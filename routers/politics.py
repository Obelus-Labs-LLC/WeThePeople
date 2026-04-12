"""
Politics sector routes — Main router hub.

Dashboard stats, claims, global actions are here.
Sub-routers handle: people, bills, votes, trades, committees.
"""

import hashlib
import json
import logging
import re
from datetime import date
from typing import Optional, Dict, Any

from fastapi import APIRouter, Query, HTTPException, Request, Depends
from sqlalchemy import func, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from models.database import (
    get_db,
    Action,
    SourceDocument,
    Claim,
    ClaimEvaluation,
    Bill,
    GoldLedgerEntry,
    TrackedMember,
)
from services.claims.match import (
    compute_matches_for_claim,
    auto_classify_claim,
    detect_intent,
    score_action_against_claim,
    get_profile,
    contains_gate_signal,
    contains_claim_signal,
    STOPWORDS_BASE,
)
from utils.normalization import normalize_bill_id
from utils.sanitize import escape_like
from services.bill_text import format_text_receipt
from services.auth import require_press_key
from models.response_schemas import PoliticsDashboardStats

# ── Sub-routers ──
from routers.politics_people import router as people_router
from routers.politics_bills import router as bills_router
from routers.politics_votes import router as votes_router
from routers.politics_trades import router as trades_router
from routers.politics_committees import router as committees_router

router = APIRouter(tags=["politics"])

# Include all sub-routers — they share the same tag and no extra prefix
# (all endpoints already use /people, /bills, /votes, etc. paths)
router.include_router(people_router)
router.include_router(bills_router)
router.include_router(votes_router)
router.include_router(trades_router)
router.include_router(committees_router)


# ── Helpers ──

def _safe_json_loads(value):
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


# ── Balance of Power (lightweight summary, avoids loading 600 people) ──

@router.get("/balance-of-power")
def balance_of_power(db: Session = Depends(get_db)):
    """Party counts by chamber — used by BalanceOfPowerPage instead of fetching all people."""
    rows = (
        db.query(TrackedMember.chamber, TrackedMember.party, func.count())
        .filter(TrackedMember.is_active == 1)
        .group_by(TrackedMember.chamber, TrackedMember.party)
        .all()
    )
    result = {"house": {"democrat": 0, "republican": 0, "independent": 0, "total": 0},
              "senate": {"democrat": 0, "republican": 0, "independent": 0, "total": 0}}
    for chamber, party, count in rows:
        key = "house" if "house" in (chamber or "").lower() else "senate"
        p = (party or "")[:1].upper()
        if p == "D":
            result[key]["democrat"] += count
        elif p == "R":
            result[key]["republican"] += count
        else:
            result[key]["independent"] += count
        result[key]["total"] += count
    result["total"] = {
        "total": result["house"]["total"] + result["senate"]["total"],
        "democrat": result["house"]["democrat"] + result["senate"]["democrat"],
        "republican": result["house"]["republican"] + result["senate"]["republican"],
        "independent": result["house"]["independent"] + result["senate"]["independent"],
    }
    return result


# ── Actions (global) ──

@router.get("/actions/recent")
def recent_actions(limit: int = Query(10, ge=1, le=200), db: Session = Depends(get_db)):
    """Unified feed of all actions, ordered by date DESC."""
    rows = (
        db.query(Action, SourceDocument.url)
          .outerjoin(SourceDocument, Action.source_id == SourceDocument.id)
          .order_by(desc(Action.date))
          .limit(limit).all()
    )

    # Batch-fetch all referenced bills in one query to avoid N+1
    bill_keys = set()
    for a, _url in rows:
        if a.bill_congress and a.bill_type and a.bill_number:
            bill_keys.add((a.bill_congress, a.bill_type, a.bill_number))

    bill_map: Dict[tuple, Bill] = {}
    if bill_keys:
        from sqlalchemy import tuple_
        bills = db.query(Bill).filter(
            tuple_(Bill.congress, Bill.bill_type, Bill.bill_number).in_(list(bill_keys))
        ).all()
        for b in bills:
            bill_map[(b.congress, b.bill_type, b.bill_number)] = b

    results = []
    for a, url in rows:
        item: Dict[str, Any] = {
            "id": a.id,
            "person_id": a.person_id,
            "title": a.title,
            "summary": a.summary,
            "date": a.date.isoformat() if a.date else None,
            "source_url": url,
            "bill_congress": a.bill_congress,
            "bill_type": a.bill_type,
            "bill_number": a.bill_number,
            "bill_status": None,
            "bill_title": None,
        }
        # Attach bill status + title from pre-fetched map
        if a.bill_congress and a.bill_type and a.bill_number:
            bill = bill_map.get((a.bill_congress, a.bill_type, a.bill_number))
            if bill:
                item["bill_status"] = getattr(bill, "status_bucket", None)
                item["bill_title"] = getattr(bill, "title", None)
        results.append(item)
    return results


