"""
Closed-loop influence detection service.

Detects: Company lobbies on issue X → Bill in area X referred to Committee Z →
         Politician P on Committee Z received donations from Company.

Uses a SQL-first approach: pre-compute donation pairs and committee-bill links,
then join in Python to find closed loops efficiently.
"""

import re
from typing import Dict, Any, List, Optional
from sqlalchemy import func, text
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

# Reverse map: policy area → set of issue codes
POLICY_TO_ISSUES = {}
for issue, policies in ISSUE_TO_POLICY.items():
    for p in policies:
        POLICY_TO_ISSUES.setdefault(p, set()).add(issue)


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

    # Step 1: Get all donation pairs (entity_id, entity_type, person_id) with aggregates
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

    donation_pairs = donation_q.all()
    if not donation_pairs:
        return {"closed_loops": [], "stats": _empty_stats()}

    # Build lookup: (entity_id, entity_type, person_id) → donation info
    donation_map = {}
    for row in donation_pairs:
        key = (row.entity_id, row.entity_type, row.person_id)
        donation_map[key] = {
            "total_amount": float(row.total_amount or 0),
            "donation_count": row.donation_count,
            "latest_date": str(row.latest_date) if row.latest_date else None,
        }

    # Step 2: Get committee memberships for all politicians with donations
    person_ids = list(set(r.person_id for r in donation_pairs))
    memberships_q = db.query(
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
        TrackedMember.person_id.in_(person_ids),
    )
    memberships = memberships_q.all()

    # Build lookup: person_id → list of (committee_thomas_id, role)
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

    # Step 3: Get all committees (cached lookup)
    all_committees = {c.thomas_id: c for c in db.query(Committee).filter(
        Committee.parent_thomas_id.is_(None)
    ).all()}

    # Build committee name → thomas_id mapping for bill action matching
    committee_name_map = {}
    for tid, c in all_committees.items():
        if c.name:
            committee_name_map[c.name.lower()] = tid

    # Step 4: Get bills referred to committees (with policy area)
    bill_refs = db.query(
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
    ).all()

    # Build lookup: committee_thomas_id → list of (bill_info, policy_area)
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

        # Get lobbying aggregates
        records = db.query(
            ecol,
            model.lobbying_issues,
            model.income,
        ).filter(
            ecol.in_(list(eids)),
            model.filing_year >= year_from,
            model.filing_year <= year_to,
        ).all()

        for eid_val, issues_str, income in records:
            key = (sector, eid_val)
            if key not in lobby_data:
                lobby_data[key] = {"issues": set(), "total_income": 0, "filing_count": 0}
            lobby_data[key]["filing_count"] += 1
            lobby_data[key]["total_income"] += (income or 0)
            if issues_str:
                for issue in issues_str.split(", "):
                    lobby_data[key]["issues"].add(issue.strip())

        # Get company display names
        for co in db.query(tracked_model).filter(
            ecol.in_(list(eids))
        ).all():
            eid_val = getattr(co, ecol.key)
            company_names[(sector, eid_val)] = co.display_name

    # Step 6: Assemble closed loops
    loops = []
    seen = set()

    for (eid, etype, pid), donation_info in donation_map.items():
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
            # Check if any bills in this committee match the policy areas
            bills_in_committee = committee_bills.get(comm_tid, [])
            for bill_info in bills_in_committee:
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

    return {
        "closed_loops": loops,
        "stats": {
            "total_loops_found": len(seen),
            "unique_companies": unique_companies,
            "unique_politicians": unique_politicians,
            "unique_bills": unique_bills,
            "total_lobbying_spend": total_lobby,
            "total_donations": total_donations,
        },
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
