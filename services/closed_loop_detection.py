"""
Closed-loop influence detection service.

Detects: Company lobbies on issue X → Bill in area X referred to Committee Z →
         Politician P on Committee Z received donations from Company.
"""

import re
from typing import Dict, Any, List, Optional
from sqlalchemy import func, and_, or_, desc
from sqlalchemy.orm import Session

from models.database import (
    SessionLocal, TrackedMember, Bill, BillAction,
    CompanyDonation, CongressionalTrade,
)
from models.committee_models import Committee, CommitteeMembership
from models.tech_models import LobbyingRecord, TrackedTechCompany
from models.finance_models import FinanceLobbyingRecord, TrackedInstitution
from models.health_models import HealthLobbyingRecord, TrackedCompany
from models.energy_models import EnergyLobbyingRecord, TrackedEnergyCompany


# Map lobbying issue codes to bill policy areas (many-to-many fuzzy mapping)
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


def _parse_bill_refs(text: str) -> List[str]:
    """Extract bill references like H.R. 1234, S. 5678 from text."""
    if not text:
        return []
    pattern = r'(?:H\.?\s*R\.?|S\.?|H\.?\s*J\.?\s*Res\.?|S\.?\s*J\.?\s*Res\.?|H\.?\s*Con\.?\s*Res\.?|S\.?\s*Con\.?\s*Res\.?)\s*(\d+)'
    matches = re.findall(pattern, text, re.IGNORECASE)
    # Also match full references like "H.R. 1234"
    full_refs = re.findall(r'((?:H\.?\s*R\.?|S\.?)\s*\d+)', text, re.IGNORECASE)
    return list(set(full_refs))


def _normalize_bill_ref(ref: str) -> tuple:
    """Convert 'H.R. 1234' to ('hr', 1234)."""
    ref = ref.strip().upper()
    ref = re.sub(r'\s+', '', ref)
    ref = ref.replace('.', '')
    if ref.startswith('HR'):
        return ('hr', int(ref[2:]))
    elif ref.startswith('S') and ref[1:].isdigit():
        return ('s', int(ref[1:]))
    elif ref.startswith('HJRES'):
        return ('hjres', int(ref[5:]))
    elif ref.startswith('SJRES'):
        return ('sjres', int(ref[5:]))
    return None


