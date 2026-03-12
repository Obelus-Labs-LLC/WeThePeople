"""
Defense sector routes — PLACEHOLDER for future development.

Planned data sources:
- USASpending (defense contracts)
- DSCA (Defense Security Cooperation Agency)
- DOD budget data
- Military base locations / BRAC
- Arms export data
"""

from fastapi import APIRouter

router = APIRouter(prefix="/defense", tags=["defense"])


@router.get("/dashboard/stats")
def get_defense_dashboard_stats():
    """Placeholder — Defense sector coming soon."""
    return {"status": "coming_soon", "sector": "defense"}
