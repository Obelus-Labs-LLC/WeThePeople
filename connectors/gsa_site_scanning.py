"""
GSA Site Scanning Connector — Federal Government Website Technology Footprint

Downloads the daily CSV of all federal website scans from GSA.
Maps third-party service domains to tracked tech companies.

Data source: https://digital.gov/guides/site-scanning/data
CSV: https://api.gsa.gov/technology/site-scanning/data/site-scanning-live-filtered-latest.csv
Rate limit: None (public CSV download, no API key needed)
Auth: None required for CSV

Key use case: detecting vendor lock-in — companies whose code runs on
government websites while also lobbying and winning contracts from those agencies.
"""

import csv
import hashlib
import io
import logging
import time
from typing import Any, Dict, List, Optional, Set

import requests

logger = logging.getLogger(__name__)

SITE_SCANNING_CSV_URL = (
    "https://api.gsa.gov/technology/site-scanning/data/"
    "site-scanning-live-filtered-latest.csv"
)

# Map third-party domains to WTP tracked company IDs.
# A domain matches if the third-party domain ends with the key.
DOMAIN_TO_COMPANY: Dict[str, str] = {
    "google.com": "alphabet",
    "googleapis.com": "alphabet",
    "googletagmanager.com": "alphabet",
    "gstatic.com": "alphabet",
    "youtube.com": "alphabet",
    "doubleclick.net": "alphabet",
    "amazonaws.com": "amazon",
    "cloudfront.net": "amazon",
    "amazon.com": "amazon",
    "microsoft.com": "microsoft",
    "azure.com": "microsoft",
    "msecnd.net": "microsoft",
    "live.com": "microsoft",
    "office.com": "microsoft",
    "facebook.com": "meta",
    "facebook.net": "meta",
    "fbcdn.net": "meta",
    "instagram.com": "meta",
    "adobe.com": "adobe",
    "demdex.net": "adobe",
    "omtrdc.net": "adobe",
    "typekit.net": "adobe",
    "salesforce.com": "salesforce",
    "force.com": "salesforce",
    "oracle.com": "oracle",
    "oraclecloud.com": "oracle",
    "bluekai.com": "oracle",
    "cloudflare.com": "cloudflare",
    "hubspot.com": "hubspot",
    "hsforms.com": "hubspot",
    "hs-analytics.net": "hubspot",
    "twilio.com": "twilio",
    "segment.com": "twilio",
    "atlassian.com": "atlassian",
    "atlassian.net": "atlassian",
    "palantir.com": "palantir",
    "ibm.com": "ibm",
    "cisco.com": "cisco",
    "datadoghq.com": "datadog",
    "elastic.co": "elastic",
    "dynatrace.com": "dynatrace",
    "servicenow.com": "servicenow",
    "apple.com": "apple",
    "snowflakecomputing.com": "snowflake",
    "akamai.net": "akamai",
    "akamaized.net": "akamai",
    "twitter.com": "twitter",
    "twimg.com": "twitter",
    "linkedin.com": "linkedin",
    "licdn.com": "linkedin",
    "wordpress.com": "wordpress",
    "wp.com": "wordpress",
}


def _compute_hash(*parts: str) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()


def map_domains_to_companies(third_party_domains: str) -> List[str]:
    """Map a comma-separated list of third-party domains to tracked company IDs.

    Returns deduplicated list of matched company IDs.
    """
    if not third_party_domains:
        return []

    matched: Set[str] = set()
    domains = [d.strip().lower() for d in third_party_domains.split(",") if d.strip()]

    for domain in domains:
        for pattern, company_id in DOMAIN_TO_COMPANY.items():
            if domain == pattern or domain.endswith("." + pattern):
                matched.add(company_id)
                break

    return sorted(matched)


def fetch_site_scanning_csv() -> List[Dict[str, Any]]:
    """Download the daily site scanning CSV and parse it.

    Returns list of dicts with website scan data and matched company IDs.
    """
    logger.info("Downloading GSA Site Scanning CSV...")

    try:
        resp = requests.get(SITE_SCANNING_CSV_URL, timeout=120, stream=True)
        resp.raise_for_status()
    except Exception as e:
        logger.error("Site Scanning CSV download failed: %s", e)
        return []

    text = resp.text
    reader = csv.DictReader(io.StringIO(text))

    results = []
    seen_hashes = set()
    total_rows = 0
    matched_rows = 0

    for row in reader:
        total_rows += 1
        target_url = row.get("target_url", "").strip()
        if not target_url:
            continue

        agency = row.get("target_url_agency_owner", "").strip()
        bureau = row.get("target_url_bureau_owner", "").strip()
        final_url = row.get("final_url", "").strip()
        status_code = row.get("final_url_status_code", "")
        third_party = row.get("third_party_service_domains", "")
        third_party_count = row.get("third_party_service_count", "0")
        scan_date = row.get("scan_date", "")

        # Map domains to companies
        matched_companies = map_domains_to_companies(third_party)
        if matched_companies:
            matched_rows += 1

        h = _compute_hash(target_url, scan_date[:10] if scan_date else "")
        if h in seen_hashes:
            continue
        seen_hashes.add(h)

        try:
            sc = int(status_code) if status_code else None
        except ValueError:
            sc = None

        try:
            tp_count = int(third_party_count)
        except ValueError:
            tp_count = 0

        results.append({
            "target_url": target_url,
            "final_url": final_url,
            "agency": agency,
            "bureau": bureau,
            "status_code": sc,
            "third_party_domains": third_party,
            "third_party_count": tp_count,
            "matched_company_ids": matched_companies,
            "scan_date": scan_date[:10] if scan_date else None,
            "dedupe_hash": h,
        })

    logger.info(
        "Site Scanning CSV: %d total rows, %d parsed, %d matched to tracked companies",
        total_rows, len(results), matched_rows,
    )
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    print("=== Testing GSA Site Scanning Connector ===\n")

    results = fetch_site_scanning_csv()

    # Count by company
    company_counts: Dict[str, int] = {}
    for r in results:
        for cid in r["matched_company_ids"]:
            company_counts[cid] = company_counts.get(cid, 0) + 1

    print(f"Total websites scanned: {len(results)}")
    print(f"\nTop tech companies embedded in .gov sites:")
    for company, count in sorted(company_counts.items(), key=lambda x: -x[1])[:15]:
        print(f"  {company:20s} {count:>6,} websites")

    # Count by agency
    agency_counts: Dict[str, int] = {}
    for r in results:
        if r["matched_company_ids"]:
            ag = r["agency"] or "Unknown"
            agency_counts[ag] = agency_counts.get(ag, 0) + 1

    print(f"\nTop agencies with tracked company tech:")
    for agency, count in sorted(agency_counts.items(), key=lambda x: -x[1])[:10]:
        print(f"  {agency[:40]:40s} {count:>6,} sites")
