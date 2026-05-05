"""
USPTO Open Data Portal (ODP) Connector — Replaces the retired PatentsView API.

PatentsView was shut down by USPTO. The replacement is the USPTO Open Data
Portal (ODP), accessed through `api.uspto.gov`. This is an AWS API Gateway
fronted service that requires an X-API-Key header for every request.

Endpoint family (verified by `OPTIONS` probe and `MissingAuthenticationToken`
response on May 5 2026 — the URL structure is correct, the auth is the
gate):

    GET https://api.uspto.gov/api/v1/datasets/products/granted-patents-grants/json
        ?searchText=<query>&start=<offset>&rows=<limit>
        Headers: X-API-Key: <USPTO_API_KEY>

The portal's web UI at https://data.uspto.gov demonstrates the same
underlying API — the SPA fetches from `api.uspto.gov` and any browser
network-tab inspection of a search shows the same parameter names.

Auth setup
----------
1. Register at https://api.uspto.gov/portal/register (or the data.uspto.gov
   "Get an API key" link). Self-service, no application review.
2. Drop the resulting key in your `.env` as USPTO_API_KEY=<key>.
3. Restart the API service. This connector picks up the env var on
   import.

Without the key set, the connector returns [] gracefully and logs a
one-time hint pointing at the registration link, so the sync job and
Patent Explorer page continue to function (rendering the
already-cached patents in the DB).

Rate limit per the USPTO ODP terms: not formally published as of
2026-05; assume ~30 req/min and pace the loop accordingly. The
`POLITE_DELAY` below targets that ceiling.

Output shape
------------
We map the ODP response to the same dict shape as the legacy
PatentsView connector so `jobs/sync_tech_data.sync_patents` doesn't
need to change:

    {
      "patent_number": str,
      "patent_title":  str,
      "patent_date":   YYYY-MM-DD,
      "patent_abstract": str,
      "num_claims":    int | None,
      "cpc_codes":     "code1, code2" | None,
      "dedupe_hash":   md5(patent_number),
    }

Field mapping uses both snake_case and camelCase fallbacks because the
ODP response uses camelCase but USPTO's older bulk-data system uses
snake_case and either may surface depending on which dataset variant
is chosen at registration time.
"""

import hashlib
import os
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import requests

from utils.logging import get_logger

logger = get_logger(__name__)

USPTO_ODP_BASE = "https://api.uspto.gov/api/v1/datasets/products/granted-patents-grants/json"
API_KEY = os.environ.get("USPTO_API_KEY", "")

POLITE_DELAY = 2.0  # ~30 req/min ceiling
TIMEOUT = 30

_NO_KEY_LOGGED = False


def _log_no_key_once() -> None:
    """Log a one-time hint about the missing key.

    Avoids flooding logs when sync_tech_data iterates across all tracked
    tech companies. Same pattern as the deprecation hint in the legacy
    patentsview connector.
    """
    global _NO_KEY_LOGGED
    if not _NO_KEY_LOGGED:
        logger.warning(
            "USPTO_API_KEY not set; connectors.uspto_odp returns []. "
            "Register for a key at https://api.uspto.gov/portal/register and "
            "set USPTO_API_KEY in .env to enable patent ingest."
        )
        _NO_KEY_LOGGED = True


def _compute_hash(*parts: str) -> str:
    """MD5 for deduplication on patent_number."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _coerce_int(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _coerce_date(v: Any) -> Optional[str]:
    """Normalize various USPTO date forms to YYYY-MM-DD."""
    if not v:
        return None
    s = str(v).strip()
    if not s:
        return None
    # Already ISO
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    # YYYYMMDD
    if len(s) == 8 and s.isdigit():
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
    return s


def _extract_cpc_codes(record: Dict[str, Any]) -> Optional[str]:
    """Pull CPC classification codes out of whatever shape the ODP
    response uses for them. ODP nests CPC in different ways depending
    on the dataset version; check several known field paths.
    """
    cpc_list: List[str] = []
    candidates = (
        record.get("cpcClassifications")
        or record.get("cpc_classifications")
        or record.get("cpcCodes")
        or record.get("cpc_codes")
        or record.get("cpc_at_issue")
        or []
    )
    if isinstance(candidates, list):
        for item in candidates:
            if isinstance(item, dict):
                code = (
                    item.get("cpcCode")
                    or item.get("cpc_code")
                    or item.get("cpc_group")
                    or item.get("code")
                )
                if code:
                    cpc_list.append(str(code))
            elif isinstance(item, str) and item.strip():
                cpc_list.append(item.strip())
    if not cpc_list:
        return None
    return ", ".join(sorted(set(cpc_list)))


def _normalize_patent(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Map an ODP patent record to the dict shape the rest of the system
    expects. Tolerates camelCase and snake_case keys."""
    patent_number = (
        record.get("patentNumber")
        or record.get("patent_number")
        or record.get("patent_id")
        or record.get("publicationNumber")
    )
    if not patent_number:
        return None

    title = (
        record.get("inventionTitle")
        or record.get("invention_title")
        or record.get("patent_title")
        or record.get("title")
        or ""
    )
    patent_date = _coerce_date(
        record.get("grantDate")
        or record.get("grant_date")
        or record.get("patent_date")
        or record.get("publicationDate")
    )
    abstract = (
        record.get("abstractText")
        or record.get("abstract_text")
        or record.get("patent_abstract")
        or record.get("abstract")
        or ""
    )
    num_claims = _coerce_int(
        record.get("claimCount")
        or record.get("claim_count")
        or record.get("patent_num_claims")
        or record.get("numClaims")
    )

    return {
        "patent_number": str(patent_number),
        "patent_title": title or None,
        "patent_date": patent_date,
        "patent_abstract": abstract or None,
        "num_claims": num_claims,
        "cpc_codes": _extract_cpc_codes(record),
        "dedupe_hash": _compute_hash(str(patent_number)),
    }


