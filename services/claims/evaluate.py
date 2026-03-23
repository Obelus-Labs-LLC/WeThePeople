"""
Evaluate claim matches and produce verification scores.

Takes a claim and its matches (from match.py) and produces a structured
verification result with tier, score, and evidence summary.
"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tier computation
# ---------------------------------------------------------------------------

def compute_tier(scores: Dict[str, Any]) -> str:
    """
    Determine verification tier from aggregated scores.

    Strong:     Clear legislative action matching the claim — bill/vote directly
                related, with follow-through timing and measurable progress.
    Moderate:   Related activity but not a direct match — similar policy area,
                partial overlap, or tangential legislative record.
    Weak:       Tangential connection — low overlap, retroactive timing, or
                only boilerplate civic terms match.
    Unverified: No matching legislative record found.
    """
    if not scores:
        return "unverified"

    best_tier = scores.get("best_match_tier", "none")
    match_count = scores.get("match_count", 0)
    best_score = scores.get("best_score", 0.0)
    has_vote_evidence = scores.get("has_vote_evidence", False)
    has_trade_evidence = scores.get("has_trade_evidence", False)
    has_lobbying_evidence = scores.get("has_lobbying_evidence", False)
    has_contract_evidence = scores.get("has_contract_evidence", False)
    has_enforcement_evidence = scores.get("has_enforcement_evidence", False)
    has_donation_evidence = scores.get("has_donation_evidence", False)
    has_committee_evidence = scores.get("has_committee_evidence", False)
    has_sec_filing_evidence = scores.get("has_sec_filing_evidence", False)

    # Collect all cross-data evidence flags
    has_any_cross_evidence = (
        has_vote_evidence or has_trade_evidence or has_lobbying_evidence
        or has_contract_evidence or has_enforcement_evidence
        or has_donation_evidence or has_committee_evidence or has_sec_filing_evidence
    )
    cross_evidence_count = sum([
        has_vote_evidence, has_trade_evidence, has_lobbying_evidence,
        has_contract_evidence, has_enforcement_evidence,
        has_donation_evidence, has_committee_evidence, has_sec_filing_evidence,
    ])

    # Direct legislative match with strong evidence
    if best_tier == "strong":
        return "strong"

    # Moderate legislative match, or strong cross-data evidence
    if best_tier == "moderate":
        return "moderate"

    # Cross-data evidence boosts weak legislative matches
    if best_tier == "weak" and has_any_cross_evidence:
        return "moderate"

    # Some legislative match but weak
    if best_tier == "weak":
        return "weak"

    # No legislative match but multiple cross-data evidence types
    if match_count == 0 and cross_evidence_count >= 2:
        return "moderate"

    # No legislative match but cross-data evidence exists
    if match_count == 0 and has_any_cross_evidence:
        return "weak"

    return "unverified"


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate_claim(
    db,
    claim,
    matches: List[Dict],
    vote_matches: Optional[List[Dict]] = None,
    trade_matches: Optional[List[Dict]] = None,
    lobbying_matches: Optional[List[Dict]] = None,
    contract_matches: Optional[List[Dict]] = None,
    enforcement_matches: Optional[List[Dict]] = None,
    donation_matches: Optional[List[Dict]] = None,
    committee_matches: Optional[List[Dict]] = None,
    sec_filing_matches: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """
    Score matches for relevance, progress, and timing.

    Args:
        db: SQLAlchemy session
        claim: Claim object or dict with claim info
        matches: List of action match dicts (from compute_matches_for_claim)
        vote_matches: Optional list from match_against_votes
        trade_matches: Optional list from match_against_trades
        lobbying_matches: Optional list from match_against_lobbying
        contract_matches: Optional list from match_against_contracts
        enforcement_matches: Optional list from match_against_enforcement
        donation_matches: Optional list from match_against_donations
        committee_matches: Optional list from match_against_committee_positions
        sec_filing_matches: Optional list from match_against_sec_filings

    Returns:
        {
            tier: "strong"|"moderate"|"weak"|"unverified",
            score: float (0.0-1.0 normalized),
            evidence: [...],
            summary: str
        }
    """
    vote_matches = vote_matches or []
    trade_matches = trade_matches or []
    lobbying_matches = lobbying_matches or []
    contract_matches = contract_matches or []
    enforcement_matches = enforcement_matches or []
    donation_matches = donation_matches or []
    committee_matches = committee_matches or []
    sec_filing_matches = sec_filing_matches or []

    evidence = []
    best_match_tier = "none"
    best_score = 0.0
    match_count = 0

    # Process legislative action matches
    if isinstance(matches, dict) and "matches" in matches:
        raw_matches = matches["matches"]
    else:
        raw_matches = matches if isinstance(matches, list) else []

    for m in raw_matches:
        tier = "none"
        score = 0.0

        if isinstance(m, dict):
            ev = m.get("evidence", {})
            tier = ev.get("tier", "none") if isinstance(ev, dict) else "none"
            score = float(m.get("score", 0.0))

        if tier != "none":
            match_count += 1

        if score > best_score:
            best_score = score
            best_match_tier = tier

        if tier in ("strong", "moderate"):
            action = m.get("action", {}) if isinstance(m, dict) else {}
            evidence.append({
                "type": "legislative_action",
                "tier": tier,
                "score": score,
                "title": action.get("title", ""),
                "bill_type": action.get("bill_type", ""),
                "bill_number": action.get("bill_number", ""),
                "date": action.get("date", ""),
                "source_url": action.get("source_url", ""),
            })

    # Process vote evidence
    has_vote_evidence = False
    for vm in vote_matches[:5]:
        if vm.get("score", 0) >= 2.0:
            has_vote_evidence = True
            data = vm.get("data", {})
            evidence.append({
                "type": "vote_record",
                "score": vm["score"],
                "question": data.get("question", ""),
                "position": data.get("position", ""),
                "result": data.get("result", ""),
                "vote_date": data.get("vote_date", ""),
                "overlap": vm.get("overlap", []),
            })

    # Process trade evidence
    has_trade_evidence = False
    for tm in trade_matches[:5]:
        if tm.get("score", 0) >= 1.0:
            has_trade_evidence = True
            data = tm.get("data", {})
            evidence.append({
                "type": "trade_record",
                "score": tm["score"],
                "ticker": data.get("ticker", ""),
                "transaction_type": data.get("transaction_type", ""),
                "transaction_date": data.get("transaction_date", ""),
                "amount_range": data.get("amount_range", ""),
                "overlap": tm.get("overlap", []),
            })

    # Process lobbying evidence
    has_lobbying_evidence = False
    for lm in lobbying_matches[:5]:
        if lm.get("score", 0) >= 1.0:
            has_lobbying_evidence = True
            data = lm.get("data", {})
            evidence.append({
                "type": "lobbying_record",
                "score": lm["score"],
                "client_name": data.get("client_name", ""),
                "registrant_name": data.get("registrant_name", ""),
                "filing_year": data.get("filing_year", ""),
                "specific_issues": data.get("specific_issues", ""),
                "overlap": lm.get("overlap", []),
            })

    # Process contract evidence
    has_contract_evidence = False
    for cm in contract_matches[:5]:
        if cm.get("relevance_score", cm.get("score", 0)) >= 1.0:
            has_contract_evidence = True
            data = cm.get("data", {})
            evidence.append({
                "type": "contract_record",
                "score": cm.get("relevance_score", cm.get("score", 0)),
                "award_amount": data.get("award_amount"),
                "awarding_agency": data.get("awarding_agency", ""),
                "description": data.get("description", ""),
                "start_date": data.get("start_date", ""),
                "overlap": cm.get("overlap", []),
            })

    # Process enforcement evidence
    has_enforcement_evidence = False
    for em in enforcement_matches[:5]:
        if em.get("relevance_score", em.get("score", 0)) >= 1.0:
            has_enforcement_evidence = True
            data = em.get("data", {})
            evidence.append({
                "type": "enforcement_record",
                "score": em.get("relevance_score", em.get("score", 0)),
                "case_title": data.get("case_title", ""),
                "enforcement_type": data.get("enforcement_type", ""),
                "penalty_amount": data.get("penalty_amount"),
                "case_date": data.get("case_date", ""),
                "case_url": data.get("case_url", ""),
                "overlap": em.get("overlap", []),
            })

    # Process donation evidence
    has_donation_evidence = False
    for dm in donation_matches[:5]:
        if dm.get("relevance_score", dm.get("score", 0)) >= 1.0:
            has_donation_evidence = True
            data = dm.get("data", {})
            evidence.append({
                "type": "donation_record",
                "score": dm.get("relevance_score", dm.get("score", 0)),
                "committee_name": data.get("committee_name", ""),
                "amount": data.get("amount"),
                "cycle": data.get("cycle", ""),
                "donation_date": data.get("donation_date", ""),
                "overlap": dm.get("overlap", []),
            })

    # Process committee evidence
    has_committee_evidence = False
    for cm in committee_matches[:5]:
        if cm.get("relevance_score", cm.get("score", 0)) >= 1.0:
            has_committee_evidence = True
            data = cm.get("data", {})
            evidence.append({
                "type": "committee_record",
                "score": cm.get("relevance_score", cm.get("score", 0)),
                "committee_name": data.get("committee_name", ""),
                "role": data.get("role", ""),
                "chamber": data.get("chamber", ""),
                "overlap": cm.get("overlap", []),
            })

    # Process SEC filing evidence
    has_sec_filing_evidence = False
    for sf in sec_filing_matches[:5]:
        if sf.get("relevance_score", sf.get("score", 0)) >= 1.0:
            has_sec_filing_evidence = True
            data = sf.get("data", {})
            evidence.append({
                "type": "sec_filing_record",
                "score": sf.get("relevance_score", sf.get("score", 0)),
                "description": sf.get("description", ""),
                "date": sf.get("date", ""),
                "source_url": sf.get("source_url", ""),
                "overlap": sf.get("overlap", []),
            })

    # Compute final tier
    scores_summary = {
        "best_match_tier": best_match_tier,
        "match_count": match_count,
        "best_score": best_score,
        "has_vote_evidence": has_vote_evidence,
        "has_trade_evidence": has_trade_evidence,
        "has_lobbying_evidence": has_lobbying_evidence,
        "has_contract_evidence": has_contract_evidence,
        "has_enforcement_evidence": has_enforcement_evidence,
        "has_donation_evidence": has_donation_evidence,
        "has_committee_evidence": has_committee_evidence,
        "has_sec_filing_evidence": has_sec_filing_evidence,
    }

    tier = compute_tier(scores_summary)

    # Normalize score to 0-1
    normalized_score = min(1.0, best_score / 50.0) if best_score > 0 else 0.0

    # Build summary
    summary = _build_summary(tier, evidence, match_count, vote_matches, trade_matches, lobbying_matches)

    return {
        "tier": tier,
        "score": round(normalized_score, 3),
        "evidence": evidence,
        "summary": summary,
        "match_count": match_count,
        "vote_evidence_count": len([e for e in evidence if e["type"] == "vote_record"]),
        "trade_evidence_count": len([e for e in evidence if e["type"] == "trade_record"]),
        "lobbying_evidence_count": len([e for e in evidence if e["type"] == "lobbying_record"]),
        "contract_evidence_count": len([e for e in evidence if e["type"] == "contract_record"]),
        "enforcement_evidence_count": len([e for e in evidence if e["type"] == "enforcement_record"]),
        "donation_evidence_count": len([e for e in evidence if e["type"] == "donation_record"]),
        "committee_evidence_count": len([e for e in evidence if e["type"] == "committee_record"]),
        "sec_filing_evidence_count": len([e for e in evidence if e["type"] == "sec_filing_record"]),
    }


def _build_summary(
    tier: str,
    evidence: List[Dict],
    match_count: int,
    vote_matches: List,
    trade_matches: List,
    lobbying_matches: List,
) -> str:
    """Build a human-readable summary of the verification result."""
    parts = []

    if tier == "strong":
        parts.append("Strong verification: direct legislative action matches this claim.")
    elif tier == "moderate":
        parts.append("Moderate verification: related legislative activity found.")
    elif tier == "weak":
        parts.append("Weak verification: tangential legislative connection found.")
    else:
        parts.append("Unverified: no matching legislative record found.")

    leg_count = len([e for e in evidence if e["type"] == "legislative_action"])
    vote_count = len([e for e in evidence if e["type"] == "vote_record"])
    trade_count = len([e for e in evidence if e["type"] == "trade_record"])
    lobby_count = len([e for e in evidence if e["type"] == "lobbying_record"])

    if leg_count:
        parts.append(f"{leg_count} legislative action(s) matched.")
    if vote_count:
        parts.append(f"{vote_count} vote record(s) found.")
    if trade_count:
        parts.append(f"{trade_count} related trade(s) found.")
    if lobby_count:
        parts.append(f"{lobby_count} lobbying record(s) found.")

    return " ".join(parts)
