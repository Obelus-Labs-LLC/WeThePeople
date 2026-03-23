"""
NHTSA Connector — National Highway Traffic Safety Administration

Fetch vehicle recalls, complaints, and safety ratings from NHTSA.

API docs: https://api.nhtsa.gov/
Rate limit: No published limit (use polite delays)
Auth: None required (free public API)

Known limitation: No exponential backoff/retry on transient failures.
Polite delay between requests reduces risk, but a retry strategy would be ideal
for production use with large company sets.
"""

import hashlib
import time
import requests
from datetime import datetime
from typing import List, Dict, Any

import logging

logger = logging.getLogger(__name__)

NHTSA_BASE = "https://api.nhtsa.gov"

POLITE_DELAY = 0.5


def _parse_nhtsa_date(date_str: str) -> str:
    """Parse NHTSA date strings (MM/DD/YYYY) to ISO format (YYYY-MM-DD) for correct sorting.
    Falls back to original string if parsing fails."""
    if not date_str:
        return date_str
    try:
        dt = datetime.strptime(date_str.strip(), "%m/%d/%Y")
        return dt.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        # Try other common formats
        for fmt in ("%Y-%m-%d", "%m-%d-%Y", "%d/%m/%Y"):
            try:
                dt = datetime.strptime(date_str.strip(), fmt)
                return dt.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                continue
        return date_str


