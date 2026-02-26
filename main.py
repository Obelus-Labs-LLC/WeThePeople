import os
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
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
from models.finance_models import (
    TrackedInstitution,
    SECFiling,
    FDICFinancial,
    CFPBComplaint,
    FREDObservation,
    FedPressRelease,
)
from models.health_models import (
    TrackedCompany,
    FDAAdverseEvent,
    FDARecall,
    ClinicalTrial,
    CMSPayment,
    SECHealthFiling,
)
from models.market_models import StockFundamentals
from models.tech_models import (
    TrackedTechCompany,
    SECTechFiling,
    TechPatent,
    GovernmentContract,
    LobbyingRecord,
    FTCEnforcement,
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
        allow_methods=["*"],
        allow_headers=["*"],
    )


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


@app.get("/ops/runtime")
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


@app.get("/ops/coverage")
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

@app.post("/claims")
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


@app.get("/claims/{claim_id}")
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


@app.get("/claims")
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


@app.get("/claims/{claim_id}/matches")
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


@app.get("/claims/{claim_id}/matches_multi")
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


@app.get("/people/{person_id}/performance")
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
        total_people = db.query(func.count(TrackedMember.id)).filter(TrackedMember.is_active == 1).scalar() or 0
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


@app.get("/claims/{claim_id}/evaluation")
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


@app.get("/graph/person/{person_id}")
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


@app.get("/powermap/person/{person_id}")
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

@app.post("/votes/ingest")
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


@app.get("/bills/enrichment/stats")
def get_bill_enrichment_stats():
    """Enrichment coverage statistics for the bills table."""
    db = SessionLocal()
    try:
        total = db.query(Bill).count()
        enriched = db.query(Bill).filter(Bill.needs_enrichment == 0).count()
        with_summary = db.query(Bill).filter(Bill.summary_text.isnot(None)).count()
        with_text_url = db.query(Bill).filter(Bill.full_text_url.isnot(None)).count()
        with_status = db.query(Bill).filter(Bill.status_bucket.isnot(None)).count()
        with_policy = db.query(Bill).filter(Bill.policy_area.isnot(None)).count()

        return {
            "total_bills": total,
            "enriched": enriched,
            "needs_enrichment": total - enriched,
            "pct_enriched": round(enriched / total * 100, 1) if total else 0,
            "with_summary": with_summary,
            "pct_with_summary": round(with_summary / total * 100, 1) if total else 0,
            "with_text_url": with_text_url,
            "with_status_bucket": with_status,
            "with_policy_area": with_policy,
        }
    finally:
        db.close()


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
            "summary_text": bill.summary_text,
            "summary_date": bill.summary_date,
            "full_text_url": bill.full_text_url,
            "is_enriched": bill.needs_enrichment == 0,
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


# ============================================================================
# FINANCE SECTOR ENDPOINTS
# ============================================================================


@app.get("/finance/dashboard/stats")
def get_finance_dashboard_stats():
    """Aggregate stats for the finance dashboard."""
    db = SessionLocal()
    try:
        total_institutions = db.query(func.count(TrackedInstitution.id)).filter(TrackedInstitution.is_active == 1).scalar() or 0
        total_filings = db.query(func.count(SECFiling.id)).scalar() or 0
        total_financials = db.query(func.count(FDICFinancial.id)).scalar() or 0
        total_complaints = db.query(func.count(CFPBComplaint.id)).scalar() or 0
        total_fred = db.query(func.count(FREDObservation.id)).scalar() or 0
        total_press = db.query(func.count(FedPressRelease.id)).scalar() or 0

        by_sector = dict(
            db.query(TrackedInstitution.sector_type, func.count(TrackedInstitution.id))
            .filter(TrackedInstitution.is_active == 1)
            .group_by(TrackedInstitution.sector_type)
            .all()
        )

        return {
            "total_institutions": total_institutions,
            "total_filings": total_filings,
            "total_financials": total_financials,
            "total_complaints": total_complaints,
            "total_fred_observations": total_fred,
            "total_press_releases": total_press,
            "by_sector": by_sector,
        }
    finally:
        db.close()


@app.get("/finance/institutions")
def get_finance_institutions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, description="Search by name or ticker"),
    sector_type: Optional[str] = Query(None, description="Filter by sector_type"),
):
    """List tracked financial institutions."""
    db = SessionLocal()
    try:
        query = db.query(TrackedInstitution).filter(TrackedInstitution.is_active == 1)

        if q:
            like = f"%{q.strip().lower()}%"
            query = query.filter(
                func.lower(TrackedInstitution.display_name).like(like)
                | func.lower(TrackedInstitution.ticker).like(like)
                | func.lower(TrackedInstitution.institution_id).like(like)
            )

        if sector_type:
            query = query.filter(TrackedInstitution.sector_type == sector_type)

        total = query.count()
        rows = query.order_by(TrackedInstitution.display_name).offset(offset).limit(limit).all()

        institutions = []
        for r in rows:
            # Count data for each institution
            filing_count = db.query(func.count(SECFiling.id)).filter(SECFiling.institution_id == r.institution_id).scalar() or 0
            complaint_count = db.query(func.count(CFPBComplaint.id)).filter(CFPBComplaint.institution_id == r.institution_id).scalar() or 0

            institutions.append({
                "institution_id": r.institution_id,
                "display_name": r.display_name,
                "ticker": r.ticker,
                "sector_type": r.sector_type,
                "headquarters": r.headquarters,
                "logo_url": r.logo_url,
                "filing_count": filing_count,
                "complaint_count": complaint_count,
            })

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "institutions": institutions,
        }
    finally:
        db.close()


