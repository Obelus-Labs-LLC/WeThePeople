"""
Orchestrate: ingest -> match -> evaluate -> persist.

Full claim verification pipeline that ties together all components.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Optional

from models.database import SessionLocal, Claim, ClaimEvaluation

from services.claims.ingest import (
    extract_claims_from_text,
    extract_claims_from_url,
    persist_claims,
)
from services.claims.match import (
    compute_matches_for_claim,
    match_against_votes,
    match_against_trades,
    match_against_lobbying,
    detect_intent,
)
from services.claims.evaluate import evaluate_claim

logger = logging.getLogger(__name__)


def run_verification(
    db,
    text: str,
    entity_id: str,
    entity_type: str,
    source_url: str = None,
) -> Dict:
    """
    Full pipeline: extract claims from text, match, evaluate, persist.

    Args:
        db: SQLAlchemy session
        text: Raw text to extract claims from
        entity_id: person_id or company_id
        entity_type: "politician" | "tech" | "finance" | "health" | "energy"
        source_url: Optional source URL

    Returns:
        Structured response with all verifications
    """
    # Step 1: Extract claims
    entity_name = _resolve_entity_name(db, entity_id, entity_type)
    raw_claims = extract_claims_from_text(text, entity_name)

    if not raw_claims:
        return {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "source_url": source_url,
            "claims_extracted": 0,
            "verifications": [],
            "summary": "No verifiable claims extracted from the provided text.",
        }

    # Step 2: Persist claims
    persisted = persist_claims(db, raw_claims, entity_id, entity_type, source_url or "")

    # Step 3: Match and evaluate each claim
    verifications = []
    for claim, raw in zip(persisted, raw_claims):
        verification = _verify_single_claim(db, claim, entity_id, entity_type)
        verification["extracted"] = raw
        verifications.append(verification)

    # Step 4: Aggregate stats
    tiers = [v["evaluation"]["tier"] for v in verifications]
    tier_counts = {
        "strong": tiers.count("strong"),
        "moderate": tiers.count("moderate"),
        "weak": tiers.count("weak"),
        "unverified": tiers.count("unverified"),
    }

    return {
        "entity_id": entity_id,
        "entity_type": entity_type,
        "entity_name": entity_name,
        "source_url": source_url,
        "claims_extracted": len(raw_claims),
        "tier_counts": tier_counts,
        "verifications": verifications,
        "summary": _overall_summary(tier_counts, len(raw_claims)),
    }


def run_verification_from_url(
    db,
    url: str,
    entity_id: str,
    entity_type: str,
) -> Dict:
    """
    Fetch URL, extract text, then run verification pipeline.

    Args:
        db: SQLAlchemy session
        url: URL to fetch and analyze
        entity_id: person_id or company_id
        entity_type: "politician" | "tech" | "finance" | "health" | "energy"

    Returns:
        Structured response with all verifications
    """
    entity_name = _resolve_entity_name(db, entity_id, entity_type)
    raw_claims = extract_claims_from_url(url, entity_name)

    if not raw_claims:
        return {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "source_url": url,
            "claims_extracted": 0,
            "verifications": [],
            "summary": "No verifiable claims extracted from the provided URL.",
        }

    # Persist claims
    persisted = persist_claims(db, raw_claims, entity_id, entity_type, url)

    # Match and evaluate
    verifications = []
    for claim, raw in zip(persisted, raw_claims):
        verification = _verify_single_claim(db, claim, entity_id, entity_type)
        verification["extracted"] = raw
        verifications.append(verification)

    tiers = [v["evaluation"]["tier"] for v in verifications]
    tier_counts = {
        "strong": tiers.count("strong"),
        "moderate": tiers.count("moderate"),
        "weak": tiers.count("weak"),
        "unverified": tiers.count("unverified"),
    }

    return {
        "entity_id": entity_id,
        "entity_type": entity_type,
        "entity_name": entity_name,
        "source_url": url,
        "claims_extracted": len(raw_claims),
        "tier_counts": tier_counts,
        "verifications": verifications,
        "summary": _overall_summary(tier_counts, len(raw_claims)),
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _verify_single_claim(db, claim: Claim, entity_id: str, entity_type: str) -> Dict:
    """Run match + evaluate for a single persisted Claim."""

    # Legislative action matches (for politicians)
    action_matches = {}
    if entity_type == "politician":
        try:
            action_matches = compute_matches_for_claim(claim, db, limit=10)
        except Exception as e:
            logger.warning("Action matching failed for claim %s: %s", claim.id, e)

    # V2 matchers — run all applicable matchers based on entity_type
    vote_matches = []
    trade_matches = []
    lobbying_matches = []
    contract_matches = []
    enforcement_matches = []
    donation_matches = []
    committee_matches = []
    sec_filing_matches = []

    if entity_type == "politician":
        # Politician-specific matchers
        try:
            vote_matches = match_against_votes(claim.text, entity_id, db, limit=10)
        except Exception as e:
            logger.warning("Vote matching failed: %s", e)
        try:
            trade_matches = match_against_trades(claim.text, entity_id, db, limit=10)
        except Exception as e:
            logger.warning("Trade matching failed: %s", e)
        try:
            donation_matches = match_against_donations(claim.text, entity_id, db, limit=10)
        except Exception as e:
            logger.warning("Donation matching failed: %s", e)
        try:
            committee_matches = match_against_committee_positions(claim.text, entity_id, db, limit=10)
        except Exception as e:
            logger.warning("Committee matching failed: %s", e)

    if entity_type in ("tech", "finance", "health", "energy"):
        # Company-specific matchers
        try:
            lobbying_matches = match_against_lobbying(
                claim.text, entity_id, entity_type, db, limit=10
            )
        except Exception as e:
            logger.warning("Lobbying matching failed: %s", e)
        try:
            contract_matches = match_against_contracts(
                claim.text, entity_id, entity_type, db, limit=10
            )
        except Exception as e:
            logger.warning("Contract matching failed: %s", e)
        try:
            enforcement_matches = match_against_enforcement(
                claim.text, entity_id, entity_type, db, limit=10
            )
        except Exception as e:
            logger.warning("Enforcement matching failed: %s", e)
        try:
            sec_filing_matches = match_against_sec_filings(
                claim.text, entity_id, entity_type, db, limit=10
            )
        except Exception as e:
            logger.warning("SEC filing matching failed: %s", e)

    # Evaluate
    evaluation = evaluate_claim(
        db, claim, action_matches,
        vote_matches=vote_matches,
        trade_matches=trade_matches,
        lobbying_matches=lobbying_matches,
        contract_matches=contract_matches,
        enforcement_matches=enforcement_matches,
        donation_matches=donation_matches,
        committee_matches=committee_matches,
        sec_filing_matches=sec_filing_matches,
    )

    # Persist evaluation
    _persist_evaluation(db, claim, evaluation)

    return {
        "claim_id": claim.id,
        "claim_text": claim.text,
        "category": claim.category,
        "intent": claim.intent,
        "evaluation": evaluation,
    }


def _persist_evaluation(db, claim: Claim, evaluation: Dict) -> None:
    """Save or update ClaimEvaluation row."""
    import json

    existing = db.query(ClaimEvaluation).filter(
        ClaimEvaluation.claim_id == claim.id
    ).first()

    tier = evaluation.get("tier", "unverified")
    # Map "unverified" to "none" for DB compatibility
    if tier == "unverified":
        tier = "none"

    evidence_json = json.dumps(evaluation.get("evidence", []))
    why_json = json.dumps({"summary": evaluation.get("summary", "")})

    if existing:
        existing.tier = tier
        existing.score = evaluation.get("score", 0.0)
        existing.relevance = evaluation.get("tier", "none")
        existing.evidence_json = evidence_json
        existing.why_json = why_json
    else:
        ev = ClaimEvaluation(
            claim_id=claim.id,
            person_id=claim.person_id,
            tier=tier,
            score=evaluation.get("score", 0.0),
            relevance=evaluation.get("tier", "none"),
            evidence_json=evidence_json,
            why_json=why_json,
        )
        db.add(ev)

    try:
        db.commit()
    except Exception:
        db.rollback()


def _resolve_entity_name(db, entity_id: str, entity_type: str) -> str:
    """Look up display name for an entity."""
    if entity_type == "politician":
        from models.database import TrackedMember
        member = db.query(TrackedMember).filter(TrackedMember.person_id == entity_id).first()
        return member.display_name if member else entity_id
    elif entity_type == "tech":
        from models.tech_models import TrackedTechCompany
        company = db.query(TrackedTechCompany).filter(TrackedTechCompany.company_id == entity_id).first()
        return company.display_name if company else entity_id
    elif entity_type == "finance":
        from models.finance_models import TrackedInstitution
        inst = db.query(TrackedInstitution).filter(TrackedInstitution.institution_id == entity_id).first()
        return inst.display_name if inst else entity_id
    elif entity_type == "health":
        from models.health_models import TrackedCompany
        company = db.query(TrackedCompany).filter(TrackedCompany.company_id == entity_id).first()
        return company.display_name if company else entity_id
    elif entity_type == "energy":
        from models.energy_models import TrackedEnergyCompany
        company = db.query(TrackedEnergyCompany).filter(TrackedEnergyCompany.company_id == entity_id).first()
        return company.display_name if company else entity_id
    return entity_id


def _overall_summary(tier_counts: Dict[str, int], total: int) -> str:
    """Build overall verification summary."""
    parts = [f"{total} claim(s) extracted."]
    if tier_counts["strong"]:
        parts.append(f"{tier_counts['strong']} strongly verified.")
    if tier_counts["moderate"]:
        parts.append(f"{tier_counts['moderate']} moderately verified.")
    if tier_counts["weak"]:
        parts.append(f"{tier_counts['weak']} weakly verified.")
    if tier_counts["unverified"]:
        parts.append(f"{tier_counts['unverified']} unverified.")
    return " ".join(parts)
