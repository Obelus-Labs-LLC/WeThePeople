"""
NHTSA Connector — National Highway Traffic Safety Administration

Fetch vehicle recalls, complaints, and safety ratings from NHTSA.

API docs: https://api.nhtsa.gov/
Rate limit: No published limit (use polite delays)
Auth: None required (free public API)
"""

import hashlib
import time
import requests
from datetime import datetime
from typing import List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

NHTSA_BASE = "https://api.nhtsa.gov"

POLITE_DELAY = 0.5


def _compute_hash(*parts: str) -> str:
    """SHA-256 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode()).hexdigest()


def fetch_recalls(make: str, model_year_start: int = 2015) -> List[Dict[str, Any]]:
    """
    Fetch NHTSA vehicle recall campaigns for a given make.
    Loops from model_year_start through the current year.

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

    for year in range(model_year_start, current_year + 1):
        url = f"{NHTSA_BASE}/recalls/recallsByVehicle"
        params = {"make": make, "modelYear": year}

        try:
            time.sleep(POLITE_DELAY)
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                logger.info("NHTSA recalls for '%s' year %d: no results", make, year)
                continue
            logger.error("NHTSA recalls fetch failed for '%s' year %d: %s", make, year, e)
            continue
        except Exception as e:
            logger.error("NHTSA recalls fetch failed for '%s' year %d: %s", make, year, e)
            continue

        recalls_raw = data.get("results", [])
        for recall in recalls_raw:
            recall_number = recall.get("NHTSACampaignNumber", "")
            results.append({
                "recall_number": recall_number,
                "make": recall.get("Make", make),
                "model": recall.get("Model", ""),
                "model_year": year,
                "recall_date": recall.get("ReportReceivedDate"),
                "component": recall.get("Component", ""),
                "summary": (recall.get("Summary", "") or "")[:2000],
                "consequence": (recall.get("Consequence", "") or "")[:1000],
                "remedy": (recall.get("Remedy", "") or "")[:1000],
                "manufacturer": recall.get("Manufacturer", ""),
                "dedupe_hash": _compute_hash(recall_number or f"{make}_{year}_{recall.get('Model', '')}"),
            })

    logger.info("NHTSA recalls '%s': %d recalls (%d-%d)", make, len(results), model_year_start, current_year)
    return results


def fetch_complaints(make: str, model_year_start: int = 2015) -> List[Dict[str, Any]]:
    """
    Fetch NHTSA vehicle complaint records for a given make.
    Loops from model_year_start through the current year.

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

    for year in range(model_year_start, current_year + 1):
        url = f"{NHTSA_BASE}/complaints/complaintsByVehicle"
        params = {"make": make, "modelYear": year}

        try:
            time.sleep(POLITE_DELAY)
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                logger.info("NHTSA complaints for '%s' year %d: no results", make, year)
                continue
            logger.error("NHTSA complaints fetch failed for '%s' year %d: %s", make, year, e)
            continue
        except Exception as e:
            logger.error("NHTSA complaints fetch failed for '%s' year %d: %s", make, year, e)
            continue

        complaints_raw = data.get("results", [])
        for complaint in complaints_raw:
            odi_number = str(complaint.get("odiNumber", ""))
            results.append({
                "odi_number": odi_number,
                "make": complaint.get("make", make),
                "model": complaint.get("model", ""),
                "model_year": year,
                "date_of_complaint": complaint.get("dateOfComplaint"),
                "crash": complaint.get("crash", "N") == "Y",
                "fire": complaint.get("fire", "N") == "Y",
                "injuries": int(complaint.get("numberOfInjuries", 0) or 0),
                "deaths": int(complaint.get("numberOfDeaths", 0) or 0),
                "component": complaint.get("components", ""),
                "summary": (complaint.get("summary", "") or "")[:2000],
                "dedupe_hash": _compute_hash(odi_number or f"{make}_{year}_{complaint.get('model', '')}_{complaint.get('dateOfComplaint', '')}"),
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
    from utils.logging import setup_logging
    setup_logging()

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