@app.get("/finance/institutions/{institution_id}")
def get_finance_institution(institution_id: str):
    """Get detail for a single institution."""
    db = SessionLocal()
    try:
        inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
        if not inst:
            raise HTTPException(status_code=404, detail=f"Institution '{institution_id}' not found")

        # Counts
        filing_count = db.query(func.count(SECFiling.id)).filter(SECFiling.institution_id == institution_id).scalar() or 0
        complaint_count = db.query(func.count(CFPBComplaint.id)).filter(CFPBComplaint.institution_id == institution_id).scalar() or 0
        financial_count = db.query(func.count(FDICFinancial.id)).filter(FDICFinancial.institution_id == institution_id).scalar() or 0
        fred_count = db.query(func.count(FREDObservation.id)).filter(FREDObservation.institution_id == institution_id).scalar() or 0
        press_count = db.query(func.count(FedPressRelease.id)).filter(FedPressRelease.institution_id == institution_id).scalar() or 0

        # Latest FDIC financial
        latest_financial = (
            db.query(FDICFinancial)
            .filter_by(institution_id=institution_id)
            .order_by(desc(FDICFinancial.report_date))
            .first()
        )

        latest_fin_data = None
        if latest_financial:
            latest_fin_data = {
                "report_date": str(latest_financial.report_date) if latest_financial.report_date else None,
                "total_assets": latest_financial.total_assets,
                "total_deposits": latest_financial.total_deposits,
                "net_income": latest_financial.net_income,
                "roa": latest_financial.roa,
                "roe": latest_financial.roe,
                "tier1_capital_ratio": latest_financial.tier1_capital_ratio,
            }

        # Latest stock fundamentals
        latest_stock = (
            db.query(StockFundamentals)
            .filter_by(entity_type="institution", entity_id=institution_id)
            .order_by(desc(StockFundamentals.snapshot_date))
            .first()
        )
        stock_data = None
        if latest_stock:
            stock_data = {
                "snapshot_date": str(latest_stock.snapshot_date) if latest_stock.snapshot_date else None,
                "market_cap": latest_stock.market_cap,
                "pe_ratio": latest_stock.pe_ratio,
                "eps": latest_stock.eps,
                "dividend_yield": latest_stock.dividend_yield,
                "week_52_high": latest_stock.week_52_high,
                "week_52_low": latest_stock.week_52_low,
                "profit_margin": latest_stock.profit_margin,
            }

        return {
            "institution_id": inst.institution_id,
            "display_name": inst.display_name,
            "ticker": inst.ticker,
            "sector_type": inst.sector_type,
            "headquarters": inst.headquarters,
            "logo_url": inst.logo_url,
            "sec_cik": inst.sec_cik,
            "fdic_cert": inst.fdic_cert,
            "filing_count": filing_count,
            "complaint_count": complaint_count,
            "financial_count": financial_count,
            "fred_observation_count": fred_count,
            "press_release_count": press_count,
            "latest_financial": latest_fin_data,
            "latest_stock": stock_data,
        }
    finally:
        db.close()