def _get_lobby_configs():
    """Return (model, entity_col, entity_type, tracked_model) for each sector."""
    return [
        (FinanceLobbyingRecord, FinanceLobbyingRecord.institution_id, "finance", TrackedInstitution),
        (HealthLobbyingRecord, HealthLobbyingRecord.company_id, "health", TrackedCompany),
        (LobbyingRecord, LobbyingRecord.company_id, "tech", TrackedTechCompany),
        (EnergyLobbyingRecord, EnergyLobbyingRecord.company_id, "energy", TrackedEnergyCompany),
    ]


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
    Find closed-loop influence chains:
    Company lobbies → Bill in matching area → Committee reviews bill →
    Committee member received donations from same company.
    """
    loops = []
    seen = set()  # Dedupe by (entity_id, bill_id, person_id)

    configs = _get_lobby_configs()
    if entity_type:
        configs = [c for c in configs if c[2] == entity_type]

    for lobby_model, entity_col, sector, tracked_model in configs:
        # Get lobbying records with their issues
        lobby_q = db.query(lobby_model).filter(
            lobby_model.filing_year >= year_from,
            lobby_model.filing_year <= year_to,
            lobby_model.lobbying_issues.isnot(None),
        )
        if entity_id:
            lobby_q = lobby_q.filter(entity_col == entity_id)

        lobby_records = lobby_q.all()

        # Group by entity
        entity_lobbying = {}
        for rec in lobby_records:
            eid = getattr(rec, entity_col.key)
            if eid not in entity_lobbying:
                entity_lobbying[eid] = []
            entity_lobbying[eid].append(rec)

        for eid, records in entity_lobbying.items():
            # Collect all issue codes and specific issues for this company
            all_issues = set()
            all_bill_refs = []
            total_lobby_income = 0
            for rec in records:
                if rec.lobbying_issues:
                    for issue in rec.lobbying_issues.split(", "):
                        all_issues.add(issue.strip())
                if hasattr(rec, 'specific_issues') and rec.specific_issues:
                    refs = _parse_bill_refs(rec.specific_issues)
                    all_bill_refs.extend(refs)
                total_lobby_income += (rec.income or 0)

            # Map issue codes to policy areas
            target_policies = set()
            for issue in all_issues:
                for policy in ISSUE_TO_POLICY.get(issue, []):
                    target_policies.add(policy)

            if not target_policies and not all_bill_refs:
                continue

            # Find bills in matching policy areas that were referred to committees
            bill_q = db.query(Bill, BillAction).join(
                BillAction, BillAction.bill_id == Bill.bill_id
            ).filter(
                BillAction.committee.isnot(None),
                BillAction.committee != "",
            )

            if target_policies:
                bill_q = bill_q.filter(Bill.policy_area.in_(list(target_policies)))

            referred_bills = bill_q.limit(200).all()

            for bill, action in referred_bills:
                # Find which committee this maps to
                committee = None
                for comm in db.query(Committee).filter(
                    Committee.parent_thomas_id.is_(None)
                ).all():
                    if comm.name and action.committee and (
                        comm.name.lower() in action.committee.lower() or
                        action.committee.lower() in comm.name.lower()
                    ):
                        committee = comm
                        break

                if not committee:
                    continue

                # Find committee members who got donations from this company
                members = db.query(CommitteeMembership, TrackedMember).join(
                    TrackedMember,
                    TrackedMember.bioguide_id == CommitteeMembership.bioguide_id
                ).filter(
                    CommitteeMembership.committee_thomas_id == committee.thomas_id,
                ).all()

                for membership, member in members:
                    if person_id and member.person_id != person_id:
                        continue

                    # Check if this company donated to this member
                    donation_agg = db.query(
                        func.sum(CompanyDonation.amount),
                        func.count(CompanyDonation.id),
                        func.max(CompanyDonation.donation_date),
                    ).filter(
                        CompanyDonation.entity_id == eid,
                        CompanyDonation.entity_type == sector,
                        CompanyDonation.person_id == member.person_id,
                    ).first()

                    total_donated = donation_agg[0] or 0
                    donation_count = donation_agg[1] or 0

                    if donation_count == 0 or total_donated < min_donation:
                        continue

                    dedup_key = (eid, bill.bill_id, member.person_id)
                    if dedup_key in seen:
                        continue
                    seen.add(dedup_key)

                    # Get company display name
                    tracked = db.query(tracked_model).filter(
                        getattr(tracked_model, entity_col.key) == eid
                    ).first()
                    company_name = tracked.display_name if tracked else eid

                    loops.append({
                        "company": {
                            "entity_type": sector,
                            "entity_id": eid,
                            "display_name": company_name,
                        },
                        "lobbying": {
                            "total_income": total_lobby_income,
                            "issue_codes": ", ".join(sorted(all_issues)),
                            "filing_count": len(records),
                        },
                        "bill": {
                            "bill_id": bill.bill_id,
                            "title": bill.title,
                            "policy_area": bill.policy_area,
                            "status": bill.status_bucket,
                        },
                        "committee": {
                            "thomas_id": committee.thomas_id,
                            "name": committee.name,
                            "chamber": committee.chamber,
                            "referral_date": str(action.action_date) if action.action_date else None,
                        },
                        "politician": {
                            "person_id": member.person_id,
                            "display_name": member.display_name,
                            "party": member.party,
                            "state": member.state,
                            "committee_role": membership.role,
                        },
                        "donation": {
                            "total_amount": float(total_donated),
                            "donation_count": donation_count,
                            "latest_date": str(donation_agg[2]) if donation_agg[2] else None,
                        },
                    })

                    if len(loops) >= limit:
                        break
                if len(loops) >= limit:
                    break
            if len(loops) >= limit:
                break
        if len(loops) >= limit:
            break

    # Sort by donation amount descending
    loops.sort(key=lambda x: x["donation"]["total_amount"], reverse=True)

    # Compute stats
    unique_companies = len(set(l["company"]["entity_id"] for l in loops))
    unique_politicians = len(set(l["politician"]["person_id"] for l in loops))
    unique_bills = len(set(l["bill"]["bill_id"] for l in loops))
    total_lobby = sum(l["lobbying"]["total_income"] for l in loops)
    total_donations = sum(l["donation"]["total_amount"] for l in loops)

    return {
        "closed_loops": loops[:limit],
        "stats": {
            "total_loops_found": len(loops),
            "unique_companies": unique_companies,
            "unique_politicians": unique_politicians,
            "unique_bills": unique_bills,
            "total_lobbying_spend": total_lobby,
            "total_donations": total_donations,
        },
    }
