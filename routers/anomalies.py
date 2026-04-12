"""
Anomaly detection routes — suspicious patterns found in the data.
"""

import json
import logging

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional

logger = logging.getLogger(__name__)

from models.database import get_db, Anomaly
from models.response_schemas import AnomaliesListResponse

router = APIRouter(prefix="/anomalies", tags=["anomalies"])


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
    """List anomalies with optional filters."""
    q = db.query(Anomaly)
    if pattern_type:
        q = q.filter(Anomaly.pattern_type == pattern_type)
    if entity_type:
        q = q.filter(Anomaly.entity_type == entity_type)
    if min_score > 0:
        q = q.filter(Anomaly.score >= min_score)

    total = q.count()
    rows = q.order_by(desc(Anomaly.score), desc(Anomaly.detected_at)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "anomalies": [_serialize_anomaly(a) for a in rows],
    }


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
