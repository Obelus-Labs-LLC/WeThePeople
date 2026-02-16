import json
import sys
from pathlib import Path
from datetime import datetime
import time

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session

from models.database import SessionLocal
from models.database import Claim, Action, ClaimEvaluation
from services.evidence.validate import validate_evidence, validate_evidence_dict

# Import shared matching service (single source of truth)
from services.matching import compute_matches_for_claim

def recompute_for_person(person_id: str | None = None, limit: int | None = None, dirty_only: bool = True):
    """
    Recompute evaluations for claims.
    
    Args:
        person_id: Filter by person_id (None = all people)
        limit: Max claims to process
        dirty_only: If True, only process claims with needs_recompute=1
    """
    db: Session = SessionLocal()

    q = db.query(Claim)
    if person_id:
        q = q.filter(Claim.person_id == person_id)
    if dirty_only:
        q = q.filter(Claim.needs_recompute == 1)
    q = q.order_by(Claim.id.asc())
    if limit:
        q = q.limit(limit)

    claims = q.all()
    total_claims = len(claims)
    start_time = time.time()

    for idx, claim in enumerate(claims, 1):
        # Progress logging every 10 claims
        if idx % 10 == 0 or idx == 1 or idx == total_claims:
            elapsed = time.time() - start_time
            mins, secs = divmod(int(elapsed), 60)
            print(f"[{idx}/{total_claims}] claim_id={claim.id} person={claim.person_id} elapsed={mins:02d}:{secs:02d}")
        
        # Use the same matcher as the live API endpoint
        result = compute_matches_for_claim(claim, db, limit=1)
        
        matches = result.get("matches", [])
        
        if not matches:
            # No matches found
            upsert_eval(
                db=db,
                claim=claim,
                best=None,
                tier="none",
                relevance="none",
                progress=None,
                timing=None,
                why=None,
                score=None,
            )
        else:
            # Take the top match
            top_match = matches[0]
            
            # Fetch the Action object
            best_action_id = top_match["action"]["id"]
            best = db.query(Action).filter(Action.id == best_action_id).first()
            
            # Extract bill_id for efficient querying
            matched_bill_id = None
            if best and best.bill_type and best.bill_number and best.bill_congress:
                matched_bill_id = f"{best.bill_type}{best.bill_number}-{best.bill_congress}"
            
            # Extract evidence array from phrase_hits and evidence fields
            evidence_list = []
            why = top_match.get("why", {})
            
            # Add phrase hits (url_match, exact title, policy overlap, etc.)
            phrase_hits = why.get("phrase_hits", [])
            for phrase in phrase_hits:
                if phrase.startswith("url_match:") or phrase.startswith("url_partial:"):
                    evidence_list.append(phrase)
                elif len(phrase) > 3:  # Skip generic single-word phrases
                    evidence_list.append(f"phrase:{phrase}")
            
            # Add policy area if available
            if top_match["evidence"].get("relevance") == "high":
                policy = top_match["action"].get("policy_area")
                if policy:
                    evidence_list.append(f"policy_area:{policy}")
            
            # Add timing signal
            timing = top_match["evidence"].get("timing")
            if timing:
                evidence_list.append(f"timing:{timing}")
            
            # Add progress signal
            progress = top_match["evidence"].get("progress")
            if progress:
                evidence_list.append(f"progress:{progress}")
            
            # Validate evidence structure before writing (PHASE 2 guard)
            validate_evidence_dict(top_match["evidence"])
            validate_evidence(evidence_list)
            
            upsert_eval(
                db=db,
                claim=claim,
                best=best,
                tier=top_match["evidence"]["tier"],
                relevance=top_match["evidence"]["relevance"],
                progress=progress,
                timing=timing,
                why=top_match.get("why"),
                score=top_match.get("score"),
                matched_bill_id=matched_bill_id,
                evidence_list=evidence_list,
            )
        
        # Clear dirty flag after successful recomputation
        claim.needs_recompute = 0

    db.commit()
    db.close()
    print(f"Recomputed evaluations for {len(claims)} claims.")


def upsert_eval(db: Session, claim: Claim, best: Action | None,
                tier: str, relevance: str | None, progress: str | None, timing: str | None,
                why: dict | None, score: float | None, 
                matched_bill_id: str | None = None, evidence_list: list | None = None):

    existing = db.query(ClaimEvaluation).filter(ClaimEvaluation.claim_id == claim.id).first()
    payload = {
        "claim_id": claim.id,
        "person_id": claim.person_id,
        "best_action_id": best.id if best else None,
        "score": score,
        "tier": tier,
        "relevance": relevance,
        "progress": progress,
        "timing": timing,
        "why_json": json.dumps(why) if why else None,
        "matched_bill_id": matched_bill_id,
        "evidence_json": json.dumps(evidence_list) if evidence_list else None,
    }

    if existing:
        for k, v in payload.items():
            setattr(existing, k, v)
    else:
        db.add(ClaimEvaluation(**payload))


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Recompute claim evaluations")
    parser.add_argument("--person-id", type=str, help="Filter by person_id")
    parser.add_argument("--limit", type=int, help="Max claims to process")
    parser.add_argument("--all", action="store_true", dest="all_claims",
                       help="Recompute ALL claims (default: only needs_recompute=1)")
    
    args = parser.parse_args()
    
    dirty_only = not args.all_claims
    
    if dirty_only:
        print("🔄 Recomputing ONLY dirty claims (needs_recompute=1)...")
    else:
        print("🔄 Recomputing ALL claims (--all flag specified)...")
    
    recompute_for_person(
        person_id=args.person_id,
        limit=args.limit,
        dirty_only=dirty_only
    )
