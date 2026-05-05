"""
USPTO Open Data Portal (ODP) Connector — Replaces the retired PatentsView API.

USPTO retired PatentsView's per-patent search API. The replacement is
the USPTO Open Data Portal at `api.uspto.gov`, which is a BULK-DATA
service: you search for a dataset product (e.g. "PatentsView Granted
Patent Disambiguated Data"), get back a list of file URLs, and
download + parse them locally.

There is no per-patent search endpoint. The legacy
`fetch_patents(assignee_name, ...)` shape from PatentsView cannot be
replicated against ODP without first ingesting the bulk dataset
locally and filtering by assignee in our DB.

Architecture under ODP
----------------------
1. Discover the right product:
       GET /api/v1/datasets/products/search?productTitle=Patent
   Returns metadata about each bulk product (TSV/CSV/XML/JSON,
   update cadence, file sizes, download URIs).

2. Pick the relevant product. For our use case (granted patents
   disambiguated by assignee), the direct PatentsView successor is
   `PVGPATDIS` — quarterly TSV files going back to 1976.

3. Download the file(s) using `fileDownloadURI`:
       GET /api/v1/datasets/products/files/{PRODUCT}/{FILENAME}
   With the same X-API-Key header.

4. Unpack the .zip, parse the .tsv with pandas or csv, filter by
   our tracked-tech-company assignee names, and INSERT into our
   `tech_patents` table.

This is a fundamentally different shape than the old per-company
HTTP query. The full bulk-ingest job is intentionally NOT shipped
in this commit — it's a multi-day implementation that needs:
  - A nightly/weekly cron in jobs/scheduler.py
  - Local disk space (~25 GB for PVGPATDIS)
  - A streaming TSV parser to avoid loading the file into memory
  - A diff strategy so we only re-process files USPTO has updated
And it needs operator review before being scheduled (it's a large
storage + bandwidth commit).

What this connector ships today
-------------------------------
* `list_products(query=None)` — query the products/search endpoint.
  Used by `scripts/diagnose_uspto_odp.py` to verify the API key and
  list available datasets.
* `find_patent_grant_products()` — convenience helper that returns
  just the patent-grant products relevant to our use case.
* `fetch_patents(assignee_name, ...)` — legacy shim. Returns []
  with a one-time warning so the existing `sync_tech_data` job
  continues to run without raising.

Auth setup
----------
Set USPTO_API_KEY in `.env` (the operator has tested a key against
the live `/products/search` endpoint as of May 5 2026).

Rate limit per the USPTO ODP terms is not formally published.
Stay polite (~30 req/min target) for both the lookup endpoint and
file downloads.
"""

import hashlib
import os
import time
from typing import Any, Dict, List, Optional

import requests

from utils.logging import get_logger

logger = get_logger(__name__)

USPTO_ODP_BASE = "https://api.uspto.gov/api/v1"
PRODUCTS_SEARCH = f"{USPTO_ODP_BASE}/datasets/products/search"
PRODUCT_DETAIL = f"{USPTO_ODP_BASE}/datasets/products"  # /{productIdentifier}
PRODUCT_FILE = f"{USPTO_ODP_BASE}/datasets/products/files"  # /{productIdentifier}/{filename}

API_KEY = os.environ.get("USPTO_API_KEY", "")

POLITE_DELAY = 2.0  # ~30 req/min
TIMEOUT = 30

# Bulk-product identifiers most relevant to the Patent Explorer.
# `PVGPATDIS` is the direct successor to PatentsView's per-grant data.
RELEVANT_PATENT_PRODUCTS = (
    "PVGPATDIS",   # PatentsView Granted Patent Disambiguated Data — quarterly TSV
    "PVANNUAL",    # PatentsView Annualized Patent Data — yearly CSV
    "PVGPATTXT",   # PatentsView Granted Patent Long Text Data
    "PTGRXML",     # Patent Grant Full-Text Data — XML, weekly
)

_NO_KEY_LOGGED = False


def _log_no_key_once() -> None:
    """One-time hint when USPTO_API_KEY is unset. Avoids flooding logs
    when sync_tech_data iterates over many tracked tech companies."""
    global _NO_KEY_LOGGED
    if not _NO_KEY_LOGGED:
        logger.warning(
            "USPTO_API_KEY not set; connectors.uspto_odp returns []. "
            "Register at https://api.uspto.gov and set USPTO_API_KEY in .env."
        )
        _NO_KEY_LOGGED = True


def _headers() -> Dict[str, str]:
    return {
        "X-API-Key": API_KEY,
        "Accept": "application/json",
        "User-Agent": "WeThePeople-Patent-Sync/1.0",
    }


