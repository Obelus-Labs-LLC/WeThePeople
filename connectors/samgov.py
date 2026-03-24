"""
SAM.gov Connector — System for Award Management

Provides access to two SAM.gov APIs:
1. Exclusions API — debarred/suspended federal contractors
2. Entity Management API — contractor registrations, NAICS, parent/subsidiary

API docs: https://open.gsa.gov/api/exclusions-api/
          https://open.gsa.gov/api/entity-api/
Rate limit: 10 requests/day (personal key), 1,000/day (system account)
Auth: API key as query parameter ?api_key=KEY

The Exclusions API is a free replacement for OpenSanctions ($0.10/call)
for U.S. federal procurement exclusion data.
"""

import hashlib
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SAM_GOV_BASE = "https://api.sam.gov"
EXCLUSIONS_ENDPOINT = "/entity-information/v4/exclusions"
ENTITY_ENDPOINT = "/entity-information/v3/entities"
POLITE_DELAY = 1.0


def _get_api_key() -> str:
    """Get SAM.gov API key from environment."""
    key = os.getenv("SAM_GOV_API_KEY", "")
    if not key:
        logger.error("SAM_GOV_API_KEY not set in environment")
    return key


def _compute_hash(*parts: str) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()


def _parse_date(val: Optional[str]) -> Optional[str]:
    """Parse SAM.gov date strings into ISO format."""
    if not val:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(val.strip(), fmt).date().isoformat()
        except (ValueError, AttributeError):
            continue
    return val


def fetch_exclusions(
    entity_name: str,
    api_key: str = "",
) -> List[Dict[str, Any]]:
    """Fetch SAM.gov exclusions (debarred/suspended entities) matching a name.

    Returns list of exclusion records with dedupe_hash.
    """
    api_key = api_key or _get_api_key()
    if not api_key:
        return []

    url = f"{SAM_GOV_BASE}{EXCLUSIONS_ENDPOINT}"
    params = {
        "api_key": api_key,
        "q": entity_name,
        "classification": "Firm",
        "isActive": "Yes",
    }

    results = []
    seen_hashes = set()

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 429:
            logger.warning("SAM.gov rate limit reached for exclusions search: %s", entity_name)
        else:
            logger.error("SAM.gov exclusions fetch failed for '%s': %s", entity_name, e)
        return []
    except Exception as e:
        logger.error("SAM.gov exclusions fetch failed for '%s': %s", entity_name, e)
        return []

    records = data.get("excludedEntity", [])
    if not isinstance(records, list):
        records = [records] if records else []

    for item in records:
        exclusion_details = item.get("exclusionDetails", {})
        exclusion_id = item.get("exclusionIdentification", {})
        exclusion_actions = item.get("exclusionActions", {})
        actions_list = exclusion_actions.get("listOfActions", [])

        ent_name = exclusion_id.get("entityName", "") or ""
        sam_number = exclusion_id.get("ueiSAM", "") or exclusion_id.get("cageCode", "") or ""
        exclusion_type = exclusion_details.get("exclusionType", "")
        excluding_agency = exclusion_details.get("excludingAgencyName", "")

        activation_date = None
        termination_date = None
        if actions_list:
            action = actions_list[0] if isinstance(actions_list, list) else actions_list
            activation_date = _parse_date(action.get("activateDate"))
            termination_date = _parse_date(action.get("terminationDate"))

        description = exclusion_details.get("exclusionProgram", "")
        classification = exclusion_details.get("classificationType", "")

        h = _compute_hash(ent_name, exclusion_type, excluding_agency, activation_date or "")
        if h in seen_hashes:
            continue
        seen_hashes.add(h)

        address = item.get("exclusionPrimaryAddress", {})
        other_info = item.get("exclusionOtherInformation", {})

        results.append({
            "sam_number": sam_number,
            "entity_name": ent_name,
            "exclusion_type": exclusion_type,
            "exclusion_program": description,
            "excluding_agency": excluding_agency,
            "activation_date": activation_date,
            "termination_date": termination_date,
            "description": other_info.get("additionalComments", ""),
            "classification": classification,
            "city": address.get("city", ""),
            "state": address.get("stateOrProvinceCode", ""),
            "dedupe_hash": h,
        })

    logger.info("SAM.gov exclusions '%s': %d records", entity_name, len(results))
    return results