def _compute_hash(*parts: str) -> str:
    """SHA-256 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode()).hexdigest()


def _get_models_for_make(make: str, model_year: int) -> List[str]:
    """Get all model names for a make/year from NHTSA products API."""
    url = f"{NHTSA_BASE}/products/vehicle/models"
    params = {"make": make, "modelYear": model_year, "issueType": "r"}
    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.debug("NHTSA models lookup for '%s' %d: %s", make, model_year, e)
        return []

    results_list = data.get("results", [])
    return [m.get("model", "") for m in results_list if m.get("model")]


def fetch_recalls(make: str, model_year_start: int = 2015) -> List[Dict[str, Any]]:
    """
    Fetch NHTSA vehicle recall campaigns for a given make.
    Uses 2-step approach: get models, then get recalls per model.
    NHTSA API requires make + model + modelYear (all 3 params).

    Args:
        make: Vehicle make name (e.g. 'Ford', 'Toyota', 'GM')
        model_year_start: Earliest model year to query (default 2015)

    Returns:
        List of recall dicts with keys: recall_number, make, model,
        model_year, recall_date, component, summary, consequence,
        remedy, manufacturer, dedupe_hash
    """
    current_year = datetime.now().year
    results = []
    seen_hashes = set()

    for year in range(model_year_start, current_year + 1):
        models = _get_models_for_make(make, year)
        if not models:
            logger.debug("NHTSA: no models found for '%s' year %d", make, year)
            continue

        for model in models:
            url = f"{NHTSA_BASE}/recalls/recallsByVehicle"
            params = {"make": make, "model": model, "modelYear": year}

            try:
                time.sleep(POLITE_DELAY)
                resp = requests.get(url, params=params, timeout=30)
                resp.raise_for_status()
                data = resp.json()
            except requests.exceptions.HTTPError as e:
                if e.response is not None and e.response.status_code == 404:
                    continue
                logger.error("NHTSA recalls fetch failed for '%s' '%s' year %d: %s", make, model, year, e)
                continue
            except Exception as e:
                logger.error("NHTSA recalls fetch failed for '%s' '%s' year %d: %s", make, model, year, e)
                continue

            recalls_raw = data.get("results", [])
            for recall in recalls_raw:
                recall_number = recall.get("NHTSACampaignNumber", "")
                h = _compute_hash(recall_number or f"{make}_{year}_{model}")
                if h in seen_hashes:
                    continue
                seen_hashes.add(h)
                results.append({
                    "recall_number": recall_number,
                    "make": recall.get("Make", make),
                    "model": recall.get("Model", model),
                    "model_year": year,
                    "recall_date": _parse_nhtsa_date(recall.get("ReportReceivedDate", "")),
                    "component": recall.get("Component", ""),
                    "summary": (recall.get("Summary", "") or "")[:2000],
                    "consequence": (recall.get("Consequence", "") or "")[:1000],
                    "remedy": (recall.get("Remedy", "") or "")[:1000],
                    "manufacturer": recall.get("Manufacturer", ""),
                    "dedupe_hash": h,
                })

    logger.info("NHTSA recalls '%s': %d recalls (%d-%d)", make, len(results), model_year_start, current_year)
    return results


def fetch_complaints(make: str, model_year_start: int = 2015) -> List[Dict[str, Any]]:
    """
    Fetch NHTSA vehicle complaint records for a given make.
    Uses 2-step approach: get models, then get complaints per model.
    NHTSA API requires make + model + modelYear (all 3 params).

    Args:
        make: Vehicle make name (e.g. 'Ford', 'Toyota')
        model_year_start: Earliest model year to query (default 2015)

    Returns:
        List of complaint dicts with keys: odi_number, make, model,
        model_year, date_of_complaint, crash, fire, injuries, deaths,
        component, summary, dedupe_hash
    """
    current_year = datetime.now().year
    results = []
    seen_hashes = set()

    for year in range(model_year_start, current_year + 1):
        # Use "c" issueType for complaints
        models = _get_models_for_make(make, year)
        if not models:
            continue

        for model in models:
            url = f"{NHTSA_BASE}/complaints/complaintsByVehicle"
            params = {"make": make, "model": model, "modelYear": year}

            try:
                time.sleep(POLITE_DELAY)
                resp = requests.get(url, params=params, timeout=30)
                resp.raise_for_status()
                data = resp.json()
            except requests.exceptions.HTTPError as e:
                if e.response is not None and e.response.status_code == 404:
                    continue
                logger.error("NHTSA complaints fetch failed for '%s' '%s' year %d: %s", make, model, year, e)
                continue
            except Exception as e:
                logger.error("NHTSA complaints fetch failed for '%s' '%s' year %d: %s", make, model, year, e)
                continue

            complaints_raw = data.get("results", [])
            for complaint in complaints_raw:
                odi_number = str(complaint.get("odiNumber", ""))
                h = _compute_hash(odi_number or f"{make}_{year}_{model}_{complaint.get('dateOfComplaint', '')}")
                if h in seen_hashes:
                    continue
                seen_hashes.add(h)
                results.append({
                    "odi_number": odi_number,
                    "make": complaint.get("make", make),
                    "model": complaint.get("model", model),
                    "model_year": year,
                    "date_of_complaint": _parse_nhtsa_date(complaint.get("dateOfComplaint", "")),
                    "crash": complaint.get("crash", "N") == "Y",
                    "fire": complaint.get("fire", "N") == "Y",
                    "injuries": int(complaint.get("numberOfInjuries", 0) or 0),
                    "deaths": int(complaint.get("numberOfDeaths", 0) or 0),
                    "component": complaint.get("components", ""),
                    "summary": (complaint.get("summary", "") or "")[:2000],
                    "dedupe_hash": h,
                })

    logger.info("NHTSA complaints '%s': %d complaints (%d-%d)", make, len(results), model_year_start, current_year)
    return results


def fetch_safety_ratings(make: str, model_year: int) -> List[Dict[str, Any]]:
    """
    Fetch NHTSA NCAP safety ratings for a given make and model year.
    First gets the list of models, then fetches detailed ratings per vehicle.

    Args:
        make: Vehicle make name (e.g. 'Ford', 'Toyota')
        model_year: Model year to query

    Returns:
        List of rating dicts with keys: make, model, model_year,
        overall_rating, front_crash, side_crash, rollover
    """
    # Step 1: Get models for this make/year
    url = f"{NHTSA_BASE}/SafetyRatings/modelyear/{model_year}/make/{make}"
    results = []

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            logger.info("NHTSA safety ratings for '%s' %d: no results", make, model_year)
            return []
        logger.error("NHTSA safety ratings fetch failed for '%s' %d: %s", make, model_year, e)
        return []
    except Exception as e:
        logger.error("NHTSA safety ratings fetch failed for '%s' %d: %s", make, model_year, e)
        return []

    models_raw = data.get("Results", [])

    # Step 2: For each model, get detailed ratings by VehicleId
    for model_entry in models_raw:
        vehicle_id = model_entry.get("VehicleId")
        if not vehicle_id:
            continue

        try:
            time.sleep(POLITE_DELAY)
            detail_url = f"{NHTSA_BASE}/SafetyRatings/VehicleId/{vehicle_id}"
            detail_resp = requests.get(detail_url, timeout=30)
            detail_resp.raise_for_status()
            detail_data = detail_resp.json()
        except Exception as e:
            logger.error("NHTSA safety rating detail fetch failed for VehicleId %s: %s", vehicle_id, e)
            continue

        for rating in detail_data.get("Results", []):
            results.append({
                "make": rating.get("Make", make),
                "model": rating.get("Model", ""),
                "model_year": model_year,
                "overall_rating": rating.get("OverallRating"),
                "front_crash": rating.get("OverallFrontCrashRating"),
                "side_crash": rating.get("OverallSideCrashRating"),
                "rollover": rating.get("RolloverRating"),
            })

    logger.info("NHTSA safety ratings '%s' %d: %d vehicles", make, model_year, len(results))
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    print("=== Testing NHTSA Connector ===\n")

    # Test recalls
    print("--- Recalls for Ford (2023-2024) ---")
    recalls = fetch_recalls("Ford", model_year_start=2023)
    for r in recalls[:3]:
        print(f"  {r['recall_number']}: {r['model']} {r['model_year']} - {r['component']}")
    print(f"  Total: {len(recalls)} recalls\n")

    # Test complaints
    print("--- Complaints for Toyota (2023-2024) ---")
    complaints = fetch_complaints("Toyota", model_year_start=2023)
    for c in complaints[:3]:
        print(f"  ODI#{c['odi_number']}: {c['model']} {c['model_year']} - {c['component']}")
    print(f"  Total: {len(complaints)} complaints\n")

    # Test safety ratings
    print("--- Safety Ratings for Honda 2024 ---")
    ratings = fetch_safety_ratings("Honda", 2024)
    for r in ratings[:3]:
        print(f"  {r['model']}: Overall={r['overall_rating']}, Front={r['front_crash']}, Side={r['side_crash']}, Rollover={r['rollover']}")
    print(f"  Total: {len(ratings)} vehicles")
