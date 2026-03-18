"""
OpenFDA Connector — Adverse Events & Recalls

Fetch drug adverse event reports and product recalls from FDA.

API docs: https://open.fda.gov/apis/
Rate limit: 240 requests/min without API key, 120k/day with key
Auth: Optional API key (env var OPENFDA_API_KEY) for higher limits
"""

import hashlib
import json
import os
import time
import requests
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

OPENFDA_BASE = "https://api.fda.gov"
API_KEY = os.environ.get("OPENFDA_API_KEY", "")

POLITE_DELAY = 0.5


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _build_params(limit: int) -> Dict[str, Any]:
    """Build base params, including API key if available."""
    params: Dict[str, Any] = {"limit": limit}
    if API_KEY:
        params["api_key"] = API_KEY
    return params


def fetch_adverse_events(
    manufacturer_name: str,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Fetch drug adverse event reports for a manufacturer from openFDA.

    Args:
        manufacturer_name: Manufacturer/company name (e.g. 'Pfizer')
        limit: Max events to return (capped at 100 per openFDA rules)

    Returns:
        List of event dicts with keys: report_id, receive_date, serious,
        drug_name, reaction, outcome, raw_json, dedupe_hash
    """
    # openFDA search syntax — quote the manufacturer name
    search = f'patient.drug.openfda.manufacturer_name:"{manufacturer_name}"'
    params = _build_params(min(limit, 100))
    params["search"] = search

    url = f"{OPENFDA_BASE}/drug/event.json"

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            logger.info("OpenFDA adverse events for '%s': no results", manufacturer_name)
            return []
        logger.error("OpenFDA adverse events fetch failed for '%s': %s", manufacturer_name, e)
        return []
    except Exception as e:
        logger.error("OpenFDA adverse events fetch failed for '%s': %s", manufacturer_name, e)
        return []

    results_raw = data.get("results", [])
    results = []

    for event in results_raw:
        # Safety report ID
        report_id = event.get("safetyreportid", "")
        receive_date = event.get("receivedate")  # YYYYMMDD format

        # Seriousness
        serious = event.get("serious", "0") == "1"

        # Drug names
        drugs = event.get("patient", {}).get("drug", [])
        drug_names = []
        for drug in drugs:
            name = drug.get("medicinalproduct")
            if name:
                drug_names.append(name)
        drug_name = ", ".join(drug_names[:5]) if drug_names else None

        # Reactions
        reactions = event.get("patient", {}).get("reaction", [])
        reaction_terms = []
        for rxn in reactions:
            term = rxn.get("reactionmeddrapt")
            if term:
                reaction_terms.append(term)
        reaction = ", ".join(reaction_terms[:5]) if reaction_terms else None

        # Outcome
        outcome = event.get("patient", {}).get("patientonsetage")

        results.append({
            "report_id": report_id,
            "receive_date": receive_date,
            "serious": serious,
            "drug_name": drug_name,
            "reaction": reaction,
            "outcome": outcome,
            "raw_json": json.dumps(event)[:2000],
            "dedupe_hash": _compute_hash(report_id),
        })

    logger.info(
        "OpenFDA adverse events '%s': %d events",
        manufacturer_name, len(results),
    )
    return results


def fetch_recalls(
    firm_name: str,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Fetch FDA enforcement/recall actions for a firm from openFDA.

    Args:
        firm_name: Firm name to search (e.g. 'Pfizer')
        limit: Max recalls to return (capped at 100)

    Returns:
        List of recall dicts with keys: recall_number, classification,
        recall_initiation_date, product_description, reason_for_recall,
        status, raw_json, dedupe_hash
    """
    search = f'recalling_firm:"{firm_name}"'
    params = _build_params(min(limit, 100))
    params["search"] = search

    url = f"{OPENFDA_BASE}/drug/enforcement.json"

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            logger.info("OpenFDA recalls for '%s': no results", firm_name)
            return []
        logger.error("OpenFDA recalls fetch failed for '%s': %s", firm_name, e)
        return []
    except Exception as e:
        logger.error("OpenFDA recalls fetch failed for '%s': %s", firm_name, e)
        return []

    results_raw = data.get("results", [])
    results = []

    for recall in results_raw:
        recall_number = recall.get("recall_number", "")
        classification = recall.get("classification")
        initiation_date = recall.get("recall_initiation_date")  # YYYYMMDD
        product_desc = recall.get("product_description", "")[:500]
        reason = recall.get("reason_for_recall", "")[:500]
        status = recall.get("status")

        results.append({
            "recall_number": recall_number,
            "classification": classification,
            "recall_initiation_date": initiation_date,
            "product_description": product_desc,
            "reason_for_recall": reason,
            "status": status,
            "raw_json": json.dumps(recall)[:2000],
            "dedupe_hash": _compute_hash(recall_number or product_desc[:50]),
        })

    logger.info(
        "OpenFDA recalls '%s': %d recalls",
        firm_name, len(results),
    )
    return results
