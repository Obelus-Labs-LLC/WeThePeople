"""Populate `logo_url` (and `website` where the column exists) for tracked
companies that don't have one yet.

Approach:
  1. For each company without a logo_url, ask Claude Haiku for the
     company's primary website domain. Tiny prompt, ~50 input + ~30
     output tokens per company. Total cost for 545 companies ~ $0.20
     against the user's $11.95 Anthropic budget.
  2. Verify the domain resolves to a real logo via Clearbit's free
     Logo API (`https://logo.clearbit.com/<domain>` returns a 200 with
     a PNG when Clearbit has the brand).
  3. Persist `logo_url = https://logo.clearbit.com/<domain>` and, when
     the table has a `website` column, persist
     `website = https://<domain>`.

Conservative behavior:
  - Skips companies that already have a logo_url
  - Caps at --limit per run (default 100) so a misbehaving Claude
    output can't burn the entire budget in one go
  - Single `--dry-run` flag: prints what it would do without calling
    the API or writing to DB

Usage:
  python jobs/backfill_company_logos.py
  python jobs/backfill_company_logos.py --limit 200
  python jobs/backfill_company_logos.py --table tracked_defense_companies --limit 50
  python jobs/backfill_company_logos.py --dry-run
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path
from typing import Iterable

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backfill_company_logos")


# Tables that hold tracked companies/institutions. Each entry is
# (table, id_col, has_website_col). Confirmed against the schema on
# 2026-05-02 — finance uses `tracked_institutions` (no website column),
# every other sector uses `tracked_<sector>_companies` (each has a
# website column).
# Audited 2026-05-02: only `tracked_defense_companies` and
# `tracked_transportation_companies` actually have a `website` column.
# Every other sector lacks one. Setting has_website=True on a table
# that doesn't carry the column produces
# `sqlite3.OperationalError: no such column: website` mid-backfill.
TARGET_TABLES = [
    ("tracked_institutions",                "institution_id", False),
    ("tracked_tech_companies",              "company_id",     False),
    ("tracked_defense_companies",           "company_id",     True),
    ("tracked_energy_companies",            "company_id",     False),
    ("tracked_transportation_companies",    "company_id",     True),
    ("tracked_chemical_companies",          "company_id",     False),
    ("tracked_agriculture_companies",       "company_id",     False),
    ("tracked_education_companies",         "company_id",     False),
    ("tracked_telecom_companies",           "company_id",     False),
]


LOGO_VERIFY_TIMEOUT = 5  # seconds

# Logo source candidates, in preference order. Each entry is
# (template, name) where template has {domain}.
LOGO_SOURCES = [
    # Logo.dev free tier — high-quality color logos when available.
    ("https://img.logo.dev/{domain}?token=pk_X-1ZO13ESDeZb2rJRvMnoQ", "logo.dev"),
    # Clearbit Logo CDN — heavily rate-limited from data-center IPs but
    # still tries; works for many top-1000 brands.
    ("https://logo.clearbit.com/{domain}", "clearbit"),
    # Google's favicon service is the always-on fallback. Quality is
    # mediocre (often a tiny rounded icon) but it returns *something*
    # for any registered domain, so a profile that would otherwise
    # render with no logo at least gets a recognizable mark.
    ("https://www.google.com/s2/favicons?domain={domain}&sz=128", "google-favicon"),
]


def _resolve_logo(domain: str) -> str | None:
    """Try each LOGO_SOURCE in order. Return the first URL that
    actually serves an image (HEAD/GET 200, image/* content-type, and
    >300 bytes for the favicon fallback so we don't persist the 1x1
    grey placeholder Google sends for non-registered domains).

    Returns None when no source has a logo for this domain."""
    if not domain or " " in domain:
        return None
    for template, name in LOGO_SOURCES:
        url = template.format(domain=domain)
        try:
            r = requests.get(url, timeout=LOGO_VERIFY_TIMEOUT, allow_redirects=True, stream=True)
            ct = r.headers.get("content-type", "")
            # Read a chunk so we know there's actually a body
            body = r.raw.read(2048, decode_content=True) if r.status_code == 200 else b""
            r.close()
            if r.status_code != 200 or not ct.startswith("image/"):
                continue
            # Google's favicon service returns a 200 even for unknown
            # domains, with a tiny generic globe. Skip those.
            if name == "google-favicon" and len(body) < 300:
                continue
            return url
        except Exception:
            continue
    return None


def _ask_claude_for_domain(client, model: str, name: str) -> str:
    """One-shot Haiku call: 'What's <Acme Corp>'s primary website domain?'

    Returns the bare domain (e.g. "acme.com") or "" if Claude couldn't
    confidently answer. The system prompt forces a single-token output
    so we can't accidentally pay for an essay.
    """
    system = (
        "You answer ONLY with a single bare website domain — no scheme, "
        "no www., no path, no commentary. If you don't know, answer "
        "exactly: unknown"
    )
    user = (
        f"What is the primary public website domain of the company "
        f"named: {name}?"
    )
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=20,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = (msg.content[0].text if msg.content else "").strip().lower()
        if not text or text == "unknown" or " " in text:
            return ""
        # Strip a leading scheme/www if Claude ignored instructions
        for prefix in ("https://", "http://", "www."):
            if text.startswith(prefix):
                text = text[len(prefix):]
        # Trim trailing path
        text = text.split("/")[0]
        return text
    except Exception as exc:
        log.warning("Claude call failed for %r: %s", name, exc)
        return ""


def _iter_targets(conn, limit: int) -> Iterable[tuple[str, str, str, bool]]:
    """Yield (table, id_col, company_id, display_name, has_website) for
    rows missing logo_url, oldest-first. `limit` caps total across all
    tables."""
    cur = conn.cursor()
    yielded = 0
    for table, id_col, has_website in TARGET_TABLES:
        if yielded >= limit:
            break
        try:
            sql = (
                f"SELECT {id_col}, display_name FROM {table} "
                f"WHERE (logo_url IS NULL OR logo_url = '') "
                f"ORDER BY id LIMIT ?"
            )
            cur.execute(sql, (limit - yielded,))
        except Exception as exc:
            log.warning("skipping %s: %s", table, exc)
            continue
        for row in cur.fetchall():
            yield table, id_col, row[0], row[1], has_website
            yielded += 1
            if yielded >= limit:
                break


def run(limit: int, dry_run: bool, restrict_table: str | None) -> int:
    import sqlite3
    db_path = os.getenv("WTP_DB_PATH", str(ROOT / "wethepeople.db"))
    if not Path(db_path).exists():
        log.error("DB not found at %s — set WTP_DB_PATH if running locally", db_path)
        return 1
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL;")

    if not dry_run:
        try:
            from anthropic import Anthropic
        except ImportError:
            log.error("anthropic SDK not installed; pip install anthropic")
            conn.close()
            return 1
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            log.error("ANTHROPIC_API_KEY not set")
            conn.close()
            return 1
        client = Anthropic(api_key=api_key)
    else:
        client = None

    model = os.getenv("WTP_HAIKU_MODEL", "claude-haiku-4-5")

    updated = 0
    no_domain = 0
    no_logo = 0
    processed = 0
    t0 = time.time()
    for table, id_col, company_id, name, has_website in _iter_targets(conn, limit):
        if restrict_table and table != restrict_table:
            continue
        processed += 1
        if dry_run:
            log.info("DRY: would resolve %s/%s (%s)", table, company_id, name)
            continue

        domain = _ask_claude_for_domain(client, model, name)
        if not domain:
            no_domain += 1
            log.info("? no domain for %s (%s)", company_id, name)
            continue

        logo_url = _resolve_logo(domain)
        if not logo_url:
            no_logo += 1
            log.info(". %s -> %s (no logo from any source)", company_id, domain)
            # Still save the website even if no logo source delivers
            if has_website:
                conn.execute(
                    f"UPDATE {table} SET website = ? WHERE {id_col} = ?",
                    (f"https://{domain}", company_id),
                )
                conn.commit()
            continue

        if has_website:
            conn.execute(
                f"UPDATE {table} SET logo_url = ?, website = ? WHERE {id_col} = ?",
                (logo_url, f"https://{domain}", company_id),
            )
        else:
            conn.execute(
                f"UPDATE {table} SET logo_url = ? WHERE {id_col} = ?",
                (logo_url, company_id),
            )
        conn.commit()
        updated += 1
        log.info("+ %s -> %s", company_id, domain)

        # Polite delay to avoid hammering Clearbit / Anthropic
        time.sleep(0.05)

    elapsed = time.time() - t0
    log.info(
        "done. processed=%d updated=%d no_domain=%d no_logo=%d in %.1fs",
        processed, updated, no_domain, no_logo, elapsed,
    )
    conn.close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100,
                        help="Max companies to process per run (default 100)")
    parser.add_argument("--table", default=None,
                        help="Restrict to one table (e.g. tracked_defense_companies)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    return run(limit=args.limit, dry_run=args.dry_run, restrict_table=args.table)


if __name__ == "__main__":
    raise SystemExit(main())
