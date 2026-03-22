"""
Admin endpoints for recomputation and cache invalidation.

NOTE: This is a code snippet, not a runnable script. Paste into main.py if needed.
These reference V1-era models (Claim, ClaimEvaluation, Action) that no longer exist.
"""

# --- ADMIN ENDPOINTS (add to main.py) ---

@app.post("/admin/recompute")
def admin_recompute_evaluations(
    person_id: str | None = None,
    claim_id: int | None = None,
    limit: int | None = None,
    dirty_only: bool = False
):
    """
    Admin endpoint: trigger evaluation recomputation.
    
    Examples:
      POST /admin/recompute?person_id=aoc
      POST /admin/recompute?claim_id=1
      POST /admin/recompute?dirty_only=true&limit=100
    """
    from jobs.recompute_evaluations import recompute_for_person, upsert_eval
    from services.matching import compute_matches_for_claim
    
    db = SessionLocal()
    
    try:
        if claim_id is not None:
            # Recompute single claim
            claim = db.query(Claim).filter(Claim.id == claim_id).first()
            if not claim:
                raise HTTPException(status_code=404, detail="Claim not found")
            
            result = compute_matches_for_claim(claim, db, limit=1)
            matches = result.get("matches", [])
            
            if not matches:
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
                top_match = matches[0]
                best_action_id = top_match["action"]["id"]
                best = db.query(Action).filter(Action.id == best_action_id).first()
                
                upsert_eval(
                    db=db,
                    claim=claim,
                    best=best,
                    tier=top_match["evidence"]["tier"],
                    relevance=top_match["evidence"]["relevance"],
                    progress=top_match["evidence"]["progress"],
                    timing=top_match["evidence"]["timing"],
                    why=top_match.get("why"),
                    score=top_match.get("score"),
                )
            
            # Clear dirty flag
            claim.needs_recompute = 0
            db.commit()
            
            return {"success": True, "claims_recomputed": 1, "claim_id": claim_id}
        
        else:
            # Batch recompute using job
            db.close()  # Close first, job will create its own session
            
            recompute_for_person(
                person_id=person_id,
                limit=limit,
                dirty_only=dirty_only
            )
            
            return {
                "success": True,
                "message": f"Recomputation triggered",
                "filters": {
                    "person_id": person_id,
                    "limit": limit,
                    "dirty_only": dirty_only
                }
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if not db.is_active:
            db.close()


@app.post("/admin/invalidate")
def admin_invalidate_claims(
    bill_congress: int | None = None,
    bill_type: str | None = None,
    bill_number: int | None = None,
    all: bool = False
):
    """
    Admin endpoint: mark claims for recomputation.
    
    Examples:
      POST /admin/invalidate?bill_congress=119&bill_type=hr&bill_number=2670
      POST /admin/invalidate?all=true
    """
    from utils.invalidation import invalidate_claims_for_bill, invalidate_all_claims
    
    db = SessionLocal()
    
    try:
        if all:
            count = invalidate_all_claims(db)
            return {"success": True, "claims_invalidated": count, "scope": "all"}
        
        elif bill_congress and bill_type and bill_number:
            count = invalidate_claims_for_bill(bill_congress, bill_type, bill_number, db)
            return {
                "success": True,
                "claims_invalidated": count,
                "bill": f"{bill_type}{bill_number} (Congress {bill_congress})"
            }
        
        else:
            raise HTTPException(
                status_code=400,
                detail="Must provide either all=true OR bill_congress + bill_type + bill_number"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.get("/admin/dirty_claims")
def admin_get_dirty_claims(limit: int = Query(50, ge=1, le=500)):
    """
    Admin endpoint: list claims needing recomputation.
    
    Example:
      GET /admin/dirty_claims?limit=10
    """
    from utils.invalidation import get_claims_needing_recompute
    
    db = SessionLocal()
    
    try:
        claims = get_claims_needing_recompute(db, limit=limit)
        
        return {
            "total": len(claims),
            "claims": [
                {
                    "id": c.id,
                    "person_id": c.person_id,
                    "text": c.text[:100] + "..." if len(c.text) > 100 else c.text,
                    "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                }
                for c in claims
            ]
        }
    finally:
        db.close()
