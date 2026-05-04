"""
Company Donation Data Sync via FEC API

Fetches PAC/committee disbursements linked to tracked companies across all sectors.
Uses the FEC API (schedules/schedule_b for disbursements to candidates,
and schedules/schedule_a for receipts/contributions).

Strategy:
  1. Load all tracked companies from finance, health, tech, energy sectors
  2. For each company, search FEC for committees with matching names (PACs)
  3. For each PAC found, fetch disbursements to candidate committees
  4. Match candidates to tracked members where possible
  5. Store in CompanyDonation table with dedupe

Requires: FEC_API_KEY in .env (falls back to DEMO_KEY with strict rate limits)

Usage:
    python jobs/sync_donations.py
    python jobs/sync_donations.py --sector finance
    python jobs/sync_donations.py --entity-id jpmorgan
"""

import os
import sys
import hashlib
import argparse
import logging
import time
from datetime import datetime, date
from typing import Optional

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base, TrackedMember, CompanyDonation
from models.finance_models import TrackedInstitution
from models.health_models import TrackedCompany
from models.tech_models import TrackedTechCompany
from models.energy_models import TrackedEnergyCompany
from models.defense_models import TrackedDefenseCompany
from models.transportation_models import TrackedTransportationCompany
from models.chemicals_models import TrackedChemicalCompany
from models.agriculture_models import TrackedAgricultureCompany
from models.education_models import TrackedEducationCompany
from models.telecom_models import TrackedTelecomCompany
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_donations")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")
FEC_API_KEY = os.getenv("FEC_API_KEY", "DEMO_KEY")
FEC_BASE_URL = "https://api.open.fec.gov/v1"

engine = create_engine(DB_PATH, connect_args={"check_same_thread": False} if "sqlite" in DB_PATH else {})

import sqlalchemy.event as sa_event

if is_sqlite():
    @sa_event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.close()

Session = sessionmaker(bind=engine)


def _dedupe_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def parse_date_str(val: Optional[str]) -> Optional[date]:
    if not val:
        return None
    val = val.strip()[:10]
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(val, fmt).date()
        except (ValueError, TypeError):
            continue
    return None


def fec_get(endpoint: str, params: dict, retries: int = 3) -> Optional[dict]:
    """Make a GET request to the FEC API with retries and rate limiting."""
    params["api_key"] = FEC_API_KEY
    url = f"{FEC_BASE_URL}/{endpoint}"

    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=30)
            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                log.warning(f"FEC API rate limited, waiting {wait}s (attempt {attempt + 1}/{retries})")
                time.sleep(wait)
                continue
            if resp.status_code == 403:
                log.error("FEC API: Forbidden — check FEC_API_KEY or request a key at https://api.open.fec.gov/developers/")
                return None
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException as e:
            log.error(f"FEC API error ({endpoint}): {e}")
            if attempt < retries - 1:
                time.sleep(2)
                continue
            return None

    return None


def load_tracked_entities(session, sector_filter: Optional[str] = None, entity_id_filter: Optional[str] = None) -> list[dict]:
    """
    Load tracked companies from all sectors.
    Returns list of dicts: {entity_type, entity_id, display_name, pac_search_names}
    """
    entities = []

    sector_configs = [
        ("finance", TrackedInstitution, "institution_id"),
        ("health", TrackedCompany, "company_id"),
        ("tech", TrackedTechCompany, "company_id"),
        ("energy", TrackedEnergyCompany, "company_id"),
        ("defense", TrackedDefenseCompany, "company_id"),
        ("transportation", TrackedTransportationCompany, "company_id"),
        ("chemicals", TrackedChemicalCompany, "company_id"),
        ("agriculture", TrackedAgricultureCompany, "company_id"),
        ("education", TrackedEducationCompany, "company_id"),
        ("telecom", TrackedTelecomCompany, "company_id"),
    ]

    for sector, model, id_field in sector_configs:
        if sector_filter and sector != sector_filter:
            continue

        query = session.query(model)
        if entity_id_filter:
            query = query.filter(getattr(model, id_field) == entity_id_filter)

        for row in query.all():
            eid = getattr(row, id_field)
            name = row.display_name

            # Build PAC search names — companies often have PACs named like:
            # "JPMORGAN CHASE & CO PAC", "PFIZER INC PAC", etc.
            # We search by the core company name
            pac_search = _build_pac_search_name(name)

            entities.append({
                "entity_type": sector,
                "entity_id": eid,
                "display_name": name,
                "pac_search_name": pac_search,
            })

    return entities


