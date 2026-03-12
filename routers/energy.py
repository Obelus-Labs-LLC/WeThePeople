"""
Energy sector routes — PLACEHOLDER for future development.

Planned data sources:
- EIA (Energy Information Administration)
- EPA (Environmental Protection Agency)
- FERC (Federal Energy Regulatory Commission)
- DOE loan programs
- Carbon emissions data
"""

from fastapi import APIRouter

router = APIRouter(prefix="/energy", tags=["energy"])


@router.get("/dashboard/stats")
def get_energy_dashboard_stats():
    """Placeholder — Energy sector coming soon."""
    return {"status": "coming_soon", "sector": "energy"}
