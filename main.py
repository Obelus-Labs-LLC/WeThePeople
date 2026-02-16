import os
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException, Depends
from services.auth import require_press_key
from services.rate_limit import RateLimitMiddleware
from fastapi.middleware.cors import CORSMiddleware
from models.database import (
    SessionLocal,
    Person,
    Action,
    SourceDocument,
    Claim,
    ClaimEvaluation,
    Vote,
    MemberVote,
    Bill,
    BillAction,
    PersonBill,
    GoldLedgerEntry,
    TrackedMember,
)
from sqlalchemy import func, desc
from sqlalchemy.exc import OperationalError
from typing import Optional, List, Dict, Any, Tuple
from datetime import date, datetime
import re
import json

from services.coverage import compute_coverage_report
from services.ops.pilot_cohort import get_pilot_person_ids

from services.matching import (
    compute_matches_for_claim,
    auto_classify_claim,
    detect_intent,
    score_action_against_claim,
    get_profile,
    contains_gate_signal,
    contains_claim_signal,
    CATEGORY_PROFILES,
    STOPWORDS_BASE,
)

from functools import lru_cache
from connectors.wikipedia import build_politician_profile
from connectors.fec import build_finance_profile
from services.power_map import build_person_power_map
from utils.normalization import normalize_bill_id
from services.bill_text import format_text_receipt

load_dotenv()

CONGRESS_API_KEY = os.getenv("API_KEY_CONGRESS")
OPENSTATES_API_KEY = os.getenv("API_KEY_OPENSTATES")

app = FastAPI()

# Local frontend dev (Vite) needs CORS when calling the API from a browser.
# Configure via CORS_ALLOW_ORIGINS (comma-separated). If unset, allow common localhost dev origins.
_cors_origins_raw = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
_cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-WTP-API-KEY"],
    )

# Rate limiting (opt-in via WTP_RATE_LIMIT_ENABLED=1)
app.add_middleware(RateLimitMiddleware)


LEDGER_TIER_VALUES = ("strong", "moderate", "weak", "none")

# Startup event to populate database with recent federal documents
@app.on_event("startup")
async def startup_event():
    """Fetch recent presidential documents on startup"""
    if os.getenv("DISABLE_STARTUP_FETCH") == "1":
        return
    try:
        from connectors.federal_register import fetch_presidential_documents
        fetch_presidential_documents(pages=3)  # Pulls ~300 most recent docs
        print("[OK] Federal Register data loaded successfully")
    except Exception as e:
        print(f"[WARN] Failed to load Federal Register data: {e}")


@app.get("/ops/runtime", dependencies=[Depends(require_press_key)])
def get_runtime_info():
    """Debug endpoint: expose runtime configuration to prevent wrong-server issues"""
    from models.database import DATABASE_URL
    import subprocess
    
    # Sanitize DB URL (remove passwords if any)
    db_display = DATABASE_URL
    if "@" in db_display:
        # Redact password in postgres://user:pass@host/db
        parts = db_display.split("@")
        user_pass = parts[0].split("//")[1]
        if ":" in user_pass:
            user = user_pass.split(":")[0]
            db_display = db_display.replace(user_pass, f"{user}:***")
    
    # Extract DB file if SQLite
    db_file = None
    if db_display.startswith("sqlite:///"):
        db_file = db_display.replace("sqlite:///", "").replace("./", "")
    
    # Best-effort git SHA
    git_sha = None
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=1
        )
        if result.returncode == 0:
            git_sha = result.stdout.strip()
    except:
        pass
    
    return {
        "db_url": db_display,
        "db_file": db_file,
        "git_sha": git_sha,
        "disable_startup_fetch": os.getenv("DISABLE_STARTUP_FETCH") == "1",
        "no_network": os.getenv("NO_NETWORK") == "1",
        "cors_origins": _cors_origins,
    }


def _safe_json_loads(value: Optional[str]):
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


