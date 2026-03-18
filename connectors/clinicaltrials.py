"""
ClinicalTrials.gov Connector — Clinical Trial Search (v2 API)

Search clinical trials by sponsor organization.

API docs: https://clinicaltrials.gov/data-api/api
Rate limit: 100 requests/min
Auth: None required (free public API)
"""

import hashlib
import time
import requests
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

CT_BASE = "https://clinicaltrials.gov/api/v2/studies"

POLITE_DELAY = 0.6  # ~100 req/min


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _parse_study(study: Dict[str, Any]) -> Dict[str, Any]:
    """Parse a single study record into our standard format."""
    protocol = study.get("protocolSection", {})
    id_module = protocol.get("identificationModule", {})
    status_module = protocol.get("statusModule", {})
    design_module = protocol.get("designModule", {})
    conditions_module = protocol.get("conditionsModule", {})
    interventions_module = protocol.get("armsInterventionsModule", {})

    nct_id = id_module.get("nctId", "")
    title = id_module.get("briefTitle", "")

    # Status
    overall_status = status_module.get("overallStatus")

    # Start date — can be a struct or string
    start_date_info = status_module.get("startDateStruct", {})
    start_date = start_date_info.get("date") if isinstance(start_date_info, dict) else None

    # Phase
    phases = design_module.get("phases", [])
    phase = ", ".join(phases) if phases else None

    # Conditions
    conditions_list = conditions_module.get("conditions", [])
    conditions = ", ".join(conditions_list[:5]) if conditions_list else None

    # Interventions
    interventions_list = interventions_module.get("interventions", [])
    intervention_names = []
    for interv in interventions_list:
        name = interv.get("name") if isinstance(interv, dict) else str(interv)
        if name:
            intervention_names.append(name)
    interventions = ", ".join(intervention_names[:5]) if intervention_names else None

    # Enrollment
    enrollment_info = design_module.get("enrollmentInfo", {})
    enrollment = enrollment_info.get("count") if isinstance(enrollment_info, dict) else None

    return {
        "nct_id": nct_id,
        "title": title,
        "overall_status": overall_status,
        "phase": phase,
        "start_date": start_date,
        "conditions": conditions,
        "interventions": interventions,
        "enrollment": enrollment,
        "dedupe_hash": _compute_hash(nct_id),
    }


def fetch_trials(
    sponsor_name: str,
    limit: int = 10000,
) -> List[Dict[str, Any]]:
    """
    Search clinical trials by sponsor organization name.
    Paginates via pageToken until all results are fetched or limit reached.

    Args:
        sponsor_name: Lead sponsor name (e.g. 'Pfizer', 'Johnson & Johnson')
        limit: Max trials to return

    Returns:
        List of trial dicts with keys: nct_id, title, overall_status,
        phase, start_date, conditions, interventions, enrollment,
        dedupe_hash
    """
    page_size = 1000  # CT.gov v2 max page size
    results = []
    page_token = None

    while len(results) < limit:
        params = {
            "query.spons": sponsor_name,
            "pageSize": page_size,
            "sort": "LastUpdatePostDate:desc",
            "fields": ",".join([
                "NCTId",
                "BriefTitle",
                "OverallStatus",
                "Phase",
                "StartDate",
                "Condition",
                "InterventionName",
                "EnrollmentCount",
            ]),
        }
        if page_token:
            params["pageToken"] = page_token

        try:
            time.sleep(POLITE_DELAY)
            resp = requests.get(CT_BASE, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error("ClinicalTrials.gov fetch failed for '%s': %s", sponsor_name, e)
            break

        studies = data.get("studies", [])
        if not studies:
            break

        for study in studies:
            results.append(_parse_study(study))

        # Check for next page
        page_token = data.get("nextPageToken")
        if not page_token:
            break

    logger.info(
        "ClinicalTrials.gov '%s': %d trials",
        sponsor_name, len(results),
    )
    return results[:limit]