def fetch_entity(
    name: str,
    api_key: str = "",
) -> List[Dict[str, Any]]:
    """Fetch SAM.gov entity registration data (UEI, CAGE, NAICS, parent company).

    Returns list of entity records with dedupe_hash.
    """
    api_key = api_key or _get_api_key()
    if not api_key:
        return []

    url = f"{SAM_GOV_BASE}{ENTITY_ENDPOINT}"
    params = {
        "api_key": api_key,
        "q": name,
        "registrationStatus": "A",
        "includeSections": "entityRegistration,coreData",
    }

    results = []
    seen_hashes = set()

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 429:
            logger.warning("SAM.gov rate limit reached for entity search: %s", name)
        else:
            logger.error("SAM.gov entity fetch failed for '%s': %s", name, e)
        return []
    except Exception as e:
        logger.error("SAM.gov entity fetch failed for '%s': %s", name, e)
        return []

    entities = data.get("entityData", [])
    if not isinstance(entities, list):
        entities = [entities] if entities else []

    for entity in entities:
        reg = entity.get("entityRegistration", {})
        core = entity.get("coreData", {})
        hierarchy = core.get("entityHierarchyInformation", {})
        parent_info = hierarchy.get("immediateParentEntity", {})
        ultimate_parent = hierarchy.get("ultimateParentEntity", {})

        uei = reg.get("ueiSAM", "")
        cage = reg.get("cageCode", "")
        legal_name = reg.get("legalBusinessName", "")
        dba = reg.get("dbaName", "")

        naics_list = []
        naics_data = core.get("naicsCode", [])
        if isinstance(naics_data, list):
            for n in naics_data:
                if isinstance(n, dict):
                    naics_list.append(n.get("naicsCode", ""))
                else:
                    naics_list.append(str(n))

        parent_uei = parent_info.get("ueiSAM", "") or ultimate_parent.get("ueiSAM", "")
        parent_name = parent_info.get("legalBusinessName", "") or ultimate_parent.get("legalBusinessName", "")

        address = core.get("physicalAddress", {})
        address_str = ", ".join(filter(None, [
            address.get("addressLine1", ""),
            address.get("city", ""),
            address.get("stateOrProvinceCode", ""),
            address.get("countryCode", ""),
        ]))

        h = _compute_hash(uei, legal_name)
        if h in seen_hashes:
            continue
        seen_hashes.add(h)

        results.append({
            "uei": uei,
            "cage_code": cage,
            "legal_business_name": legal_name,
            "dba_name": dba,
            "physical_address": address_str,
            "naics_codes": naics_list,
            "parent_uei": parent_uei,
            "parent_name": parent_name,
            "registration_status": reg.get("registrationStatus", ""),
            "registration_date": _parse_date(reg.get("registrationDate")),
            "exclusion_status_flag": reg.get("exclusionStatusFlag", ""),
            "dedupe_hash": h,
        })

    logger.info("SAM.gov entity '%s': %d records", name, len(results))
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    print("=== Testing SAM.gov Connector ===\n")

    key = _get_api_key()
    if not key:
        print("Set SAM_GOV_API_KEY to test")
    else:
        print("--- Exclusions: Lockheed Martin ---")
        excl = fetch_exclusions("Lockheed Martin", key)
        for e in excl[:3]:
            print(f"  {e['entity_name']} | {e['exclusion_type']} | {e['excluding_agency']}")

        print("\n--- Entity: Lockheed Martin ---")
        ents = fetch_entity("Lockheed Martin", key)
        for e in ents[:3]:
            print(f"  {e['legal_business_name']} | UEI: {e['uei']} | Parent: {e['parent_name']}")
