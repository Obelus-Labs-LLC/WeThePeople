"""
EPA Greenhouse Gas Reporting Program (GHGRP) Connector

Fetches facility-level emissions data from EPA's Envirofacts API.

API docs: https://www.epa.gov/enviro/greenhouse-gas-overview
Base URL: https://data.epa.gov/efservice/
Rate limit: Be polite — 1 second between requests (EPA is slow).
Auth: None required.
"""

import hashlib
import json
import logging
import time
import requests
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

GHGRP_BASE = "https://data.epa.gov/efservice"
POLITE_DELAY = 1.0


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _safe_float(val: Any) -> Optional[float]:
    """Safely convert a value to float, returning None on failure."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def search_facilities_by_parent(parent_company: str, rows: int = 100) -> List[Dict[str, Any]]:
    """
    Search EPA GHGRP for facilities by parent company name.

    Uses the PUB_DIM_FACILITY view. EPA renamed the parent column from
    `parent_co` (old) → `parent_company` (current) and changed the URL
    pattern from `/JSON/0/N` (old) → `/rows/0:N/JSON` (current).
    Without those updates the connector returned 0 facilities for every
    tracked company. Field names in the response are also lowercase
    now, not uppercase. (Audit: 2026-05-02.)

    Returns list of facility dicts with keys:
        facility_id, facility_name, city, state, zip, parent_company,
        latitude, longitude, industry_type, year
    """
    from urllib.parse import quote
    url = (
        f"{GHGRP_BASE}/PUB_DIM_FACILITY/parent_company/CONTAINING/"
        f"{quote(parent_company, safe='')}/rows/0:{rows}/JSON"
    )

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        logger.error("Error fetching facilities for '%s': %s", parent_company, e)
        return []
    except (json.JSONDecodeError, ValueError):
        logger.error("Invalid JSON response for '%s'", parent_company)
        return []

    if isinstance(data, dict) and "error" in data:
        logger.warning("EPA returned error for '%s': %s", parent_company, data.get("error"))
        return []
    if not isinstance(data, list):
        return []

    # The PUB_DIM_FACILITY view emits one row per facility per
    # reporting year (`year`), so a single facility can appear 5–15
    # times in the result. De-dupe by facility_id, keep the most
    # recent year's row for each facility — that's the canonical
    # name/location.
    by_id: Dict[int, Dict[str, Any]] = {}
    for row in data:
        fid = row.get("facility_id")
        if not fid:
            continue
        existing = by_id.get(fid)
        if existing and (existing.get("year") or 0) >= (row.get("year") or 0):
            continue
        by_id[fid] = {
            "facility_id": fid,
            "facility_name": row.get("facility_name"),
            "city": row.get("city"),
            "state": row.get("state"),
            "zip": row.get("zip"),
            "parent_company": row.get("parent_company"),
            "latitude": _safe_float(row.get("latitude")),
            "longitude": _safe_float(row.get("longitude")),
            "industry_type": row.get("reported_industry_types") or row.get("naics_code"),
            "year": row.get("year"),
        }

    time.sleep(POLITE_DELAY)
    return list(by_id.values())


def get_facility_emissions(facility_id: int, rows: int = 1000) -> List[Dict[str, Any]]:
    """
    Fetch greenhouse gas emissions for a specific facility.

    Uses PUB_FACTS_SUBP_GHG_EMISSION (one row per (facility, sub_part,
    gas, year)). The 2026-05 schema has columns:
        facility_id, sub_part_id, co2e_emission, gas_id, year
    Field names are lowercase. Old code used uppercase REPORTING_YEAR /
    GAS_NAME / CO2E_EMISSION and got Nones across the board.

    Returns list of per-row emission dicts with keys:
        facility_id, reporting_year, gas_id, total_emissions
    The aggregate (sum across sub_parts and gases per year) is what the
    sync job actually persists; it computes that locally.
    """
    url = (
        f"{GHGRP_BASE}/PUB_FACTS_SUBP_GHG_EMISSION/facility_id/=/{facility_id}"
        f"/rows/0:{rows}/JSON"
    )

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        logger.error("Error fetching emissions for facility %s: %s", facility_id, e)
        return []
    except (json.JSONDecodeError, ValueError):
        logger.error("Invalid JSON response for facility %s", facility_id)
        return []

    if isinstance(data, dict) and "error" in data:
        return []
    if not isinstance(data, list):
        return []

    emissions = []
    for row in data:
        emissions.append({
            "facility_id": row.get("facility_id"),
            "reporting_year": row.get("year"),
            "gas_id": row.get("gas_id"),
            "sub_part_id": row.get("sub_part_id"),
            "total_emissions": _safe_float(row.get("co2e_emission")),
        })

    time.sleep(POLITE_DELAY)
    return emissions


def get_facility_total_emissions(facility_id: int, rows: int = 1000) -> List[Dict[str, Any]]:
    """
    Aggregate GHG emissions per facility per year.

    EPA's old PUB_FACTS_SECTOR_GHG_EMISSION view was deprecated; we now
    sum PUB_FACTS_SUBP_GHG_EMISSION rows locally. The aggregation
    sums co2e_emission across all sub_parts and gases for each
    (facility_id, year) pair, which is what the sync job stores as
    "total CO2e emissions for this facility this year".

    Returns list of dicts with:
        facility_id, reporting_year, total_reported_emissions, sector
    `sector` is left None — the sub_part view doesn't carry it; if
    you need it, look it up from PUB_DIM_FACILITY.
    """
    rows_data = get_facility_emissions(facility_id, rows=rows)
    if not rows_data:
        return []

    by_year: Dict[int, float] = {}
    for r in rows_data:
        year = r.get("reporting_year")
        emit = r.get("total_emissions")
        if year is None or emit is None:
            continue
        by_year[year] = by_year.get(year, 0.0) + float(emit)

    results = []
    for year, total in sorted(by_year.items()):
        results.append({
            "facility_id": facility_id,
            "reporting_year": year,
            "total_reported_emissions": round(total, 3),
            "sector": None,
        })

    time.sleep(POLITE_DELAY)
    return results


if __name__ == "__main__":
    print("=== EPA GHGRP Connector Test ===\n")

    # Test searching for ExxonMobil facilities
    test_company = "ExxonMobil"
    print(f"Searching facilities for: {test_company}")
    facilities = search_facilities_by_parent(test_company, rows=5)
    print(f"Found {len(facilities)} facilities\n")

    for f in facilities[:3]:
        print(f"  Facility: {f['facility_name']}")
        print(f"  City: {f['city']}, State: {f['state']}")
        print(f"  Industry: {f['industry_type']}")
        print(f"  Facility ID: {f['facility_id']}")

        if f["facility_id"]:
            print(f"  Fetching emissions...")
            emissions = get_facility_total_emissions(f["facility_id"], rows=5)
            for em in emissions[:3]:
                print(f"    {em['reporting_year']}: {em['total_reported_emissions']} metric tons CO2e ({em['sector']})")
        print()

    # Test dedup hash
    h = _compute_hash("1234", "2023", "ExxonMobil Baytown Olefins Plant")
    print(f"Example dedup hash: {h}")
