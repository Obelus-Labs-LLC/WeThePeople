"""
Data USA Connector — Census, BLS, BEA Economic & Demographic Data

Aggregated public data from Census Bureau, Bureau of Labor Statistics,
Bureau of Economic Analysis, and 10+ other federal sources. Free, no auth.

Use cases for WeThePeople:
- "I created 50,000 jobs in my district" -> verify employment numbers
- "Wages are up under my leadership" -> check wage data by state/district
- "Healthcare costs are down" -> health insurance coverage rates
- "Poverty is at record lows" -> poverty rates by geography
- "Our infrastructure is crumbling" -> commute times, housing data

API: Tesseract OLAP engine at https://api.datausa.io
Auth: None required (fully public)
Rate limit: No hard limit (be polite)
Response: JSON

The API uses a cube/OLAP model:
- Cubes contain measures (metrics) and dimensions (breakdowns)
- Dimensions have hierarchies with levels (Nation > State > County > Place)
- Query by cube name + drilldowns (level names) + measures (metric names)
"""

import time
from typing import Optional, List, Dict, Any

from utils.logging import get_logger, setup_logging

logger = get_logger(__name__)

# Tesseract API base
API_BASE = "https://api.datausa.io"
DATA_ENDPOINT = f"{API_BASE}/tesseract/data.jsonrecords"
CUBES_ENDPOINT = f"{API_BASE}/cubes"

# Polite delay between calls (seconds)
POLITE_DELAY = 0.3


# ============================================================================
# CORE API — Low-level Tesseract query
# ============================================================================

