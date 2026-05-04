"""
FCC License View & Spectrum Connector

Search FCC radio/wireless license records and spectrum band allocations.
Covers broadcast TV/radio, cellular carriers, satellite, microwave,
amateur radio, and all other FCC-licensed spectrum users.

API docs:
  License View: https://www.fcc.gov/developers/license-view-api
  Spectrum: https://www.fcc.gov/developers/spectrum-dashboard-api
Rate limit: No published limit (use polite delays)
Auth: None required (free public API)
"""

import logging
import time
import requests
from typing import Optional, List, Dict, Any

log = logging.getLogger(__name__)

LICENSE_BASE = "https://data.fcc.gov/api/license-view/basicSearch/getLicenses"
SPECTRUM_BASE = "https://data.fcc.gov/api/spectrum-view/services/advancedSearch/getSpectrumBands"

POLITE_DELAY = 0.5


def search_licenses(
    query: str,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Search FCC licenses by company/entity name.

    Args:
        query: Search term (company name, call sign, etc.)
        limit: Max results to return (default 100)

    Returns:
        List of license dicts with call sign, service, status, entity info
    """
    params: Dict[str, Any] = {
        "searchValue": query,
        "format": "json",
        "limit": min(limit, 1000),
    }

    # The FCC License View endpoint at data.fcc.gov is notoriously slow
    # (5-30s tail latency, occasional cold-start timeouts). The audit
    # surfaced R-SP-1 because a single 30s timeout produced empty
    # results during the morning warmup window. Retry up to 3 times
    # with progressive backoff, and bump per-request timeout.
    max_attempts = 3
    last_exc: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            time.sleep(POLITE_DELAY)
            resp = requests.get(
                LICENSE_BASE,
                params=params,
                timeout=(10, 60),  # (connect, read)
                headers={"User-Agent": "WeThePeople-Research/1.0"},
            )
            resp.raise_for_status()
            data = resp.json()
            break
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else "unknown"
            log.error("FCC License search failed (HTTP %s): %s", status, e)
            return []
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_exc = e
            log.warning(
                "FCC License attempt %d/%d timed out for query=%r: %s",
                attempt, max_attempts, query, e,
            )
            if attempt == max_attempts:
                log.error("FCC License search exhausted retries: %s", e)
                return []
            # Linear backoff: 1s, 2s, 3s.
            time.sleep(attempt)
            continue
        except Exception as e:
            log.error("FCC License search failed: %s", e)
            return []
    else:
        # Loop exited via break-less path (shouldn't be reachable, but
        # protects against future refactors).
        if last_exc:
            log.error("FCC License search loop fell through: %s", last_exc)
        return []

    # Response nests results under Licenses -> License
    licenses_wrapper = data.get("Licenses", {})
    results = licenses_wrapper.get("License", [])

    # Ensure we always return a list (single result may not be wrapped)
    if isinstance(results, dict):
        results = [results]

    log.info(
        "FCC License search (query=%s): %d licenses",
        query, len(results),
    )
    return results


def get_spectrum_bands(
    freq_from: Optional[float] = None,
    freq_to: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch FCC spectrum band allocations and service assignments.

    Args:
        freq_from: Lower frequency bound in MHz (optional)
        freq_to: Upper frequency bound in MHz (optional)

    Returns:
        List of spectrum band dicts with frequency ranges, service descriptions,
        and allocation details
    """
    params: Dict[str, Any] = {
        "format": "json",
    }
    if freq_from is not None:
        params["frequencyFrom"] = freq_from
    if freq_to is not None:
        params["frequencyTo"] = freq_to

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(SPECTRUM_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        log.error("FCC Spectrum search failed (HTTP %s): %s", status, e)
        return []
    except Exception as e:
        log.error("FCC Spectrum search failed: %s", e)
        return []

    # Response nests results under SpectrumBands -> SpectrumBand
    bands_wrapper = data.get("SpectrumBands", {})
    results = bands_wrapper.get("SpectrumBand", [])

    if isinstance(results, dict):
        results = [results]

    log.info(
        "FCC Spectrum search (freq=%s-%s MHz): %d bands",
        freq_from, freq_to, len(results),
    )
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    print("=== Testing FCC License & Spectrum Connector ===\n")

    print("--- License search (T-Mobile) ---")
    licenses = search_licenses("T-Mobile", limit=10)
    for lic in licenses[:5]:
        print(f"  {lic.get('callSign', 'N/A')}: {lic.get('licName', 'N/A')} - {lic.get('serviceDesc', 'N/A')}")
    print(f"  Total returned: {len(licenses)}\n")

    print("--- Spectrum bands (700-900 MHz) ---")
    bands = get_spectrum_bands(freq_from=700, freq_to=900)
    for b in bands[:5]:
        print(f"  {b.get('lowerBand', 'N/A')}-{b.get('upperBand', 'N/A')} MHz: {b.get('serviceDesc', 'N/A')}")
    print(f"  Total returned: {len(bands)}")
