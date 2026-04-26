"""
Closed-loop influence detection service.

Detects: Company lobbies on issue X -> Bill in area X referred to Committee Z ->
         Politician P on Committee Z received donations from Company.

Uses a SQL-first approach: pre-compute donation pairs and committee-bill links,
then join in Python to find closed loops efficiently.

Performance safeguards:
- Donation pairs capped at 200, sorted by amount desc
- Bill refs filtered by year and capped at 2000
- Lobbying IN clauses batched at 100
- Assembly loop early-terminates at limit * 3
- 8-second timeout returns partial results
- File-backed in-memory cache (1h TTL) for repeated requests; survives
  process restarts so cold loads after a redeploy don't pay the full
  5+ second computation cost.
"""

import atexit
import os
import threading
import time
import hashlib
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy import func, text, desc
from sqlalchemy.orm import Session

from utils.db_compat import limit_sql

# In-memory cache: key -> (timestamp, result). Persisted to disk on a
# background timer + atexit so process restarts (e.g., after deploys)
# don't lose hot results.
_cache: Dict[str, Tuple[float, Dict]] = {}
_cache_lock = threading.Lock()
_CACHE_TTL = 3600  # 1 hour — closed loops aggregate annual / multi-year data
_CACHE_FILE = Path(os.environ.get(
    "CLOSED_LOOP_CACHE_PATH",
    str(Path(__file__).resolve().parent.parent / "data" / "closed_loop_cache.json"),
))
_CACHE_PERSIST_INTERVAL = 60  # snapshot to disk every minute when dirty
_cache_dirty = False
_persist_timer: Optional[threading.Timer] = None


def _load_cache_from_disk() -> None:
    """Restore cache from disk on import. Stale entries are dropped on restore."""
    global _cache
    if not _CACHE_FILE.exists():
        return
    try:
        with open(_CACHE_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            return
        now = time.monotonic()
        wall_now = time.time()
        # Disk format stores wall-clock timestamps; convert to monotonic
        # offset so the in-memory comparator still works.
        with _cache_lock:
            for key, entry in raw.items():
                if not isinstance(entry, dict):
                    continue
                wall_ts = entry.get("wall_ts")
                result = entry.get("result")
                if wall_ts is None or result is None:
                    continue
                age = wall_now - float(wall_ts)
                if age >= _CACHE_TTL:
                    continue
                _cache[key] = (now - age, result)
    except Exception:
        # Corrupt cache file: ignore and start fresh
        pass


def _persist_cache_to_disk() -> None:
    global _cache_dirty
    with _cache_lock:
        if not _cache_dirty:
            return
        # Convert monotonic timestamps back to wall-clock for disk
        wall_now = time.time()
        mono_now = time.monotonic()
        snapshot = {}
        for key, (mono_ts, result) in _cache.items():
            age = mono_now - mono_ts
            if age >= _CACHE_TTL:
                continue
            snapshot[key] = {
                "wall_ts": wall_now - age,
                "result": result,
            }
        _cache_dirty = False
    try:
        _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = _CACHE_FILE.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, separators=(",", ":"))
        os.replace(tmp, _CACHE_FILE)
    except Exception:
        # Persistence is best-effort; never raise from a background timer.
        pass


def _start_persist_timer() -> None:
    global _persist_timer
    if _persist_timer is not None:
        return
    def _tick() -> None:
        _persist_cache_to_disk()
        # Reschedule
        t = threading.Timer(_CACHE_PERSIST_INTERVAL, _tick)
        t.daemon = True
        t.start()
        global _persist_timer
        _persist_timer = t
    t = threading.Timer(_CACHE_PERSIST_INTERVAL, _tick)
    t.daemon = True
    t.start()
    _persist_timer = t


# Initialise on import
_load_cache_from_disk()
_start_persist_timer()
atexit.register(_persist_cache_to_disk)

from models.database import (
    TrackedMember, Bill, BillAction, CompanyDonation,
)
from models.committee_models import Committee, CommitteeMembership
from models.tech_models import LobbyingRecord, TrackedTechCompany
from models.finance_models import FinanceLobbyingRecord, TrackedInstitution
from models.health_models import HealthLobbyingRecord, TrackedCompany
from models.energy_models import EnergyLobbyingRecord, TrackedEnergyCompany