def query_cube(
    cube: str,
    drilldowns: str,
    measures: str,
    filters: Optional[Dict[str, str]] = None,
    use_cache: bool = True,
) -> List[Dict[str, Any]]:
    """
    Query a Data USA cube via the Tesseract API.

    Args:
        cube: Cube name (e.g., "acs_yg_total_population_5")
        drilldowns: Comma-separated level names (e.g., "State" or "Nation,Year")
        measures: Comma-separated measure names (e.g., "Population")
        filters: Optional dimension filters as {dimension: value}
                 (e.g., {"Year": "2022"})
        use_cache: Whether to use HTTP cache

    Returns:
        List of record dicts from the 'data' key
    """
    import requests

    params: Dict[str, str] = {
        "cube": cube,
        "drilldowns": drilldowns,
        "measures": measures,
    }

    # Add filters (passed as query params with dimension name as key)
    if filters:
        params.update(filters)

    try:
        response = requests.get(DATA_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        records = data.get("data", [])
        logger.info(
            "Data USA query: cube=%s drilldowns=%s measures=%s -> %d records",
            cube, drilldowns, measures, len(records),
        )
        return records
    except requests.RequestException as e:
        logger.error("Data USA query failed: %s", e)
        return []


def list_cubes() -> List[Dict[str, Any]]:
    """
    Fetch the full cube catalog from the API.

    Returns:
        List of cube metadata dicts with name, annotations, dimensions, measures
    """
    import requests

    try:
        response = requests.get(CUBES_ENDPOINT, timeout=30)
        response.raise_for_status()
        data = response.json()
        cubes = data.get("cubes", [])
        logger.info("Data USA catalog: %d cubes available", len(cubes))
        return cubes
    except requests.RequestException as e:
        logger.error("Failed to fetch Data USA cube catalog: %s", e)
        return []


# ============================================================================
# POPULATION & DEMOGRAPHICS
# ============================================================================

def fetch_population(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch population data by geographic level.

    Args:
        level: Geographic level — "Nation", "State", "County", "Place"
        year: Specific year or None for all years

    Returns:
        List of records with geography + population
    """
    filters = {"Year": year} if year else None
    return query_cube(
        cube="acs_yg_total_population_5",
        drilldowns=level,
        measures="Population,Population Moe",
        filters=filters,
    )


def fetch_median_age(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch median age by geography."""
    filters = {"Year": year} if year else None
    return query_cube(
        cube="acs_ygs_median_age_total_5",
        drilldowns=f"{level},Gender",
        measures="Median Age,Median Age Moe",
        filters=filters,
    )


def fetch_race_demographics(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch race/ethnicity breakdown by geography."""
    filters = {"Year": year} if year else None
    return query_cube(
        cube="acs_ygr_race_with_hispanic_5",
        drilldowns=f"{level},Race",
        measures="Hispanic Population,Hispanic Population Moe",
        filters=filters,
    )


# ============================================================================
# ECONOMY & EMPLOYMENT
# ============================================================================

def fetch_average_wage(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch average wage data by geography.

    Uses the PUMS (Public Use Microdata Sample) cube which has
    wage, income, and workforce status data.

    Args:
        level: Geographic level
        year: Specific year or None for all

    Returns:
        Records with Average Wage, Average Income, Total Population
    """
    filters = {"Year": year} if year else None
    return query_cube(
        cube="pums_5",
        drilldowns=level,
        measures="Average Wage,Average Income,Total Population",
        filters=filters,
    )


def fetch_household_income(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch household income distribution by geography.

    Args:
        level: Geographic level
        year: Specific year or None

    Returns:
        Records with Household Income by bucket
    """
    filters = {"Year": year} if year else None
    return query_cube(
        cube="acs_yg_household_income_5",
        drilldowns=f"{level},Household Income Bucket",
        measures="Household Income,Household Income Moe",
        filters=filters,
    )


def fetch_industry_employment(
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch BLS industry employment projections.

    Returns:
        Records with Industry Jobs, Industry Jobs Change, output data
    """
    filters = {"Year": year} if year else None
    return query_cube(
        cube="bls_growth_industry",
        drilldowns="BLS Industry Flat",
        measures="Industry Jobs,Industry Jobs Change,Industry Jobs CARC",
        filters=filters,
    )


def fetch_occupation_employment(
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch BLS occupation employment projections.

    Returns:
        Records with occupation employment, change, and openings
    """
    filters = {"Year": year} if year else None
    return query_cube(
        cube="bls_growth_occupation",
        drilldowns="BLS Occupation Flat",
        measures="Occupation Employment,Occupation Employment Change,Occupation Employment Openings",
        filters=filters,
    )


def fetch_unemployment_claims(
    state: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch BLS unemployment insurance claims (most recent).

    Args:
        state: Optional state filter

    Returns:
        Records with Initial Claims, Continued Claims, Insured Unemployment Rate
    """
    filters = {}
    if state:
        filters["State"] = state
    return query_cube(
        cube="BLS Unemployment Insurance Claims - Most Recent",
        drilldowns="State",
        measures="Initial Claims,Continued Claims,Insured Unemployment Rate",
        filters=filters or None,
    )


def fetch_median_earnings_by_industry(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch median earnings broken down by industry and geography."""
    filters = {"Year": year} if year else None
    return query_cube(
        cube="acs_ygi_industry_for_median_earnings_5",
        drilldowns=f"{level},ACS Industry",
        measures="Median Earnings by Industry: Industry Group",
        filters=filters,
    )


# ============================================================================
# POVERTY & INEQUALITY
# ============================================================================

def fetch_poverty_rate(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch poverty population by geography.

    Args:
        level: Geographic level
        year: Specific year

    Returns:
        Records with Poverty Population by status, gender, age
    """
    filters = {"Year": year} if year else None
    return query_cube(
        cube="acs_ygpsar_poverty_by_gender_age_race_5",
        drilldowns=f"{level},Poverty Status",
        measures="Poverty Population,Poverty Population Moe",
        filters=filters,
    )


def fetch_gini_coefficient(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch GINI coefficient (income inequality) by geography."""
    filters = {"Year": year} if year else None
    return query_cube(
        cube="acs_yg_gini_5",
        drilldowns=level,
        measures="Wage GINI,Wage GINI Moe",
        filters=filters,
    )


# ============================================================================
# HEALTH
# ============================================================================

def fetch_health_insurance_coverage(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch health insurance coverage rates by geography.

    Args:
        level: Geographic level
        year: Specific year

    Returns:
        Records with coverage type breakdown
    """
    filters = {"Year": year} if year else None
    return query_cube(
        cube="acs_ygh_health_care_coverage_overall_5",
        drilldowns=f"{level},Health Coverage",
        measures="Health Insurance Policies,Health Insurance Policies Moe",
        filters=filters,
    )


def fetch_opioid_death_rate(
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch opioid overdose death rate by state."""
    filters = {"Year": year} if year else None
    return query_cube(
        cube="health_opioid_overdose_deathrate",
        drilldowns="Geography",
        measures="Opioid overdose death rate",
        filters=filters,
    )


# ============================================================================
# HOUSING & LIVING
# ============================================================================

def fetch_housing_values(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch median property values by geography."""
    filters = {"Year": year} if year else None
    return query_cube(
        cube="acs_yg_housing_median_value_5",
        drilldowns=level,
        measures="Property Value,Property Value Moe",
        filters=filters,
    )


def fetch_commute_times(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch average commute time by geography."""
    filters = {"Year": year} if year else None
    return query_cube(
        cube="acs_ygt_mean_transportation_time_to_work_5",
        drilldowns=level,
        measures="Average Commute Time,Average Commute Time Moe",
        filters=filters,
    )


def fetch_internet_access(
    level: str = "State",
    year: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch household internet access rates by geography."""
    filters = {"Year": year} if year else None
    return query_cube(
        cube="acs_ygh_households_with_no_internet_2016_5",
        drilldowns=f"{level},Internet Access",
        measures="Households by Internet Access,Households by Internet Access Moe",
        filters=filters,
    )


# ============================================================================
# GOVERNMENT SPENDING
# ============================================================================

def fetch_federal_spending(
    fiscal_year: Optional[str] = None,
    level: str = "Agency",
) -> List[Dict[str, Any]]:
    """
    Fetch federal spending from USAspending.gov via Data USA.

    Args:
        fiscal_year: Fiscal year filter
        level: Drilldown level — "Agency", "Geography", etc.

    Returns:
        Records with Obligation Amount and Total Loan Value
    """
    filters = {"Fiscal Year": fiscal_year} if fiscal_year else None
    return query_cube(
        cube="usa_spending",
        drilldowns=level,
        measures="Obligation Amount,Total Loan Value",
        filters=filters,
    )


# ============================================================================
# TOPIC REGISTRY — What's available
# ============================================================================

TOPIC_FUNCTIONS = {
    "population": {
        "function": "fetch_population",
        "description": "Total population by geography",
        "use_case": "Verify population growth/decline claims",
    },
    "wages": {
        "function": "fetch_average_wage",
        "description": "Average wage and income by geography",
        "use_case": "Verify 'wages are up' claims",
    },
    "household_income": {
        "function": "fetch_household_income",
        "description": "Household income distribution",
        "use_case": "Verify middle class / income claims",
    },
    "unemployment": {
        "function": "fetch_unemployment_claims",
        "description": "Unemployment insurance claims by state",
        "use_case": "Verify jobs/employment claims",
    },
    "poverty": {
        "function": "fetch_poverty_rate",
        "description": "Poverty rates by geography",
        "use_case": "Verify poverty reduction claims",
    },
    "inequality": {
        "function": "fetch_gini_coefficient",
        "description": "Income inequality (GINI coefficient)",
        "use_case": "Verify inequality/equity claims",
    },
    "health_insurance": {
        "function": "fetch_health_insurance_coverage",
        "description": "Health insurance coverage rates",
        "use_case": "Verify healthcare access claims",
    },
    "housing": {
        "function": "fetch_housing_values",
        "description": "Median property values",
        "use_case": "Verify housing market claims",
    },
    "commute": {
        "function": "fetch_commute_times",
        "description": "Average commute times",
        "use_case": "Verify infrastructure/transportation claims",
    },
    "federal_spending": {
        "function": "fetch_federal_spending",
        "description": "Federal spending by agency",
        "use_case": "Verify government spending claims",
    },
    "opioids": {
        "function": "fetch_opioid_death_rate",
        "description": "Opioid overdose death rates",
        "use_case": "Verify drug crisis claims",
    },
}


def list_topics() -> Dict[str, Dict[str, str]]:
    """Return registry of available data topics and their use cases."""
    return TOPIC_FUNCTIONS.copy()


# ============================================================================
# CLI TEST
# ============================================================================

if __name__ == "__main__":
    import sys

    setup_logging("INFO")

    print("Data USA Connector Test")
    print("=" * 60)

    # Test 1: Population
    print("\n1. Fetching state population (latest year)...")
    pop = fetch_population(level="Nation")
    if pop:
        # Find most recent year
        latest = sorted(pop, key=lambda x: x.get("Year", ""), reverse=True)
        if latest:
            rec = latest[0]
            print(f"   US Population ({rec.get('Year', '?')}): {rec.get('Population', 0):,.0f}")
    else:
        print("   No data returned")

    time.sleep(POLITE_DELAY)

    # Test 2: Average Wage
    print("\n2. Fetching average wage (Nation level)...")
    wages = fetch_average_wage(level="Nation")
    if wages:
        latest = sorted(wages, key=lambda x: x.get("Year", ""), reverse=True)
        if latest:
            rec = latest[0]
            print(f"   Average Wage ({rec.get('Year', '?')}): ${rec.get('Average Wage', 0):,.0f}")
            print(f"   Average Income: ${rec.get('Average Income', 0):,.0f}")
    else:
        print("   No data returned")

    time.sleep(POLITE_DELAY)

    # Test 3: Unemployment claims
    print("\n3. Fetching unemployment claims (top 5 states)...")
    claims = fetch_unemployment_claims()
    if claims:
        sorted_claims = sorted(claims, key=lambda x: x.get("Initial Claims", 0), reverse=True)
        for rec in sorted_claims[:5]:
            print(f"   {rec.get('State', '?')}: {rec.get('Initial Claims', 0):,.0f} initial claims")
    else:
        print("   No data returned")

    time.sleep(POLITE_DELAY)

    # Test 4: Health insurance
    print("\n4. Fetching health insurance coverage (Nation)...")
    health = fetch_health_insurance_coverage(level="Nation")
    if health:
        latest_year = max(r.get("Year", "") for r in health)
        year_data = [r for r in health if r.get("Year") == latest_year]
        for rec in year_data[:5]:
            print(f"   {rec.get('Health Coverage', '?')}: {rec.get('Health Insurance Policies', 0):,.0f}")
    else:
        print("   No data returned")

    # Test 5: Available topics
    print(f"\n5. Available topics: {len(TOPIC_FUNCTIONS)}")
    for key, info in TOPIC_FUNCTIONS.items():
        print(f"   {key}: {info['description']}")
        print(f"     Use case: {info['use_case']}")

    # Test 6: Cube catalog
    print(f"\n6. Fetching cube catalog...")
    cubes = list_cubes()
    print(f"   {len(cubes)} cubes available")
    topics = set()
    for c in cubes:
        t = c.get("annotations", {}).get("topic", "")
        if t:
            topics.add(t)
    print(f"   Topics: {', '.join(sorted(topics))}")

    print("\n" + "=" * 60)
    print("Data USA connector test complete.")
