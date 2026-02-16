"""Deterministic auth-gating test (NO NETWORK, temp DB).

Verifies:
- WTP_REQUIRE_AUTH=0 (default): all routes open, no key needed.
- WTP_REQUIRE_AUTH=1 + correct X-WTP-API-KEY: PRESS routes return 200/404 (not 401).
- WTP_REQUIRE_AUTH=1 + wrong/missing key: PRESS routes return 401.
- PUBLIC routes always accessible regardless of auth state.
"""

from __future__ import annotations

import importlib
import os
import sys
import tempfile
from pathlib import Path


# Representative routes to test.
# PUBLIC: use /people which only needs tracked_members table.
# PRESS: use /ops/runtime (no table deps) and /claims (needs claims table).
PUBLIC_ROUTES = [
    ("GET", "/people?limit=1"),
]
PRESS_ROUTES = [
    ("GET", "/ops/runtime"),
    ("GET", "/claims?limit=1"),
]

TEST_KEY = "test-press-key-abc123"


def _sqlite_url_for_path(db_path: Path) -> str:
    return f"sqlite:///{db_path.resolve().as_posix()}"


def _fresh_app():
    """Force-reimport main (and models.database) so env var changes take effect."""
    # Remove cached modules that read env on import
    for mod_name in list(sys.modules):
        if mod_name.startswith("main") or mod_name.startswith("models") or mod_name.startswith("services"):
            del sys.modules[mod_name]

    import main as main_mod
    return main_mod.app


def _request(client, method: str, url: str, headers: dict | None = None):
    if method == "GET":
        return client.get(url, headers=headers or {})
    elif method == "POST":
        return client.post(url, headers=headers or {})
    raise ValueError(f"Unsupported method: {method}")


def main() -> int:
    os.environ["NO_NETWORK"] = "1"
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_auth_gating_"))
    tmp_db = tmp_dir / "tmp_auth_test.db"
    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    errors = []

    try:
        # ── Test 1: Auth OFF (default) ─ everything open ──
        os.environ.pop("WTP_REQUIRE_AUTH", None)
        os.environ.pop("WTP_PRESS_API_KEY", None)

        from fastapi.testclient import TestClient
        app = _fresh_app()

        # Create tables needed for basic queries
        from models.database import TrackedMember, Claim, engine
        TrackedMember.__table__.create(bind=engine, checkfirst=True)
        Claim.__table__.create(bind=engine, checkfirst=True)

        client = TestClient(app)

        for method, url in PUBLIC_ROUTES + PRESS_ROUTES:
            r = _request(client, method, url)
            if r.status_code == 401:
                errors.append(f"FAIL auth-off: {method} {url} returned 401 (should be open)")
            # 200, 404, or other non-401 are fine — route is accessible

        if not errors:
            print("  PASS: auth OFF: all routes accessible")

        # ── Test 2: Auth ON + correct key ─ PRESS routes accessible ──
        os.environ["WTP_REQUIRE_AUTH"] = "1"
        os.environ["WTP_PRESS_API_KEY"] = TEST_KEY

        app2 = _fresh_app()
        client2 = TestClient(app2)

        good_headers = {"X-WTP-API-KEY": TEST_KEY}

        for method, url in PUBLIC_ROUTES:
            r = _request(client2, method, url)
            if r.status_code == 401:
                errors.append(f"FAIL auth-on public: {method} {url} returned 401 (public should never gate)")

        for method, url in PRESS_ROUTES:
            r = _request(client2, method, url, headers=good_headers)
            if r.status_code == 401:
                errors.append(f"FAIL auth-on good-key: {method} {url} returned 401 with valid key")

        if not errors:
            print("  PASS: auth ON + valid key: public open, press accessible")

        # ── Test 3: Auth ON + missing key ─ PRESS routes blocked ──
        for method, url in PRESS_ROUTES:
            r = _request(client2, method, url)  # no header
            if r.status_code != 401:
                errors.append(f"FAIL auth-on no-key: {method} {url} returned {r.status_code} (expected 401)")

        if not errors:
            print("  PASS: auth ON + missing key: press routes return 401")

        # ── Test 4: Auth ON + wrong key ─ PRESS routes blocked ──
        bad_headers = {"X-WTP-API-KEY": "wrong-key"}
        for method, url in PRESS_ROUTES:
            r = _request(client2, method, url, headers=bad_headers)
            if r.status_code != 401:
                errors.append(f"FAIL auth-on bad-key: {method} {url} returned {r.status_code} (expected 401)")

        if not errors:
            print("  PASS: auth ON + wrong key: press routes return 401")

        # ── Test 5: Auth ON but no key configured (fail-closed) ──
        os.environ["WTP_REQUIRE_AUTH"] = "1"
        os.environ["WTP_PRESS_API_KEY"] = ""

        app3 = _fresh_app()
        client3 = TestClient(app3)

        for method, url in PRESS_ROUTES:
            r = _request(client3, method, url, headers=good_headers)
            if r.status_code != 401:
                errors.append(f"FAIL fail-closed: {method} {url} returned {r.status_code} (expected 401 when no key configured)")

        if not errors:
            print("  PASS: fail-closed: no key configured blocks even valid-looking requests")

        # ── Summary ──
        if errors:
            print(f"\nFAIL: auth gating FAILED ({len(errors)} errors):")
            for e in errors:
                print(f"  {e}")
            return 1

        print("OK: auth gating contract OK")
        return 0

    finally:
        # Clean up env
        os.environ.pop("WTP_REQUIRE_AUTH", None)
        os.environ.pop("WTP_PRESS_API_KEY", None)

        try:
            if tmp_db.exists():
                tmp_db.unlink()
        except Exception:
            pass
        try:
            if tmp_dir.exists():
                tmp_dir.rmdir()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
