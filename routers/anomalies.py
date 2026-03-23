"""
Anomaly detection routes — suspicious patterns found in the data.
"""

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import func, desc
from typing import Optional
import json

from models.database import SessionLocal, Anomaly

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


@router.get("")
def list_anomalies(
    pattern_type: Optional[str] = Query(None, description="Filter by pattern type"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type (person, company)"),
    min_score: float = Query(0, ge=0, le=10, description="Minimum suspicion score"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List anomalies with optional filters."""
    db = SessionLocal()
    try:
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
    finally:
        db.close()


@router.get("/top")
def top_anomalies(
    limit: int = Query(10, ge=1, le=50),
):
    """Top N highest-scoring anomalies."""
    db = SessionLocal()
    try:
        rows = (
            db.query(Anomaly)
            .order_by(desc(Anomaly.score), desc(Anomaly.detected_at))
            .limit(limit)
            .all()
        )
        return {
            "anomalies": [_serialize_anomaly(a) for a in rows],
        }
    finally:
        db.close()


@router.get("/entity/{entity_type}/{entity_id}")
def entity_anomalies(
    entity_type: str,
    entity_id: str,
    min_score: float = Query(0, ge=0, le=10),
):
    """Anomalies for a specific entity."""
    db = SessionLocal()
    try:
        q = (
            db.query(Anomaly)
            .filter(
                Anomaly.entity_type == entity_type,
                Anomaly.entity_id == entity_id,
            )
        )
        if min_score > 0:
            q = q.filter(Anomaly.score >= min_score)

        rows = q.order_by(desc(Anomaly.score)).all()

        return {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "total": len(rows),
            "anomalies": [_serialize_anomaly(a) for a in rows],
        }
    finally:
        db.close()


@router.get("/stats")
def anomaly_stats():
    """Summary statistics about detected anomalies."""
    db = SessionLocal()
    try:
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
    finally:
        db.close()
