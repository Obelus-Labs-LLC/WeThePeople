"""
Infrastructure sector routes — PLACEHOLDER for future development.

Planned data sources:
- DOT (Department of Transportation)
- FHWA (Federal Highway Administration)
- FCC (broadband deployment data)
- Army Corps of Engineers
- Infrastructure spending (IIJA tracker)
"""

from fastapi import APIRouter

router = APIRouter(prefix="/infrastructure", tags=["infrastructure"])


@router.get("/dashboard/stats")
def get_infrastructure_dashboard_stats():
    """Placeholder — Infrastructure sector coming soon."""
    return {"status": "coming_soon", "sector": "infrastructure"}
