"""
FuelEconomy.gov Connector — EPA/DOE Fuel Economy Data

Fetch vehicle fuel economy, emissions, and efficiency data.

API docs: https://www.fueleconomy.gov/feg/ws/index.shtml
Rate limit: No published limit (use polite delays)
Auth: None required (free public API)
"""

import hashlib
import time
import requests
from typing import List, Dict, Any, Optional

from utils.logging import get_logger

logger = get_logger(__name__)

FUELECONOMY_BASE = "https://www.fueleconomy.gov/ws/rest"

POLITE_DELAY = 0.3

HEADERS = {
    "Accept": "application/json",
}


def _compute_hash(*parts: str) -> str:
    """SHA-256 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode()).hexdigest()


def _safe_int(val) -> Optional[int]:
    """Safely convert to int, returning None on failure."""
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_float(val) -> Optional[float]:
    """Safely convert to float, returning None on failure."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def fetch_vehicles_by_make(make: str, year_start: int = 2015) -> List[Dict[str, Any]]:
    """
    Fetch all vehicle records for a make from FuelEconomy.gov.

    Steps:
        1. Get available years
        2. For each year >= year_start, get models for the make
        3. For each model, get option IDs
        4. For each option, get full vehicle details

    Args:
        make: Vehicle make name (e.g. 'Ford', 'Toyota', 'Honda')
        year_start: Earliest year to query (default 2015)

    Returns:
        List of vehicle dicts with keys: vehicle_id, year, make, model,
        mpg_city, mpg_highway, mpg_combined, co2_tailpipe, fuel_type,
        vehicle_class, ghg_score, smog_rating, dedupe_hash
    """
    results = []

    # Step 1: Get all available years
    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(f"{FUELECONOMY_BASE}/vehicle/menu/year", headers=HEADERS, timeout=30)
        resp.raise_for_status()
        year_data = resp.json()
    except Exception as e:
        logger.error("FuelEconomy year menu fetch failed: %s", e)
        return []

    # Parse years — API returns {"menuItem": [{"value": "2025"}, ...]} or single item
    year_items = year_data.get("menuItem", [])
    if isinstance(year_items, dict):
        year_items = [year_items]

    years = []
    for item in year_items:
        try:
            y = int(item.get("value", 0))
            if y >= year_start:
                years.append(y)
        except (ValueError, TypeError):
            continue

    logger.info("FuelEconomy years for '%s': filtering %d years >= %d", make, len(years), year_start)

    # Step 2: For each year, get models
    for year in sorted(years):
        try:
            time.sleep(POLITE_DELAY)
            resp = requests.get(
                f"{FUELECONOMY_BASE}/vehicle/menu/model",
                params={"year": year, "make": make},
                headers=HEADERS, timeout=30,
            )
            resp.raise_for_status()
            model_data = resp.json()
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                logger.info("FuelEconomy models for '%s' %d: no results", make, year)
                continue
            logger.error("FuelEconomy model menu fetch failed for '%s' %d: %s", make, year, e)
            continue
        except Exception as e:
            logger.error("FuelEconomy model menu fetch failed for '%s' %d: %s", make, year, e)
            continue

        model_items = model_data.get("menuItem", [])
        if isinstance(model_items, dict):
            model_items = [model_items]

        # Step 3: For each model, get options (vehicle IDs)
        for model_item in model_items:
            model_name = model_item.get("value", "")
            if not model_name:
                continue

            try:
                time.sleep(POLITE_DELAY)
                resp = requests.get(
                    f"{FUELECONOMY_BASE}/vehicle/menu/options",
                    params={"year": year, "make": make, "model": model_name},
                    headers=HEADERS, timeout=30,
                )
                resp.raise_for_status()
                option_data = resp.json()
            except Exception as e:
                logger.error("FuelEconomy options fetch failed for '%s' %s %d: %s", make, model_name, year, e)
                continue

            option_items = option_data.get("menuItem", [])
            if isinstance(option_items, dict):
                option_items = [option_items]

            # Step 4: For each option, get full vehicle details
            for option in option_items:
                vehicle_id = option.get("value", "")
                if not vehicle_id:
                    continue

                try:
                    time.sleep(POLITE_DELAY)
                    resp = requests.get(
                        f"{FUELECONOMY_BASE}/vehicle/{vehicle_id}",
                        headers=HEADERS, timeout=30,
                    )
                    resp.raise_for_status()
                    vehicle = resp.json()
                except Exception as e:
                    logger.error("FuelEconomy vehicle detail fetch failed for ID %s: %s", vehicle_id, e)
                    continue

                results.append({
                    "vehicle_id": str(vehicle_id),
                    "year": _safe_int(vehicle.get("year")) or year,
                    "make": vehicle.get("make", make),
                    "model": vehicle.get("model", model_name),
                    "mpg_city": _safe_float(vehicle.get("city08")),
                    "mpg_highway": _safe_float(vehicle.get("highway08")),
                    "mpg_combined": _safe_float(vehicle.get("comb08")),
                    "co2_tailpipe": _safe_float(vehicle.get("co2TailpipeGpm")),
                    "fuel_type": vehicle.get("fuelType"),
                    "vehicle_class": vehicle.get("VClass"),
                    "ghg_score": _safe_int(vehicle.get("ghgScore")),
                    "smog_rating": _safe_int(vehicle.get("smogRating")),
                    "dedupe_hash": _compute_hash(str(vehicle_id)),
                })

    logger.info("FuelEconomy vehicles '%s': %d vehicles (%d+)", make, len(results), year_start)
    return results