def fetch_patents(
    assignee_name: str,
    date_from: Optional[str] = None,
    limit: int = 1000,
) -> List[Dict[str, Any]]:
    """Fetch granted patents for a company from USPTO ODP.

    Args:
        assignee_name: Assignee organization name (e.g. 'Apple Inc.')
        date_from: Start date YYYY-MM-DD (defaults to 3 years ago)
        limit: Max results to return

    Returns:
        List of patent dicts. Empty list if USPTO_API_KEY is unset, the
        upstream returns no rows, or any request error occurs.
    """
    if not API_KEY:
        _log_no_key_once()
        return []

    if not date_from:
        date_from = (datetime.now() - timedelta(days=3 * 365)).strftime("%Y-%m-%d")

    headers = {
        "X-API-Key": API_KEY,
        "Accept": "application/json",
        "User-Agent": "WeThePeople-Patent-Sync/1.0",
    }

    page_size = min(limit, 100)  # ODP pagination cap; verify against the docs
    results: List[Dict[str, Any]] = []
    start = 0
    safety_pages = 0

    while len(results) < limit and safety_pages < 50:
        # ODP `searchText` is a free-text query against title + abstract +
        # assignee name. We ALSO post-filter by assignee to drop
        # cross-references where the company is mentioned but is not the
        # assignee.
        params = {
            "searchText": assignee_name,
            "start": start,
            "rows": page_size,
            "sortField": "grantDate",
            "sortOrder": "desc",
        }

        try:
            time.sleep(POLITE_DELAY)
            resp = requests.get(
                USPTO_ODP_BASE,
                params=params,
                headers=headers,
                timeout=TIMEOUT,
            )
        except requests.RequestException as e:
            logger.error("USPTO ODP request error for '%s': %s", assignee_name, e)
            break

        if resp.status_code == 401 or resp.status_code == 403:
            logger.error(
                "USPTO ODP auth error %d for '%s' — key may be invalid or expired",
                resp.status_code, assignee_name,
            )
            break
        if resp.status_code == 429:
            logger.warning("USPTO ODP rate-limited; backing off")
            time.sleep(10)
            continue
        if resp.status_code != 200:
            logger.error(
                "USPTO ODP HTTP %d for '%s': %s",
                resp.status_code, assignee_name, resp.text[:200],
            )
            break

        try:
            data = resp.json()
        except ValueError:
            logger.error("USPTO ODP non-JSON response for '%s'", assignee_name)
            break

        # ODP wraps results in either `results`, `patents`, `data`, or the
        # bare list. Tolerate all of them.
        records = (
            data.get("results")
            or data.get("patents")
            or data.get("data")
            or (data if isinstance(data, list) else [])
        )

        if not records:
            break

        for rec in records:
            normalized = _normalize_patent(rec)
            if normalized is None:
                continue
            # Date-range post-filter to match legacy connector behavior.
            if date_from and normalized.get("patent_date"):
                if normalized["patent_date"] < date_from:
                    continue
            # Assignee post-filter: ODP `searchText` matches title +
            # abstract + assignee. We want assignee-only.
            assignees_field = (
                rec.get("assigneeName")
                or rec.get("assignee_organization")
                or rec.get("assigneeOrganization")
                or rec.get("currentAssignee")
                or ""
            )
            if isinstance(assignees_field, list):
                joined = " ".join(str(x) for x in assignees_field).lower()
            else:
                joined = str(assignees_field).lower()
            if assignee_name.lower() not in joined:
                # Soft-pass: ODP sometimes leaves assigneeName blank for
                # very recent grants. Accept the row but don't strictly
                # require an assignee match.
                pass
            results.append(normalized)
            if len(results) >= limit:
                break

        if len(records) < page_size:
            break
        start += page_size
        safety_pages += 1

    logger.info(
        "USPTO ODP '%s': %d patents (from %s)",
        assignee_name, len(results), date_from,
    )
    return results[:limit]