def _compute_hash(*parts: str) -> str:
    """MD5 for deduplication on patent_number."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


# ─── Public: products discovery ────────────────────────────────────────────


def list_products(
    query: Optional[str] = None,
    product_title: Optional[str] = None,
    label: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List bulk-data products available at api.uspto.gov.

    Args:
        query: free-text query (Swagger calls this `q`)
        product_title: exact-prefix match against `productTitleText`
            (e.g. "Patent" returns every patent product)
        label: filter by `productLabelArrayText` (e.g. "Patent",
            "Trademark", "Research")

    Returns:
        Flat list of product dicts (one per ODP product). Empty
        list on auth failure or upstream error — never raises.
    """
    if not API_KEY:
        _log_no_key_once()
        return []

    params: Dict[str, Any] = {}
    if query:
        params["q"] = query
    if product_title:
        params["productTitle"] = product_title
    if label:
        params["productLabel"] = label

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(
            PRODUCTS_SEARCH,
            params=params,
            headers=_headers(),
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        logger.error("USPTO ODP products/search request error: %s", e)
        return []

    if resp.status_code != 200:
        logger.error(
            "USPTO ODP products/search HTTP %d: %s",
            resp.status_code, resp.text[:200],
        )
        return []

    try:
        data = resp.json()
    except ValueError:
        logger.error("USPTO ODP products/search non-JSON response")
        return []

    bag = data.get("bulkDataProductBag") or []
    # The ODP wraps results in nested arrays in some cases; flatten.
    flat: List[Dict[str, Any]] = []
    for item in bag:
        if isinstance(item, list):
            flat.extend(x for x in item if isinstance(x, dict))
        elif isinstance(item, dict):
            flat.append(item)
    return flat


def find_patent_grant_products() -> List[Dict[str, Any]]:
    """Return the bulk-data products most relevant to granted-patent
    ingest. Useful for a `scripts/diagnose_uspto_odp.py` smoke test
    that confirms the key works AND the right datasets are available.

    Filters the full product list down to RELEVANT_PATENT_PRODUCTS.
    """
    products = list_products(label="Patent")
    relevant_set = set(RELEVANT_PATENT_PRODUCTS)
    return [p for p in products if p.get("productIdentifier") in relevant_set]


def get_product_detail(product_identifier: str) -> Optional[Dict[str, Any]]:
    """Fetch the file manifest for a single product.

    Used by the bulk-download job to pick which files have been
    updated since the last sync (compare `fileLastModifiedDateTime`).

    Returns None on any error.
    """
    if not API_KEY:
        _log_no_key_once()
        return None

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(
            f"{PRODUCT_DETAIL}/{product_identifier}",
            headers=_headers(),
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        logger.error("USPTO ODP product detail request error: %s", e)
        return None

    if resp.status_code != 200:
        logger.error(
            "USPTO ODP product detail HTTP %d: %s",
            resp.status_code, resp.text[:200],
        )
        return None

    try:
        data = resp.json()
    except ValueError:
        return None

    bag = data.get("bulkDataProductBag") or []
    if isinstance(bag, list) and bag:
        first = bag[0]
        if isinstance(first, list):
            first = first[0] if first else None
        return first
    return None


def list_files_for_product(product_identifier: str) -> List[Dict[str, Any]]:
    """Convenience: pull just the file list out of a product's detail.

    Returns dicts with at minimum: fileName, fileSize, fileDownloadURI,
    fileLastModifiedDateTime. Empty list on error.
    """
    detail = get_product_detail(product_identifier)
    if not detail:
        return []
    bag = (detail.get("productFileBag") or {}).get("fileDataBag") or []
    if isinstance(bag, list):
        return [x for x in bag if isinstance(x, dict)]
    return []


# ─── Public: legacy shim for the existing sync_tech_data job ────────────────


def fetch_patents(
    assignee_name: str,
    date_from: Optional[str] = None,
    limit: int = 1000,
) -> List[Dict[str, Any]]:
    """Legacy per-company patent search (PatentsView shape).

    USPTO ODP does not expose a per-patent search endpoint. The
    replacement architecture is bulk-data download + local filter:

      1. Run a quarterly job that downloads the latest PVGPATDIS files.
      2. Parse the TSVs streaming.
      3. Filter rows by our tracked-tech-company assignee names.
      4. Insert into the `tech_patents` table.

    The bulk-ingest job is not shipped yet (multi-day implementation,
    needs operator sign-off on the disk + bandwidth budget). Until
    that lands this shim returns [] so `sync_tech_data` continues to
    run without raising; the ~4,200 patents already in the cache
    continue to serve the Patent Explorer UI.

    Args mirror the old PatentsView signature so callers don't change.
    """
    # Suppress unused-arg lint without changing the public signature.
    _ = (assignee_name, date_from, limit)
    if not API_KEY:
        _log_no_key_once()
    else:
        # Log once that the per-patent path is the wrong architecture
        # for ODP, so operators don't waste time investigating "why no
        # patents" when the key is set correctly.
        global _ARCH_LOGGED
        if not globals().get("_ARCH_LOGGED"):
            logger.info(
                "uspto_odp.fetch_patents is a no-op shim under the new ODP "
                "architecture (no per-patent search endpoint). "
                "Implement the bulk-download job to resume ingest."
            )
            globals()["_ARCH_LOGGED"] = True
    return []
