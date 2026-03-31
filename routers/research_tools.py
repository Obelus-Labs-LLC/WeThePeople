"""
Research Tools — lightweight proxy router for external public APIs.

Proxies FDA, USDA, and EPA data so the research site doesn't need
to handle CORS or expose third-party endpoints to the browser.
"""

import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Query, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/research", tags=["research"])

_TIMEOUT = 15.0


# ── FDA Food Recalls (OpenFDA) ──────────────────────────────────────────────


@router.get("/food-recalls")
async def food_recalls(
    search: str = Query("", description="Product or company search term"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to OpenFDA food enforcement (recall) endpoint."""
    base = "https://api.fda.gov/food/enforcement.json"
    params: dict = {"limit": limit}
    if search.strip():
        # OpenFDA search: field:term, use + for AND. For broad search, just search one field.
        q = search.strip().replace('"', "")
        params["search"] = f'product_description:"{q}"'

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(base, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return {"total": 0, "recalls": []}
        logger.warning("OpenFDA error %s: %s", exc.response.status_code, exc.response.text[:200])
        raise HTTPException(502, "OpenFDA request failed")
    except Exception as exc:
        logger.warning("OpenFDA request error: %s", exc)
        raise HTTPException(502, "OpenFDA request failed")

    results = data.get("results", [])
    total = data.get("meta", {}).get("results", {}).get("total", len(results))

    recalls = []
    for r in results:
        recalls.append({
            "recall_number": r.get("recall_number"),
            "classification": r.get("classification"),
            "status": r.get("status"),
            "product_description": r.get("product_description"),
            "reason_for_recall": r.get("reason_for_recall"),
            "recall_initiation_date": r.get("recall_initiation_date"),
            "recalling_firm": r.get("recalling_firm"),
            "city": r.get("city"),
            "state": r.get("state"),
            "distribution_pattern": r.get("distribution_pattern"),
        })

    return {"total": total, "recalls": recalls}


# ── USDA FSIS Recalls ───────────────────────────────────────────────────────


@router.get("/usda-recalls")
async def usda_recalls(
    search: str = Query("", description="Product or company search term"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to USDA FSIS recall API."""
    base = "https://api.fsis.usda.gov/fsis-api/recalls"

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(base)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("USDA FSIS request error: %s", exc)
        raise HTTPException(502, "USDA FSIS request failed")

    # FSIS returns a flat list; filter client-side
    items = data if isinstance(data, list) else data.get("recalls", data.get("results", []))
    q = search.strip().lower()

    filtered = []
    for item in items:
        if q:
            searchable = " ".join(
                str(v) for v in [
                    item.get("recall_number", ""),
                    item.get("title", ""),
                    item.get("reason", ""),
                    item.get("company", item.get("establishment", "")),
                    item.get("products", ""),
                ]
            ).lower()
            if q not in searchable:
                continue
        filtered.append({
            "recall_number": item.get("recall_number"),
            "title": item.get("title", item.get("subject", "")),
            "risk_level": item.get("risk_level", item.get("classification", "")),
            "reason": item.get("reason", ""),
            "company": item.get("company", item.get("establishment", "")),
            "products": item.get("products", item.get("product_items", "")),
            "date": item.get("date", item.get("recall_date", "")),
        })
        if len(filtered) >= limit:
            break

    return {"total": len(filtered), "recalls": filtered}


# ── EPA Toxic Release Inventory (EnviroFacts) ───────────────────────────────


@router.get("/toxic-releases")
async def toxic_releases(
    state: Optional[str] = Query(None, description="2-letter state code"),
    chemical: Optional[str] = Query(None, description="Chemical name search"),
    year: Optional[int] = Query(None, description="Reporting year"),
    facility_name: Optional[str] = Query(None, description="Facility name search"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to EPA EnviroFacts TRI facility data."""
    # Build EnviroFacts REST URL segments
    # API: https://enviro.epa.gov/enviro/efservice/tri_facility/<filters>/JSON
    base = "https://enviro.epa.gov/enviro/efservice"
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

    url = "/".join([base] + segments)

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return {"total": 0, "releases": []}
        logger.warning("EPA EnviroFacts error %s: %s", exc.response.status_code, exc.response.text[:200])
        raise HTTPException(502, "EPA EnviroFacts request failed")
    except Exception as exc:
        logger.warning("EPA EnviroFacts request error: %s", exc)
        raise HTTPException(502, "EPA EnviroFacts request failed")

    if not isinstance(data, list):
        return {"total": 0, "releases": []}

    releases = []
    for row in data:
        # Try to parse total releases from on-site + off-site columns
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


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
