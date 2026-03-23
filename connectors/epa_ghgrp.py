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
import time
import requests
from typing import Optional, List, Dict, Any

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

    Uses the PUB_DIM_FACILITY table which links facilities to parent companies.
    The PARENT_CO field supports LIKE-style matching.

    Returns list of facility dicts with keys:
        facility_id, facility_name, city, state, zip, parent_company,
        latitude, longitude, industry_type
    """
    # URL encode the company name for the REST endpoint
    # Envirofacts uses path-based queries: /TABLE/COLUMN/VALUE/JSON
    url = f"{GHGRP_BASE}/PUB_DIM_FACILITY/PARENT_CO/CONTAINING/{parent_company}/JSON/0/{rows}"

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        print(f"[EPA GHGRP] Error fetching facilities for '{parent_company}': {e}")
        return []
    except (json.JSONDecodeError, ValueError):
        print(f"[EPA GHGRP] Invalid JSON response for '{parent_company}'")
        return []

    if not isinstance(data, list):
        return []

    facilities = []
    for row in data:
        facilities.append({
            "facility_id": row.get("FACILITY_ID"),
            "facility_name": row.get("FACILITY_NAME"),
            "city": row.get("CITY"),
            "state": row.get("STATE"),
            "zip": row.get("ZIP"),
            "parent_company": row.get("PARENT_CO"),
            "latitude": _safe_float(row.get("LATITUDE")),
            "longitude": _safe_float(row.get("LONGITUDE")),
            "industry_type": row.get("PRIMARY_NAICS_CODE_DESC"),
        })

    time.sleep(POLITE_DELAY)
    return facilities


def get_facility_emissions(facility_id: int, rows: int = 200) -> List[Dict[str, Any]]:
    """
    Fetch greenhouse gas emissions for a specific facility.

    Uses PUB_FACTS_SUBP_GHG_EMISSION which has per-year, per-gas emission totals.

    Returns list of emission dicts with keys:
        facility_id, reporting_year, gas_name, total_emissions (metric tons CO2e)
    """
    url = f"{GHGRP_BASE}/PUB_FACTS_SUBP_GHG_EMISSION/FACILITY_ID/{facility_id}/JSON/0/{rows}"

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        print(f"[EPA GHGRP] Error fetching emissions for facility {facility_id}: {e}")
        return []
    except (json.JSONDecodeError, ValueError):
        print(f"[EPA GHGRP] Invalid JSON response for facility {facility_id}")
        return []

    if not isinstance(data, list):
        return []

    emissions = []
    for row in data:
        emissions.append({
            "facility_id": row.get("FACILITY_ID"),
            "reporting_year": row.get("REPORTING_YEAR"),
            "gas_name": row.get("GAS_NAME"),
            "total_emissions": _safe_float(row.get("CO2E_EMISSION")),
        })

    time.sleep(POLITE_DELAY)
    return emissions


def get_facility_total_emissions(facility_id: int, rows: int = 100) -> List[Dict[str, Any]]:
    """
    Fetch total (aggregated) GHG emissions per facility per year.

    Uses PUB_FACTS_SECTOR_GHG_EMISSION for higher-level totals.

    Returns list of dicts with:
        facility_id, reporting_year, total_reported_emissions (metric tons CO2e),
        sector
    """
    url = f"{GHGRP_BASE}/PUB_FACTS_SECTOR_GHG_EMISSION/FACILITY_ID/{facility_id}/JSON/0/{rows}"

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        print(f"[EPA GHGRP] Error fetching sector emissions for facility {facility_id}: {e}")
        return []
    except (json.JSONDecodeError, ValueError):
        print(f"[EPA GHGRP] Invalid JSON response for facility {facility_id}")
        return []

    if not isinstance(data, list):
        return []

    results = []
    for row in data:
        results.append({
            "facility_id": row.get("FACILITY_ID"),
            "reporting_year": row.get("REPORTING_YEAR"),
            "total_reported_emissions": _safe_float(row.get("CO2E_EMISSION")),
            "sector": row.get("INDUSTRY_TYPE_DESC"),
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
