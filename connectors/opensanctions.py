"""
OpenSanctions Connector

Search the OpenSanctions API for sanctioned entities and politically exposed persons (PEPs).

Source: https://api.opensanctions.org/
Auth: API key required (set OPENSANCTIONS_API_KEY in .env, free trial at opensanctions.org)
"""

import hashlib
import os
import time
import requests
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

API_BASE = "https://api.opensanctions.org"
API_KEY = os.getenv("OPENSANCTIONS_API_KEY", "")
POLITE_DELAY = 1.0  # Be respectful of rate limits


def _compute_hash(*parts: str) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def search_entity(
    name: str,
    schema: str = "LegalEntity",
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Search OpenSanctions for an entity by name.

    Args:
        name: Entity name (person or company)
        schema: OpenSanctions schema type — 'LegalEntity' for companies,
                'Person' for individuals
        limit: Max results

    Returns:
        List of match dicts with: id, caption, schema, datasets,
        properties, score, match_status
    """
    url = f"{API_BASE}/search/default"
    params = {
        "q": name,
        "schema": schema,
        "limit": limit,
    }

    try:
        time.sleep(POLITE_DELAY)
        headers = {
            "User-Agent": "WeThePeople/1.0 (Civic transparency platform)",
            "Accept": "application/json",
        }
        if API_KEY:
            headers["Authorization"] = f"ApiKey {API_KEY}"
        resp = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])

        matches = []
        for r in results:
            score = r.get("score", 0)
            # Only consider matches with reasonable confidence
            if score < 0.5:
                continue

            datasets = r.get("datasets", [])
            properties = r.get("properties", {})

            # Determine status based on datasets
            is_sanctioned = any(
                d in datasets for d in [
                    "us_ofac_sdn", "us_ofac_cons", "eu_fsf",
                    "un_sc_sanctions", "gb_hmt_sanctions",
                    "us_bis_denied", "us_trade_csl",
                ]
            )
            is_pep = any(
                "pep" in d.lower() or "politically" in d.lower()
                for d in datasets
            )

            status = "sanctioned" if is_sanctioned else "pep" if is_pep else "listed"

            matches.append({
                "opensanctions_id": r.get("id"),
                "caption": r.get("caption"),
                "schema": r.get("schema"),
                "score": score,
                "status": status,
                "datasets": datasets,
                "countries": properties.get("country", []),
                "aliases": properties.get("alias", []),
                "topics": r.get("topics", []),
                "first_seen": r.get("first_seen"),
                "last_seen": r.get("last_seen"),
                "url": f"https://www.opensanctions.org/entities/{r.get('id')}/",
                "dedupe_hash": _compute_hash(name, r.get("id", "")),
            })

        return matches

    except requests.exceptions.RequestException as e:
        logger.error("OpenSanctions search failed for '%s': %s", name, e)
        return []


def check_entity(
    name: str,
    entity_type: str = "company",
) -> Dict[str, Any]:
    """
    Check a single entity and return its sanctions status.

    Args:
        name: Entity name
        entity_type: 'company' or 'person'

    Returns:
        Dict with: status ('sanctioned', 'pep', 'listed', 'clear'),
        best_match (dict or None), all_matches (list)
    """
    schema = "Person" if entity_type == "person" else "LegalEntity"
    matches = search_entity(name, schema=schema, limit=5)

    if not matches:
        return {
            "status": "clear",
            "best_match": None,
            "all_matches": [],
        }

    # Sort by score descending
    matches.sort(key=lambda m: m["score"], reverse=True)
    best = matches[0]

    # Only flag if the best match has a strong score
    if best["score"] < 0.7:
        return {
            "status": "clear",
            "best_match": None,
            "all_matches": matches,
        }

    return {
        "status": best["status"],
        "best_match": best,
        "all_matches": matches,
    }