def _build_pac_search_name(display_name: str) -> str:
    """
    Extract a clean search term from company display name for FEC committee search.
    E.g., 'JPMorgan Chase & Co.' -> 'JPMORGAN CHASE'
          'Pfizer Inc.' -> 'PFIZER'
          'Alphabet Inc.' -> 'ALPHABET'
    """
    name = display_name.upper()
    # Remove common suffixes iteratively (a name may have multiple, e.g. "FOO HOLDINGS INC.")
    changed = True
    while changed:
        changed = False
        for suffix in [" INC.", " INC", " CORP.", " CORP", " CORPORATION", " CO.", " CO",
                       " LLC", " LTD.", " LTD", " L.P.", " LP", " PLC", " GROUP",
                       " HOLDINGS", " HOLDING", " & CO.", " & CO"]:
            if name.endswith(suffix):
                name = name[: -len(suffix)]
                changed = True
    return name.strip()


def _pac_search_variants(display_name: str) -> list[str]:
    """Yield a small ranked set of search-name variants for the FEC `committees`
    endpoint. Some sectors (transportation, agriculture, telecom) have PACs
    whose names don't include the legal suffix-stripped corporate name —
    e.g., John Deere's PAC is "DEERE & COMPANY POLITICAL ACTION COMMITTEE",
    UPS's is "UNITED PARCEL SERVICE INC. POLITICAL ACTION COMMITTEE", and
    Tyson Foods is "TYSON FOODS, INC. POLITICAL ACTION COMMITTEE."

    Returns the variants in order of decreasing specificity. Caller stops
    at the first variant that returns committee hits to avoid duplicate
    work and rate-limit pressure.
    """
    primary = _build_pac_search_name(display_name)
    variants = [primary]

    # Variant 2: full display name uppercased (preserves "& CO", "FOODS",
    # "RAILROAD" etc. that are sometimes in the PAC name).
    full_upper = display_name.upper().strip()
    if full_upper and full_upper != primary:
        variants.append(full_upper)

    # Variant 3: just the first word of the cleaned name. Catches PACs
    # named "Tyson PAC", "Cargill PAC", "Verizon Good Government Club"
    # where only the brand survives in the committee name.
    if primary:
        first_token = primary.split()[0]
        if first_token and first_token != primary:
            variants.append(first_token)

    # Dedupe while preserving order.
    seen = set()
    out = []
    for v in variants:
        if v and v not in seen:
            out.append(v)
            seen.add(v)
    return out


def search_committees(company_name: str) -> list[dict]:
    """
    Search FEC for committees (PACs) associated with a company name.
    Returns list of committee dicts with committee_id and name.
    """
    data = fec_get("committees/", {
        "q": company_name,
        "committee_type": ["O", "Q", "N", "W"],  # PAC types: Super PAC, Qualified, Non-qualified, Independent
        "per_page": 100,
        "sort": "-receipts",
    })
    if not data:
        return []

    results = data.get("results", [])
    log.debug(f"  Found {len(results)} committees for '{company_name}'")
    return results


