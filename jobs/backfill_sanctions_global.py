"""Global sanctions backfill — uses OpenSanctions consolidated dataset
to add EU, UK, and UN sanctions checks on top of the existing OFAC
SDN backfill.

Why this exists:
  `jobs/backfill_sanctions_status.py` checks tracked entities against
  the US Treasury OFAC SDN list. That covers US sanctions only.

  OpenSanctions publishes a free, daily-updated consolidated CSV
  (`targets.simple.csv`) that aggregates major sanctions lists
  worldwide: EU CFSP, UK OFSI, UN, plus dozens of national lists. We
  use the same OpenSanctions data the paid Yente service uses, but
  via the unauthenticated public dataset.

  This script complements rather than replaces the OFAC pass:
  - OFAC pass writes sanctions_status='clear'/'sdn'
  - This pass UPDATES sanctions_status to a richer value when the
    entity matches a non-OFAC list:
      'sdn'        -> on US SDN only (set by OFAC pass)
      'eu'         -> on EU CFSP only
      'uk'         -> on UK OFSI only
      'un'         -> on UN list only
      'multi'      -> on 2+ lists
      'clear'      -> not on any list
  - We never downgrade — if OFAC pass said 'sdn' and OpenSanctions
    confirms US+EU, we set 'multi'.

Same false-positive guard as the OFAC pass: we drop entities whose
program list is exclusively foreign-jurisdiction targeting (Russia,
Iran, Cuba, etc.) since our tracked entities are US-incorporated.

Usage:
  python jobs/backfill_sanctions_global.py
  python jobs/backfill_sanctions_global.py --dry-run
  python jobs/backfill_sanctions_global.py --refresh-csv
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backfill_sanctions_global")


OPENSANCTIONS_URL = "https://data.opensanctions.org/datasets/latest/sanctions/targets.simple.csv"
CACHE_PATH = Path("/tmp/wtp_opensanctions.csv")
CACHE_TTL = 24 * 3600

# Same TABLES + has_data flags as backfill_sanctions_status.py.
TABLES = [
    ("tracked_members",                     "person_id",      True),
    ("tracked_institutions",                "institution_id", True),
    ("tracked_tech_companies",              "company_id",     False),
    ("tracked_defense_companies",           "company_id",     False),
    ("tracked_energy_companies",            "company_id",     False),
    ("tracked_transportation_companies",    "company_id",     False),
    ("tracked_chemical_companies",          "company_id",     False),
    ("tracked_agriculture_companies",       "company_id",     False),
    ("tracked_education_companies",         "company_id",     False),
    ("tracked_telecom_companies",           "company_id",     False),
]

# Datasets that target foreign jurisdictions. An entity that ONLY
# appears in these is a sanctioned foreign target — a name collision
# against our US-incorporated tracked entities is a false positive.
# Conservative list: when in doubt, leave the dataset OUT (we'd
# rather not skip a real sanction).
_FOREIGN_DATASETS_KEYWORDS = (
    "russia", "ukraine", "belarus", "iran", "iranian", "syria",
    "cuba", "north korea", "dprk", "venezuela", "burma", "myanmar",
    "zimbabwe", "libya", "sudan", "somalia", "yemen", "lebanon",
    "central african republic", "drc", "congo", "balkans",
    "ethiopia", "hong kong", "nicaragua", "mali", "haiti",
)

# Datasets that look sanctions-like but are actually regulatory
# enforcement / administrative actions, not political sanctions.
# Caught a wave of false positives (Marathon Oil, Pioneer Natural,
# Shell, ANSYS, ChampionX all flagged via "EU ESMA Suspensions and
# Removals" — but ESMA suspensions are M&A delistings and trading
# halts, not sanctions). Excluding these dataset name fragments
# keeps the index focused on actual political sanctions lists.
_REGULATORY_NOT_SANCTIONS = (
    "esma",                # EU securities suspensions / delistings
    "suspensions and removals",
    "fca enforcement",     # UK financial conduct authority enforcement
    "fincen",              # US financial crimes regulatory
    "interpol",            # red notices != sanctions
    "wikidata pep",        # politically exposed persons (not sanctioned)
    "debarment",           # contractor debarment is procurement, not sanctions
    "world bank debar",
    "european court",
    "missing persons",
    "wanted by",
)


def _is_real_sanctions_list(datasets: str) -> bool:
    """Return True only when the dataset list contains at least one
    recognized political-sanctions source (OFAC/SDN, EU CFSP, UK OFSI,
    UN Security Council). Filters out regulatory enforcement and
    administrative actions that OpenSanctions also tracks."""
    blob = datasets.lower()
    if any(reg in blob for reg in _REGULATORY_NOT_SANCTIONS):
        # Even if it's also on a real sanctions list, dropping the
        # regulatory rows means we avoid the false-positive lift
        # entirely. Keep True if there's a clearly-sanctions tag too.
        if not any(real in blob for real in (
            "ofac", "sdn", "cfsp", "ofsi", "un security",
            "consolidated list", "specially designated",
        )):
            return False
    # Otherwise: only accept rows that have at least one recognized
    # sanctions source.
    return any(real in blob for real in (
        "ofac", "sdn", "cfsp", "ofsi", "un security council",
        "consolidated list", "specially designated", "asset freeze",
        "sectoral sanctions",
    ))


def _normalize(name: str) -> str:
    """Same normalization as the OFAC pass for consistent matching."""
    if not name:
        return ""
    name = name.lower()
    name = re.sub(r"[^a-z0-9 ]+", " ", name)
    name = re.sub(
        r"\b(inc|incorporated|corp|corporation|llc|ltd|limited|co|company|holdings|group)\b",
        " ",
        name,
    )
    name = re.sub(r"\s+", " ", name).strip()
    return name


def _ensure_csv(refresh: bool) -> bytes:
    """Download or load cached CSV. Public OpenSanctions dataset, no
    auth, ~10MB."""
    if not refresh and CACHE_PATH.exists():
        age = time.time() - CACHE_PATH.stat().st_mtime
        if age < CACHE_TTL:
            return CACHE_PATH.read_bytes()
    log.info("downloading OpenSanctions CSV (~10MB)...")
    r = requests.get(OPENSANCTIONS_URL, timeout=60, headers={"User-Agent": "WeThePeopleBot/1.0"})
    r.raise_for_status()
    CACHE_PATH.write_bytes(r.content)
    return r.content


def _list_kind(datasets: str, sanctions: str) -> str:
    """Classify which list family this entity is on.
    Returns one of 'us', 'eu', 'uk', 'un', 'other'.

    Pad with leading/trailing spaces so word-boundary checks like
    " uk " match start-of-string tokens too. Without padding,
    "UN Security Council" wouldn't match because " un " needs a
    leading space."""
    blob = " " + (datasets + " " + sanctions).lower() + " "
    if "ofac" in blob or " us " in blob or "us-" in blob.replace(" ", ""):
        return "us"
    if "ofsi" in blob or " uk " in blob or "uk-" in blob.replace(" ", "") or "british" in blob:
        return "uk"
    if "cfsp" in blob or " eu " in blob or "european union" in blob or "eu-" in blob.replace(" ", ""):
        return "eu"
    if "united nations" in blob or " un " in blob or "un-" in blob.replace(" ", ""):
        return "un"
    return "other"


def _is_foreign_only(datasets: str, countries: str) -> bool:
    """When the entity's dataset names exclusively reference foreign-
    jurisdiction sanctions programs, treat as foreign target. The
    `countries` field can also flag this — if the entity is listed
    with country=ru/ir/cu/etc., it's almost certainly a foreign target
    rather than something a US tracked entity could legitimately match."""
    ds_lower = datasets.lower()
    has_foreign = any(kw in ds_lower for kw in _FOREIGN_DATASETS_KEYWORDS)
    if not has_foreign:
        return False
    # If any non-foreign-targeted list ALSO names this entity, keep it.
    if any(safe in ds_lower for safe in ("global magnitsky", "sdgt", "narcotics", "cyber", "anti-corruption")):
        return False
    return True


def _parse_index(csv_bytes: bytes) -> dict[str, dict]:
    """Build {normalized_name: {schema, lists, sanctions_summary}}.
    Aliases also get indexed. Foreign-targeted entries are dropped."""
    text = csv_bytes.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    index: dict[str, dict] = {}
    skipped_foreign = 0
    skipped_individual = 0
    for row in reader:
        schema = row.get("schema") or ""
        # We only care about organizations / companies — skip individuals
        if schema in ("Person", "PoliticalParty", "Vessel", "Airplane"):
            skipped_individual += 1
            continue
        datasets = row.get("dataset") or ""
        countries = row.get("countries") or ""
        sanctions = row.get("sanctions") or ""
        if _is_foreign_only(datasets, countries):
            skipped_foreign += 1
            continue
        # Stricter: drop entries that aren't on a recognized political
        # sanctions source. ESMA delistings et al. are caught here.
        if not _is_real_sanctions_list(datasets):
            continue
        kind = _list_kind(datasets, sanctions)
        names = [row.get("name", "")]
        for alias in (row.get("aliases") or "").split(";"):
            alias = alias.strip()
            if alias:
                names.append(alias)
        for n in names:
            norm = _normalize(n)
            if not norm or len(norm) < 4:  # too short -> too noisy
                continue
            entry = index.get(norm)
            if entry:
                entry["lists"].add(kind)
            else:
                index[norm] = {
                    "id": row.get("id"),
                    "name": row.get("name"),
                    "datasets": datasets,
                    "sanctions": sanctions,
                    "lists": {kind},
                }
    log.info(
        "OpenSanctions index: %d unique normalized names (skipped %d individuals, %d foreign-only)",
        len(index), skipped_individual, skipped_foreign,
    )
    return index


def _resolve_status(existing: str | None, lists: set[str]) -> str:
    """Combine prior OFAC status with new OpenSanctions findings.

      lists = set of {'us', 'eu', 'uk', 'un', 'other'} that match.

    Returns the most-informative status. Never downgrades a prior
    'sdn' to 'clear'."""
    # Drop 'other' from list-family decisions; it's noise from
    # smaller national lists we don't want to surface as primary.
    families = lists - {"other"}
    if existing == "sdn":
        families.add("us")
    if not families:
        return existing or "clear"
    if len(families) >= 2:
        return "multi"
    only = next(iter(families))
    return {"us": "sdn", "eu": "eu", "uk": "uk", "un": "un"}[only]


def _iter_targets(conn):
    cur = conn.cursor()
    for table, id_col, has_data in TABLES:
        try:
            sql = (
                f"SELECT {id_col}, display_name, sanctions_status FROM {table} "
                f"WHERE display_name IS NOT NULL AND display_name != ''"
            )
            cur.execute(sql)
        except Exception as exc:
            log.warning("skipping %s: %s", table, exc)
            continue
        for id_value, display_name, prior_status in cur.fetchall():
            yield table, id_col, has_data, id_value, display_name, prior_status


def run(refresh_csv: bool, dry_run: bool, limit: int) -> int:
    db_path = os.getenv("WTP_DB_PATH", str(ROOT / "wethepeople.db"))
    if not Path(db_path).exists():
        log.error("DB not found at %s", db_path)
        return 1

    csv_bytes = _ensure_csv(refresh=refresh_csv)
    index = _parse_index(csv_bytes)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL;")
    cur = conn.cursor()

    seen = upgraded = unchanged = matched = 0
    for table, id_col, has_data, eid, name, prior in _iter_targets(conn):
        if limit and seen >= limit:
            break
        seen += 1
        norm = _normalize(name)
        match = index.get(norm)
        if not match:
            continue
        matched += 1
        new_status = _resolve_status(prior, match["lists"])
        if new_status == prior:
            unchanged += 1
            continue
        if dry_run:
            log.info(
                "DRY: %s/%s (%s) %s -> %s [%s]",
                table, eid, name, prior, new_status, ",".join(sorted(match["lists"])),
            )
            upgraded += 1
            continue
        if has_data:
            import json
            cur.execute(
                f"UPDATE {table} SET sanctions_status = ?, sanctions_data = ?, "
                f"sanctions_checked_at = ? WHERE {id_col} = ?",
                (
                    new_status,
                    json.dumps({"opensanctions_id": match["id"], "datasets": match["datasets"], "sanctions": match["sanctions"]}),
                    datetime.now(timezone.utc).isoformat(),
                    eid,
                ),
            )
        else:
            cur.execute(f"UPDATE {table} SET sanctions_status = ? WHERE {id_col} = ?", (new_status, eid))
        conn.commit()
        upgraded += 1
        log.warning("MATCH %s/%s (%s) %s -> %s [%s]", table, eid, name, prior, new_status, ",".join(sorted(match["lists"])))

    log.info("done. seen=%d matched=%d upgraded=%d unchanged=%d", seen, matched, upgraded, unchanged)
    conn.close()
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--refresh-csv", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--limit", type=int, default=0)
    args = p.parse_args()
    return run(refresh_csv=args.refresh_csv, dry_run=args.dry_run, limit=args.limit)


if __name__ == "__main__":
    raise SystemExit(main())
