"""
USAJobs Connector — Federal Job Listings

Search federal job listings from data.usajobs.gov.

API docs: https://developer.usajobs.gov/API-Reference
Auth: Email + Authorization-Key header (free registration at developer.usajobs.gov)
"""

import os
import requests
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

USAJOBS_BASE = "https://data.usajobs.gov/api/Search"
TIMEOUT = 15


def search_jobs(
    keyword: str = "",
    agency: Optional[str] = None,
    min_salary: Optional[int] = None,
    location: Optional[str] = None,
    limit: int = 25,
) -> Dict[str, Any]:
    """
    Search USAJobs for federal job listings.

    Args:
        keyword: Job title or keyword search
        agency: Agency subelement code
        min_salary: Minimum salary filter
        location: City or state
        limit: Max results (1-100)

    Returns:
        Dict with 'total' and 'jobs' list

    Raises:
        ValueError: If USAJobs API key is not configured
    """
    email = os.environ.get("USAJOBS_EMAIL", "wethepeopleforus@gmail.com")
    api_key = os.environ.get("USAJOBS_API_KEY", "")

    if not api_key:
        raise ValueError("USAJobs API key not configured. Register free at developer.usajobs.gov")

    params: Dict[str, Any] = {"ResultsPerPage": min(limit, 100)}
    if keyword.strip():
        params["Keyword"] = keyword.strip()
    if agency:
        params["Organization"] = agency
    if min_salary:
        params["RemunerationMinimumAmount"] = min_salary
    if location:
        params["LocationName"] = location.strip()

    headers = {
        "User-Agent": email,
        "Authorization-Key": api_key,
        "Host": "data.usajobs.gov",
    }

    try:
        resp = requests.get(USAJOBS_BASE, params=params, headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            return {"total": 0, "jobs": []}
        logger.warning("USAJobs error: %s", e)
        return {"total": 0, "jobs": [], "error": str(e)}
    except Exception as e:
        logger.warning("USAJobs request error: %s", e)
        return {"total": 0, "jobs": [], "error": str(e)}

    search_result = data.get("SearchResult", {})
    total = int(search_result.get("SearchResultCountAll", 0))
    items = search_result.get("SearchResultItems", [])

    jobs = []
    for item in items:
        matched = item.get("MatchedObjectDescriptor", {})
        pos_loc = matched.get("PositionLocation", [{}])
        loc_name = pos_loc[0].get("LocationName", "") if pos_loc else ""

        remun = matched.get("PositionRemuneration", [{}])
        salary_min = ""
        salary_max = ""
        if remun:
            salary_min = remun[0].get("MinimumRange", "")
            salary_max = remun[0].get("MaximumRange", "")

        schedule = matched.get("PositionSchedule", [{}])
        schedule_type = schedule[0].get("Name", "") if schedule else ""

        jobs.append({
            "position_title": matched.get("PositionTitle", ""),
            "organization_name": matched.get("OrganizationName", ""),
            "department_name": matched.get("DepartmentName", ""),
            "salary_min": salary_min,
            "salary_max": salary_max,
            "location": loc_name,
            "grade": matched.get("JobGrade", [{}])[0].get("Code", "") if matched.get("JobGrade") else "",
            "schedule_type": schedule_type,
            "start_date": matched.get("PublicationStartDate", ""),
            "end_date": matched.get("ApplicationCloseDate", ""),
            "url": matched.get("PositionURI", ""),
        })

    return {"total": total, "jobs": jobs}