def fetch_committee_disbursements(committee_id: str, cycle: str = "2024") -> list[dict]:
    """
    Fetch disbursements from a committee to candidate committees.
    Uses schedule_b (disbursements) endpoint.
    """
    all_results = []
    page = 1
    last_index = None

    while True:
        params = {
            "committee_id": committee_id,
            "two_year_transaction_period": cycle,
            "per_page": 100,
            "sort": "-disbursement_amount",
        }
        if last_index:
            params["last_index"] = last_index

        data = fec_get("schedules/schedule_b/", params)
        if not data:
            break

        results = data.get("results", [])
        all_results.extend(results)

        pagination = data.get("pagination", {})
        last_index = pagination.get("last_indexes", {}).get("last_index")
        if not last_index or len(results) < 100 or len(all_results) >= 5000:
            break

        page += 1
        time.sleep(0.5)  # Rate limit

    return all_results


def match_candidate_to_member(candidate_name: str, candidate_id: str,
                              member_lookup: dict,
                              candidate_state: Optional[str] = None) -> Optional[str]:
    """
    Try to match an FEC candidate to a tracked member.

    member_lookup contains:
      - (last_name_lower, state_upper) -> person_id
      - fec_candidate_id -> person_id
      - "__name_only__" -> {last_name_lower -> person_id}  (fallback)
    """
    # Try FEC candidate ID match first
    if candidate_id and candidate_id in member_lookup:
        return member_lookup[candidate_id]

    # Try (last_name, state) match
    if candidate_name:
        # FEC names are "LASTNAME, FIRSTNAME"
        parts = candidate_name.split(",")
        if parts:
            last = parts[0].strip().lower()
            state = (candidate_state or "").upper().strip()

            if state:
                key = (last, state)
                if key in member_lookup:
                    return member_lookup[key]

            # Fall back to name-only if state is unavailable
            name_only = member_lookup.get("__name_only__", {})
            if last in name_only:
                if not state:
                    log.warning(f"  Name-only fallback match for '{candidate_name}' "
                                f"(no state available) — may be inaccurate for common surnames")
                return name_only[last]

    return None


def build_member_lookup(session) -> dict:
    """Build lookup dict for matching FEC candidates to tracked members.

    Uses (last_name, state) tuples as keys to avoid collisions for common
    surnames (Brown, Smith, Johnson, etc.).  Also keeps FEC candidate ID
    entries and a name-only fallback dict for cases where state is unavailable.
    """
    lookup = {}          # (last_name_lower, state_upper) -> person_id  AND  fec_id -> person_id
    name_only = {}       # last_name_lower -> person_id  (fallback, may collide)
    members = session.query(TrackedMember).filter_by(is_active=1).all()
    for m in members:
        last = m.display_name.split()[-1].lower()
        state = (m.state or "").upper().strip()
        if state:
            lookup[(last, state)] = m.person_id
        # Keep a name-only fallback (last writer wins, but that's OK — it's
        # only used when state is unavailable from the FEC record)
        name_only[last] = m.person_id
        # By FEC candidate ID if we have it
        if hasattr(m, "fec_candidate_id") and m.fec_candidate_id:
            lookup[m.fec_candidate_id] = m.person_id
    # Stash the name-only dict inside the main lookup under a sentinel key
    lookup["__name_only__"] = name_only
    return lookup


