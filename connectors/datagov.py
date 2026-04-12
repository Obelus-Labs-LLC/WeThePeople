"""
data.gov Connector — Federal Agency Data Framework

Umbrella connector for the 20+ federal agency APIs that accept
the data.gov API key. This is the framework for expanding
WeThePeople beyond pure legislative tracking into regulatory
accountability: EPA enforcement, FDA recalls, DOJ actions, etc.

Auth: data.gov API key (query param: api_key)
Rate limit: 1,000 requests/hour (shared across all agencies)

Supported sub-APIs:
- EPA ECHO (Enforcement & Compliance History Online)
- FDA openFDA (Drug/food recalls, adverse events)
- Regulations.gov (Federal rulemaking comments & dockets)
- NHTSA (Vehicle recalls, safety complaints)
"""

import time
from typing import Optional, List, Dict, Any

from utils.http_client import http_client, HTTPError
from utils.http_client import config
from utils.logging import get_logger, setup_logging

logger = get_logger(__name__)

# Polite delay between API calls (seconds)
POLITE_DELAY = 0.5


# ============================================================================
# BASE CLIENT — Generic data.gov API wrapper
# ============================================================================

class DataGovClient:
    """
    Base client for any data.gov-powered API.

    Wraps http_client.get_datagov() with agency-specific base URLs
    and sensible defaults.
    """

    def __init__(self, base_url: str, agency_name: str):
        self.base_url = base_url.rstrip("/")
        self.agency_name = agency_name

    def get(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        use_cache: bool = True,
    ) -> Dict[str, Any]:
        """
        Make a GET request to this agency's API.

        Args:
            endpoint: API endpoint path
            params: Query parameters (api_key added automatically)
            use_cache: Whether to cache the response

        Returns:
            JSON response as dict
        """
        try:
            return http_client.get_datagov(
                self.base_url, endpoint, params=params, use_cache=use_cache
            )
        except HTTPError as e:
            logger.error("%s API request failed (%s): %s", self.agency_name, endpoint, e)
            raise

    def get_paged(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        results_key: str = "results",
        per_page: int = 100,
        max_pages: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Fetch paginated results from an API endpoint.

        Args:
            endpoint: API endpoint path
            params: Base query parameters
            results_key: JSON key containing the results list
            per_page: Results per page
            max_pages: Max pages to fetch

        Returns:
            Combined list of result dicts
        """
        all_results = []
        params = dict(params or {})
        params["per_page"] = per_page

        for page in range(1, max_pages + 1):
            params["page"] = page

            try:
                data = self.get(endpoint, params=params)
            except HTTPError:
                break

            results = data.get(results_key, [])
            if not results:
                break

            all_results.extend(results)
            time.sleep(POLITE_DELAY)

        return all_results


# ============================================================================
# EPA — Environmental Protection Agency
# ============================================================================

# EPA ECHO (Enforcement & Compliance History)
EPA_ECHO_BASE = "https://echo.epa.gov/api"

# EPA ENVIROFACTS
EPA_ENVIROFACTS_BASE = "https://data.epa.gov/efservice"


def fetch_epa_enforcement_cases(
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    per_page: int = 25,
) -> List[Dict[str, Any]]:
    """
    Fetch EPA enforcement case data from ECHO.

    Args:
        state: Two-letter state code
        zip_code: ZIP code filter
        per_page: Results per page

    Returns:
        List of enforcement case dicts
    """
    params: Dict[str, Any] = {
        "output": "JSON",
        "p_act": "CWA,CAA,RCRA",  # Clean Water, Clean Air, RCRA
    }
    if state:
        params["p_st"] = state
    if zip_code:
        params["p_zip"] = zip_code

    try:
        # ECHO uses its own auth structure — may not need data.gov key
        data = http_client.get(
            f"{EPA_ECHO_BASE}/echo_rest_services.get_facility_info",
            params=params,
            use_cache=True,
        )
        results = data.get("Results", {}).get("Facilities", [])
        logger.info("EPA ECHO: %d facilities found", len(results))
        return results
    except HTTPError as e:
        logger.error("EPA ECHO request failed: %s", e)
        return []


# ============================================================================
# FDA — Food and Drug Administration (openFDA)
# ============================================================================

OPENFDA_BASE = "https://api.fda.gov"


def fetch_fda_drug_recalls(
    query: Optional[str] = None,
    limit: int = 25,
) -> List[Dict[str, Any]]:
    """
    Fetch FDA drug recall enforcement reports.

    Args:
        query: Search query (e.g., drug name, firm name)
        limit: Max results

    Returns:
        List of recall report dicts
    """
    params: Dict[str, Any] = {"limit": limit}
    if query:
        params["search"] = query

    try:
        # openFDA has its own API — doesn't use data.gov key
        data = http_client.get(
            f"{OPENFDA_BASE}/drug/enforcement.json",
            params=params,
            use_cache=True,
        )
        results = data.get("results", [])
        logger.info("FDA drug recalls: %d results", len(results))
        return results
    except HTTPError as e:
        logger.error("FDA drug recall request failed: %s", e)
        return []


def fetch_fda_food_recalls(
    query: Optional[str] = None,
    limit: int = 25,
) -> List[Dict[str, Any]]:
    """
    Fetch FDA food recall enforcement reports.

    Args:
        query: Search query
        limit: Max results

    Returns:
        List of food recall dicts
    """
    params: Dict[str, Any] = {"limit": limit}
    if query:
        params["search"] = query

    try:
        data = http_client.get(
            f"{OPENFDA_BASE}/food/enforcement.json",
            params=params,
            use_cache=True,
        )
        results = data.get("results", [])
        logger.info("FDA food recalls: %d results", len(results))
        return results
    except HTTPError as e:
        logger.error("FDA food recall request failed: %s", e)
        return []


def fetch_fda_device_recalls(
    query: Optional[str] = None,
    limit: int = 25,
) -> List[Dict[str, Any]]:
    """
    Fetch FDA medical device recall enforcement reports.

    Args:
        query: Search query
        limit: Max results

    Returns:
        List of device recall dicts
    """
    params: Dict[str, Any] = {"limit": limit}
    if query:
        params["search"] = query

    try:
        data = http_client.get(
            f"{OPENFDA_BASE}/device/enforcement.json",
            params=params,
            use_cache=True,
        )
        results = data.get("results", [])
        logger.info("FDA device recalls: %d results", len(results))
        return results
    except HTTPError as e:
        logger.error("FDA device recall request failed: %s", e)
        return []


# ============================================================================
# REGULATIONS.GOV — Federal Rulemaking
# ============================================================================

from connectors.regulationsgov import REGULATIONS_BASE  # canonical source


def fetch_dockets(
    search_term: Optional[str] = None,
    agency_id: Optional[str] = None,
    docket_type: Optional[str] = None,
    per_page: int = 25,
) -> List[Dict[str, Any]]:
    """
    Search federal regulatory dockets on Regulations.gov.

    Args:
        search_term: Search text
        agency_id: Agency acronym (e.g., "EPA", "FDA", "FCC")
        docket_type: "Rulemaking" or "Nonrulemaking"
        per_page: Max results

    Returns:
        List of docket dicts
    """
    params: Dict[str, Any] = {"page[size]": per_page}
    if search_term:
        params["filter[searchTerm]"] = search_term
    if agency_id:
        params["filter[agencyId]"] = agency_id
    if docket_type:
        params["filter[docketType]"] = docket_type

    try:
        data = http_client.get_datagov(
            REGULATIONS_BASE, "dockets", params=params, use_cache=True
        )
        results = data.get("data", [])
        logger.info("Regulations.gov dockets: %d results", len(results))
        return results
    except HTTPError as e:
        logger.error("Regulations.gov docket search failed: %s", e)
        return []


def fetch_documents(
    search_term: Optional[str] = None,
    agency_id: Optional[str] = None,
    document_type: Optional[str] = None,
    per_page: int = 25,
) -> List[Dict[str, Any]]:
    """
    Search federal regulatory documents on Regulations.gov.

    Args:
        search_term: Search text
        agency_id: Agency acronym
        document_type: "Rule", "Proposed Rule", "Notice", "Other"
        per_page: Max results

    Returns:
        List of document dicts
    """
    params: Dict[str, Any] = {"page[size]": per_page}
    if search_term:
        params["filter[searchTerm]"] = search_term
    if agency_id:
        params["filter[agencyId]"] = agency_id
    if document_type:
        params["filter[documentType]"] = document_type

    try:
        data = http_client.get_datagov(
            REGULATIONS_BASE, "documents", params=params, use_cache=True
        )
        results = data.get("data", [])
        logger.info("Regulations.gov documents: %d results", len(results))
        return results
    except HTTPError as e:
        logger.error("Regulations.gov document search failed: %s", e)
        return []


# ============================================================================
# NHTSA — National Highway Traffic Safety Administration
# ============================================================================

NHTSA_BASE = "https://api.nhtsa.gov/recalls/recallsByVehicle"


def fetch_vehicle_recalls(
    make: Optional[str] = None,
    model: Optional[str] = None,
    model_year: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch NHTSA vehicle recall data.

    Args:
        make: Vehicle make (e.g., "Toyota")
        model: Vehicle model (e.g., "Camry")
        model_year: Model year

    Returns:
        List of recall dicts
    """
    params: Dict[str, Any] = {}
    if make:
        params["make"] = make
    if model:
        params["model"] = model
    if model_year:
        params["modelYear"] = model_year

    try:
        data = http_client.get(NHTSA_BASE, params=params, use_cache=True)
        results = data.get("results", [])
        logger.info("NHTSA recalls: %d results", len(results))
        return results
    except HTTPError as e:
        logger.error("NHTSA recall request failed: %s", e)
        return []


# ============================================================================
# REGISTRY — Available agency connectors
# ============================================================================

AGENCY_REGISTRY = {
    "epa": {
        "name": "Environmental Protection Agency",
        "base_url": EPA_ECHO_BASE,
        "functions": ["fetch_epa_enforcement_cases"],
        "relevance": "Environmental policy enforcement, pollution violations",
    },
    "fda": {
        "name": "Food and Drug Administration",
        "base_url": OPENFDA_BASE,
        "functions": ["fetch_fda_drug_recalls", "fetch_fda_food_recalls", "fetch_fda_device_recalls"],
        "relevance": "Drug safety, food safety, medical device regulation",
    },
    "regulations": {
        "name": "Regulations.gov",
        "base_url": REGULATIONS_BASE,
        "functions": ["fetch_dockets", "fetch_documents"],
        "relevance": "Federal rulemaking, public comment periods, regulatory actions",
    },
    "nhtsa": {
        "name": "National Highway Traffic Safety Administration",
        "base_url": NHTSA_BASE,
        "functions": ["fetch_vehicle_recalls"],
        "relevance": "Vehicle safety, transportation policy",
    },
}


def list_agencies() -> Dict[str, Dict[str, Any]]:
    """Return registry of available agency connectors."""
    return AGENCY_REGISTRY.copy()


# ============================================================================
# CLI TEST
# ============================================================================

if __name__ == "__main__":
    import sys

    setup_logging("INFO")

    print("data.gov Framework Connector Test")
    print("=" * 60)

    # Show available agencies
    print("\nAvailable agency connectors:")
    for key, info in AGENCY_REGISTRY.items():
        print(f"  - {key}: {info['name']}")
        print(f"    Functions: {', '.join(info['functions'])}")
        print(f"    Relevance: {info['relevance']}")

    # Test 1: FDA drug recalls
    print(f"\n1. Fetching recent FDA drug recalls...")
    recalls = fetch_fda_drug_recalls(limit=3)
    for r in recalls:
        print(f"   - {r.get('product_description', 'unknown')[:60]}")
        print(f"     Reason: {r.get('reason_for_recall', 'unknown')[:60]}")

    # Test 2: FDA food recalls
    print(f"\n2. Fetching recent FDA food recalls...")
    food = fetch_fda_food_recalls(limit=3)
    for r in food:
        print(f"   - {r.get('product_description', 'unknown')[:60]}")

    # Test 3: Regulations.gov (requires data.gov key)
    if config.DATAGOV_API_KEY:
        print(f"\n3. Searching Regulations.gov for EPA dockets...")
        dockets = fetch_dockets(agency_id="EPA", per_page=3)
        for d in dockets:
            attrs = d.get("attributes", {})
            print(f"   - {attrs.get('title', 'unknown')[:60]}")
    else:
        print("\n3. Skipping Regulations.gov (no data.gov key)")

    print("\n" + "=" * 60)
    print("data.gov framework test complete.")