@router.get("/actions/search")
def search_actions(
    person_id: Optional[str] = Query(None),
    bill_congress: Optional[int] = Query(None),
    bill_type: Optional[str] = Query(None),
    bill_number: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Keyword search in title/summary"),
    has_enriched: Optional[bool] = Query(None),
    simple: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Search endpoint for actions."""
    base = (
        db.query(Action, SourceDocument.url)
          .outerjoin(SourceDocument, Action.source_id == SourceDocument.id)
    )
    if person_id:
        base = base.filter(Action.person_id == person_id)
    if bill_congress is not None:
        base = base.filter(Action.bill_congress == bill_congress)
    if bill_type:
        base = base.filter(func.upper(Action.bill_type) == bill_type.upper())
    if bill_number:
        base = base.filter(Action.bill_number == str(bill_number))
    if q:
        like = f"%{escape_like(q)}%"
        base = base.filter((Action.title.ilike(like, escape="\\")) | (Action.summary.ilike(like, escape="\\")))
    if has_enriched is True:
        base = base.filter(Action.metadata_json.isnot(None))
    elif has_enriched is False:
        base = base.filter(Action.metadata_json.is_(None))

    total = base.with_entities(func.count()).scalar()
    rows = base.order_by(desc(Action.date)).offset(offset).limit(limit).all()

    actions = []
    for a, url in rows:
        action_data = {
            "id": a.id, "person_id": a.person_id, "title": a.title, "summary": a.summary,
            "date": a.date.isoformat() if a.date else None, "source_url": url,
            "bill_congress": a.bill_congress, "bill_type": a.bill_type, "bill_number": a.bill_number,
        }
        if simple:
            enriched = (a.metadata_json or {}).get("enriched", {}) if isinstance(a.metadata_json, dict) else {}
            latest_action = enriched.get("latest_action", {}) if isinstance(enriched.get("latest_action"), dict) else {}
            action_data["policy_area"] = enriched.get("policy_area")
            action_data["latest_action_text"] = latest_action.get("text")
            action_data["introduced_date"] = enriched.get("introduced_date")
        else:
            action_data["metadata_json"] = a.metadata_json
        actions.append(action_data)

    return {"total": total, "limit": limit, "offset": offset, "actions": actions}


@router.get("/actions/{action_id}")
def get_action_detail(action_id: int, db: Session = Depends(get_db)):
    """Full detail for a single action, including enriched fields and bill text receipt."""
    row = (
        db.query(Action, SourceDocument.url)
          .join(SourceDocument, Action.source_id == SourceDocument.id)
          .filter(Action.id == action_id)
          .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Action not found")

    a, url = row
    meta = a.metadata_json if isinstance(a.metadata_json, dict) else {}
    enriched = meta.get("enriched", {}) if isinstance(meta, dict) else {}
    latest = enriched.get("latest_action", {}) if isinstance(enriched.get("latest_action"), dict) else {}

    response = {
        "id": a.id,
        "person_id": a.person_id,
        "title": a.title,
        "summary": a.summary,
        "date": a.date.isoformat() if a.date else None,
        "source_url": url,
        "bill_congress": a.bill_congress,
        "bill_type": a.bill_type,
        "bill_number": a.bill_number,
        "enriched": {
            "title": enriched.get("title"),
            "policy_area": enriched.get("policy_area"),
            "subjects": enriched.get("subjects", []),
            "introduced_date": enriched.get("introduced_date"),
            "sponsors": enriched.get("sponsors", []),
            "cosponsors_count": enriched.get("cosponsors_count"),
            "latest_action_text": latest.get("text"),
            "latest_action_date": latest.get("actionDate"),
            "summary_text": enriched.get("summary_text"),
        } if enriched else None,
    }

    # Add bill text receipt
    if a.bill_congress and a.bill_type and a.bill_number:
        bill_id = normalize_bill_id(a.bill_congress, a.bill_type, a.bill_number)
        try:
            response["receipts"] = format_text_receipt(a.bill_congress, a.bill_type, a.bill_number)
        except Exception as e:
            response["receipts"] = {"error": str(e)}

    return response


# ── Claims ──

@router.post("/claims", dependencies=[Depends(require_press_key)])
def create_claim(
    request: Request,
    person_id: str,
    text: str = Query(..., max_length=2000),
    category: Optional[str] = None,
    claim_date: Optional[str] = None,
    claim_source_url: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Create a new claim with conservative auto-classification."""
    logger.info("New claim submission for person_id=%s", person_id)
    parsed_date = None
    if claim_date:
        try:
            parsed_date = date.fromisoformat(claim_date)
        except ValueError:
            return {"error": "claim_date must be YYYY-MM-DD"}

    suggestions = auto_classify_claim(text)
    intent = detect_intent(text)

    final_category = category
    category_source = "user"

    if category:
        final_category = category.strip().lower()
    else:
        top_suggestion = suggestions[0] if suggestions else ("general", 0.0)
        top_category, top_confidence = top_suggestion
        if top_confidence >= 0.7:
            final_category = top_category
            category_source = "auto_high_confidence"
        else:
            final_category = "general"
            category_source = "auto_low_confidence"

    # Build claim_hash for deduplication: hash of (person_id + normalized_text + source_url)
    normalized = re.sub(r'[^\w\s]', '', text.lower())
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    hash_input = f"{person_id}|{normalized}|{claim_source_url or ''}"
    claim_hash = hashlib.md5(hash_input.encode()).hexdigest()

    c = Claim(
        person_id=person_id, text=text, category=final_category, intent=intent,
        claim_date=parsed_date, claim_source_url=claim_source_url,
        claim_hash=claim_hash,
    )
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Duplicate claim already exists")
    except Exception:
        db.rollback()
        raise
    db.refresh(c)

    return {
        "id": c.id, "person_id": c.person_id, "text": c.text,
        "category": c.category, "category_source": category_source,
        "claim_date": c.claim_date, "claim_source_url": c.claim_source_url,
        "created_at": c.created_at.isoformat(), "intent": intent,
        "suggested_categories": suggestions,
    }


@router.get("/claims/{claim_id}")
def get_claim(claim_id: int, db: Session = Depends(get_db)):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return {
        "id": claim.id, "person_id": claim.person_id, "text": claim.text,
        "category": claim.category, "intent": claim.intent,
        "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
        "claim_source_url": claim.claim_source_url, "claim_hash": claim.claim_hash,
        "created_at": claim.created_at.isoformat() if claim.created_at else None,
        "updated_at": claim.updated_at.isoformat() if claim.updated_at else None,
    }


@router.get("/claims")
def list_claims(
    person_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Claim)
    if person_id:
        q = q.filter(Claim.person_id == person_id)
    total = q.with_entities(func.count()).scalar()
    rows = q.order_by(desc(Claim.id)).offset(offset).limit(limit).all()
    return {
        "total": total, "limit": limit, "offset": offset,
        "claims": [{
            "id": c.id, "person_id": c.person_id, "text": c.text,
            "claim_date": c.claim_date.isoformat() if c.claim_date else None,
            "claim_source_url": c.claim_source_url,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        } for c in rows],
    }


@router.get("/claims/{claim_id}/matches")
def match_claim_to_actions(claim_id: int, limit: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    """Deterministic matcher using shared matching service."""
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return compute_matches_for_claim(claim, db, limit=limit)


@router.get("/claims/{claim_id}/matches_multi")
def match_claim_multi_category(
    claim_id: int,
    limit: int = Query(25, ge=1, le=100),
    min_confidence: float = Query(0.1, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
):
    """Multi-category matcher."""
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        return {"error": "Claim not found"}

    all_categories = auto_classify_claim(claim.text)
    categories = [(cat, conf) for cat, conf in all_categories if conf >= min_confidence]
    if not categories:
        categories = [("general", 1.0)]

    rows = (
        db.query(Action, SourceDocument.url)
          .join(SourceDocument, Action.source_id == SourceDocument.id)
          .filter(Action.person_id == claim.person_id)
          .order_by(desc(Action.date)).limit(500).all()
    )

    all_matches = []
    category_results = {}

    for category, confidence in categories:
        profile = get_profile(category)
        stopwords = STOPWORDS_BASE.union(profile["stopwords_extra"])

        claim_gate_terms = profile.get("claim_gate_terms")
        if claim_gate_terms is not None:
            if not contains_claim_signal(claim.text, claim_gate_terms, stopwords):
                category_results[category] = {"confidence": confidence, "matches": 0, "note": "Claim missing category signal terms"}
                continue

        scored = []
        for a, url in rows:
            meta = a.metadata_json if isinstance(a.metadata_json, dict) else {}
            enriched = (meta.get("enriched") or {}) if isinstance(meta, dict) else {}
            latest = (enriched.get("latest_action") or {}) if isinstance(enriched.get("latest_action"), dict) else {}
            combined_text = f"{a.title or ''} {a.summary or ''} {enriched.get('title') or ''} {enriched.get('policy_area') or ''} {latest.get('text') or ''}"

            if profile["gate_terms"] is not None:
                if not contains_gate_signal(combined_text, profile["gate_terms"], stopwords):
                    continue

            s = score_action_against_claim(claim.text, a.title, a.summary, meta, profile)
            if s["score"] < profile["min_score"]:
                continue

            match_data = {
                "action_id": a.id, "score": s["score"], "category": category,
                "category_confidence": confidence, "combined_score": s["score"] * confidence,
                "title": a.title, "date": a.date.isoformat() if a.date else None, "source_url": url,
                "why": {
                    "claim_tokens": s["claim_tokens"], "overlap_basic": s["overlap_basic"],
                    "overlap_enriched": s["overlap_enriched"], "phrase_hits": s.get("phrase_hits", []),
                },
            }
            scored.append(match_data)
            all_matches.append(match_data)

        category_results[category] = {"confidence": confidence, "matches": len(scored), "min_score": profile["min_score"]}

    seen_actions = {}
    for match in all_matches:
        aid = match["action_id"]
        if aid not in seen_actions or match["combined_score"] > seen_actions[aid]["combined_score"]:
            seen_actions[aid] = match

    final_matches = sorted(seen_actions.values(), key=lambda x: x["combined_score"], reverse=True)

    return {
        "claim": {"id": claim.id, "person_id": claim.person_id, "text": claim.text, "intent": claim.intent},
        "categories_analyzed": category_results,
        "total_unique_matches": len(final_matches),
        "matches": final_matches[:limit],
    }


@router.get("/claims/{claim_id}/evaluation")
def get_claim_evaluation(claim_id: int, db: Session = Depends(get_db)):
    """Drill-down: full evaluation receipt for a single claim."""
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    eval_row = (
        db.query(ClaimEvaluation, Action, SourceDocument.url)
          .outerjoin(Action, Action.id == ClaimEvaluation.best_action_id)
          .outerjoin(SourceDocument, SourceDocument.id == Action.source_id)
          .filter(ClaimEvaluation.claim_id == claim_id)
          .first()
    )

    if not eval_row:
        return {
            "claim": {"id": claim.id, "text": claim.text, "person_id": claim.person_id,
                      "category": claim.category, "intent": claim.intent},
            "evaluation": None,
        }

    ev, act, source_url = eval_row
    return {
        "claim": {"id": claim.id, "text": claim.text, "person_id": claim.person_id,
                  "category": claim.category, "intent": claim.intent,
                  "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
                  "claim_source_url": claim.claim_source_url},
        "evaluation": {
            "id": ev.id, "tier": ev.tier, "score": ev.score,
            "relevance": ev.relevance, "progress": ev.progress, "timing": ev.timing,
            "matched_bill_id": ev.matched_bill_id,
            "evidence_json": _safe_json_loads(ev.evidence_json) if hasattr(ev, 'evidence_json') else None,
            "why_json": _safe_json_loads(ev.why_json) if hasattr(ev, 'why_json') else None,
            "action": None if not act else {
                "id": act.id, "title": act.title,
                "date": act.date.isoformat() if act.date else None,
                "source_url": source_url,
                "bill_congress": act.bill_congress, "bill_type": act.bill_type, "bill_number": act.bill_number,
            },
        },
    }


# ── Dashboard Stats ──

@router.get("/dashboard/stats", response_model=PoliticsDashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Aggregate stats for the dashboard hero section."""
    total_people = db.query(func.count(TrackedMember.id)).filter(TrackedMember.is_active == 1).scalar() or 0
    total_claims = db.query(func.count(Claim.id)).scalar() or 0
    total_actions = db.query(func.count(Action.id)).scalar() or 0
    total_bills = db.query(func.count(Bill.bill_id)).scalar() or 0

    by_tier = dict(
        db.query(GoldLedgerEntry.tier, func.count(GoldLedgerEntry.id))
        .group_by(GoldLedgerEntry.tier).all()
    )
    total_scored = sum(by_tier.values())
    match_rate = round((total_scored / total_claims * 100), 1) if total_claims > 0 else 0.0

    return {
        "total_people": total_people, "total_claims": total_claims,
        "total_actions": total_actions, "total_bills": total_bills,
        "by_tier": by_tier, "match_rate": match_rate,
    }
