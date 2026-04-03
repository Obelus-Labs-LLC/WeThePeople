"""
Zip Code Lookup — Rich representative profiles by zip code.

GET /lookup/{zip_code}
  Maps zip → district via whoismyrepresentative.com, finds matching
  TrackedMembers (district rep + senators), returns trades, donors,
  committees, anomalies, and votes for each — all in batch queries.
"""

import logging
import time
import requests
from datetime import date, timedelta, datetime, timezone
from difflib import SequenceMatcher
from typing import Optional, Dict, Any, List, Tuple

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

from models.database import (
    get_db,
    TrackedMember,
    CongressionalTrade,
    CompanyDonation,
    Vote,
    MemberVote,
    Anomaly,
)
from models.committee_models import Committee, CommitteeMembership

router = APIRouter(tags=["lookup"])
log = logging.getLogger("lookup")


# ── District lookup cache (zip -> (results, timestamp)) ──
_district_cache: Dict[str, Tuple[list, float]] = {}
_CACHE_TTL = 3600  # 1 hour


def _cached_district_lookup(zip_code: str) -> Optional[list]:
    """
    Look up congressional district via whoismyrepresentative.com.
    Returns list of {"name", "party", "state", "district"} or None on failure.
    Caches results for 1 hour.
    """
    now = time.time()
    if zip_code in _district_cache:
        results, ts = _district_cache[zip_code]
        if now - ts < _CACHE_TTL:
            return results

    try:
        resp = requests.get(
            f"https://whoismyrepresentative.com/getall_mems.php?zip={zip_code}&output=json",
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        _district_cache[zip_code] = (results, now)
        return results
    except Exception as e:
        log.warning("whoismyrepresentative.com lookup failed for %s: %s", zip_code, e)
        return None


def _name_similarity(a: str, b: str) -> float:
    """Case-insensitive similarity ratio between two names."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _filter_members_by_district(
    all_state_members: list,
    district_results: list,
) -> list:
    """
    Given all active TrackedMembers for a state and whoismyrepresentative results,
    return only the senators + the specific district representative.
    """
    # Extract district number(s) from the API results
    districts = set()
    api_names = []
    for r in district_results:
        dist = str(r.get("district", "")).strip()
        if dist:
            districts.add(dist)
        name = r.get("name", "").strip()
        if name:
            api_names.append(name)

    matched = []
    for m in all_state_members:
        # Always include senators
        if m.chamber and m.chamber.lower() == "senate":
            matched.append(m)
            continue

        # For House members: match by district number first
        member_district = str(m.district).strip() if m.district else ""
        if member_district and member_district in districts:
            matched.append(m)
            continue

        # Fallback: match by name similarity to API results
        if api_names and m.display_name:
            best = max(_name_similarity(m.display_name, n) for n in api_names)
            if best >= 0.6:
                matched.append(m)

    return matched


# ── Zip → State (reuse the digest fallback map) ──

def _zip_to_state(zip_code: str) -> Optional[str]:
    """Resolve 5-digit zip to state code via 3-digit prefix lookup."""
    try:
        from routers.digest import _zip_to_state as digest_zip
        return digest_zip(zip_code)
    except (ImportError, AttributeError):
        pass
    # Inline minimal fallback (should never hit if digest loads)
    return None


# ── Endpoint ──

@router.get("/lookup/{zip_code}")
def zip_lookup(zip_code: str, db: Session = Depends(get_db)):
    """
    Full zip code lookup: maps zip to district via whoismyrepresentative.com,
    finds the specific district rep + senators, returns trades, donors,
    committees, anomalies, and votes for each member.
    Falls back to all state members if district lookup fails.
    """
    cleaned = "".join(c for c in zip_code if c.isdigit())[:5]
    if len(cleaned) < 5:
        raise HTTPException(status_code=400, detail="Invalid zip code — must be 5 digits")

    state = _zip_to_state(cleaned)
    if not state:
        raise HTTPException(status_code=404, detail=f"No state mapping found for zip code {cleaned}")

    # ── 1. Find all active members for this state ──
    all_state_members = (
        db.query(TrackedMember)
        .filter(TrackedMember.state == state, TrackedMember.is_active == 1)
        .order_by(TrackedMember.chamber, TrackedMember.display_name)
        .all()
    )

    # ── 1b. Try district-specific filtering via whoismyrepresentative.com ──
    district_results = _cached_district_lookup(cleaned)
    if district_results:
        members = _filter_members_by_district(all_state_members, district_results)
        if not members:
            # If filtering produced nothing, fall back to all state members
            log.warning("District filter returned 0 members for %s, falling back to state", cleaned)
            members = all_state_members
    else:
        members = all_state_members

    if not members:
        return {
            "zip_code": cleaned,
            "state": state,
            "representatives": [],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    person_ids = [m.person_id for m in members]
    bioguide_ids = [m.bioguide_id for m in members]
    ninety_days_ago = date.today() - timedelta(days=90)

    # ── 2. Batch: recent trades (last 90 days, up to 10 per member) ──
    all_trades = (
        db.query(CongressionalTrade)
        .filter(
            CongressionalTrade.person_id.in_(person_ids),
            CongressionalTrade.transaction_date >= ninety_days_ago,
        )
        .order_by(desc(CongressionalTrade.transaction_date))
        .all()
    )
    trades_by_pid: Dict[str, List] = {pid: [] for pid in person_ids}
    for t in all_trades:
        bucket = trades_by_pid.get(t.person_id)
        if bucket is not None and len(bucket) < 10:
            bucket.append(t)

    # ── 3. Batch: top donors (top 5 by total amount per member) ──
    # Subquery: sum donations grouped by (person_id, entity_id, entity_type)
    donor_rows = []
    try:
        donor_rows = (
            db.query(
                CompanyDonation.person_id,
                CompanyDonation.entity_id,
                CompanyDonation.entity_type,
                CompanyDonation.committee_name,
                func.sum(CompanyDonation.amount).label("total_amount"),
                func.count(CompanyDonation.id).label("donation_count"),
            )
            .filter(CompanyDonation.person_id.in_(person_ids))
            .group_by(
                CompanyDonation.person_id,
                CompanyDonation.entity_id,
                CompanyDonation.entity_type,
                CompanyDonation.committee_name,
            )
            .order_by(desc("total_amount"))
            .all()
        )
    except OperationalError:
        donor_rows = []

    donors_by_pid: Dict[str, List] = {pid: [] for pid in person_ids}
    for row in donor_rows:
        bucket = donors_by_pid.get(row.person_id)
        if bucket is not None and len(bucket) < 5:
            bucket.append({
                "entity_id": row.entity_id,
                "entity_type": row.entity_type,
                "pac_name": row.committee_name,
                "total_amount": round(row.total_amount, 2) if row.total_amount else 0,
                "donation_count": row.donation_count,
            })

    # ── 4. Batch: committee memberships ──
    memberships = []
    try:
        memberships = (
            db.query(CommitteeMembership, Committee.name, Committee.chamber)
            .join(Committee, Committee.thomas_id == CommitteeMembership.committee_thomas_id)
            .filter(CommitteeMembership.person_id.in_(person_ids))
            .all()
        )
    except OperationalError:
        memberships = []

    committees_by_pid: Dict[str, List] = {pid: [] for pid in person_ids}
    for membership, committee_name, committee_chamber in memberships:
        pid = membership.person_id
        if pid in committees_by_pid:
            committees_by_pid[pid].append({
                "committee_name": committee_name,
                "committee_chamber": committee_chamber,
                "role": membership.role,
                "thomas_id": membership.committee_thomas_id,
            })

    # ── 5. Batch: anomalies ──
    anomaly_rows = []
    try:
        anomaly_rows = (
            db.query(Anomaly)
            .filter(
                Anomaly.entity_id.in_(person_ids),
                Anomaly.entity_type == "person",
            )
            .order_by(desc(Anomaly.score))
            .all()
        )
    except OperationalError:
        anomaly_rows = []

    anomalies_by_pid: Dict[str, List] = {pid: [] for pid in person_ids}
    for a in anomaly_rows:
        bucket = anomalies_by_pid.get(a.entity_id)
        if bucket is not None:
            bucket.append(a)

    # ── 6. Batch: recent votes (last 90 days, up to 5 per member) ──
    vote_rows = []
    try:
        vote_rows = (
            db.query(Vote, MemberVote.position, MemberVote.person_id)
            .join(MemberVote, MemberVote.vote_id == Vote.id)
            .filter(
                MemberVote.person_id.in_(person_ids),
                Vote.vote_date >= ninety_days_ago,
            )
            .order_by(desc(Vote.vote_date))
            .all()
        )
    except OperationalError:
        vote_rows = []

    votes_by_pid: Dict[str, List] = {pid: [] for pid in person_ids}
    for vote, position, pid in vote_rows:
        bucket = votes_by_pid.get(pid)
        if bucket is not None and len(bucket) < 5:
            bucket.append({
                "question": vote.question,
                "vote_date": str(vote.vote_date) if vote.vote_date else None,
                "result": vote.result,
                "position": position,
                "related_bill": (
                    f"{vote.related_bill_type}{vote.related_bill_number}"
                    if vote.related_bill_type and vote.related_bill_number
                    else None
                ),
            })

    # ── 7. Assemble response ──
    representatives = []
    for m in members:
        pid = m.person_id
        member_anomalies = anomalies_by_pid.get(pid, [])
        member_trades = trades_by_pid.get(pid, [])

        # Compute red flag counts
        late_disclosures = sum(
            1 for t in member_trades
            if t.reporting_gap and _parse_gap_days(t.reporting_gap) > 45
        )

        # Committee-stock overlap: trades whose ticker appears in a committee name keyword
        committee_names_lower = [
            c["committee_name"].lower() for c in committees_by_pid.get(pid, [])
        ]
        overlap_count = 0
        for t in member_trades:
            if t.asset_name and any(
                kw in (t.asset_name or "").lower()
                for kw in _extract_sector_keywords(committee_names_lower)
            ):
                overlap_count += 1

        rep = {
            "person_id": pid,
            "name": m.display_name,
            "party": m.party,
            "chamber": m.chamber,
            "state": m.state,
            "photo_url": m.photo_url,
            "bioguide_id": m.bioguide_id,
            "red_flags": {
                "anomaly_count": len(member_anomalies),
                "late_disclosures": late_disclosures,
                "committee_stock_overlaps": overlap_count,
                "top_anomaly": (
                    {
                        "title": member_anomalies[0].title,
                        "score": member_anomalies[0].score,
                        "pattern_type": member_anomalies[0].pattern_type,
                    }
                    if member_anomalies
                    else None
                ),
            },
            "trades": [
                {
                    "ticker": t.ticker,
                    "asset_name": t.asset_name,
                    "transaction_type": t.transaction_type,
                    "amount_range": t.amount_range,
                    "transaction_date": str(t.transaction_date) if t.transaction_date else None,
                    "disclosure_date": str(t.disclosure_date) if t.disclosure_date else None,
                    "reporting_gap": t.reporting_gap,
                    "owner": t.owner,
                }
                for t in member_trades[:5]
            ],
            "donors": donors_by_pid.get(pid, []),
            "committees": committees_by_pid.get(pid, []),
            "anomalies": [
                {
                    "pattern_type": a.pattern_type,
                    "title": a.title,
                    "score": a.score,
                    "description": a.description,
                    "detected_at": a.detected_at.isoformat() if a.detected_at else None,
                }
                for a in member_anomalies[:5]
            ],
            "votes": votes_by_pid.get(pid, []),
        }
        representatives.append(rep)

    return {
        "zip_code": cleaned,
        "state": state,
        "representative_count": len(representatives),
        "representatives": representatives,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Helpers ──

def _parse_gap_days(gap_str: str) -> int:
    """Parse '38 Days' → 38. Returns 0 on failure."""
    try:
        return int(gap_str.split()[0])
    except (ValueError, IndexError, AttributeError):
        return 0


# Sector keywords extracted from committee names for overlap detection
_SECTOR_KEYWORDS = {
    "agriculture": ["farm", "agri", "food", "crop"],
    "armed services": ["defense", "military", "weapon"],
    "banking": ["bank", "financial", "credit"],
    "commerce": ["tech", "telecom", "commerce"],
    "energy": ["energy", "oil", "gas", "nuclear", "solar", "wind"],
    "health": ["health", "pharma", "drug", "medical", "biotech"],
    "transportation": ["transport", "airline", "rail", "auto"],
    "finance": ["financ", "insur", "invest", "securities"],
}


def _extract_sector_keywords(committee_names: List[str]) -> List[str]:
    """Given lowercased committee names, return trade-relevant keywords."""
    keywords = []
    for cname in committee_names:
        for sector_key, sector_words in _SECTOR_KEYWORDS.items():
            if any(w in cname for w in [sector_key] + sector_words):
                keywords.extend(sector_words)
    return list(set(keywords))
