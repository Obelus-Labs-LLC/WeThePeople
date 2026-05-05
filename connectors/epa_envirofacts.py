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

# EPA migrated EnviroFacts from `enviro.epa.gov/enviro/efservice` to
# `data.epa.gov/efservice` (matches the migration we already applied to
# epa_ghgrp.py + datagov.py). The old host now returns HTTP 301 with a
# Location header pointing at the new URL, but the redirect doesn't
# preserve some query parameters cleanly under our requests-lib usage.
# Caught in the May 5 upstream-API audit.
ENVIROFACTS_BASE = "https://data.epa.gov/efservice"
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

    The EPA EnviroFacts V_TRI_FORM_R_EZ view returns rows whose keys
    are LOWERCASE (`facility_name`, `city_name`, `state_abbr`,
    `chem_name`, `total_on_off_site_release`, `reporting_year`,
    `industry_description`). The previous version of this connector
    read UPPERCASE keys (`FACILITY_NAME`, `ON_SITE_RELEASE_TOTAL`,
    etc.) which don't exist in the response — so every row showed
    blanks and 0 lbs in the UI.

    Filter columns are also lowercase (`state_abbr`, `chem_name`).

    EnviroFacts' `rows/A:B` is inclusive on both ends, so `0:limit`
    returns `limit+1` rows. Use `0:(limit-1)` to land exactly limit.

    Args:
        state: 2-letter state code
        chemical: Chemical name search term
        year: Reporting year
        facility_name: Facility name search term
        limit: Max results (1-250)

    Returns:
        Dict with 'total' and 'releases' list
    """
    segments = ["V_TRI_FORM_R_EZ"]

    if state:
        segments.append(f"state_abbr/{state.upper()}")
    if chemical:
        segments.append(f"chem_name/CONTAINING/{chemical.strip().upper()}")
    if year:
        segments.append(f"reporting_year/{year}")
    if facility_name:
        segments.append(f"facility_name/CONTAINING/{facility_name.strip().upper()}")

    # 0:0 returns 1 row, 0:99 returns 100 rows, etc.
    end_idx = max(0, int(limit) - 1)
    segments.append(f"rows/0:{end_idx}")
    segments.append("JSON")

    url = "/".join([ENVIROFACTS_BASE] + segments)

    try:
        # allow_redirects defaults True; the API moved from
        # enviro.epa.gov to data.epa.gov via 301.
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
        # Real fields per EPA docs:
        # total_on_off_site_release is the canonical total. Falls
        # back to summing the on-site / off-site if the precomputed
        # column is null on a given row.
        total = _safe_float(row.get("total_on_off_site_release"))
        if total is None:
            on_site = _safe_float(row.get("total_on_site_release")) or 0
            off_site = _safe_float(row.get("total_off_site_release")) or 0
            total = on_site + off_site

        releases.append({
            "facility_name": row.get("facility_name", "") or "",
            "city": row.get("city_name", "") or "",
            "state": row.get("state_abbr", "") or "",
            "chemical": (
                row.get("chem_name")
                or row.get("cas_chem_name")
                or row.get("generic_chem_name")
                or ""
            ),
            "total_releases": total or 0,
            "industry": (
                row.get("industry_description")
                or row.get("primary_sic_code")
                or ""
            ),
            "latitude": _safe_float(row.get("latitude")),
            "longitude": _safe_float(row.get("longitude")),
            "year": row.get("reporting_year"),
        })

    # Sort by total_releases descending so the worst offenders surface first.
    releases.sort(key=lambda r: r["total_releases"] or 0, reverse=True)

    return {"total": len(releases), "releases": releases}