def fetch_emissions_by_make(make: str, year: int) -> List[Dict[str, Any]]:
    """
    Fetch emission records for a make and year.
    Gets vehicle IDs first, then fetches emissions for each.

    Args:
        make: Vehicle make name
        year: Model year to query

    Returns:
        List of emission dicts
    """
    results = []

    # Get models for this make/year
    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(
            f"{FUELECONOMY_BASE}/vehicle/menu/model",
            params={"year": year, "make": make},
            headers=HEADERS, timeout=30,
        )
        resp.raise_for_status()
        model_data = resp.json()
    except Exception as e:
        logger.error("FuelEconomy emissions model menu fetch failed for '%s' %d: %s", make, year, e)
        return []

    model_items = model_data.get("menuItem", [])
    if isinstance(model_items, dict):
        model_items = [model_items]

    for model_item in model_items:
        model_name = model_item.get("value", "")
        if not model_name:
            continue

        # Get option IDs
        try:
            time.sleep(POLITE_DELAY)
            resp = requests.get(
                f"{FUELECONOMY_BASE}/vehicle/menu/options",
                params={"year": year, "make": make, "model": model_name},
                headers=HEADERS, timeout=30,
            )
            resp.raise_for_status()
            option_data = resp.json()
        except Exception as e:
            logger.error("FuelEconomy emissions options fetch failed for '%s' %s %d: %s", make, model_name, year, e)
            continue

        option_items = option_data.get("menuItem", [])
        if isinstance(option_items, dict):
            option_items = [option_items]

        for option in option_items:
            vehicle_id = option.get("value", "")
            if not vehicle_id:
                continue

            # Fetch emissions for this vehicle
            try:
                time.sleep(POLITE_DELAY)
                resp = requests.get(
                    f"{FUELECONOMY_BASE}/vehicle/emissions/{vehicle_id}",
                    headers=HEADERS, timeout=30,
                )
                resp.raise_for_status()
                emissions_data = resp.json()
            except Exception as e:
                logger.error("FuelEconomy emissions fetch failed for vehicle %s: %s", vehicle_id, e)
                continue

            # Emissions response can be a list or single object
            emissions_list = emissions_data if isinstance(emissions_data, list) else [emissions_data]
            for emission in emissions_list:
                if not isinstance(emission, dict):
                    continue
                results.append({
                    "vehicle_id": str(vehicle_id),
                    "make": make,
                    "model": model_name,
                    "year": year,
                    "emission_score": _safe_float(emission.get("score")),
                    "emission_standard": emission.get("standard"),
                    "emission_standard_text": emission.get("stdText"),
                })

    logger.info("FuelEconomy emissions '%s' %d: %d records", make, year, len(results))
    return results


if __name__ == "__main__":
    from utils.logging import setup_logging
    setup_logging()

    print("=== Testing FuelEconomy.gov Connector ===\n")

    # Test vehicles
    print("--- Vehicles for Ford (2024 only) ---")
    vehicles = fetch_vehicles_by_make("Ford", year_start=2024)
    for v in vehicles[:5]:
        print(f"  {v['year']} {v['make']} {v['model']}: {v['mpg_combined']} MPG combined, CO2={v['co2_tailpipe']} g/mi")
    print(f"  Total: {len(vehicles)} vehicles\n")

    # Test emissions
    print("--- Emissions for Toyota 2024 ---")
    emissions = fetch_emissions_by_make("Toyota", 2024)
    for e in emissions[:3]:
        print(f"  {e['model']}: score={e['emission_score']}, standard={e['emission_standard']}")
    print(f"  Total: {len(emissions)} records")
