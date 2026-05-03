"""5th-tier logo backfill: Wikidata P154 (logo image).

Why a separate script:
  The main backfill_company_logos.py uses a 4-tier cascade
  (logo.dev -> Clearbit -> Google favicon -> og:image scrape) that
  reaches 88% coverage. The remaining 82 misses are well-known
  brands (Comcast, Bunge, Tractor Supply, Lumen, Cox, Altice, etc.)
  whose websites use SPA frameworks where og:image is set in JS so
  our raw-HTML regex misses it.

  Wikidata stores the canonical logo for most public companies as
  property P154 (logo image), pointing to a Commons file. This is
  the same source Wikipedia infoboxes use. Free, no key, fast.

How it works:
  1. SELECT every entity with logo_url IS NULL across the 9 sector tables.
  2. For each, query Wikidata wbsearchentities with the display name.
  3. For each candidate entity, query wbgetclaims for property P154.
  4. First entity with a P154 wins; resolve its filename through
     Special:FilePath to a stable image URL.
  5. Persist as logo_url.

Idempotent. Adds zero new logos for entities that already have one.

Usage:
  python jobs/backfill_logos_wikidata.py
  python jobs/backfill_logos_wikidata.py --dry-run
  python jobs/backfill_logos_wikidata.py --limit 50
"""

from __future__ import annotations

import argparse
import logging
import os
import sqlite3
import sys
import time
import urllib.parse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backfill_logos_wikidata")

# Same TARGET_TABLES shape as backfill_company_logos: (table, id_col, has_website).
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

WD_API = "https://www.wikidata.org/w/api.php"
HEADERS = {"User-Agent": "WeThePeopleBot/1.0 (https://wethepeopleforus.com; ops@wethepeopleforus.com)"}


def _search_entities(name: str) -> list[str]:
    """Wikidata's free-text search. Returns up to 5 candidate Q-IDs
    ranked by Wikidata's own relevance score. We try them in order
    when looking for P154."""
    try:
        r = requests.get(
            WD_API,
            params={
                "action": "wbsearchentities",
                "search": name,
                "language": "en",
                "format": "json",
                "limit": 5,
                "type": "item",
            },
            headers=HEADERS,
            timeout=15,
        )
        if r.status_code != 200:
            return []
        return [c["id"] for c in r.json().get("search", []) if c.get("id")]
    except Exception as exc:  # noqa: BLE001
        log.info("wikidata search %r err: %s", name, exc)
        return []


def _logo_for_entity(qid: str) -> str | None:
    """Fetch P154 (logo image) claim. Returns the Commons filename or
    None if the entity has no logo property."""
    try:
        r = requests.get(
            WD_API,
            params={
                "action": "wbgetclaims",
                "entity": qid,
                "property": "P154",
                "format": "json",
            },
            headers=HEADERS,
            timeout=15,
        )
        if r.status_code != 200:
            return None
        claims = r.json().get("claims", {}).get("P154", [])
        if not claims:
            return None
        return claims[0]["mainsnak"]["datavalue"]["value"]
    except Exception:  # noqa: BLE001
        return None


def _commons_url(filename: str) -> str:
    """Build a stable Special:FilePath URL with width=300 thumbnail.
    Special:FilePath redirects to the actual image regardless of
    Commons internal path layout."""
    # URL-encode the filename, replacing spaces with underscores per
    # MediaWiki convention.
    safe = urllib.parse.quote(filename.replace(" ", "_"), safe="")
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{safe}?width=300"


def _verify_image(url: str) -> bool:
    """HEAD-check the resolved URL. Wikidata occasionally references
    deleted Commons files; we don't want to persist a 404 logo_url."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=10, stream=True, allow_redirects=True)
        if r.status_code != 200:
            return False
        ct = r.headers.get("content-type", "")
        if not ct.startswith("image/"):
            return False
        body = r.raw.read(2048, decode_content=True)
        r.close()
        return len(body) >= 300
    except Exception:  # noqa: BLE001
        return False


def find_logo(name: str) -> str | None:
    """End-to-end: name -> Wikidata search -> P154 -> Commons URL ->
    verified image URL. Returns the persistable logo_url or None."""
    for qid in _search_entities(name):
        filename = _logo_for_entity(qid)
        if not filename:
            continue
        url = _commons_url(filename)
        if _verify_image(url):
            return url
        time.sleep(0.3)  # be polite between failed candidates
    return None


def _iter_targets(conn, limit: int, upgrade_favicons: bool = False):
    """Yield entities needing a logo. By default only NULL/empty
    logo_url. With `upgrade_favicons=True`, also yields entities whose
    current logo_url is a Google favicon (16-32px low-quality fallback)
    so a higher-quality Wikidata logo can replace it. Caught a coverage-
    quality bug 2026-05-03: the prior 4-tier cascade hit Google for ~86%
    of entities because logo.dev/Clearbit blocked our IP, leaving the
    cards rendering tiny pixelated favicons."""
    cur = conn.cursor()
    yielded = 0
    for table, id_col, has_website in TARGET_TABLES:
        if limit and yielded >= limit:
            break
        try:
            if upgrade_favicons:
                where = (
                    "(logo_url IS NULL OR logo_url = '' "
                    "OR logo_url LIKE '%google.com/s2/favicons%')"
                )
            else:
                where = "(logo_url IS NULL OR logo_url = '')"
            sql = (
                f"SELECT {id_col}, display_name FROM {table} "
                f"WHERE {where} "
                f"AND display_name IS NOT NULL ORDER BY id"
            )
            cur.execute(sql)
        except Exception as exc:  # noqa: BLE001
            log.warning("skipping %s: %s", table, exc)
            continue
        for row in cur.fetchall():
            yield table, id_col, has_website, row[0], row[1]
            yielded += 1
            if limit and yielded >= limit:
                break


def run(limit: int, dry_run: bool, upgrade_favicons: bool = False) -> int:
    db_path = os.getenv("WTP_DB_PATH", str(ROOT / "wethepeople.db"))
    if not Path(db_path).exists():
        log.error("DB not found at %s", db_path)
        return 1
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL;")

    seen = found = failed = 0
    for table, id_col, _has_website, eid, name in _iter_targets(conn, limit, upgrade_favicons):
        seen += 1
        url = find_logo(name) if not dry_run else None
        if dry_run:
            log.info("DRY: would search %s/%s (%s)", table, eid, name)
            continue
        if url:
            conn.execute(f"UPDATE {table} SET logo_url = ? WHERE {id_col} = ?", (url, eid))
            conn.commit()
            found += 1
            log.info("+ %s/%s (%s) -> %s", table, eid, name, url)
        else:
            failed += 1
            log.info(". %s/%s (%s): no Wikidata logo", table, eid, name)
        time.sleep(0.5)  # polite delay against the WMF API

    log.info("done. seen=%d found=%d failed=%d", seen, found, failed)
    conn.close()
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--limit", type=int, default=0, help="0 = unlimited")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--upgrade-favicons",
        action="store_true",
        help="Also re-process entities whose current logo_url is a Google "
        "favicon (low-quality 16-32px fallback). Replaces with the Wikidata "
        "logo when found; leaves the favicon alone otherwise.",
    )
    args = p.parse_args()
    return run(limit=args.limit, dry_run=args.dry_run, upgrade_favicons=args.upgrade_favicons)


if __name__ == "__main__":
    raise SystemExit(main())
