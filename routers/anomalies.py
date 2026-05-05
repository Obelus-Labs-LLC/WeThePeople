"""
Anomaly detection routes — suspicious patterns found in the data.
"""

import json
import logging
import threading
import time

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional, Tuple, Dict

logger = logging.getLogger(__name__)

from models.database import get_db, Anomaly
from models.response_schemas import AnomaliesListResponse

router = APIRouter(prefix="/anomalies", tags=["anomalies"])

# In-process TTL cache for the /anomalies list endpoint.
# The underlying anomalies table is only refreshed by detect_anomalies.py
# nightly, and the dedupe-via-window-function query is O(N log N) over
# the full ~10K row table — measured at 4.94s on prod (May 2026
# walkthrough). With a 10-minute cache, all but the first hit per
# filter combo each window land in microseconds.
_LIST_CACHE_TTL_SEC = 600
_list_cache: Dict[Tuple, Tuple[float, dict]] = {}
_list_cache_lock = threading.Lock()


def _serialize_anomaly(a: Anomaly) -> dict:
    return {
        "id": a.id,
        "pattern_type": a.pattern_type,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "entity_name": a.entity_name,
        "score": a.score,
        "title": a.title,
        "description": a.description,
        "evidence": json.loads(a.evidence) if a.evidence else None,
        "detected_at": a.detected_at.isoformat() if a.detected_at else None,
    }


@router.get("", response_model=AnomaliesListResponse)
def list_anomalies(
    pattern_type: Optional[str] = Query(None, description="Filter by pattern type"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type (person, company)"),
    min_score: float = Query(0, ge=0, le=10, description="Minimum suspicion score"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List anomalies with optional filters.

    De-duplicates server-side by (entity_id, pattern_type, description-prefix)
    before paging. The underlying `dedupe_hash` column is keyed off the
    source event (lobby_filing_id, trade_id, etc.), not the anomaly's
    rendered text — so a single politician's "serves on committees
    overseeing finance/tech" pattern can have 30+ copies (one per
    detection-engine run × source events). Without this dedupe the
    /anomalies feed showed 19/20 copies of the same Henry Schein row at
    the top of the page. Caught 2026-05-03."""
    # Cache check: identical filter combos hit the same dedupe SQL
    # which costs ~5s on prod. Skip on cache hit.
    cache_key = (pattern_type, entity_type, float(min_score), int(limit), int(offset))
    now = time.monotonic()
    with _list_cache_lock:
        cached = _list_cache.get(cache_key)
    if cached:
        cached_time, cached_value = cached
        if now - cached_time < _LIST_CACHE_TTL_SEC:
            return cached_value

    # Use a window-function subquery to keep ONLY the highest-scored
    # row per (entity_id, pattern_type) group. This is the canonical
    # way to dedupe `wide` tables on SQLite 3.25+ (Hetzner's sqlite is
    # 3.40+). A previous Python-side dedupe over a fixed-size superset
    # collapsed the entire feed to 2 rows because Henry Schein and
    # Josh Gottheimer occupied the top ~thousand of score-DESC.
    from sqlalchemy import text as _sa_text
    where_clauses = []
    params: dict = {"limit": limit, "offset": offset}
    if pattern_type:
        where_clauses.append("pattern_type = :pattern_type")
        params["pattern_type"] = pattern_type
    if entity_type:
        where_clauses.append("entity_type = :entity_type")
        params["entity_type"] = entity_type
    if min_score > 0:
        where_clauses.append("score >= :min_score")
        params["min_score"] = min_score
    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    sql = _sa_text(f"""
        SELECT id, score FROM (
            SELECT id, score, ROW_NUMBER() OVER (
                PARTITION BY entity_id, pattern_type
                ORDER BY score DESC, detected_at DESC
            ) AS rn
            FROM anomalies
            {where_sql}
        )
        WHERE rn = 1
        ORDER BY score DESC, id DESC
        LIMIT :limit OFFSET :offset
    """)
    id_rows = db.execute(sql, params).all()
    ids = [r[0] for r in id_rows]

    total_sql = _sa_text(f"""
        SELECT COUNT(*) FROM (
            SELECT 1 FROM anomalies
            {where_sql}
            GROUP BY entity_id, pattern_type
        )
    """)
    total = db.execute(total_sql, {k: v for k, v in params.items() if k not in ("limit", "offset")}).scalar() or 0

    # Re-fetch the rows by id, preserving order
    rows = db.query(Anomaly).filter(Anomaly.id.in_(ids)).all() if ids else []
    rows_by_id = {r.id: r for r in rows}
    ordered = [rows_by_id[i] for i in ids if i in rows_by_id]

    response = {
        "total": total,
        "anomalies": [_serialize_anomaly(a) for a in ordered],
    }
    with _list_cache_lock:
        _list_cache[cache_key] = (now, response)
    return response


@router.get("/top")
def top_anomalies(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Top N highest-scoring anomalies."""
    rows = (
        db.query(Anomaly)
        .order_by(desc(Anomaly.score), desc(Anomaly.detected_at))
        .limit(limit)
        .all()
    )
    return {
        "anomalies": [_serialize_anomaly(a) for a in rows],
    }


@router.get("/entity/{entity_type}/{entity_id}")
def entity_anomalies(
    entity_type: str,
    entity_id: str,
    min_score: float = Query(0, ge=0, le=10),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Anomalies for a specific entity."""
    q = (
        db.query(Anomaly)
        .filter(
            Anomaly.entity_type == entity_type,
            Anomaly.entity_id == entity_id,
        )
    )
    if min_score > 0:
        q = q.filter(Anomaly.score >= min_score)

    total = q.count()
    rows = q.order_by(desc(Anomaly.score)).offset(offset).limit(limit).all()

    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "total": total,
        "limit": limit,
        "offset": offset,
        "anomalies": [_serialize_anomaly(a) for a in rows],
    }


@router.get("/stats")
def anomaly_stats(db: Session = Depends(get_db)):
    """Summary statistics about detected anomalies."""
    total = db.query(func.count(Anomaly.id)).scalar() or 0

    by_pattern = dict(
        db.query(Anomaly.pattern_type, func.count(Anomaly.id))
        .group_by(Anomaly.pattern_type)
        .all()
    )

    high_score_count = (
        db.query(func.count(Anomaly.id))
        .filter(Anomaly.score >= 7)
        .scalar()
    ) or 0

    avg_score = db.query(func.avg(Anomaly.score)).scalar() or 0

    return {
        "total": total,
        "high_score_count": high_score_count,
        "average_score": round(float(avg_score), 2),
        "by_pattern": by_pattern,
    }