# Map lobbying issue codes to bill policy areas
ISSUE_TO_POLICY = {
    "Taxes": ["Taxation"],
    "Health Issues": ["Health"],
    "Energy/Nuclear": ["Energy", "Nuclear Energy"],
    "Environment/Superfund": ["Environmental Protection"],
    "Defense": ["Armed Forces and National Security"],
    "Banking": ["Finance and Financial Sector"],
    "Budget/Appropriations": ["Economics and Public Finance"],
    "Education": ["Education"],
    "Trade (Domestic & Foreign)": ["Foreign Trade and International Finance"],
    "Transportation": ["Transportation and Public Works"],
    "Telecommunications/Information Technology": ["Science, Technology, Communications"],
    "Medicare/Medicaid": ["Health"],
    "Pharmacy": ["Health"],
    "Medical/Disease Research/Clinical Labs": ["Health"],
    "Immigration": ["Immigration"],
    "Labor Issues/Antitrust/Workplace": ["Labor and Employment"],
    "Agriculture": ["Agriculture and Food"],
    "Copyright/Patent/Trademark": ["Commerce"],
    "Housing": ["Housing and Community Development"],
    "Insurance": ["Finance and Financial Sector"],
    "Financial Institutions/Investments/Securities": ["Finance and Financial Sector"],
}

# Reverse map: policy area -> set of issue codes
POLICY_TO_ISSUES = {}
for issue, policies in ISSUE_TO_POLICY.items():
    for p in policies:
        POLICY_TO_ISSUES.setdefault(p, set()).add(issue)

# Timeout in seconds for the entire function
_TIMEOUT_SECONDS = 8


def _batched_in_query(db, query_fn, ids, batch_size=100):
    """Execute a query function in batches over a list of IDs to avoid huge IN clauses."""
    results = []
    id_list = list(ids)
    for i in range(0, len(id_list), batch_size):
        batch = id_list[i:i + batch_size]
        results.extend(query_fn(batch))
    return results


