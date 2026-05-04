"""
Diagnose Oracle Cloud Database connection.

Reports the current state of the Oracle wallet, env config, and
attempts a connection. The session-15 backlog flagged Oracle as
"Available but connection refused" with the DigiCert certificate
distrust deadline hitting April 15, 2026 — likely the wallet needs
to be regenerated against the new CA.

Run on prod where the wallet lives:
    python scripts/diagnose_oracle_connection.py

Outputs (sample, not exhaustive):
    [env] ORACLE_DB_URL = oracle+oracledb://...   (configured | missing)
    [env] TNS_ADMIN     = /home/dshon/wallet      (set | unset)
    [wallet] dir exists: yes
    [wallet] cwallet.sso present: yes
    [wallet] tnsnames.ora present: yes
    [wallet] sqlnet.ora WALLET_LOCATION matches TNS_ADMIN: yes
    [conn]  attempting connect... refused: ORA-12506 (post-DigiCert distrust)
    [next]  download fresh wallet bundle from Oracle Cloud Console

Never raises — reports and exits 0/1.
"""

import argparse
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("diagnose_oracle")


REQUIRED_WALLET_FILES = [
    "cwallet.sso",
    "ewallet.p12",
    "tnsnames.ora",
    "sqlnet.ora",
]


def _check_env() -> dict[str, str | None]:
    """Inspect Oracle-relevant env vars without printing secrets."""
    out = {}
    for key in ("ORACLE_DB_URL", "ORACLE_USER", "ORACLE_PASSWORD",
                "ORACLE_DSN", "ORACLE_WALLET_LOCATION", "TNS_ADMIN"):
        val = os.getenv(key, "")
        out[key] = "<set>" if val else "<unset>"
    return out


def _check_wallet(wallet_dir: Path) -> dict[str, bool]:
    """Confirm wallet directory has the canonical files."""
    out = {"dir_exists": wallet_dir.exists() and wallet_dir.is_dir()}
    if not out["dir_exists"]:
        return out
    for name in REQUIRED_WALLET_FILES:
        out[name] = (wallet_dir / name).exists()
    return out


def _check_sqlnet(wallet_dir: Path) -> dict[str, str | None]:
    """Read sqlnet.ora and confirm WALLET_LOCATION points at wallet_dir."""
    sqlnet = wallet_dir / "sqlnet.ora"
    if not sqlnet.exists():
        return {"present": False, "wallet_location_line": None}
    try:
        content = sqlnet.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return {"present": True, "error": str(e)}
    line = next(
        (ln for ln in content.splitlines() if "WALLET_LOCATION" in ln.upper()),
        None,
    )
    return {"present": True, "wallet_location_line": line}


def _attempt_connection() -> dict[str, str | None]:
    """Try a short oracledb.connect() and surface whatever error fires."""
    try:
        import oracledb  # type: ignore
    except ImportError:
        return {"status": "skipped", "reason": "oracledb not installed"}

    user = os.getenv("ORACLE_USER", "")
    password = os.getenv("ORACLE_PASSWORD", "")
    dsn = os.getenv("ORACLE_DSN", "")
    wallet = os.getenv("ORACLE_WALLET_LOCATION") or os.getenv("TNS_ADMIN", "")

    if not (user and password and dsn):
        return {
            "status": "skipped",
            "reason": "ORACLE_USER / ORACLE_PASSWORD / ORACLE_DSN not all set",
        }

    try:
        conn = oracledb.connect(
            user=user,
            password=password,
            dsn=dsn,
            config_dir=wallet or None,
            wallet_location=wallet or None,
            wallet_password=os.getenv("ORACLE_WALLET_PASSWORD", "") or None,
        )
    except Exception as e:
        return {"status": "failed", "error": f"{type(e).__name__}: {e}"}

    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM DUAL")
        row = cur.fetchone()
        cur.close()
        conn.close()
        return {"status": "ok", "result": str(row)}
    except Exception as e:
        return {"status": "connected_but_query_failed", "error": str(e)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wallet-dir", type=str, default=None,
                        help="Override the wallet directory (defaults to TNS_ADMIN env var)")
    args = parser.parse_args()

    env = _check_env()
    log.info("=== ENV ===")
    for k, v in env.items():
        log.info("  %-25s %s", k, v)

    wallet_path = Path(args.wallet_dir or os.getenv("TNS_ADMIN", "wallet"))
    log.info("=== WALLET (%s) ===", wallet_path)
    wallet = _check_wallet(wallet_path)
    for k, v in wallet.items():
        log.info("  %-20s %s", k, v)

    log.info("=== sqlnet.ora ===")
    sqlnet = _check_sqlnet(wallet_path)
    for k, v in sqlnet.items():
        log.info("  %-25s %s", k, v)

    log.info("=== CONNECT ATTEMPT ===")
    result = _attempt_connection()
    for k, v in result.items():
        log.info("  %-25s %s", k, v)

    if result.get("status") in ("ok", "skipped"):
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
