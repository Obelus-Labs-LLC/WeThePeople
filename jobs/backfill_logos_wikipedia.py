"""6th-tier logo backfill: Wikipedia media-list API.

Why this exists:
  After 5 prior tiers (logo.dev / Clearbit / Google favicon /
  og:image / Wikidata P154) we have 92.8% logo coverage. The
  remaining 44 entities are companies whose Wikidata page either
  doesn't exist or doesn't carry the P154 (logo image) property.

  But many of those same companies DO have a Wikipedia article
  whose infobox embeds the logo as a normal Commons image. The
  Wikipedia REST API exposes the full media list of any article
  via `/api/rest_v1/page/media-list/{title}` — we can grep that
  for files with "logo" in the title and pick the first hit.

  This catches companies like Devon Energy, RPM International,
  Sasol, Atmos Energy, Bunge Limited that the Wikidata-P154 pass
  missed.

Conservative behaviour:
  - Only accepts file names containing "logo"; skips HQ photos,
    storefront images, etc.
  - Requires file extension svg/png/jpg/jpeg
  - Verifies the URL serves a real image >300 bytes

Usage:
  python jobs/backfill_logos_wikipedia.py
  python jobs/backfill_logos_wikipedia.py --dry-run
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sqlite3
import sys
import time
import urllib.parse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backfill_logos_wikipedia")

TARGET_TABLES = [
    ("tracked_institutions",                "institution_id"),
    ("tracked_tech_companies",              "company_id"),
    ("tracked_defense_companies",           "company_id"),
    ("tracked_energy_companies",            "company_id"),
    ("tracked_transportation_companies",    "company_id"),
    ("tracked_chemical_companies",          "company_id"),
    ("tracked_agriculture_companies",       "company_id"),
    ("tracked_education_companies",         "company_id"),
    ("tracked_telecom_companies",           "company_id"),
]

WP_MEDIA_API = "https://en.wikipedia.org/api/rest_v1/page/media-list/"
HEADERS = {"User-Agent": "WeThePeopleBot/1.0 (https://wethepeopleforus.com)"}

# Words in a filename that disqualify it as a logo candidate. Most of
# these come from caught false positives in the smoke test —
# Wikipedia infoboxes sometimes lead with HQ building photos or
# product imagery.
_DISQUALIFY = (
    "building", "headquarters", "tower", "office", "hq",
    "campus", "factory", "plant", "store", "storefront",
    "product", "sign", "billboard", "exterior", "entrance",
    "facade", "lobby", "construction", "ceo", "founder",
)


def _is_logo_candidate(title: str) -> bool:
    t = title.lower()
    if not any(t.endswith(ext) for ext in (".svg", ".png", ".jpg", ".jpeg")):
        return False
    if "logo" not in t and "wordmark" not in t:
        return False
    return not any(bad in t for bad in _DISQUALIFY)


def _normalize_title(name: str) -> str:
    """Cleanse the company name for use as a Wikipedia article title.
    Wikipedia auto-redirects most variants but we strip the trailing
    legal suffix to maximize hit rate (Wikipedia titles are usually
    'Bunge Limited' not 'Bunge Limited SA')."""
    name = re.sub(r"\s*\((.*?)\)\s*$", "", name)  # strip parenthetical
    name = re.sub(r"[,\.]?\s*(Inc|Inc\.|Corporation|Corp|Corp\.|LLC|Ltd|Ltd\.|Limited|N\.V\.|S\.A\.|Co\.?|Co\\b)\s*$", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def _fetch_logo(name: str) -> str | None:
    """Try the cleaned name and the full name; return the first
    Commons URL that serves a verified image."""
    candidates = [_normalize_title(name)]
    if candidates[0] != name:
        candidates.append(name)
    for cand in candidates:
        title = urllib.parse.quote(cand.replace(" ", "_"))
        try:
            r = requests.get(f"{WP_MEDIA_API}{title}", headers=HEADERS, timeout=15)
        except Exception:  # noqa: BLE001
            continue
        if r.status_code == 404:
            continue
        if r.status_code != 200:
            continue
        try:
            items = r.json().get("items", [])
        except Exception:  # noqa: BLE001
            continue
        for it in items:
            t = (it.get("title") or "").replace("File:", "")
            if not _is_logo_candidate(t):
                continue
            srcset = it.get("srcset", [])
            src = srcset[0].get("src") if srcset else None
            if not src:
                src = (it.get("original") or {}).get("source")
            if not src:
                continue
            # srcset URLs come back protocol-relative — fix to https
            if src.startswith("//"):
                src = "https:" + src
            if _verify(src):
                return src
        time.sleep(0.3)
    return None


def _verify(url: str) -> bool:
    try:
        r = requests.get(url, headers=HEADERS, timeout=10, stream=True, allow_redirects=True)
        if r.status_code != 200:
            return False
        ct = r.headers.get("content-type", "")
        body = r.raw.read(2048, decode_content=True) if ct.startswith("image/") else b""
        r.close()
        return ct.startswith("image/") and len(body) >= 300
    except Exception:  # noqa: BLE001
        return False


def _iter_targets(conn, limit: int, upgrade_favicons: bool = False):
    """Same NULL-vs-favicon-upgrade flag as the Wikidata backfill.
    See backfill_logos_wikidata.py for rationale."""
    cur = conn.cursor()
    yielded = 0
    for table, id_col in TARGET_TABLES:
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
            yield table, id_col, row[0], row[1]
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
    for table, id_col, eid, name in _iter_targets(conn, limit, upgrade_favicons):
        seen += 1
        if dry_run:
            log.info("DRY: %s/%s (%s)", table, eid, name)
            continue
        url = _fetch_logo(name)
        if url:
            conn.execute(f"UPDATE {table} SET logo_url = ? WHERE {id_col} = ?", (url, eid))
            conn.commit()
            found += 1
            log.info("+ %s/%s (%s) -> %s", table, eid, name, url)
        else:
            failed += 1
            log.info(". %s/%s (%s): no Wikipedia logo", table, eid, name)
        time.sleep(0.5)

    log.info("done. seen=%d found=%d failed=%d", seen, found, failed)
    conn.close()
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--upgrade-favicons",
        action="store_true",
        help="Also re-process entities whose current logo_url is a Google "
        "favicon, replacing with a Wikipedia logo when found.",
    )
    args = p.parse_args()
    return run(limit=args.limit, dry_run=args.dry_run, upgrade_favicons=args.upgrade_favicons)


if __name__ == "__main__":
    raise SystemExit(main())