def find_closed_loops(
    db: Session,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    person_id: Optional[str] = None,
    min_donation: float = 0,
    year_from: int = 2020,
    year_to: int = 2026,
    limit: int = 25,
) -> Dict[str, Any]:
    """
    Find closed-loop influence chains using a SQL-first approach.
    """
    # Check cache first (in-memory + disk-restored on import)
    cache_key = hashlib.md5(json.dumps({
        "et": entity_type, "eid": entity_id, "pid": person_id,
        "md": min_donation, "yf": year_from, "yt": year_to, "l": limit
    }, sort_keys=True).encode()).hexdigest()
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(cache_key)
    if cached:
        cached_time, cached_result = cached
        if now - cached_time < _CACHE_TTL:
            return cached_result

    start_time = now
    is_partial = False

    def _check_timeout():
        nonlocal is_partial
        if time.monotonic() - start_time > _TIMEOUT_SECONDS:
            is_partial = True
            return True
        return False

    # Step 1: Get donation pairs using raw SQL for speed
    # ORM GROUP BY on the full donations table is too slow (~10s); raw SQL is ~1-2s
    sql_filters = ["person_id IS NOT NULL"]
    sql_params = {}
    if entity_type:
        sql_filters.append("entity_type = :entity_type")
        sql_params["entity_type"] = entity_type
    if entity_id:
        sql_filters.append("entity_id = :entity_id")
        sql_params["entity_id"] = entity_id
    if person_id:
        sql_filters.append("person_id = :person_id")
        sql_params["person_id"] = person_id

    where_clause = " AND ".join(sql_filters)
    having_clause = f"HAVING total_amount >= {float(min_donation)}" if min_donation > 0 else ""

    raw_sql = text(f"""
        SELECT entity_id, entity_type, person_id,
               SUM(amount) as total_amount,
               COUNT(id) as donation_count,
               MAX(donation_date) as latest_date
        FROM company_donations
        WHERE {where_clause}
        GROUP BY entity_id, entity_type, person_id
        {having_clause}
        ORDER BY total_amount DESC
        {limit_sql(100)}
    """)
    donation_pairs = db.execute(raw_sql, sql_params).fetchall()
    if not donation_pairs:
        return {"closed_loops": [], "stats": _empty_stats()}

    if _check_timeout():
        return {"closed_loops": [], "stats": {**_empty_stats(), "partial": True}}

    # Build lookup: (entity_id, entity_type, person_id) -> donation info
    donation_map = {}
    for row in donation_pairs:
        key = (row.entity_id, row.entity_type, row.person_id)
        donation_map[key] = {
            "total_amount": float(row.total_amount or 0),
            "donation_count": row.donation_count,
            "latest_date": str(row.latest_date) if row.latest_date else None,
        }

    # Step 2: Get committee memberships for all politicians with donations
    # Batch person_ids if > 500
    person_ids = list(set(r.person_id for r in donation_pairs))

    def _query_memberships(pid_batch):
        return db.query(
            CommitteeMembership.committee_thomas_id,
            CommitteeMembership.bioguide_id,
            CommitteeMembership.role,
            TrackedMember.person_id,
            TrackedMember.display_name,
            TrackedMember.party,
            TrackedMember.state,
        ).join(
            TrackedMember, TrackedMember.bioguide_id == CommitteeMembership.bioguide_id
        ).filter(
            TrackedMember.person_id.in_(pid_batch),
        ).all()

    if len(person_ids) > 500:
        memberships = _batched_in_query(db, _query_memberships, person_ids, batch_size=500)
    else:
        memberships = _query_memberships(person_ids)

    # Build lookup: person_id -> list of (committee_thomas_id, role)
    person_committees = {}
    person_info = {}
    for m in memberships:
        person_committees.setdefault(m.person_id, []).append(
            (m.committee_thomas_id, m.role)
        )
        person_info[m.person_id] = {
            "display_name": m.display_name,
            "party": m.party,
            "state": m.state,
        }

    if _check_timeout():
        return {"closed_loops": [], "stats": {**_empty_stats(), "partial": True}}

    # Step 3: Get all committees (cached lookup)
    all_committees = {c.thomas_id: c for c in db.query(Committee).filter(
        Committee.parent_thomas_id.is_(None)
    ).all()}

    # Build committee name -> thomas_id mapping for bill action matching
    committee_name_map = {}
    for tid, c in all_committees.items():
        if c.name:
            committee_name_map[c.name.lower()] = tid

    # Step 4: Get bills referred to committees (with policy area)
    # FILTERED by year and congress number, CAPPED at 5000
    bill_refs_q = db.query(
        Bill.bill_id,
        Bill.title,
        Bill.policy_area,
        Bill.status_bucket,
        BillAction.committee,
        BillAction.action_date,
    ).join(
        BillAction, BillAction.bill_id == Bill.bill_id
    ).filter(
        BillAction.committee.isnot(None),
        BillAction.committee != "",
        Bill.policy_area.isnot(None),
        Bill.congress >= 117,  # 117th congress = 2021-2022, matches 2020+ data
    )
    # Add year filter on action_date if available
    if year_from:
        bill_refs_q = bill_refs_q.filter(
            BillAction.action_date >= f"{year_from}-01-01"
        )

    bill_refs = bill_refs_q.limit(2000).all()

    if _check_timeout():
        return {"closed_loops": [], "stats": {**_empty_stats(), "partial": True}}

    # Build lookup: committee_thomas_id -> list of (bill_info, policy_area)
    committee_bills = {}
    for br in bill_refs:
        # Match committee name to thomas_id
        matched_tid = None
        if br.committee:
            action_comm = br.committee.lower()
            for cname, tid in committee_name_map.items():
                if cname in action_comm or action_comm in cname:
                    matched_tid = tid
                    break

        if matched_tid:
            committee_bills.setdefault(matched_tid, []).append({
                "bill_id": br.bill_id,
                "title": br.title,
                "policy_area": br.policy_area,
                "status": br.status_bucket,
                "referral_date": str(br.action_date) if br.action_date else None,
            })

    # Step 5: Get lobbying aggregates per (entity_id, sector)
    # Batched IN clauses for entity IDs > 100
    entity_ids_by_sector = {}
    for eid, etype, _ in donation_map.keys():
        entity_ids_by_sector.setdefault(etype, set()).add(eid)

    lobby_configs = [
        ("finance", FinanceLobbyingRecord, FinanceLobbyingRecord.institution_id, TrackedInstitution),
        ("health", HealthLobbyingRecord, HealthLobbyingRecord.company_id, TrackedCompany),
        ("tech", LobbyingRecord, LobbyingRecord.company_id, TrackedTechCompany),
        ("energy", EnergyLobbyingRecord, EnergyLobbyingRecord.company_id, TrackedEnergyCompany),
    ]

    # lobby_data[sector][entity_id] = {issues: set, total_income: float, filing_count: int}
    lobby_data = {}
    company_names = {}

    for sector, model, ecol, tracked_model in lobby_configs:
        if entity_type and sector != entity_type:
            continue
        eids = entity_ids_by_sector.get(sector, set())
        if not eids:
            continue

        if _check_timeout():
            is_partial = True
            break

        # Get lobbying aggregates - batched if > 100 entity IDs
        def _query_lobbying(eid_batch, _model=model, _ecol=ecol):
            return db.query(
                _ecol,
                _model.lobbying_issues,
                _model.income,
            ).filter(
                _ecol.in_(eid_batch),
                _model.filing_year >= year_from,
                _model.filing_year <= year_to,
            ).all()

        if len(eids) > 100:
            records = _batched_in_query(db, _query_lobbying, eids, batch_size=100)
        else:
            records = _query_lobbying(list(eids))

        for eid_val, issues_str, income in records:
            key = (sector, eid_val)
            if key not in lobby_data:
                lobby_data[key] = {"issues": set(), "total_income": 0, "filing_count": 0}
            lobby_data[key]["filing_count"] += 1
            lobby_data[key]["total_income"] += (income or 0)
            if issues_str:
                for issue in issues_str.split(", "):
                    lobby_data[key]["issues"].add(issue.strip())

        # Get company display names - batched if > 100
        def _query_names(eid_batch, _tracked_model=tracked_model, _ecol=ecol):
            return db.query(_tracked_model).filter(
                _ecol.in_(eid_batch)
            ).all()

        if len(eids) > 100:
            name_rows = _batched_in_query(db, _query_names, eids, batch_size=100)
        else:
            name_rows = _query_names(list(eids))

        for co in name_rows:
            eid_val = getattr(co, ecol.key)
            company_names[(sector, eid_val)] = co.display_name

    # Step 6: Assemble closed loops with early termination
    loops = []
    seen = set()
    max_loops_before_sort = limit * 3  # Early termination threshold

    for (eid, etype, pid), donation_info in donation_map.items():
        if is_partial or len(loops) >= max_loops_before_sort:
            break

        if _check_timeout():
            is_partial = True
            break

        lobby_key = (etype, eid)
        if lobby_key not in lobby_data:
            continue

        ld = lobby_data[lobby_key]
        if not ld["issues"]:
            continue

        # Map this company's lobbying issues to policy areas
        target_policies = set()
        for issue in ld["issues"]:
            for policy in ISSUE_TO_POLICY.get(issue, []):
                target_policies.add(policy)
        if not target_policies:
            continue

        # Check what committees this politician is on
        if pid not in person_committees:
            continue

        for comm_tid, comm_role in person_committees[pid]:
            if len(loops) >= max_loops_before_sort:
                break

            # Check if any bills in this committee match the policy areas
            bills_in_committee = committee_bills.get(comm_tid, [])
            for bill_info in bills_in_committee:
                if len(loops) >= max_loops_before_sort:
                    break

                if bill_info["policy_area"] not in target_policies:
                    continue

                dedup_key = (eid, bill_info["bill_id"], pid)
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)

                comm = all_committees.get(comm_tid)
                loops.append({
                    "company": {
                        "entity_type": etype,
                        "entity_id": eid,
                        "display_name": company_names.get(lobby_key, eid),
                    },
                    "lobbying": {
                        "total_income": ld["total_income"],
                        "issue_codes": ", ".join(sorted(ld["issues"])),
                        "filing_count": ld["filing_count"],
                    },
                    "bill": bill_info,
                    "committee": {
                        "thomas_id": comm_tid,
                        "name": comm.name if comm else comm_tid,
                        "chamber": comm.chamber if comm else None,
                        "referral_date": bill_info.get("referral_date"),
                    },
                    "politician": {
                        "person_id": pid,
                        "committee_role": comm_role,
                        **(person_info.get(pid, {})),
                    },
                    "donation": donation_info,
                })

    # Sort by donation amount descending, limit
    loops.sort(key=lambda x: x["donation"]["total_amount"], reverse=True)
    loops = loops[:limit]

    unique_companies = len(set(l["company"]["entity_id"] for l in loops))
    unique_politicians = len(set(l["politician"]["person_id"] for l in loops))
    unique_bills = len(set(l["bill"]["bill_id"] for l in loops))
    total_lobby = sum(l["lobbying"]["total_income"] for l in loops)
    total_donations = sum(l["donation"]["total_amount"] for l in loops)

    stats = {
        "total_loops_found": len(seen),
        "unique_companies": unique_companies,
        "unique_politicians": unique_politicians,
        "unique_bills": unique_bills,
        "total_lobbying_spend": total_lobby,
        "total_donations": total_donations,
    }
    if is_partial:
        stats["partial"] = True

    result = {
        "closed_loops": loops,
        "stats": stats,
    }
    # Cache the result. Mark dirty so the periodic timer flushes to disk.
    with _cache_lock:
        _cache[cache_key] = (time.monotonic(), result)
        global _cache_dirty
        _cache_dirty = True
    return result


def _empty_stats():
    return {
        "total_loops_found": 0,
        "unique_companies": 0,
        "unique_politicians": 0,
        "unique_bills": 0,
        "total_lobbying_spend": 0,
        "total_donations": 0,
    }