def main():
    parser = argparse.ArgumentParser(description="Sync company donation data from FEC API")
    parser.add_argument("--sector", choices=["finance", "health", "tech", "energy", "defense",
                                              "transportation", "chemicals", "agriculture",
                                              "education", "telecom"],
                        help="Only sync for this sector")
    parser.add_argument("--entity-id", type=str, help="Only sync for this entity_id")
    parser.add_argument("--cycle", type=str, default="2024", help="Election cycle (default: 2024)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be synced without writing")
    args = parser.parse_args()

    if FEC_API_KEY == "DEMO_KEY":
        log.warning("Using DEMO_KEY — rate limits are very strict (1,000 requests/hour). "
                     "Get a free key at https://api.open.fec.gov/developers/")

    Base.metadata.create_all(engine)
    session = Session()

    # Build member lookup for matching candidates
    member_lookup = build_member_lookup(session)
    log.info(f"Loaded {len(member_lookup)} member lookup entries")

    # Load tracked entities
    entities = load_tracked_entities(session, sector_filter=args.sector, entity_id_filter=args.entity_id)
    log.info(f"Found {len(entities)} tracked entities to process")

    total_inserted = 0
    total_dupes = 0
    total_committees = 0

    for i, entity in enumerate(entities):
        log.info(f"[{i + 1}/{len(entities)}] {entity['display_name']} ({entity['entity_type']})")

        try:
            # Search for PACs associated with this company. Try the
            # cleaned-name variant first; if FEC returns nothing, fall
            # back to the full display name (which may include the
            # legal suffix the PAC kept in its registered name) and
            # then to the first-word stem. This catches sector-PAC
            # naming patterns the original 1-shot search missed —
            # see `_pac_search_variants` for the list.
            committees: list[dict] = []
            tried_variants: list[str] = []
            for variant in _pac_search_variants(entity["display_name"]):
                tried_variants.append(variant)
                committees = search_committees(variant)
                time.sleep(0.5)  # Rate limit between FEC searches
                if committees:
                    break

            if not committees:
                log.info(f"  No committees found for '{entity['display_name']}'"
                         f" (tried variants: {tried_variants})")
                continue

            total_committees += len(committees)

            for committee in committees:
                cmte_id = committee.get("committee_id", "")
                cmte_name = committee.get("name", "")

                if not cmte_id:
                    continue

                log.info(f"  Committee: {cmte_name} ({cmte_id})")

                # Fetch disbursements to candidates
                disbursements = fetch_committee_disbursements(cmte_id, cycle=args.cycle)
                time.sleep(0.5)  # Rate limit

                if not disbursements:
                    log.info(f"    No disbursements found for cycle {args.cycle}")
                    continue

                entity_inserted = 0

                for disb in disbursements:
                    recipient_name = disb.get("recipient_name", "")
                    recipient_cmte_id = disb.get("recipient_committee_id", "")
                    amount = disb.get("disbursement_amount")
                    disb_date = disb.get("disbursement_date")
                    candidate_name = disb.get("candidate_name", "")
                    candidate_id = disb.get("candidate_id", "")
                    candidate_state = disb.get("candidate_office_state", "")

                    if not amount or amount <= 0:
                        continue

                    # Try to match to tracked member
                    person_id = match_candidate_to_member(
                        candidate_name, candidate_id, member_lookup,
                        candidate_state=candidate_state,
                    )

                    # Build dedupe hash: entity + committee + candidate + amount + date
                    dedupe = _dedupe_hash(f"{entity['entity_id']}:{cmte_id}:{candidate_id or recipient_name}:{amount}:{disb_date}")

                    if not args.dry_run:
                        if session.query(CompanyDonation).filter_by(dedupe_hash=dedupe).first():
                            total_dupes += 1
                            continue

                        donation_date = parse_date_str(disb_date)

                        session.add(CompanyDonation(
                            entity_type=entity["entity_type"],
                            entity_id=entity["entity_id"],
                            person_id=person_id,
                            committee_name=cmte_name,
                            committee_id=cmte_id,
                            candidate_name=candidate_name or recipient_name,
                            candidate_id=candidate_id if candidate_id else None,
                            amount=float(amount),
                            cycle=args.cycle,
                            donation_date=donation_date,
                            source_url=f"https://www.fec.gov/data/disbursements/?committee_id={cmte_id}&two_year_transaction_period={args.cycle}",
                            dedupe_hash=dedupe,
                        ))
                        entity_inserted += 1
                    else:
                        log.info(f"    [DRY RUN] ${amount:,.0f} -> {candidate_name or recipient_name}")
                        entity_inserted += 1

                if entity_inserted > 0 and not args.dry_run:
                    session.commit()
                    total_inserted += entity_inserted
                    log.info(f"    Inserted {entity_inserted} disbursements")
        except Exception as e:
            log.error(f"FAILED {entity['entity_id']}: {e}")
            session.rollback()

    log.info(f"\nDone! {total_inserted} new donations inserted, {total_dupes} dupes skipped, "
             f"{total_committees} total committees searched")
    session.close()


if __name__ == "__main__":
    main()
