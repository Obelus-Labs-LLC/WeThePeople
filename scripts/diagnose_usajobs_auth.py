"""
Diagnose USAJobs API authentication.

The USAJobs Search API requires:
  - User-Agent: <registered email address>
  - Authorization-Key: <api key from developer.usajobs.gov>
  - Host: data.usajobs.gov

Session-15 backlog flagged the API as returning 401 even with the key set.
The most common cause is `User-Agent` not matching the email used at
registration time, or the key being for the wrong endpoint family
(developer.usajobs.gov vs the older data.gov key).

Run on prod where the env vars live:
    python scripts/diagnose_usajobs_auth.py
    python scripts/diagnose_usajobs_auth.py --keyword engineer

Tries each header permutation and reports which works.
"""

import argparse
import logging
import os
import sys
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("diagnose_usajobs")

USAJOBS_BASE = "https://data.usajobs.gov/api/Search"
TIMEOUT = 15


def _try_headers(label: str, params: Dict[str, Any], headers: Dict[str, str]) -> Optional[int]:
    log.info("--- %s ---", label)
    safe_headers = {k: ("<redacted>" if k.lower() == "authorization-key" else v)
                    for k, v in headers.items()}
    log.info("  headers: %s", safe_headers)
    try:
        resp = requests.get(USAJOBS_BASE, params=params, headers=headers, timeout=TIMEOUT)
    except Exception as e:
        log.error("  request error: %s", e)
        return None
    log.info("  HTTP %d", resp.status_code)
    if resp.status_code == 200:
        try:
            data = resp.json()
            total = data.get("SearchResult", {}).get("SearchResultCountAll", "?")
            log.info("  total results: %s", total)
        except Exception:
            log.info("  body[:200]: %s", resp.text[:200])
    else:
        log.info("  body[:300]: %s", resp.text[:300])
    return resp.status_code


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keyword", type=str, default="data scientist",
                        help="Search keyword (default 'data scientist')")
    parser.add_argument("--limit", type=int, default=2)
    args = parser.parse_args()

    email = os.environ.get("USAJOBS_EMAIL", "")
    api_key = os.environ.get("USAJOBS_API_KEY", "")

    if not api_key:
        log.error("USAJOBS_API_KEY is not set in env. Aborting.")
        return 2
    if not email:
        log.warning("USAJOBS_EMAIL is not set; the API requires it as the User-Agent.")

    params = {"Keyword": args.keyword, "ResultsPerPage": args.limit}

    attempts = [
        (
            "Variant A — exact code path (User-Agent=email, Authorization-Key, Host)",
            {
                "User-Agent": email or "wethepeopleforus@gmail.com",
                "Authorization-Key": api_key,
                "Host": "data.usajobs.gov",
            },
        ),
        (
            "Variant B — drop Host header (requests sets it automatically)",
            {
                "User-Agent": email or "wethepeopleforus@gmail.com",
                "Authorization-Key": api_key,
            },
        ),
        (
            "Variant C — User-Agent with the key prefix some docs show",
            {
                "User-Agent": f"WeThePeople ({email})" if email else "WeThePeople",
                "Authorization-Key": api_key,
            },
        ),
        (
            "Variant D — Authorization-Key ALL-CAPS (some clients ship like this)",
            {
                "User-Agent": email or "wethepeopleforus@gmail.com",
                "AUTHORIZATION-KEY": api_key,
            },
        ),
    ]

    seen_ok = False
    statuses: list[tuple[str, Optional[int]]] = []
    for label, headers in attempts:
        code = _try_headers(label, params, headers)
        statuses.append((label, code))
        if code == 200:
            seen_ok = True
            break  # Stop at first success

    log.info("=== SUMMARY ===")
    for label, code in statuses:
        log.info("  HTTP %s  %s", code, label)

    if not seen_ok:
        log.error(
            "All header variants failed. Most likely fix: regenerate the API key "
            "at https://developer.usajobs.gov/APIRequest/Index and confirm the "
            "registered email in USAJOBS_EMAIL matches the one used to register."
        )
        return 1

    log.info("Authentication succeeded with one of the header variants above.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