@app.get("/finance/institutions/{institution_id}/filings")
def get_institution_filings(
    institution_id: str,
    form_type: Optional[str] = Query(None, description="Filter by form type (10-K, 10-Q, 8-K)"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Get SEC filings for an institution."""
    db = SessionLocal()
    try:
        query = db.query(SECFiling).filter_by(institution_id=institution_id)

        if form_type:
            query = query.filter(SECFiling.form_type == form_type)

        total = query.count()
        rows = query.order_by(desc(SECFiling.filing_date)).offset(offset).limit(limit).all()

        filings = []
        for f in rows:
            filings.append({
                "id": f.id,
                "accession_number": f.accession_number,
                "form_type": f.form_type,
                "filing_date": str(f.filing_date) if f.filing_date else None,
                "primary_doc_url": f.primary_doc_url,
                "filing_url": f.filing_url,
                "description": f.description,
            })

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "filings": filings,
        }
    finally:
        db.close()


@app.get("/finance/institutions/{institution_id}/financials")
def get_institution_financials(
    institution_id: str,
    limit: int = Query(20, ge=1, le=80),
    offset: int = Query(0, ge=0),
):
    """Get FDIC quarterly financials for an institution."""
    db = SessionLocal()
    try:
        query = db.query(FDICFinancial).filter_by(institution_id=institution_id)

        total = query.count()
        rows = query.order_by(desc(FDICFinancial.report_date)).offset(offset).limit(limit).all()

        financials = []
        for f in rows:
            financials.append({
                "id": f.id,
                "report_date": str(f.report_date) if f.report_date else None,
                "total_assets": f.total_assets,
                "total_deposits": f.total_deposits,
                "net_income": f.net_income,
                "net_loans": f.net_loans,
                "roa": f.roa,
                "roe": f.roe,
                "tier1_capital_ratio": f.tier1_capital_ratio,
                "efficiency_ratio": f.efficiency_ratio,
                "noncurrent_loan_ratio": f.noncurrent_loan_ratio,
                "net_charge_off_ratio": f.net_charge_off_ratio,
            })

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "financials": financials,
        }
    finally:
        db.close()


@app.get("/finance/institutions/{institution_id}/complaints")
def get_institution_complaints(
    institution_id: str,
    product: Optional[str] = Query(None, description="Filter by product"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Get CFPB complaints for an institution."""
    db = SessionLocal()
    try:
        query = db.query(CFPBComplaint).filter_by(institution_id=institution_id)

        if product:
            query = query.filter(CFPBComplaint.product == product)

        total = query.count()
        rows = query.order_by(desc(CFPBComplaint.date_received)).offset(offset).limit(limit).all()

        complaints = []
        for c in rows:
            complaints.append({
                "id": c.id,
                "complaint_id": c.complaint_id,
                "date_received": str(c.date_received) if c.date_received else None,
                "product": c.product,
                "sub_product": c.sub_product,
                "issue": c.issue,
                "sub_issue": c.sub_issue,
                "company_response": c.company_response,
                "timely_response": c.timely_response,
                "consumer_disputed": c.consumer_disputed,
                "state": c.state,
            })

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "complaints": complaints,
        }
    finally:
        db.close()


@app.get("/finance/institutions/{institution_id}/complaints/summary")
def get_institution_complaint_summary(institution_id: str):
    """Get complaint aggregation for an institution."""
    db = SessionLocal()
    try:
        total = db.query(func.count(CFPBComplaint.id)).filter_by(institution_id=institution_id).scalar() or 0

        by_product = dict(
            db.query(CFPBComplaint.product, func.count(CFPBComplaint.id))
            .filter_by(institution_id=institution_id)
            .group_by(CFPBComplaint.product)
            .all()
        )

        by_response = dict(
            db.query(CFPBComplaint.company_response, func.count(CFPBComplaint.id))
            .filter_by(institution_id=institution_id)
            .group_by(CFPBComplaint.company_response)
            .all()
        )

        timely_count = (
            db.query(func.count(CFPBComplaint.id))
            .filter_by(institution_id=institution_id, timely_response="Yes")
            .scalar() or 0
        )
        timely_pct = round(timely_count / total * 100, 1) if total > 0 else None

        return {
            "total_complaints": total,
            "by_product": by_product,
            "by_response": by_response,
            "timely_response_pct": timely_pct,
        }
    finally:
        db.close()


@app.get("/finance/institutions/{institution_id}/fred")
def get_institution_fred(
    institution_id: str,
    series_id: Optional[str] = Query(None, description="Filter by series (FEDFUNDS, CPIAUCSL, etc.)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """FRED economic observations for an institution (Federal Reserve)."""
    db = SessionLocal()
    try:
        query = db.query(FREDObservation).filter_by(institution_id=institution_id)
        if series_id:
            query = query.filter(FREDObservation.series_id == series_id)

        total = query.count()
        rows = query.order_by(desc(FREDObservation.observation_date)).offset(offset).limit(limit).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "observations": [
                {
                    "id": o.id,
                    "series_id": o.series_id,
                    "series_title": o.series_title,
                    "observation_date": str(o.observation_date) if o.observation_date else None,
                    "value": o.value,
                    "units": o.units,
                }
                for o in rows
            ],
        }
    finally:
        db.close()


@app.get("/finance/institutions/{institution_id}/press-releases")
def get_institution_press_releases(
    institution_id: str,
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Federal Reserve press releases for an institution."""
    db = SessionLocal()
    try:
        query = db.query(FedPressRelease).filter_by(institution_id=institution_id)
        if category:
            query = query.filter(FedPressRelease.category == category)

        total = query.count()
        rows = query.order_by(desc(FedPressRelease.published_at)).offset(offset).limit(limit).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "press_releases": [
                {
                    "id": p.id,
                    "title": p.title,
                    "link": p.link,
                    "published_at": p.published_at.isoformat() if p.published_at else None,
                    "category": p.category,
                    "summary": p.summary,
                }
                for p in rows
            ],
        }
    finally:
        db.close()


@app.get("/finance/institutions/{institution_id}/stock")
def get_institution_stock(institution_id: str):
    """Latest stock fundamentals for an institution."""
    db = SessionLocal()
    try:
        latest = (
            db.query(StockFundamentals)
            .filter_by(entity_type="institution", entity_id=institution_id)
            .order_by(desc(StockFundamentals.snapshot_date))
            .first()
        )
        if not latest:
            return {"stock": None}

        return {
            "stock": {
                "ticker": latest.ticker,
                "snapshot_date": str(latest.snapshot_date) if latest.snapshot_date else None,
                "market_cap": latest.market_cap,
                "pe_ratio": latest.pe_ratio,
                "forward_pe": latest.forward_pe,
                "peg_ratio": latest.peg_ratio,
                "price_to_book": latest.price_to_book,
                "eps": latest.eps,
                "revenue_ttm": latest.revenue_ttm,
                "profit_margin": latest.profit_margin,
                "operating_margin": latest.operating_margin,
                "return_on_equity": latest.return_on_equity,
                "dividend_yield": latest.dividend_yield,
                "dividend_per_share": latest.dividend_per_share,
                "week_52_high": latest.week_52_high,
                "week_52_low": latest.week_52_low,
                "day_50_moving_avg": latest.day_50_moving_avg,
                "day_200_moving_avg": latest.day_200_moving_avg,
                "sector": latest.sector,
                "industry": latest.industry,
            }
        }
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════
# NEWS ENDPOINT (shared across sectors)
# ═══════════════════════════════════════════════════════════════


@app.get("/news/{query}")
def get_news(query: str, limit: int = 10):
    """Fetch recent news headlines from Google News RSS for any query."""
    from connectors.news_feed import fetch_news
    articles = fetch_news(query, limit=min(limit, 20))
    return {"query": query, "articles": articles}


# ═══════════════════════════════════════════════════════════════
# HEALTH SECTOR ENDPOINTS
# ═══════════════════════════════════════════════════════════════


@app.get("/health/dashboard/stats")
def get_health_dashboard_stats():
    """Aggregate stats for the health dashboard."""
    db = SessionLocal()
    try:
        total_companies = db.query(func.count(TrackedCompany.id)).filter(TrackedCompany.is_active == 1).scalar() or 0
        total_events = db.query(func.count(FDAAdverseEvent.id)).scalar() or 0
        total_recalls = db.query(func.count(FDARecall.id)).scalar() or 0
        total_trials = db.query(func.count(ClinicalTrial.id)).scalar() or 0
        total_payments = db.query(func.count(CMSPayment.id)).scalar() or 0
        total_sec_filings = db.query(func.count(SECHealthFiling.id)).scalar() or 0

        by_sector = dict(
            db.query(TrackedCompany.sector_type, func.count(TrackedCompany.id))
            .filter(TrackedCompany.is_active == 1)
            .group_by(TrackedCompany.sector_type)
            .all()
        )

        return {
            "total_companies": total_companies,
            "total_adverse_events": total_events,
            "total_recalls": total_recalls,
            "total_trials": total_trials,
            "total_payments": total_payments,
            "total_sec_filings": total_sec_filings,
            "by_sector": by_sector,
        }
    finally:
        db.close()


@app.get("/health/companies")
def get_health_companies(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, description="Search by name or ticker"),
    sector_type: Optional[str] = Query(None, description="Filter by sector_type"),
):
    """List tracked healthcare companies with optional search and filtering."""
    db = SessionLocal()
    try:
        query = db.query(TrackedCompany).filter(TrackedCompany.is_active == 1)

        if q:
            like = f"%{q.strip().lower()}%"
            query = query.filter(
                func.lower(TrackedCompany.display_name).like(like)
                | func.lower(TrackedCompany.ticker).like(like)
            )

        if sector_type:
            query = query.filter(TrackedCompany.sector_type == sector_type)

        total = query.count()
        rows = query.order_by(TrackedCompany.display_name).offset(offset).limit(limit).all()

        companies = []
        for c in rows:
            event_count = db.query(func.count(FDAAdverseEvent.id)).filter_by(company_id=c.company_id).scalar() or 0
            recall_count = db.query(func.count(FDARecall.id)).filter_by(company_id=c.company_id).scalar() or 0
            trial_count = db.query(func.count(ClinicalTrial.id)).filter_by(company_id=c.company_id).scalar() or 0

            companies.append({
                "company_id": c.company_id,
                "display_name": c.display_name,
                "ticker": c.ticker,
                "sector_type": c.sector_type,
                "headquarters": c.headquarters,
                "logo_url": c.logo_url,
                "adverse_event_count": event_count,
                "recall_count": recall_count,
                "trial_count": trial_count,
            })

        return {"total": total, "limit": limit, "offset": offset, "companies": companies}
    finally:
        db.close()


@app.get("/health/companies/{company_id}")
def get_health_company(company_id: str):
    """Detail for a single tracked company, with safety + trial summary."""
    db = SessionLocal()
    try:
        c = db.query(TrackedCompany).filter_by(company_id=company_id, is_active=1).first()
        if not c:
            raise HTTPException(status_code=404, detail="Company not found")

        event_count = db.query(func.count(FDAAdverseEvent.id)).filter_by(company_id=company_id).scalar() or 0
        recall_count = db.query(func.count(FDARecall.id)).filter_by(company_id=company_id).scalar() or 0
        trial_count = db.query(func.count(ClinicalTrial.id)).filter_by(company_id=company_id).scalar() or 0
        payment_count = db.query(func.count(CMSPayment.id)).filter_by(company_id=company_id).scalar() or 0
        filing_count = db.query(func.count(SECHealthFiling.id)).filter_by(company_id=company_id).scalar() or 0

        # Latest recall
        latest_recall = (
            db.query(FDARecall)
            .filter_by(company_id=company_id)
            .order_by(desc(FDARecall.recall_initiation_date))
            .first()
        )

        # Trial breakdown by status
        trials_by_status = dict(
            db.query(ClinicalTrial.overall_status, func.count(ClinicalTrial.id))
            .filter_by(company_id=company_id)
            .group_by(ClinicalTrial.overall_status)
            .all()
        )

        # Serious event count
        serious_count = (
            db.query(func.count(FDAAdverseEvent.id))
            .filter_by(company_id=company_id, serious=1)
            .scalar() or 0
        )

        # Latest stock fundamentals
        latest_stock = (
            db.query(StockFundamentals)
            .filter_by(entity_type="company", entity_id=company_id)
            .order_by(desc(StockFundamentals.snapshot_date))
            .first()
        )
        stock_data = None
        if latest_stock:
            stock_data = {
                "snapshot_date": str(latest_stock.snapshot_date) if latest_stock.snapshot_date else None,
                "market_cap": latest_stock.market_cap,
                "pe_ratio": latest_stock.pe_ratio,
                "eps": latest_stock.eps,
                "dividend_yield": latest_stock.dividend_yield,
                "week_52_high": latest_stock.week_52_high,
                "week_52_low": latest_stock.week_52_low,
                "profit_margin": latest_stock.profit_margin,
            }

        return {
            "company_id": c.company_id,
            "display_name": c.display_name,
            "ticker": c.ticker,
            "sector_type": c.sector_type,
            "headquarters": c.headquarters,
            "logo_url": c.logo_url,
            "fda_manufacturer_name": c.fda_manufacturer_name,
            "ct_sponsor_name": c.ct_sponsor_name,
            "sec_cik": c.sec_cik,
            "adverse_event_count": event_count,
            "recall_count": recall_count,
            "trial_count": trial_count,
            "payment_count": payment_count,
            "filing_count": filing_count,
            "serious_event_count": serious_count,
            "trials_by_status": trials_by_status,
            "latest_stock": stock_data,
            "latest_recall": {
                "recall_number": latest_recall.recall_number,
                "classification": latest_recall.classification,
                "recall_initiation_date": str(latest_recall.recall_initiation_date) if latest_recall.recall_initiation_date else None,
                "product_description": latest_recall.product_description,
                "reason_for_recall": latest_recall.reason_for_recall,
                "status": latest_recall.status,
            } if latest_recall else None,
        }
    finally:
        db.close()


@app.get("/health/companies/{company_id}/adverse-events")
def get_company_adverse_events(
    company_id: str,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """FDA adverse event reports for a company."""
    db = SessionLocal()
    try:
        query = db.query(FDAAdverseEvent).filter_by(company_id=company_id)
        total = query.count()
        rows = query.order_by(desc(FDAAdverseEvent.receive_date)).offset(offset).limit(limit).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "adverse_events": [
                {
                    "id": e.id,
                    "report_id": e.report_id,
                    "receive_date": str(e.receive_date) if e.receive_date else None,
                    "serious": e.serious,
                    "drug_name": e.drug_name,
                    "reaction": e.reaction,
                    "outcome": e.outcome,
                }
                for e in rows
            ],
        }
    finally:
        db.close()


@app.get("/health/companies/{company_id}/recalls")
def get_company_recalls(
    company_id: str,
    classification: Optional[str] = Query(None, description="Filter by classification (e.g. 'Class I')"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """FDA recall/enforcement actions for a company."""
    db = SessionLocal()
    try:
        query = db.query(FDARecall).filter_by(company_id=company_id)
        if classification:
            query = query.filter(FDARecall.classification == classification)

        total = query.count()
        rows = query.order_by(desc(FDARecall.recall_initiation_date)).offset(offset).limit(limit).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "recalls": [
                {
                    "id": r.id,
                    "recall_number": r.recall_number,
                    "classification": r.classification,
                    "recall_initiation_date": str(r.recall_initiation_date) if r.recall_initiation_date else None,
                    "product_description": r.product_description,
                    "reason_for_recall": r.reason_for_recall,
                    "status": r.status,
                }
                for r in rows
            ],
        }
    finally:
        db.close()


@app.get("/health/companies/{company_id}/trials")
def get_company_trials(
    company_id: str,
    status: Optional[str] = Query(None, description="Filter by overall_status"),
    phase: Optional[str] = Query(None, description="Filter by phase"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Clinical trials sponsored by a company."""
    db = SessionLocal()
    try:
        query = db.query(ClinicalTrial).filter_by(company_id=company_id)
        if status:
            query = query.filter(ClinicalTrial.overall_status == status)
        if phase:
            query = query.filter(ClinicalTrial.phase == phase)

        total = query.count()
        rows = query.order_by(desc(ClinicalTrial.start_date)).offset(offset).limit(limit).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "trials": [
                {
                    "id": t.id,
                    "nct_id": t.nct_id,
                    "title": t.title,
                    "overall_status": t.overall_status,
                    "phase": t.phase,
                    "start_date": str(t.start_date) if t.start_date else None,
                    "conditions": t.conditions,
                    "interventions": t.interventions,
                    "enrollment": t.enrollment,
                }
                for t in rows
            ],
        }
    finally:
        db.close()


@app.get("/health/companies/{company_id}/payments")
def get_company_payments(
    company_id: str,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """CMS Open Payments records for a company."""
    db = SessionLocal()
    try:
        query = db.query(CMSPayment).filter_by(company_id=company_id)
        total = query.count()
        rows = query.order_by(desc(CMSPayment.payment_date)).offset(offset).limit(limit).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "payments": [
                {
                    "id": p.id,
                    "record_id": p.record_id,
                    "payment_date": str(p.payment_date) if p.payment_date else None,
                    "amount": p.amount,
                    "payment_nature": p.payment_nature,
                    "physician_name": p.physician_name,
                    "physician_specialty": p.physician_specialty,
                    "state": p.state,
                }
                for p in rows
            ],
        }
    finally:
        db.close()


@app.get("/health/companies/{company_id}/payments/summary")
def get_company_payment_summary(company_id: str):
    """Aggregated payment stats for a company."""
    db = SessionLocal()
    try:
        total = db.query(func.count(CMSPayment.id)).filter_by(company_id=company_id).scalar() or 0
        total_amount = db.query(func.sum(CMSPayment.amount)).filter_by(company_id=company_id).scalar() or 0.0

        by_nature = dict(
            db.query(CMSPayment.payment_nature, func.count(CMSPayment.id))
            .filter_by(company_id=company_id)
            .group_by(CMSPayment.payment_nature)
            .all()
        )

        by_specialty = dict(
            db.query(CMSPayment.physician_specialty, func.count(CMSPayment.id))
            .filter_by(company_id=company_id)
            .group_by(CMSPayment.physician_specialty)
            .order_by(desc(func.count(CMSPayment.id)))
            .limit(10)
            .all()
        )

        return {
            "total_payments": total,
            "total_amount": round(float(total_amount), 2),
            "by_nature": by_nature,
            "by_specialty": by_specialty,
        }
    finally:
        db.close()


@app.get("/health/companies/{company_id}/filings")
def get_company_filings(
    company_id: str,
    form_type: Optional[str] = Query(None, description="Filter by form type (10-K, 10-Q, 8-K)"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """SEC EDGAR filings for a health company."""
    db = SessionLocal()
    try:
        query = db.query(SECHealthFiling).filter_by(company_id=company_id)
        if form_type:
            query = query.filter(SECHealthFiling.form_type == form_type)

        total = query.count()
        rows = query.order_by(desc(SECHealthFiling.filing_date)).offset(offset).limit(limit).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "filings": [
                {
                    "id": f.id,
                    "accession_number": f.accession_number,
                    "form_type": f.form_type,
                    "filing_date": str(f.filing_date) if f.filing_date else None,
                    "primary_doc_url": f.primary_doc_url,
                    "filing_url": f.filing_url,
                    "description": f.description,
                }
                for f in rows
            ],
        }
    finally:
        db.close()


@app.get("/health/companies/{company_id}/stock")
def get_company_stock(company_id: str):
    """Latest stock fundamentals for a health company."""
    db = SessionLocal()
    try:
        latest = (
            db.query(StockFundamentals)
            .filter_by(entity_type="company", entity_id=company_id)
            .order_by(desc(StockFundamentals.snapshot_date))
            .first()
        )
        if not latest:
            return {"stock": None}

        return {
            "stock": {
                "ticker": latest.ticker,
                "snapshot_date": str(latest.snapshot_date) if latest.snapshot_date else None,
                "market_cap": latest.market_cap,
                "pe_ratio": latest.pe_ratio,
                "forward_pe": latest.forward_pe,
                "peg_ratio": latest.peg_ratio,
                "price_to_book": latest.price_to_book,
                "eps": latest.eps,
                "revenue_ttm": latest.revenue_ttm,
                "profit_margin": latest.profit_margin,
                "operating_margin": latest.operating_margin,
                "return_on_equity": latest.return_on_equity,
                "dividend_yield": latest.dividend_yield,
                "dividend_per_share": latest.dividend_per_share,
                "week_52_high": latest.week_52_high,
                "week_52_low": latest.week_52_low,
                "day_50_moving_avg": latest.day_50_moving_avg,
                "day_200_moving_avg": latest.day_200_moving_avg,
                "sector": latest.sector,
                "industry": latest.industry,
            }
        }
    finally:
        db.close()


# ============================================================================
# TECHNOLOGY SECTOR ENDPOINTS
# ============================================================================

@app.get("/tech/dashboard/stats")
def get_tech_dashboard_stats():
    """Aggregate stats for the technology dashboard."""
    db = SessionLocal()
    try:
        total_companies = db.query(TrackedTechCompany).filter(TrackedTechCompany.is_active == 1).count()
        total_filings = db.query(SECTechFiling).count()
        total_patents = db.query(TechPatent).count()
        total_contracts = db.query(GovernmentContract).count()

        by_sector = {}
        rows = db.query(TrackedTechCompany.sector_type, func.count()).filter(
            TrackedTechCompany.is_active == 1
        ).group_by(TrackedTechCompany.sector_type).all()
        for sector_type, count in rows:
            by_sector[sector_type] = count

        return {
            "total_companies": total_companies,
            "total_filings": total_filings,
            "total_patents": total_patents,
            "total_contracts": total_contracts,
            "by_sector": by_sector,
        }
    finally:
        db.close()


@app.get("/tech/companies")
def get_tech_companies(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None),
    sector_type: Optional[str] = Query(None),
):
    """List tracked tech companies with optional search and filtering."""
    db = SessionLocal()
    try:
        query = db.query(TrackedTechCompany).filter(TrackedTechCompany.is_active == 1)

        if q:
            pattern = f"%{q}%"
            query = query.filter(
                (TrackedTechCompany.display_name.ilike(pattern))
                | (TrackedTechCompany.company_id.ilike(pattern))
                | (TrackedTechCompany.ticker.ilike(pattern))
            )

        if sector_type:
            query = query.filter(TrackedTechCompany.sector_type == sector_type)

        total = query.count()
        companies = query.order_by(TrackedTechCompany.display_name).offset(offset).limit(limit).all()

        results = []
        for co in companies:
            patent_count = db.query(TechPatent).filter_by(company_id=co.company_id).count()
            contract_count = db.query(GovernmentContract).filter_by(company_id=co.company_id).count()
            filing_count = db.query(SECTechFiling).filter_by(company_id=co.company_id).count()

            results.append({
                "company_id": co.company_id,
                "display_name": co.display_name,
                "ticker": co.ticker,
                "sector_type": co.sector_type,
                "headquarters": co.headquarters,
                "logo_url": co.logo_url,
                "patent_count": patent_count,
                "contract_count": contract_count,
                "filing_count": filing_count,
            })

        return {"total": total, "limit": limit, "offset": offset, "companies": results}
    finally:
        db.close()


@app.get("/tech/companies/{company_id}")
def get_tech_company(company_id: str):
    """Detail for a single tracked tech company with summary stats."""
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        patent_count = db.query(TechPatent).filter_by(company_id=company_id).count()
        contract_count = db.query(GovernmentContract).filter_by(company_id=company_id).count()
        filing_count = db.query(SECTechFiling).filter_by(company_id=company_id).count()

        total_contract_value = db.query(func.sum(GovernmentContract.award_amount)).filter_by(
            company_id=company_id
        ).scalar() or 0

        # Latest stock fundamentals
        latest_stock = None
        latest = db.query(StockFundamentals).filter_by(
            entity_type="tech_company", entity_id=company_id
        ).order_by(desc(StockFundamentals.snapshot_date)).first()
        if latest:
            latest_stock = {
                "snapshot_date": str(latest.snapshot_date) if latest.snapshot_date else None,
                "market_cap": latest.market_cap,
                "pe_ratio": latest.pe_ratio,
                "eps": latest.eps,
                "dividend_yield": latest.dividend_yield,
                "week_52_high": latest.week_52_high,
                "week_52_low": latest.week_52_low,
                "profit_margin": latest.profit_margin,
            }

        return {
            "company_id": co.company_id,
            "display_name": co.display_name,
            "ticker": co.ticker,
            "sector_type": co.sector_type,
            "headquarters": co.headquarters,
            "logo_url": co.logo_url,
            "sec_cik": co.sec_cik,
            "patent_count": patent_count,
            "contract_count": contract_count,
            "filing_count": filing_count,
            "total_contract_value": total_contract_value,
            "latest_stock": latest_stock,
        }
    finally:
        db.close()


@app.get("/tech/companies/{company_id}/filings")
def get_tech_company_filings(
    company_id: str,
    form_type: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """SEC EDGAR filings for a tech company."""
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        query = db.query(SECTechFiling).filter_by(company_id=company_id)
        if form_type:
            query = query.filter(SECTechFiling.form_type == form_type)

        total = query.count()
        filings = query.order_by(desc(SECTechFiling.filing_date)).offset(offset).limit(limit).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "filings": [
                {
                    "id": f.id,
                    "accession_number": f.accession_number,
                    "form_type": f.form_type,
                    "filing_date": str(f.filing_date) if f.filing_date else None,
                    "primary_doc_url": f.primary_doc_url,
                    "filing_url": f.filing_url,
                    "description": f.description,
                }
                for f in filings
            ],
        }
    finally:
        db.close()


@app.get("/tech/companies/{company_id}/patents")
def get_tech_company_patents(
    company_id: str,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """USPTO patents for a tech company."""
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        query = db.query(TechPatent).filter_by(company_id=company_id)
        total = query.count()
        patents = query.order_by(desc(TechPatent.patent_date)).offset(offset).limit(limit).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "patents": [
                {
                    "id": p.id,
                    "patent_number": p.patent_number,
                    "patent_title": p.patent_title,
                    "patent_date": str(p.patent_date) if p.patent_date else None,
                    "patent_abstract": p.patent_abstract,
                    "num_claims": p.num_claims,
                    "cpc_codes": p.cpc_codes,
                }
                for p in patents
            ],
        }
    finally:
        db.close()


@app.get("/tech/companies/{company_id}/contracts")
def get_tech_company_contracts(
    company_id: str,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Federal government contracts for a tech company."""
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        query = db.query(GovernmentContract).filter_by(company_id=company_id)
        total = query.count()
        contracts = query.order_by(desc(GovernmentContract.award_amount)).offset(offset).limit(limit).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "contracts": [
                {
                    "id": ct.id,
                    "award_id": ct.award_id,
                    "award_amount": ct.award_amount,
                    "awarding_agency": ct.awarding_agency,
                    "description": ct.description,
                    "start_date": str(ct.start_date) if ct.start_date else None,
                    "end_date": str(ct.end_date) if ct.end_date else None,
                    "contract_type": ct.contract_type,
                }
                for ct in contracts
            ],
        }
    finally:
        db.close()


@app.get("/tech/companies/{company_id}/contracts/summary")
def get_tech_company_contract_summary(company_id: str):
    """Aggregated contract stats for a tech company."""
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        total_contracts = db.query(GovernmentContract).filter_by(company_id=company_id).count()
        total_amount = db.query(func.sum(GovernmentContract.award_amount)).filter_by(
            company_id=company_id
        ).scalar() or 0

        by_agency = {}
        rows = db.query(
            GovernmentContract.awarding_agency, func.count()
        ).filter_by(company_id=company_id).group_by(
            GovernmentContract.awarding_agency
        ).order_by(func.count().desc()).limit(10).all()
        for agency, count in rows:
            if agency:
                by_agency[agency] = count

        by_type = {}
        rows = db.query(
            GovernmentContract.contract_type, func.count()
        ).filter_by(company_id=company_id).group_by(GovernmentContract.contract_type).all()
        for ctype, count in rows:
            if ctype:
                by_type[ctype] = count

        return {
            "total_contracts": total_contracts,
            "total_amount": total_amount,
            "by_agency": by_agency,
            "by_type": by_type,
        }
    finally:
        db.close()


@app.get("/tech/companies/{company_id}/stock")
def get_tech_company_stock(company_id: str):
    """Latest stock fundamentals for a tech company."""
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        latest = db.query(StockFundamentals).filter_by(
            entity_type="tech_company", entity_id=company_id
        ).order_by(desc(StockFundamentals.snapshot_date)).first()

        if not latest:
            return {"latest_stock": None}

        return {
            "latest_stock": {
                "snapshot_date": str(latest.snapshot_date) if latest.snapshot_date else None,
                "market_cap": latest.market_cap,
                "pe_ratio": latest.pe_ratio,
                "forward_pe": latest.forward_pe,
                "peg_ratio": latest.peg_ratio,
                "price_to_book": latest.price_to_book,
                "eps": latest.eps,
                "revenue_ttm": latest.revenue_ttm,
                "profit_margin": latest.profit_margin,
                "operating_margin": latest.operating_margin,
                "return_on_equity": latest.return_on_equity,
                "dividend_yield": latest.dividend_yield,
                "dividend_per_share": latest.dividend_per_share,
                "week_52_high": latest.week_52_high,
                "week_52_low": latest.week_52_low,
                "day_50_moving_avg": latest.day_50_moving_avg,
                "day_200_moving_avg": latest.day_200_moving_avg,
                "sector": latest.sector,
                "industry": latest.industry,
            }
        }
    finally:
        db.close()


@app.get("/tech/companies/{company_id}/lobbying")
def get_tech_company_lobbying(
    company_id: str,
    filing_year: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Lobbying disclosure filings for a tech company."""
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        query = db.query(LobbyingRecord).filter_by(company_id=company_id)
        if filing_year:
            query = query.filter(LobbyingRecord.filing_year == filing_year)

        total = query.count()
        records = query.order_by(desc(LobbyingRecord.filing_year), LobbyingRecord.filing_period).offset(offset).limit(limit).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "filings": [
                {
                    "id": r.id,
                    "filing_uuid": r.filing_uuid,
                    "filing_year": r.filing_year,
                    "filing_period": r.filing_period,
                    "income": r.income,
                    "expenses": r.expenses,
                    "registrant_name": r.registrant_name,
                    "client_name": r.client_name,
                    "lobbying_issues": r.lobbying_issues,
                    "government_entities": r.government_entities,
                }
                for r in records
            ],
        }
    finally:
        db.close()


@app.get("/tech/companies/{company_id}/lobbying/summary")
def get_tech_company_lobbying_summary(company_id: str):
    """Aggregated lobbying stats for a tech company."""
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        total_filings = db.query(LobbyingRecord).filter_by(company_id=company_id).count()
        total_income = db.query(func.sum(LobbyingRecord.income)).filter_by(
            company_id=company_id
        ).scalar() or 0

        by_year = {}
        rows = db.query(
            LobbyingRecord.filing_year,
            func.sum(LobbyingRecord.income),
            func.count(),
        ).filter_by(company_id=company_id).group_by(
            LobbyingRecord.filing_year
        ).order_by(LobbyingRecord.filing_year).all()
        for year, income, count in rows:
            by_year[str(year)] = {"income": income or 0, "filings": count}

        top_firms = {}
        rows = db.query(
            LobbyingRecord.registrant_name,
            func.sum(LobbyingRecord.income),
            func.count(),
        ).filter_by(company_id=company_id).group_by(
            LobbyingRecord.registrant_name
        ).order_by(func.sum(LobbyingRecord.income).desc()).limit(10).all()
        for name, income, count in rows:
            if name:
                top_firms[name] = {"income": income or 0, "filings": count}

        return {
            "total_filings": total_filings,
            "total_income": total_income,
            "by_year": by_year,
            "top_firms": top_firms,
        }
    finally:
        db.close()


@app.get("/tech/companies/{company_id}/enforcement")
def get_tech_company_enforcement(
    company_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """FTC/DOJ enforcement actions for a tech company."""
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        query = db.query(FTCEnforcement).filter_by(company_id=company_id)
        total = query.count()
        actions = query.order_by(desc(FTCEnforcement.case_date)).offset(offset).limit(limit).all()

        total_penalties = db.query(func.sum(FTCEnforcement.penalty_amount)).filter_by(
            company_id=company_id
        ).scalar() or 0

        return {
            "total": total,
            "total_penalties": total_penalties,
            "limit": limit,
            "offset": offset,
            "actions": [
                {
                    "id": a.id,
                    "case_title": a.case_title,
                    "case_date": str(a.case_date) if a.case_date else None,
                    "case_url": a.case_url,
                    "enforcement_type": a.enforcement_type,
                    "penalty_amount": a.penalty_amount,
                    "description": a.description,
                    "source": a.source,
                }
                for a in actions
            ],
        }
    finally:
        db.close()


@app.get("/tech/companies/{company_id}/contracts/trends")
def get_tech_company_contract_trends(company_id: str):
    """Contract value trends by year for a tech company."""
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        contracts = db.query(GovernmentContract).filter_by(company_id=company_id).all()

        by_year: Dict[str, Any] = {}
        for ct in contracts:
            year = str(ct.start_date.year) if ct.start_date else "Unknown"
            if year not in by_year:
                by_year[year] = {"total_amount": 0, "count": 0}
            by_year[year]["total_amount"] += ct.award_amount or 0
            by_year[year]["count"] += 1

        sorted_years = sorted(
            [{"year": y, **d} for y, d in by_year.items() if y != "Unknown"],
            key=lambda x: x["year"],
        )
        if "Unknown" in by_year:
            sorted_years.append({"year": "Unknown", **by_year["Unknown"]})

        return {"trends": sorted_years}
    finally:
        db.close()


@app.get("/tech/compare")
def get_tech_comparison(
    ids: str = Query(..., description="Comma-separated company IDs"),
):
    """Cross-company comparison for tech sector."""
    db = SessionLocal()
    try:
        company_ids = [cid.strip() for cid in ids.split(",") if cid.strip()]
        if not company_ids or len(company_ids) > 10:
            raise HTTPException(status_code=400, detail="Provide 2-10 company IDs")

        results = []
        for cid in company_ids:
            co = db.query(TrackedTechCompany).filter_by(company_id=cid).first()
            if not co:
                continue

            patent_count = db.query(TechPatent).filter_by(company_id=cid).count()
            contract_count = db.query(GovernmentContract).filter_by(company_id=cid).count()
            filing_count = db.query(SECTechFiling).filter_by(company_id=cid).count()
            total_contract_value = db.query(func.sum(GovernmentContract.award_amount)).filter_by(
                company_id=cid
            ).scalar() or 0
            lobbying_total = db.query(func.sum(LobbyingRecord.income)).filter_by(
                company_id=cid
            ).scalar() or 0
            enforcement_count = db.query(FTCEnforcement).filter_by(company_id=cid).count()
            total_penalties = db.query(func.sum(FTCEnforcement.penalty_amount)).filter_by(
                company_id=cid
            ).scalar() or 0

            latest = db.query(StockFundamentals).filter_by(
                entity_type="tech_company", entity_id=cid
            ).order_by(desc(StockFundamentals.snapshot_date)).first()

            results.append({
                "company_id": co.company_id,
                "display_name": co.display_name,
                "ticker": co.ticker,
                "sector_type": co.sector_type,
                "patent_count": patent_count,
                "contract_count": contract_count,
                "filing_count": filing_count,
                "total_contract_value": total_contract_value,
                "lobbying_total": lobbying_total,
                "enforcement_count": enforcement_count,
                "total_penalties": total_penalties,
                "market_cap": latest.market_cap if latest else None,
                "pe_ratio": latest.pe_ratio if latest else None,
                "profit_margin": latest.profit_margin if latest else None,
            })

        return {"companies": results}
    finally:
        db.close()
