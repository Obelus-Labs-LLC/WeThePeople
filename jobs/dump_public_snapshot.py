"""Generate the nightly public SQLite snapshot.

Produces a redistributable, sanitised copy of the production database
and writes it (plus a manifest) to the configured public directory.

What gets stripped before shipping:
  - users, api_key_records, audit_log         — credentials / PII
  - rate_limit_records, claims_rate_limit     — internal counters
  - user_watchlist, user_action_log           — per-user state
  - sessions, refresh_tokens (any auth state) — credentials
  - any table prefixed `_internal_` or `_dev_` if they exist

What ships:
  - All civic data: lobbying, contracts, enforcement, trades, donations
  - All tracked entities (politicians, companies)
  - All published stories (drafts and retractions excluded)
  - All bills, votes, member votes, person↔bill links

Output:
  /var/www/wtp-bulk/wtp-snapshot-YYYY-MM-DD.db.gz   (the file)
  /var/www/wtp-bulk/wtp-snapshot-latest.db.gz      (symlink)
  /var/www/wtp-bulk/manifest.json                  (filename, size, sha256, generated_at)

Run nightly via cron. Idempotent — overwrites the date file if re-run
the same day.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_DB = "/home/dshon/wethepeople-backend/wethepeople.db"
DEFAULT_OUT = "/var/www/wtp-bulk"

# Tables to drop entirely from the snapshot (case-sensitive).
SENSITIVE_TABLES = {
    "users",
    "api_key_records",
    "audit_log",
    "rate_limit_records",
    "claims_rate_limit",
    "user_watchlist",
    "user_action_log",
    "user_alert_subscriptions",
    "sessions",
    "refresh_tokens",
}

# Stories must not include drafts / retracted in the public snapshot.
DRAFT_FILTER_TABLES = {"stories": "status = 'published'"}


def _sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _list_tables(conn: sqlite3.Connection) -> list[str]:
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    return [r[0] for r in cur.fetchall()]


def build_snapshot(src_db: Path, work_dir: Path) -> Path:
    """Copy `src_db` to a fresh file, drop sensitive tables, filter
    drafts. Returns path to the cleaned (uncompressed) file."""
    cleaned = work_dir / "clean.db"

    # Use SQLite's online backup API so we capture a consistent view
    # even while the live API is mid-write. Copying the .db file with
    # cp can produce a corrupted snapshot if a transaction is in flight.
    src = sqlite3.connect(f"file:{src_db}?mode=ro", uri=True)
    dst = sqlite3.connect(str(cleaned))
    try:
        with dst:
            src.backup(dst)
    finally:
        src.close()

    # Open the cleaned copy and surgically remove what we don't ship.
    conn = sqlite3.connect(str(cleaned))
    try:
        tables = _list_tables(conn)

        # Drop sensitive tables entirely.
        for t in tables:
            if t in SENSITIVE_TABLES or t.startswith("_internal_") or t.startswith("_dev_"):
                conn.execute(f"DROP TABLE IF EXISTS {t}")

        # Filter draft / non-published rows.
        for t, where in DRAFT_FILTER_TABLES.items():
            if t in tables:
                conn.execute(f"DELETE FROM {t} WHERE NOT ({where})")

        # Drop any orphan indices on tables we removed. REINDEX rebuilds
        # every index, which on a 4GB DB needs ~1-2GB temporary space.
        # On a tight host we skip it; consumers can REINDEX locally.
        try:
            conn.execute("REINDEX")
            conn.commit()
        except sqlite3.OperationalError as e:
            if "disk is full" in str(e).lower() or "database or disk" in str(e).lower():
                print(f"  warning: skipping REINDEX (insufficient free disk): {e}",
                      file=sys.stderr)
                conn.rollback()
            else:
                raise
        # Reclaim space so the snapshot isn't bloated by deleted rows.
        # VACUUM needs ~2x disk space (it writes a new file then renames).
        # On a tight host we skip it — the gzip pass downstream squeezes
        # the deleted-row holes back out anyway.
        try:
            conn.execute("VACUUM")
            conn.commit()
        except sqlite3.OperationalError as e:
            if "disk is full" in str(e).lower() or "database or disk" in str(e).lower():
                print(f"  warning: skipping VACUUM (insufficient free disk): {e}",
                      file=sys.stderr)
            else:
                raise
    finally:
        conn.close()

    return cleaned


def gzip_to(src: Path, dst: Path) -> None:
    with open(src, "rb") as f_in, gzip.open(dst, "wb", compresslevel=6) as f_out:
        shutil.copyfileobj(f_in, f_out, length=1 << 20)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src-db", default=os.getenv("WTP_DB_PATH", DEFAULT_DB))
    ap.add_argument("--out-dir", default=os.getenv("WTP_BULK_DIR", DEFAULT_OUT))
    ap.add_argument("--keep-uncompressed", action="store_true",
                    help="Also keep the un-gzipped clean.db for debugging.")
    args = ap.parse_args()

    src_db = Path(args.src_db)
    out_dir = Path(args.out_dir)
    if not src_db.exists():
        print(f"ERROR: source DB not found at {src_db}", file=sys.stderr)
        sys.exit(2)
    out_dir.mkdir(parents=True, exist_ok=True)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    final_name = f"wtp-snapshot-{today}.db.gz"
    final_path = out_dir / final_name

    with tempfile.TemporaryDirectory() as tmpd:
        work = Path(tmpd)
        cleaned = build_snapshot(src_db, work)
        # Compress to a temp path first, then move into place atomically
        # so consumers never see a half-written file.
        tmp_gz = work / "snapshot.db.gz"
        gzip_to(cleaned, tmp_gz)
        shutil.move(str(tmp_gz), str(final_path))

        if args.keep_uncompressed:
            shutil.copy(str(cleaned), str(out_dir / f"wtp-snapshot-{today}.db"))

    # Update the latest pointer (symlink on POSIX, copy on win32).
    latest = out_dir / "wtp-snapshot-latest.db.gz"
    try:
        if latest.exists() or latest.is_symlink():
            latest.unlink()
        latest.symlink_to(final_name)
    except (OSError, NotImplementedError):
        shutil.copy(str(final_path), str(latest))

    # Manifest.
    sha = _sha256_of(final_path)
    size = final_path.stat().st_size
    manifest = {
        "filename": final_name,
        "latest_url_path": "/wtp-snapshot-latest.db.gz",
        "size_bytes": size,
        "size_human": f"{size / (1024 * 1024):.1f} MB",
        "sha256": sha,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "schema_notes": (
            "Sanitised copy of the production WeThePeople SQLite DB. "
            "Sensitive tables (users, api_keys, audit_log, rate-limit "
            "counters, watchlists) are dropped. Stories are restricted "
            "to status='published'. All civic data tables (lobbying, "
            "contracts, enforcement, trades, donations, tracked "
            "entities, bills, votes) are included in full."
        ),
        "license": (
            "AGPL-3.0 for schema and platform code; underlying data is "
            "public-domain US government records redistributed under the "
            "originating agency's terms."
        ),
    }
    manifest_path = out_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"Snapshot written: {final_path} ({manifest['size_human']})")
    print(f"Manifest:         {manifest_path}")


if __name__ == "__main__":
    main()
