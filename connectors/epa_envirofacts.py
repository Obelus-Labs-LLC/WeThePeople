"""
EPA EnviroFacts Connector — Toxic Release Inventory (TRI)

Fetch TRI facility data from the EPA EnviroFacts REST API.

API docs: https://www.epa.gov/enviro/envirofacts-data-service-api
No API key required — public data.
"""

import requests
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

ENVIROFACTS_BASE = "https://enviro.epa.gov/enviro/efservice"
TIMEOUT = 15


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def search_tri_releases(
    state: Optional[str] = None,
    chemical: Optional[str] = None,
    year: Optional[int] = None,
    facility_name: Optional[str] = None,
    limit: int = 25,
) -> Dict[str, Any]:
    """
    Search EPA TRI (Toxic Release Inventory) facility data.

    Args:
        state: 2-letter state code
        chemical: Chemical name search term
        year: Reporting year
        facility_name: Facility name search term
        limit: Max results (1-100)

    Returns:
        Dict with 'total' and 'releases' list
    """
    segments = ["V_TRI_FORM_R_EZ"]

    if state:
        segments.append(f"FACILITY_STATE/{state.upper()}")
    if chemical:
        segments.append(f"CHEMICAL_NAME/CONTAINING/{chemical.strip().upper()}")
    if year:
        segments.append(f"REPORTING_YEAR/{year}")
    if facility_name:
        segments.append(f"FACILITY_NAME/CONTAINING/{facility_name.strip().upper()}")

    segments.append(f"rows/0:{limit}")
    segments.append("JSON")

    url = "/".join([ENVIROFACTS_BASE] + segments)

    try:
        resp = requests.get(url, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            return {"total": 0, "releases": []}
        logger.warning("EPA EnviroFacts error: %s", e)
        return {"total": 0, "releases": [], "error": str(e)}
    except Exception as e:
        logger.warning("EPA EnviroFacts request error: %s", e)
        return {"total": 0, "releases": [], "error": str(e)}

    if not isinstance(data, list):
        return {"total": 0, "releases": []}

    releases = []
    for row in data:
        on_site = _safe_float(row.get("ON_SITE_RELEASE_TOTAL"))
        off_site = _safe_float(row.get("OFF_SITE_RELEASE_TOTAL"))
        total = (on_site or 0) + (off_site or 0)

        releases.append({
            "facility_name": row.get("FACILITY_NAME", ""),
            "city": row.get("FACILITY_CITY", ""),
            "state": row.get("FACILITY_STATE", ""),
            "chemical": row.get("CHEMICAL_NAME", ""),
            "total_releases": total,
            "industry": row.get("INDUSTRY_SECTOR", row.get("PRIMARY_SIC_CODE", "")),
            "latitude": _safe_float(row.get("FACILITY_LATITUDE")),
            "longitude": _safe_float(row.get("FACILITY_LONGITUDE")),
            "year": row.get("REPORTING_YEAR"),
        })

    # Sort by total_releases descending
    releases.sort(key=lambda r: r["total_releases"] or 0, reverse=True)

    return {"total": len(releases), "releases": releases}
