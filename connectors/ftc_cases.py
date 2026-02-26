"""
FTC Enforcement Cases Connector

Scrape FTC Legal Library for enforcement actions against tracked companies.
Falls back to curated seed data for known major enforcement actions.

Source: https://www.ftc.gov/legal-library/browse/cases-proceedings
Auth: None required
"""

import hashlib
import time
import re
import requests
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

FTC_CASES_URL = "https://www.ftc.gov/legal-library/browse/cases-proceedings"

POLITE_DELAY = 2.0


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def fetch_ftc_cases(
    company_name: str,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """
    Fetch FTC enforcement cases for a company by scraping the FTC Legal Library.

    Args:
        company_name: Company name to search (e.g. 'Google', 'Meta', 'Amazon')
        limit: Max results to return

    Returns:
        List of case dicts with keys: case_title, case_date, case_url,
        enforcement_type, description, dedupe_hash
    """
    params = {
        "search_api_fulltext": company_name,
    }

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(
            FTC_CASES_URL,
            params=params,
            headers={
                "User-Agent": "WeThePeople/1.0 (Public accountability platform)",
                "Accept": "text/html",
            },
            timeout=30,
        )
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        logger.error("FTC cases fetch failed for '%s': %s", company_name, e)
        return []

    results = _parse_ftc_html(html, limit)

    logger.info(
        "FTC cases '%s': %d cases found",
        company_name, len(results),
    )
    return results


def _parse_ftc_html(html: str, limit: int) -> List[Dict[str, Any]]:
    """Parse FTC Legal Library HTML for case entries."""
    results = []

    # Match case entries — the FTC uses a structured Drupal layout
    # Each case is in a views-row with title, date, and type
    # Pattern: look for case titles in h3 or .views-field-title elements
    title_pattern = re.compile(
        r'<a\s+href="(/legal-library/browse/cases-proceedings/[^"]+)"[^>]*>'
        r'\s*([^<]+?)\s*</a>',
        re.IGNORECASE | re.DOTALL,
    )

    date_pattern = re.compile(
        r'<(?:time|span)[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)</(?:time|span)>',
        re.IGNORECASE,
    )

    # Find all case links
    matches = title_pattern.findall(html)
    dates = date_pattern.findall(html)

    for i, (path, title) in enumerate(matches[:limit]):
        title = title.strip()
        if not title:
            continue

        case_url = f"https://www.ftc.gov{path}"
        case_date = dates[i].strip() if i < len(dates) else None

        results.append({
            "case_title": title,
            "case_date": case_date,
            "case_url": case_url,
            "enforcement_type": None,
            "penalty_amount": None,
            "description": None,
            "dedupe_hash": _compute_hash(title, case_url),
        })

    return results


# ── Curated Major Enforcement Actions ──
# For reliable initial data, we include known major FTC/DOJ actions
# against Big Tech companies. These supplement the scraped data.

CURATED_ENFORCEMENT_ACTIONS = [
    # Meta / Facebook
    {
        "company_id": "meta",
        "case_title": "FTC v. Facebook — $5 Billion Privacy Settlement",
        "case_date": "2019-07-24",
        "enforcement_type": "Consent Order",
        "penalty_amount": 5000000000,
        "description": "Record-setting $5B penalty for privacy violations including Cambridge Analytica scandal. Required new privacy oversight.",
        "source": "FTC",
    },
    {
        "company_id": "meta",
        "case_title": "FTC v. Meta — Children's Privacy (COPPA)",
        "case_date": "2023-05-03",
        "enforcement_type": "Federal Court",
        "penalty_amount": None,
        "description": "FTC proposed blanket ban on Meta monetizing children's data. Alleged COPPA violations on Messenger Kids.",
        "source": "FTC",
    },
    {
        "company_id": "meta",
        "case_title": "FTC v. Meta Platforms — Antitrust Complaint",
        "case_date": "2020-12-09",
        "enforcement_type": "Federal Court",
        "penalty_amount": None,
        "description": "Antitrust lawsuit alleging monopoly maintenance through acquisitions of Instagram and WhatsApp.",
        "source": "FTC",
    },
    # Google / Alphabet
    {
        "company_id": "alphabet",
        "case_title": "DOJ v. Google — Search Monopoly Antitrust",
        "case_date": "2024-08-05",
        "enforcement_type": "Federal Court",
        "penalty_amount": None,
        "description": "Federal judge ruled Google illegally maintained monopoly in search. DOJ proposed structural remedies including divestiture of Chrome.",
        "source": "DOJ",
    },
    {
        "company_id": "alphabet",
        "case_title": "DOJ v. Google — Ad Tech Antitrust",
        "case_date": "2023-01-24",
        "enforcement_type": "Federal Court",
        "penalty_amount": None,
        "description": "DOJ sued Google for monopolizing digital advertising technology, seeking divestiture of ad exchange.",
        "source": "DOJ",
    },
    {
        "company_id": "alphabet",
        "case_title": "FTC v. Google — Location Tracking Privacy Settlement",
        "case_date": "2022-11-10",
        "enforcement_type": "Consent Order",
        "penalty_amount": 391500000,
        "description": "$391.5M multistate settlement for misleading users about location tracking practices.",
        "source": "FTC/State AGs",
    },
    # Amazon
    {
        "company_id": "amazon",
        "case_title": "FTC v. Amazon — Alexa Children's Privacy",
        "case_date": "2023-05-31",
        "enforcement_type": "Consent Order",
        "penalty_amount": 25000000,
        "description": "$25M penalty for violating children's privacy through Alexa voice assistant, retaining recordings.",
        "source": "FTC",
    },
    {
        "company_id": "amazon",
        "case_title": "FTC v. Amazon (Ring) — Surveillance Camera Privacy",
        "case_date": "2023-05-31",
        "enforcement_type": "Consent Order",
        "penalty_amount": 5800000,
        "description": "$5.8M penalty for Ring employees accessing customer videos without consent.",
        "source": "FTC",
    },
    {
        "company_id": "amazon",
        "case_title": "FTC v. Amazon — Online Marketplace Antitrust",
        "case_date": "2023-09-26",
        "enforcement_type": "Federal Court",
        "penalty_amount": None,
        "description": "FTC and 17 state AGs sued Amazon for illegally maintaining monopoly power in online marketplace.",
        "source": "FTC",
    },
    # Apple
    {
        "company_id": "apple",
        "case_title": "DOJ v. Apple — Smartphone Monopoly Antitrust",
        "case_date": "2024-03-21",
        "enforcement_type": "Federal Court",
        "penalty_amount": None,
        "description": "DOJ and 16 state AGs sued Apple for monopolizing smartphone market through app store restrictions.",
        "source": "DOJ",
    },
    {
        "company_id": "apple",
        "case_title": "Epic Games v. Apple — App Store Antitrust",
        "case_date": "2021-09-10",
        "enforcement_type": "Federal Court",
        "penalty_amount": None,
        "description": "Court ordered Apple to allow alternative payment methods in apps. Apple largely prevailed but anti-steering injunction issued.",
        "source": "Private/Court",
    },
    # Microsoft
    {
        "company_id": "microsoft",
        "case_title": "FTC v. Microsoft — Activision Acquisition Challenge",
        "case_date": "2022-12-08",
        "enforcement_type": "Administrative",
        "penalty_amount": None,
        "description": "FTC challenged Microsoft's $69B acquisition of Activision Blizzard. Court denied preliminary injunction; deal closed.",
        "source": "FTC",
    },
    # NVIDIA
    {
        "company_id": "nvidia",
        "case_title": "FTC v. NVIDIA — ARM Acquisition Block",
        "case_date": "2021-12-02",
        "enforcement_type": "Administrative",
        "penalty_amount": None,
        "description": "FTC sued to block NVIDIA's $40B acquisition of ARM, citing competition concerns in semiconductor market. Deal abandoned.",
        "source": "FTC",
    },
    # Tesla
    {
        "company_id": "tesla",
        "case_title": "FTC Investigation — Autopilot Safety Claims",
        "case_date": "2022-06-01",
        "enforcement_type": "Investigation",
        "penalty_amount": None,
        "description": "FTC investigated Tesla's marketing claims about Autopilot and Full Self-Driving capabilities.",
        "source": "FTC",
    },
]


def get_curated_enforcement_actions(company_id: str = None) -> List[Dict[str, Any]]:
    """Return curated enforcement actions, optionally filtered by company_id."""
    actions = CURATED_ENFORCEMENT_ACTIONS
    if company_id:
        actions = [a for a in actions if a["company_id"] == company_id]

    for a in actions:
        if "dedupe_hash" not in a:
            a["dedupe_hash"] = _compute_hash(a["case_title"], a.get("case_date", ""))

    return actions
