"""
Education sector routes — PLACEHOLDER for future development.

Planned data sources:
- Department of Education (College Scorecard API)
- IPEDS (Integrated Postsecondary Education Data System)
- State education budgets
- Student loan data (FSA)
- School safety data (NCES)
"""

import logging

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/education", tags=["education"])


@router.get("/dashboard/stats")
def get_education_dashboard_stats():
    """Placeholder — Education sector coming soon."""
    return {"status": "coming_soon", "sector": "education"}
