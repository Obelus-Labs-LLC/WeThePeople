"""
Closed-loop influence detection service.

Detects: Company lobbies on issue X -> Bill in area X referred to Committee Z ->
         Politician P on Committee Z received donations from Company.

Uses a SQL-first approach: pre-compute donation pairs and committee-bill links,
then join in Python to find closed loops efficiently.

Performance safeguards:
- Donation pairs capped at 500, sorted by amount desc
- Bill refs filtered by year and capped at 5000
- Lobbying IN clauses batched at 100
- Assembly loop early-terminates at limit * 3
- 25-second timeout returns partial results
"""

import time
from typing import Dict, Any, List, Optional
from sqlalchemy import func, text, desc
from sqlalchemy.orm import Session

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
_TIMEOUT_SECONDS = 25


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
    start_time = time.monotonic()
    is_partial = False

    def _check_timeout():
        nonlocal is_partial
        if time.monotonic() - start_time > _TIMEOUT_SECONDS:
            is_partial = True
            return True
        return False

    # Step 1: Get donation pairs (entity_id, entity_type, person_id) with aggregates
    # Capped at 500, sorted by total_amount desc for most interesting results first
    donation_q = db.query(
        CompanyDonation.entity_id,
        CompanyDonation.entity_type,
        CompanyDonation.person_id,
        func.sum(CompanyDonation.amount).label("total_amount"),
        func.count(CompanyDonation.id).label("donation_count"),
        func.max(CompanyDonation.donation_date).label("latest_date"),
    ).filter(
        CompanyDonation.person_id.isnot(None),
    ).group_by(
        CompanyDonation.entity_id,
        CompanyDonation.entity_type,
        CompanyDonation.person_id,
    )
    if min_donation > 0:
        donation_q = donation_q.having(func.sum(CompanyDonation.amount) >= min_donation)
    if entity_type:
        donation_q = donation_q.filter(CompanyDonation.entity_type == entity_type)
    if entity_id:
        donation_q = donation_q.filter(CompanyDonation.entity_id == entity_id)
    if person_id:
        donation_q = donation_q.filter(CompanyDonation.person_id == person_id)

    donation_pairs = donation_q.order_by(desc("total_amount")).limit(500).all()
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

    bill_refs = bill_refs_q.limit(5000).all()

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

    return {
        "closed_loops": loops,
        "stats": stats,
    }


def _empty_stats():
    return {
        "total_loops_found": 0,
        "unique_companies": 0,
        "unique_politicians": 0,
        "unique_bills": 0,
        "total_lobbying_spend": 0,
        "total_donations": 0,
    }