def _serialize_gold_row(row: GoldLedgerEntry) -> Dict[str, Any]:
    return {
        "id": row.id,
        "claim_id": row.claim_id,
        "evaluation_id": row.evaluation_id,
        "person_id": row.person_id,
        "claim_date": row.claim_date.isoformat() if row.claim_date else None,
        "source_url": row.source_url,
        "normalized_text": row.normalized_text,
        "intent_type": row.intent_type,
        "policy_area": row.policy_area,
        "matched_bill_id": row.matched_bill_id,
        "best_action_id": row.best_action_id,
        "score": row.score,
        "tier": row.tier,
        "relevance": row.relevance,
        "progress": row.progress,
        "timing": row.timing,
        "evidence": _safe_json_loads(row.evidence_json),
        "why": _safe_json_loads(row.why_json),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@app.get("/ledger/person/{person_id}")
def get_person_ledger(
    person_id: str,
    tier: Optional[str] = Query(None, description="Filter by tier (strong/moderate/weak/none)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Gold-backed ledger entries for a person.

    Canonical source: gold_ledger (materialized from claim_evaluations).
    """
    db = SessionLocal()
    try:
        q = db.query(GoldLedgerEntry).filter(GoldLedgerEntry.person_id == person_id)
        if tier is not None:
            if tier not in LEDGER_TIER_VALUES:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error": "invalid tier",
                        "allowed": list(LEDGER_TIER_VALUES),
                    },
                )
            q = q.filter(GoldLedgerEntry.tier == tier)

        total = q.with_entities(func.count(GoldLedgerEntry.id)).scalar() or 0

        rows = (
            q.order_by(
                desc(GoldLedgerEntry.claim_date).nullslast(),
                desc(GoldLedgerEntry.claim_id),
                desc(GoldLedgerEntry.id),
            )
            .offset(offset)
            .limit(limit)
            .all()
        )

        return {
            "person_id": person_id,
            "total": total,
            "limit": limit,
            "offset": offset,
            "entries": [_serialize_gold_row(r) for r in rows],
        }
    finally:
        db.close()


@app.get("/ledger/summary")
def get_ledger_summary(
    person_id: Optional[str] = Query(None, description="Optional filter by person_id"),
):
    """Aggregate summary over Gold ledger entries."""
    db = SessionLocal()
    try:
        q = db.query(GoldLedgerEntry)
        if person_id:
            q = q.filter(GoldLedgerEntry.person_id == person_id)

        total = q.with_entities(func.count(GoldLedgerEntry.id)).scalar() or 0
        by_tier = dict(
            q.with_entities(GoldLedgerEntry.tier, func.count(GoldLedgerEntry.id))
             .group_by(GoldLedgerEntry.tier)
             .all()
        )

        return {
            "total": total,
            "by_tier": by_tier,
        }
    finally:
        db.close()


@app.get("/ledger/claim/{claim_id}")
def get_ledger_claim(claim_id: int):
    """Single claim view from the Gold ledger (thin wrapper).

    Canonical source: gold_ledger.
    """
    db = SessionLocal()
    try:
        row = db.query(GoldLedgerEntry).filter(GoldLedgerEntry.claim_id == claim_id).one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "ledger claim not found", "claim_id": claim_id})
        return _serialize_gold_row(row)
    finally:
        db.close()


@app.get("/ops/coverage", dependencies=[Depends(require_press_key)])
def get_ops_coverage(
    person_id: Optional[str] = Query(
        None,
        description="Optional person_id filter. Can be a single id or a comma-separated list.",
    ),
    pilot_only: bool = Query(
        False,
        description="If true, filters to the canonical pilot cohort (deterministic, no network).",
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    active_only: bool = Query(True),
    order: str = Query("worst", description="Ordering: worst|best"),
):
    """Operational coverage snapshot (Phase L3)."""
    db = SessionLocal()
    try:
        person_ids = None
        if person_id is not None:
            # Note: allow an explicitly empty list; downstream code treats [] as an explicit empty filter.
            person_ids = [p.strip() for p in person_id.split(",") if p.strip()]

        if pilot_only:
            pilot_ids = get_pilot_person_ids(db)
            if person_ids is None:
                person_ids = pilot_ids
            else:
                pilot_set = set(pilot_ids)
                person_ids = [p for p in person_ids if p in pilot_set]
        return compute_coverage_report(
            db,
            person_ids=person_ids,
            limit=limit,
            offset=offset,
            active_only=active_only,
            order=order,
        )
    finally:
        db.close()

@app.get("/people")
def get_people(
    active_only: bool = Query(True),
    has_ledger: bool = Query(
        False,
        description="If true, returns only people that have at least one gold_ledger entry.",
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, description="Case-insensitive search over person_id/display_name/bioguide_id"),
):
    """People directory for frontend.

    Canonical source: tracked_members.
    Returns paginated dict with total for proper UI pagination.
    """
    db = SessionLocal()
    try:
        query = db.query(TrackedMember)
        if active_only:
            query = query.filter(TrackedMember.is_active == 1)

        if has_ledger:
            query = query.filter(
                db.query(GoldLedgerEntry.id)
                .filter(GoldLedgerEntry.person_id == TrackedMember.person_id)
                .exists()
            )

        if q:
            like = f"%{q.strip().lower()}%"
            query = query.filter(
                func.lower(TrackedMember.person_id).like(like)
                | func.lower(TrackedMember.display_name).like(like)
                | func.lower(TrackedMember.bioguide_id).like(like)
            )

        # Get total before pagination
        total = query.count()

        rows = (
            query.order_by(TrackedMember.display_name.asc(), TrackedMember.person_id.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        return {
            "total": total,
            "people": [
                {
                    "person_id": r.person_id,
                    "display_name": r.display_name,
                    "chamber": r.chamber,
                    "state": r.state,
                    "party": r.party,
                    "is_active": bool(r.is_active),
                    "photo_url": r.photo_url,
                }
                for r in rows
            ],
            "limit": limit,
            "offset": offset,
        }
    finally:
        db.close()


@app.get("/people/{person_id}")
def get_person_directory_entry(person_id: str):
    """Single person directory entry (tracked_members-backed)."""
    db = SessionLocal()
    try:
        row = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "person not found", "person_id": person_id})

        return {
            "person_id": row.person_id,
            "display_name": row.display_name,
            "bioguide_id": row.bioguide_id,
            "chamber": row.chamber,
            "state": row.state,
            "party": row.party,
            "is_active": bool(row.is_active),
        }
    finally:
        db.close()

@app.get("/people/{person_id}/actions")
def get_actions(
    person_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        rows = (
            db.query(Action, SourceDocument.url)
              .join(SourceDocument, Action.source_id == SourceDocument.id)
              .filter(Action.person_id == person_id)
              .order_by(desc(Action.date))
              .offset(offset)
              .limit(limit)
              .all()
        )

        return [{
            "id": a.id,
            "person_id": a.person_id,
            "title": a.title,
            "summary": a.summary,
            "date": a.date.isoformat() if a.date else None,
            "source_url": url,
            "bill_congress": a.bill_congress,
            "bill_type": a.bill_type,
            "bill_number": a.bill_number,
            "metadata_json": a.metadata_json,
        } for a, url in rows]
    finally:
        db.close()

@app.get("/people/{person_id}/stats")
def get_person_stats(person_id: str):
    """Get summary metrics for a person - supports performance scoring without editorializing"""
    db = SessionLocal()
    try:
        # Get all actions for this person
        actions = db.query(Action).filter(Action.person_id == person_id).all()

        # Calculate stats
        actions_count = len(actions)
        last_action_date = None
        top_tags = []

        if actions_count > 0:
            # Get most recent action date
            last_action = max(actions, key=lambda a: a.date if a.date else "")
            last_action_date = last_action.date.isoformat() if last_action.date else None

        return {
            "id": person_id,
            "actions_count": actions_count,
            "last_action_date": last_action_date,
            "top_tags": top_tags
        }
    finally:
        db.close()

@app.get("/actions/recent")
def recent_actions(limit: int = Query(10, ge=1, le=200)):
    """Unified feed of all actions, ordered by date DESC - powers the dashboard 'Recent Activity' panel"""
    db = SessionLocal()
    try:
        rows = (
            db.query(Action, SourceDocument.url)
              .join(SourceDocument, Action.source_id == SourceDocument.id)
              .order_by(desc(Action.date))
              .limit(limit)
              .all()
        )

        return [{
            "id": a.id,
            "person_id": a.person_id,
            "title": a.title,
            "summary": a.summary,
            "date": a.date.isoformat() if a.date else None,
            "source_url": url,
            "bill_congress": a.bill_congress,
            "bill_type": a.bill_type,
            "bill_number": a.bill_number,
        } for a, url in rows]
    finally:
        db.close()

@app.get("/actions/search")
def search_actions(
    person_id: Optional[str] = Query(None),
    bill_congress: Optional[int] = Query(None),
    bill_type: Optional[str] = Query(None),
    bill_number: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Keyword search in title/summary"),
    has_enriched: Optional[bool] = Query(None, description="true = only actions with enriched metadata"),
    simple: bool = Query(False, description="true = extract enriched fields instead of raw metadata_json"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    Search endpoint for actions.
    Returns source_url from SourceDocument (audit-safe).
    Use simple=true for extracted enriched fields instead of raw metadata_json.
    """
    db = SessionLocal()
    try:
        base = (
            db.query(Action, SourceDocument.url)
              .join(SourceDocument, Action.source_id == SourceDocument.id)
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
            like = f"%{q}%"
            base = base.filter(
                (Action.title.ilike(like)) | (Action.summary.ilike(like))
            )
        if has_enriched is True:
            base = base.filter(Action.metadata_json.isnot(None))
        elif has_enriched is False:
            base = base.filter(Action.metadata_json.is_(None))

        total = base.with_entities(func.count()).scalar()

        rows = (
            base.order_by(desc(Action.date))
                .offset(offset)
                .limit(limit)
                .all()
        )

        actions = []
        for a, url in rows:
            action_data = {
                "id": a.id,
                "person_id": a.person_id,
                "title": a.title,
                "summary": a.summary,
                "date": a.date.isoformat() if a.date else None,
                "source_url": url,
                "bill_congress": a.bill_congress,
                "bill_type": a.bill_type,
                "bill_number": a.bill_number,
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

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "actions": actions
        }
    finally:
        db.close()




# --- CLAIMS API ---

@app.post("/claims", dependencies=[Depends(require_press_key)])
def create_claim(
    person_id: str,
    text: str,
    category: Optional[str] = None,
    claim_date: Optional[str] = None,         # 'YYYY-MM-DD' as string for simplicity
    claim_source_url: Optional[str] = None,
):
    """
    Create a new claim with conservative auto-classification.
    
    Category rules:
    - If user provides category: trust user, store it
    - If not: compute suggestions, only auto-apply if confidence >= 0.7
    - Always return suggestions for transparency
    """
    db = SessionLocal()
    try:
        parsed_date = None
        if claim_date:
            try:
                parsed_date = date.fromisoformat(claim_date)
            except ValueError:
                return {"error": "claim_date must be YYYY-MM-DD"}

        # Always compute suggestions (for transparency)
        suggestions = auto_classify_claim(text)
        intent = detect_intent(text)
        
        # Conservative category assignment
        final_category = category
        category_source = "user"  # Track where category came from
        
        if category:
            # User provided category - trust user
            final_category = category.strip().lower()
            category_source = "user"
        else:
            # No category provided - use auto-classification conservatively
            top_suggestion = suggestions[0] if suggestions else ("general", 0.0)
            top_category, top_confidence = top_suggestion
            
            # CONSERVATIVE THRESHOLD: Only auto-apply if confidence >= 0.7
            if top_confidence >= 0.7:
                final_category = top_category
                category_source = "auto_high_confidence"
            else:
                # Low confidence - default to general but flag it
                final_category = "general"
                category_source = "auto_low_confidence"

        c = Claim(
            person_id=person_id,
            text=text,
            category=final_category,
            intent=intent,
            claim_date=parsed_date,
            claim_source_url=claim_source_url,
        )
        db.add(c)
        db.commit()
        db.refresh(c)

        return {
            "id": c.id,
            "person_id": c.person_id,
            "text": c.text,
            "category": c.category,
            "category_source": category_source,
            "claim_date": c.claim_date,
            "claim_source_url": c.claim_source_url,
            "created_at": c.created_at.isoformat(),
            "intent": intent,
            "suggested_categories": suggestions,  # Always return for transparency
        }
    finally:
        db.close()


@app.get("/claims/{claim_id}", dependencies=[Depends(require_press_key)])
def get_claim(claim_id: int):
    """Get a single claim by ID."""
    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        
        return {
            "id": claim.id,
            "person_id": claim.person_id,
            "text": claim.text,
            "category": claim.category,
            "intent": claim.intent,
            "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
            "claim_source_url": claim.claim_source_url,
            "claim_hash": claim.claim_hash,
            "created_at": claim.created_at.isoformat() if claim.created_at else None,
            "updated_at": claim.updated_at.isoformat() if claim.updated_at else None,
        }
    finally:
        db.close()


@app.get("/claims", dependencies=[Depends(require_press_key)])
def list_claims(
    person_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        q = db.query(Claim)

        if person_id:
            q = q.filter(Claim.person_id == person_id)

        total = q.with_entities(func.count()).scalar()

        rows = (
            q.order_by(desc(Claim.id))
             .offset(offset)
             .limit(limit)
             .all()
        )

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "claims": [{
                "id": c.id,
                "person_id": c.person_id,
                "text": c.text,
                "claim_date": c.claim_date.isoformat() if c.claim_date else None,
                "claim_source_url": c.claim_source_url,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            } for c in rows]
        }
    finally:
        db.close()


@app.get("/claims/{claim_id}/matches", dependencies=[Depends(require_press_key)])
def match_claim_to_actions(
    claim_id: int,
    limit: int = Query(25, ge=1, le=100),
):
    """
    Deterministic matcher using shared matching service.
    Returns top actions with explanations + evidence framework.
    """
    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")

        result = compute_matches_for_claim(claim, db, limit=limit)
        return result
    finally:
        db.close()


@app.get("/claims/{claim_id}/matches_multi", dependencies=[Depends(require_press_key)])
def match_claim_multi_category(
    claim_id: int,
    limit: int = Query(25, ge=1, le=100),
    min_confidence: float = Query(0.1, ge=0.0, le=1.0),
):
    """
    Multi-category matcher - runs claim against all relevant categories.
    Auto-detects categories and combines results.
    """
    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim:
            return {"error": "Claim not found"}

        # Auto-classify to get all relevant categories
        all_categories = auto_classify_claim(claim.text)
        categories = [(cat, conf) for cat, conf in all_categories if conf >= min_confidence]
        if not categories:
            categories = [("general", 1.0)]

        # Pull candidate actions once
        rows = (
            db.query(Action, SourceDocument.url)
              .join(SourceDocument, Action.source_id == SourceDocument.id)
              .filter(Action.person_id == claim.person_id)
              .order_by(desc(Action.date))
              .limit(2000)
              .all()
        )

        all_matches = []
        category_results = {}

        for category, confidence in categories:
            profile = get_profile(category)
            stopwords = STOPWORDS_BASE.union(profile["stopwords_extra"])

            # Check claim gate for this category
            claim_gate_terms = profile.get("claim_gate_terms")
            if claim_gate_terms is not None:
                if not contains_claim_signal(claim.text, claim_gate_terms, stopwords):
                    category_results[category] = {
                        "confidence": confidence,
                        "matches": 0,
                        "note": "Claim missing category signal terms"
                    }
                    continue

            scored = []
            for a, url in rows:
                meta = a.metadata_json if isinstance(a.metadata_json, dict) else {}
                enriched = (meta.get("enriched") or {}) if isinstance(meta, dict) else {}
                latest = (enriched.get("latest_action") or {}) if isinstance(enriched.get("latest_action"), dict) else {}

                combined_text = f"{a.title or ''} {a.summary or ''} {enriched.get('title') or ''} {enriched.get('policy_area') or ''} {latest.get('text') or ''}"

                # Action gate
                if profile["gate_terms"] is not None:
                    if not contains_gate_signal(combined_text, profile["gate_terms"], stopwords):
                        continue

                s = score_action_against_claim(claim.text, a.title, a.summary, meta, profile)
                if s["score"] < profile["min_score"]:
                    continue

                match_data = {
                    "action_id": a.id,
                    "score": s["score"],
                    "category": category,
                    "category_confidence": confidence,
                    "combined_score": s["score"] * confidence,  # Weight by category confidence
                    "title": a.title,
                    "date": a.date.isoformat() if a.date else None,
                    "source_url": url,
                    "why": {
                        "claim_tokens": s["claim_tokens"],
                        "overlap_basic": s["overlap_basic"],
                        "overlap_enriched": s["overlap_enriched"],
                        "phrase_hits": s.get("phrase_hits", []),
                    }
                }
                scored.append(match_data)
                all_matches.append(match_data)

            category_results[category] = {
                "confidence": confidence,
                "matches": len(scored),
                "min_score": profile["min_score"]
            }

        # Deduplicate and sort by combined score
        seen_actions = {}
        for match in all_matches:
            aid = match["action_id"]
            if aid not in seen_actions or match["combined_score"] > seen_actions[aid]["combined_score"]:
                seen_actions[aid] = match

        final_matches = sorted(seen_actions.values(), key=lambda x: x["combined_score"], reverse=True)

        return {
            "claim": {
                "id": claim.id,
                "person_id": claim.person_id,
                "text": claim.text,
                "intent": claim.intent,
            },
            "categories_analyzed": category_results,
            "total_unique_matches": len(final_matches),
            "matches": final_matches[:limit],
        }
    finally:
        db.close()


@app.get("/people/{person_id}/performance", dependencies=[Depends(require_press_key)])
def person_performance(person_id: str, top: int = Query(10, ge=1, le=50)):
    """
    Evidence-backed performance summary for a person.
    Returns aggregated claim evaluations and top receipts.
    """
    db = SessionLocal()
    try:
        total_claims = db.query(func.count(Claim.id)).filter(Claim.person_id == person_id).scalar() or 0
        total_scored = db.query(func.count(ClaimEvaluation.id)).filter(ClaimEvaluation.person_id == person_id).scalar() or 0

        by_tier = dict(
            db.query(ClaimEvaluation.tier, func.count(ClaimEvaluation.id))
              .filter(ClaimEvaluation.person_id == person_id)
              .group_by(ClaimEvaluation.tier)
              .all()
        )

        by_category = dict(
            db.query(Claim.category, func.count(Claim.id))
              .filter(Claim.person_id == person_id)
              .group_by(Claim.category)
              .all()
        )

        by_timing = dict(
            db.query(ClaimEvaluation.timing, func.count(ClaimEvaluation.id))
              .filter(ClaimEvaluation.person_id == person_id)
              .group_by(ClaimEvaluation.timing)
              .all()
        )

        by_progress = dict(
            db.query(ClaimEvaluation.progress, func.count(ClaimEvaluation.id))
              .filter(ClaimEvaluation.person_id == person_id)
              .group_by(ClaimEvaluation.progress)
              .all()
        )

        # Top receipts: best matches with citations
        top_rows = (
            db.query(ClaimEvaluation, Claim, Action, SourceDocument.url)
              .join(Claim, Claim.id == ClaimEvaluation.claim_id)
              .outerjoin(Action, Action.id == ClaimEvaluation.best_action_id)
              .outerjoin(SourceDocument, SourceDocument.id == Action.source_id)
              .filter(ClaimEvaluation.person_id == person_id)
              .order_by(ClaimEvaluation.score.desc().nullslast(), ClaimEvaluation.updated_at.desc())
              .limit(top)
              .all()
        )

        receipts = []
        for ev, cl, act, source_url in top_rows:
            receipts.append({
                "claim_id": cl.id,
                "claim_text": cl.text,
                "category": cl.category,
                "tier": ev.tier,
                "relevance": ev.relevance,
                "progress": ev.progress,
                "timing": ev.timing,
                "score": ev.score,
                "action": None if not act else {
                    "id": act.id,
                    "title": act.title,
                    "date": act.date.isoformat() if act.date else None,
                    "source_url": source_url,
                    "bill_congress": act.bill_congress,
                    "bill_type": act.bill_type,
                    "bill_number": act.bill_number,
                    "policy_area": act.policy_area,
                    "latest_action_text": act.latest_action_text,
                    "latest_action_date": act.latest_action_date,
                }
            })

        return {
            "person_id": person_id,
            "total_claims": total_claims,
            "total_scored": total_scored,
            "by_tier": by_tier,
            "by_category": by_category,
            "by_timing": by_timing,
            "by_progress": by_progress,
            "top_receipts": receipts,
        }
    finally:
        db.close()


# --- Wikipedia profile (cached) ---

@lru_cache(maxsize=128)
def _cached_wikipedia_profile(display_name: str):
    try:
        return build_politician_profile(display_name)
    except Exception:
        return None


@app.get("/people/{person_id}/profile")
def get_person_profile(person_id: str):
    """Wikipedia profile for a person. Cached in-memory."""
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).one_or_none()
        if member is None:
            raise HTTPException(status_code=404, detail={"error": "person not found", "person_id": person_id})
        display_name = member.display_name
    finally:
        db.close()

    profile = _cached_wikipedia_profile(display_name)
    if profile is None:
        return {"person_id": person_id, "display_name": display_name, "summary": None, "thumbnail": None,
                "wikidata_id": None, "infobox": {}, "sections": {}, "url": None}
    profile["person_id"] = person_id
    profile["display_name"] = display_name
    return profile


# --- FEC finance profile (cached) ---

@lru_cache(maxsize=128)
def _cached_fec_profile(display_name: str):
    try:
        return build_finance_profile(display_name)
    except Exception:
        return None


@app.get("/people/{person_id}/finance")
def get_person_finance(person_id: str):
    """FEC finance profile for a person. Cached in-memory."""
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).one_or_none()
        if member is None:
            raise HTTPException(status_code=404, detail={"error": "person not found", "person_id": person_id})
        display_name = member.display_name
    finally:
        db.close()

    profile = _cached_fec_profile(display_name)
    if profile is None:
        return {"person_id": person_id, "display_name": display_name,
                "candidate_id": None, "totals": None, "committees": [], "top_donors": []}
    profile["person_id"] = person_id
    profile["display_name"] = display_name
    return profile


# --- Dashboard aggregate stats ---

@app.get("/dashboard/stats")
def get_dashboard_stats():
    """Aggregate stats for the dashboard hero section."""
    db = SessionLocal()
    try:
        total_people = db.query(func.count(Person.id)).scalar() or 0
        total_claims = db.query(func.count(Claim.id)).scalar() or 0
        total_actions = db.query(func.count(Action.id)).scalar() or 0
        total_bills = db.query(func.count(Bill.bill_id)).scalar() or 0

        by_tier = dict(
            db.query(GoldLedgerEntry.tier, func.count(GoldLedgerEntry.id))
            .group_by(GoldLedgerEntry.tier)
            .all()
        )

        total_scored = sum(by_tier.values())
        match_rate = round((total_scored / total_claims * 100), 1) if total_claims > 0 else 0.0

        return {
            "total_people": total_people,
            "total_claims": total_claims,
            "total_actions": total_actions,
            "total_bills": total_bills,
            "by_tier": by_tier,
            "match_rate": match_rate,
        }
    finally:
        db.close()


@app.get("/claims/{claim_id}/evaluation", dependencies=[Depends(require_press_key)])
def get_claim_evaluation(claim_id: int):
    """
    Drill-down endpoint: returns full evaluation receipt for a single claim.
    Powers dashboard clicks → evidence page.
    """
    db = SessionLocal()
    try:
        # Get claim
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")

        # Get evaluation with action and source
        result = (
            db.query(ClaimEvaluation, Action, SourceDocument.url)
              .outerjoin(Action, Action.id == ClaimEvaluation.best_action_id)
              .outerjoin(SourceDocument, SourceDocument.id == Action.source_id)
              .filter(ClaimEvaluation.claim_id == claim_id)
              .first()
        )

        if not result:
            # No evaluation exists yet
            return {
                "claim": {
                    "id": claim.id,
                    "text": claim.text,
                    "category": claim.category,
                    "intent": claim.intent,
                    "person_id": claim.person_id,
                    "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
                },
                "evaluation": None,
                "action": None,
            }

        ev, act, source_url = result

        # Parse why_json if exists
        why_data = None
        if ev.why_json:
            try:
                why_data = json.loads(ev.why_json)
            except Exception:
                why_data = None

        payload = {
            "claim": {
                "id": claim.id,
                "text": claim.text,
                "category": claim.category,
                "intent": claim.intent,
                "person_id": claim.person_id,
                "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
            },
            "evaluation": {
                "tier": ev.tier,
                "relevance": ev.relevance,
                "progress": ev.progress,
                "timing": ev.timing,
                "score": ev.score,
                "why": why_data,
                "updated_at": ev.updated_at.isoformat() if ev.updated_at else None,
            },
            "action": None if not act else {
                "id": act.id,
                "title": act.title,
                "summary": act.summary,
                "date": act.date.isoformat() if act.date else None,
                "source_url": source_url,
                "bill_congress": act.bill_congress,
                "bill_type": act.bill_type,
                "bill_number": act.bill_number,
                "policy_area": act.policy_area,
                "latest_action_text": act.latest_action_text,
                "latest_action_date": act.latest_action_date,
            }
        }
        
        # Add bill_id and timeline link if action has bill info
        if act and act.bill_congress and act.bill_type and act.bill_number:
            bill_id = normalize_bill_id(act.bill_congress, act.bill_type, act.bill_number)
            payload["action"]["bill_id"] = bill_id
            payload["action"]["timeline_endpoint"] = f"/bills/{bill_id}/timeline"
            
            # Add bill summary snapshot (from Bill table if enriched)
            bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
            if bill:
                payload["bill_summary"] = {
                    "bill_id": bill.bill_id,
                    "status_bucket": bill.status_bucket,
                    "status_reason": bill.status_reason,
                    "timeline_count": db.query(BillAction).filter(BillAction.bill_id == bill_id).count(),
                }
        
        # Phase 3.2: Add bill text receipt if available
        if act and act.bill_congress and act.bill_type and act.bill_number:
            try:
                text_receipt = format_text_receipt(act.bill_congress, act.bill_type, act.bill_number)
                if text_receipt:
                    payload["action"]["bill_text"] = text_receipt
            except:
                pass
        
        return payload
    finally:
        db.close()


@app.get("/compare")
def compare_performance(person_id: List[str] = Query(..., min_length=1, max_length=10)):
    """
    Public accountability ledger: compare performance metrics across politicians.
    Returns raw counts and normalized percentages for each person.
    """
    db = SessionLocal()
    try:
        people_data = []
        
        for pid in person_id:
            # Same metrics as /people/{person_id}/performance
            total_claims = db.query(func.count(Claim.id)).filter(Claim.person_id == pid).scalar() or 0
            total_scored = db.query(func.count(ClaimEvaluation.id)).filter(ClaimEvaluation.person_id == pid).scalar() or 0

            by_tier = dict(
                db.query(ClaimEvaluation.tier, func.count(ClaimEvaluation.id))
                  .filter(ClaimEvaluation.person_id == pid)
                  .group_by(ClaimEvaluation.tier)
                  .all()
            )

            by_category = dict(
                db.query(Claim.category, func.count(Claim.id))
                  .filter(Claim.person_id == pid)
                  .group_by(Claim.category)
                  .all()
            )

            by_timing = dict(
                db.query(ClaimEvaluation.timing, func.count(ClaimEvaluation.id))
                  .filter(ClaimEvaluation.person_id == pid)
                  .group_by(ClaimEvaluation.timing)
                  .all()
            )

            by_progress = dict(
                db.query(ClaimEvaluation.progress, func.count(ClaimEvaluation.id))
                  .filter(ClaimEvaluation.person_id == pid)
                  .group_by(ClaimEvaluation.progress)
                  .all()
            )

            # Calculate normalized percentages
            tier_pct = {}
            if total_scored > 0:
                for tier, count in by_tier.items():
                    tier_pct[tier] = round(count / total_scored * 100, 1)

            timing_pct = {}
            if total_scored > 0:
                for timing, count in by_timing.items():
                    timing_pct[timing] = round(count / total_scored * 100, 1)

            progress_pct = {}
            if total_scored > 0:
                for progress, count in by_progress.items():
                    progress_pct[progress] = round(count / total_scored * 100, 1)

            people_data.append({
                "person_id": pid,
                "total_claims": total_claims,
                "total_scored": total_scored,
                "by_tier": {
                    "raw": by_tier,
                    "percent": tier_pct,
                },
                "by_category": by_category,
                "by_timing": {
                    "raw": by_timing,
                    "percent": timing_pct,
                },
                "by_progress": {
                    "raw": by_progress,
                    "percent": progress_pct,
                },
            })

        return {
            "people": people_data,
            "comparison_count": len(people_data),
        }
    finally:
        db.close()


@app.get("/graph/person/{person_id}", dependencies=[Depends(require_press_key)])
def get_person_graph(person_id: str):
    """
    Knowledge graph for a person: nodes (person, claims, actions, categories) and edges.
    Powers interactive graph visualization without inventing anything.
    """
    db = SessionLocal()
    try:
        nodes = []
        edges = []
        
        # Person node (central)
        nodes.append({
            "id": f"person:{person_id}",
            "type": "person",
            "label": person_id,
        })
        
        # Category nodes (we'll track which ones are used)
        categories_seen = set()
        
        # Get all claims for this person
        claims = db.query(Claim).filter(Claim.person_id == person_id).all()
        
        for claim in claims:
            # Claim node
            claim_node = {
                "id": f"claim:{claim.id}",
                "type": "claim",
                "label": claim.text[:60] + "..." if len(claim.text) > 60 else claim.text,
                "full_text": claim.text,
                "category": claim.category,
                "intent": claim.intent,
                "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
            }
            nodes.append(claim_node)
            
            # Edge: person → claim
            edges.append({
                "source": f"person:{person_id}",
                "target": f"claim:{claim.id}",
                "type": "made_claim",
            })
            
            # Edge: claim → category
            if claim.category:
                categories_seen.add(claim.category)
                edges.append({
                    "source": f"claim:{claim.id}",
                    "target": f"category:{claim.category}",
                    "type": "categorized_as",
                })
            
            # Get evaluation to find matched action
            evaluation = (
                db.query(ClaimEvaluation)
                  .filter(ClaimEvaluation.claim_id == claim.id)
                  .first()
            )
            
            if evaluation and evaluation.best_action_id:
                action = db.query(Action).filter(Action.id == evaluation.best_action_id).first()
                
                if action:
                    # Action node
                    action_node = {
                        "id": f"action:{action.id}",
                        "type": "action",
                        "label": action.title[:60] + "..." if len(action.title) > 60 else action.title,
                        "full_title": action.title,
                        "bill_congress": action.bill_congress,
                        "bill_type": action.bill_type,
                        "bill_number": action.bill_number,
                        "policy_area": action.policy_area,
                        "date": action.date.isoformat() if action.date else None,
                    }
                    
                    # Only add action node if not already present
                    if not any(n["id"] == action_node["id"] for n in nodes):
                        nodes.append(action_node)
                    
                    # Edge: claim → action (with evidence metadata)
                    edges.append({
                        "source": f"claim:{claim.id}",
                        "target": f"action:{action.id}",
                        "type": "matched",
                        "tier": evaluation.tier,
                        "relevance": evaluation.relevance,
                        "score": evaluation.score,
                        "progress": evaluation.progress,
                        "timing": evaluation.timing,
                    })
                    
                    # Edge: action → category (based on policy_area)
                    if action.policy_area:
                        # Normalize policy_area to lowercase for consistency
                        policy_category = action.policy_area.lower().replace(" ", "_")
                        categories_seen.add(policy_category)
                        edges.append({
                            "source": f"action:{action.id}",
                            "target": f"category:{policy_category}",
                            "type": "policy_area",
                        })
        
        # Add category nodes for all seen categories
        for category in categories_seen:
            nodes.append({
                "id": f"category:{category}",
                "type": "category",
                "label": category.replace("_", " ").title(),
            })
        
        return {
            "person_id": person_id,
            "nodes": nodes,
            "edges": edges,
            "stats": {
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "claims": len(claims),
                "categories": len(categories_seen),
            }
        }
    finally:
        db.close()


@app.get("/powermap/person/{person_id}", dependencies=[Depends(require_press_key)])
def get_person_power_map(
    person_id: str,
    limit: int = Query(200, ge=1, le=2000),
):
    """Power Map graph derived from Gold (canonical evaluation outputs).

    This endpoint is additive and does not replace the legacy /graph/person endpoint.
    """
    db = SessionLocal()
    try:
        return build_person_power_map(db, person_id=person_id, limit=limit)
    finally:
        db.close()


# -------------------------
# Vote Ingestion & Query Endpoints (Phase 2)
# -------------------------

@app.post("/votes/ingest", dependencies=[Depends(require_press_key)])
def ingest_votes(congress: int = Query(119), limit: int = Query(50)):
    """
    Ingest recent House roll call votes from Congress.gov.
    
    Args:
        congress: Congress number (118, 119, etc.)
        limit: Max number of votes to ingest
        
    Returns:
        Summary of ingestion
    """
    from connectors.congress_votes import ingest_recent_house_votes
    
    # Basic bioguide_id -> person_id mapping
    # TODO: Build this from a Person table column or config file
    person_id_map = {
        "O000172": "aoc",  # Alexandria Ocasio-Cortez
    }
    
    count = ingest_recent_house_votes(congress, limit, person_id_map)
    
    return {
        "status": "success",
        "congress": congress,
        "votes_ingested": count,
        "limit": limit,
    }


@app.get("/votes")
def list_votes(
    person_id: Optional[str] = None,
    congress: Optional[int] = None,
    chamber: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500)
):
    """
    List votes, optionally filtered by person/congress/chamber.
    """
    db = SessionLocal()
    try:
        query = db.query(Vote)
        
        if congress:
            query = query.filter(Vote.congress == congress)
        if chamber:
            query = query.filter(Vote.chamber == chamber.lower())
        
        if person_id:
            # Join through MemberVote
            query = (
                query.join(MemberVote, Vote.id == MemberVote.vote_id)
                     .filter(MemberVote.person_id == person_id)
            )
        
        votes = query.order_by(desc(Vote.vote_date)).limit(limit).all()
        
        return {
            "votes": [
                {
                    "id": v.id,
                    "congress": v.congress,
                    "chamber": v.chamber,
                    "roll_number": v.roll_number,
                    "question": v.question,
                    "vote_date": v.vote_date.isoformat() if v.vote_date else None,
                    "result": v.result,
                    "related_bill": f"{v.related_bill_type} {v.related_bill_number}" if v.related_bill_type else None,
                    "source_url": v.source_url,
                }
                for v in votes
            ],
            "count": len(votes),
        }
    finally:
        db.close()


@app.get("/votes/{vote_id}")
def get_vote_detail(vote_id: int):
    """
    Get detailed information about a specific vote, including member positions.
    """
    db = SessionLocal()
    try:
        vote = db.query(Vote).filter(Vote.id == vote_id).first()
        if not vote:
            raise HTTPException(status_code=404, detail="Vote not found")
        
        # Get member votes
        member_votes = db.query(MemberVote).filter(MemberVote.vote_id == vote_id).all()
        
        return {
            "vote": {
                "id": vote.id,
                "congress": vote.congress,
                "chamber": vote.chamber,
                "roll_number": vote.roll_number,
                "question": vote.question,
                "vote_date": vote.vote_date.isoformat() if vote.vote_date else None,
                "result": vote.result,
                "related_bill_congress": vote.related_bill_congress,
                "related_bill_type": vote.related_bill_type,
                "related_bill_number": vote.related_bill_number,
                "yea_count": vote.yea_count,
                "nay_count": vote.nay_count,
                "present_count": vote.present_count,
                "not_voting_count": vote.not_voting_count,
                "source_url": vote.source_url,
            },
            "member_votes": [
                {
                    "person_id": mv.person_id,
                    "position": mv.position,
                    "bioguide_id": mv.bioguide_id,
                    "member_name": mv.member_name,
                    "party": mv.party,
                    "state": mv.state,
                }
                for mv in member_votes
            ],
            "total_members": len(member_votes),
        }
    finally:
        db.close()


# ============================================================================
# BILL LIFECYCLE & TIMELINE ENDPOINTS
# ============================================================================


@app.get("/bills/{bill_id}")
def get_bill(bill_id: str):
    """Bill summary for drilldown screens.

    DB-only (no network). Uses the Bill row plus timeline-derived dates.
    """
    db = SessionLocal()
    try:
        bid = bill_id.lower()
        bill = db.query(Bill).filter(Bill.bill_id == bid).one_or_none()
        if bill is None:
            raise HTTPException(status_code=404, detail={"error": "bill not found", "bill_id": bill_id})

        introduced_dt = (
            db.query(func.min(BillAction.action_date))
            .filter(BillAction.bill_id == bid)
            .scalar()
        )
        latest_dt = bill.latest_action_date
        if latest_dt is None:
            latest_dt = (
                db.query(func.max(BillAction.action_date))
                .filter(BillAction.bill_id == bid)
                .scalar()
            )

        sponsor_person_id = (
            db.query(PersonBill.person_id)
            .filter(PersonBill.bill_id == bid)
            .filter(func.lower(PersonBill.relationship_type) == "sponsored")
            .order_by(PersonBill.person_id.asc())
            .limit(1)
            .scalar()
        )

        source_urls = (
            db.query(PersonBill.source_url)
            .filter(PersonBill.bill_id == bid)
            .filter(PersonBill.source_url.isnot(None))
            .all()
        )
        source_urls_list = sorted({u[0] for u in source_urls if u and u[0]})

        return {
            "bill_id": bill.bill_id,
            "title": bill.title,
            "status_bucket": bill.status_bucket,
            "latest_action_date": latest_dt.date().isoformat() if latest_dt else None,
            "introduced_date": introduced_dt.date().isoformat() if introduced_dt else None,
            "sponsor_person_id": sponsor_person_id,
            "policy_area": bill.policy_area,
            "source_urls": source_urls_list,
        }
    finally:
        db.close()

@app.get("/bills/{bill_id}/timeline")
def get_bill_timeline(
    bill_id: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Bill timeline for drilldown screens.

    Contract:
    - DB-only (no network)
    - Deterministic ordering: action_date ASC, then id ASC
    """
    db = SessionLocal()
    try:
        bid = bill_id.lower()
        bill = db.query(Bill).filter(Bill.bill_id == bid).one_or_none()
        if bill is None:
            raise HTTPException(status_code=404, detail={"error": "bill not found", "bill_id": bill_id})

        base_q = db.query(BillAction).filter(BillAction.bill_id == bid)
        total = base_q.with_entities(func.count(BillAction.id)).scalar() or 0

        rows = (
            base_q.order_by(BillAction.action_date.asc(), BillAction.id.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        # Legacy-friendly view (DESC) for existing debug tooling.
        legacy_rows = (
            base_q.order_by(BillAction.action_date.desc(), BillAction.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        # Related actions (politician evidence) - DB only.
        match = re.match(r"^([a-z]+)(\d+)-(\d+)$", bid)
        related_actions = []
        if match:
            bill_type, bill_number, congress = match.groups()
            try:
                related_actions = (
                    db.query(Action)
                    .filter(
                        Action.bill_congress == int(congress),
                        Action.bill_type.ilike(bill_type),
                        Action.bill_number == str(bill_number),
                    )
                    .all()
                )
            except OperationalError:
                # Optional: some contract tests create minimal schemas without the actions table.
                related_actions = []

        return {
            "bill_id": bill.bill_id,
            "total": total,
            "limit": limit,
            "offset": offset,
            "actions": [
                {
                    "id": a.id,
                    "bill_id": a.bill_id,
                    "action_date": a.action_date.isoformat() if a.action_date else None,
                    "action_type": a.action_code,
                    "canonical_status": None,
                    "description": a.action_text,
                    "chamber": a.chamber,
                    "source_url": None,
                }
                for a in rows
            ],
            # Legacy keys (kept for compatibility with existing debug scripts)
            "bill": {
                "bill_id": bill.bill_id,
                "congress": bill.congress,
                "bill_type": bill.bill_type,
                "bill_number": bill.bill_number,
                "title": bill.title,
                "policy_area": bill.policy_area,
                "status_bucket": bill.status_bucket,
                "status_reason": bill.status_reason,
                "latest_action_text": bill.latest_action_text,
                "latest_action_date": bill.latest_action_date.isoformat() if bill.latest_action_date else None,
                "updated_at": bill.updated_at.isoformat() if bill.updated_at else None,
            },
            "timeline": [
                {
                    "date": a.action_date.isoformat() if a.action_date else None,
                    "text": a.action_text,
                    "code": a.action_code,
                    "chamber": a.chamber,
                    "committee": a.committee,
                }
                for a in legacy_rows
            ],
            "timeline_count": total,
            "related_actions": [
                {
                    "id": act.id,
                    "person_id": act.person_id,
                    "title": act.title,
                    "date": act.date.isoformat() if act.date else None,
                }
                for act in related_actions
            ],
        }
    finally:
        db.close()


@app.get("/actions/{action_id}")
def get_action_detail(action_id: int):
    """
    Get action detail (evidence item) with linked bill timeline.
    
    Returns:
        - Action metadata
        - Linked bill_id (if available)
        - Timeline endpoint link
        - Bill text receipt (on-demand)
    """
    db = SessionLocal()
    
    try:
        action = db.query(Action).filter(Action.id == action_id).first()
        
        if not action:
            raise HTTPException(status_code=404, detail="Action not found")
        
        # Get source document
        source = db.query(SourceDocument).filter(SourceDocument.id == action.source_id).first()
        
        # Build normalized bill_id if available
        bill_id = None
        timeline_endpoint = None
        if action.bill_congress and action.bill_type and action.bill_number:
            bill_id = normalize_bill_id(action.bill_congress, action.bill_type, action.bill_number)
            timeline_endpoint = f"/bills/{bill_id}/timeline"
        
        # Build response
        response = {
            "action": {
                "id": action.id,
                "person_id": action.person_id,
                "title": action.title,
                "summary": action.summary,
                "date": action.date.isoformat() if action.date else None,
                "bill_congress": action.bill_congress,
                "bill_type": action.bill_type,
                "bill_number": action.bill_number,
                "policy_area": action.policy_area,
                "latest_action_text": action.latest_action_text,
                "latest_action_date": action.latest_action_date,
                "created_at": action.created_at.isoformat() if action.created_at else None,
            },
            "source": {
                "url": source.url if source else None,
                "publisher": source.publisher if source else None,
            },
            "bill_id": bill_id,
            "timeline_endpoint": timeline_endpoint,
        }
        
        # Add bill text receipt (on-demand, cached)
        if bill_id:
            try:
                text_receipt = format_text_receipt(
                    action.bill_congress,
                    action.bill_type,
                    action.bill_number
                )
                if text_receipt:
                    response["receipts"] = {
                        "bill_text": text_receipt
                    }
            except Exception as e:
                # Don't fail if receipt unavailable
                response["receipts"] = {"error": str(e)}
        
        return response
    
    finally:
        db.close()
