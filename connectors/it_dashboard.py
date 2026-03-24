"""
IT Dashboard Connector — Federal IT Investment Data

Downloads bulk CSV data from itdashboard.gov for:
- CIO ratings of major IT investments (1-5 scale, Red/Yellow/Green)
- Investment summaries with spending, schedule/cost variance
- Vendor/contractor information

Data source: https://www.itdashboard.gov/data-feeds
Rate limit: None (CSV downloads)
Auth: None required for CSV downloads

Key use case: cross-referencing CIO risk ratings with lobbying spend
and contractor donations to detect "lobby then win (then fail)" patterns.
"""

import csv
import hashlib
import io
import logging
import time
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

IT_DASHBOARD_BASE = "https://www.itdashboard.gov"
CIO_RATINGS_URL = f"{IT_DASHBOARD_BASE}/ogpvp_download/csv/agency_analysis/agency-analysis-cio"
COST_VARIANCE_URL = f"{IT_DASHBOARD_BASE}/ogpvp_download/csv/agency_analysis/agency-analysis-cost-variance"
POLITE_DELAY = 1.0


def _compute_hash(*parts: str) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()


def _safe_float(val: Any) -> Optional[float]:
    if val is None or val == "" or val == "N/A":
        return None
    try:
        cleaned = str(val).replace(",", "").replace("$", "").replace("%", "").strip()
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _safe_int(val: Any) -> Optional[int]:
    if val is None or val == "" or val == "N/A":
        return None
    try:
        return int(float(str(val).replace(",", "").strip()))
    except (ValueError, TypeError):
        return None


def _download_csv(url: str) -> List[Dict[str, str]]:
    """Download a CSV from IT Dashboard and return list of row dicts."""
    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        text = resp.text
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        logger.info("IT Dashboard CSV %s: %d rows", url.split("/")[-1], len(rows))
        return rows
    except Exception as e:
        logger.error("IT Dashboard CSV download failed (%s): %s", url, e)
        return []


def fetch_cio_ratings() -> List[Dict[str, Any]]:
    """Fetch CIO evaluation ratings for all major IT investments.

    Returns list of dicts with investment details and CIO risk ratings.
    """
    rows = _download_csv(CIO_RATINGS_URL)
    results = []
    seen_hashes = set()

    for row in rows:
        agency_code = row.get("Agency Code", "").strip()
        agency_name = row.get("Agency Name", "").strip()
        investment_title = row.get("Investment Title", "").strip()
        uii = row.get("Unique Investment Identifier", row.get("UII", "")).strip()
        cio_rating = _safe_int(row.get("CIO Rating", row.get("Overall CIO Rating", "")))

        if not uii and not investment_title:
            continue

        total_spending = _safe_float(row.get("Total IT Spending (PY+CY+BY)", row.get("Total IT Spending", "")))
        lifecycle_cost = _safe_float(row.get("Lifecycle Cost", ""))
        schedule_var = _safe_float(row.get("Schedule Variance (%)", row.get("Schedule Variance", "")))
        cost_var = _safe_float(row.get("Cost Variance (%)", row.get("Cost Variance", "")))

        h = _compute_hash(uii or investment_title, agency_code)
        if h in seen_hashes:
            continue
        seen_hashes.add(h)

        results.append({
            "agency_code": agency_code,
            "agency_name": agency_name,
            "investment_title": investment_title,
            "unique_investment_id": uii,
            "cio_rating": cio_rating,
            "total_it_spending": total_spending,
            "lifecycle_cost": lifecycle_cost,
            "schedule_variance": schedule_var,
            "cost_variance": cost_var,
            "dedupe_hash": h,
        })

    logger.info("IT Dashboard CIO ratings: %d investments parsed", len(results))
    return results


def fetch_cost_variance() -> List[Dict[str, Any]]:
    """Fetch cost variance data for IT investments."""
    rows = _download_csv(COST_VARIANCE_URL)
    results = []
    seen_hashes = set()

    for row in rows:
        agency_code = row.get("Agency Code", "").strip()
        agency_name = row.get("Agency Name", "").strip()
        investment_title = row.get("Investment Title", "").strip()
        uii = row.get("Unique Investment Identifier", row.get("UII", "")).strip()

        if not uii and not investment_title:
            continue

        planned_cost = _safe_float(row.get("Planned Cost", ""))
        projected_cost = _safe_float(row.get("Projected Cost", ""))
        cost_var = _safe_float(row.get("Cost Variance (%)", row.get("Cost Variance", "")))

        h = _compute_hash(uii or investment_title, agency_code, "cost_variance")
        if h in seen_hashes:
            continue
        seen_hashes.add(h)

        results.append({
            "agency_code": agency_code,
            "agency_name": agency_name,
            "investment_title": investment_title,
            "unique_investment_id": uii,
            "planned_cost": planned_cost,
            "projected_cost": projected_cost,
            "cost_variance": cost_var,
            "dedupe_hash": h,
        })

    logger.info("IT Dashboard cost variance: %d investments parsed", len(results))
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    print("=== Testing IT Dashboard Connector ===\n")

    print("--- CIO Ratings ---")
    ratings = fetch_cio_ratings()
    for r in ratings[:5]:
        print(f"  {r['agency_name'][:30]} | {r['investment_title'][:40]} | CIO: {r['cio_rating']} | ${r['total_it_spending']}")

    print(f"\nTotal investments with CIO ratings: {len(ratings)}")
    red = sum(1 for r in ratings if r["cio_rating"] and r["cio_rating"] <= 2)
    print(f"RED-rated (high risk): {red}")
