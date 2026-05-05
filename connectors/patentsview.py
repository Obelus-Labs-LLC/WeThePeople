"""
USPTO PatentsView Connector — DEPRECATED (PatentsView shut down)

PatentsView was retired by USPTO. The old hosts no longer resolve
or no longer serve the search API:

    api.patentsview.org/patents/query  → 301 redirect to USPTO transition guide
    search.patentsview.org             → DNS NXDOMAIN

USPTO has migrated patent data to its Open Data Portal at
`data.uspto.gov`. The replacement APIs use a different shape and
authentication model than PatentsView, so a one-line URL update
cannot fix the connector.

Until a migration to data.uspto.gov is completed, this connector
returns an empty list and logs a deprecation warning. The Patent
Explorer tool continues to render the ~4,200 patents already in the
database; no new ingest happens.

Caught in the May 5 upstream-API audit. Tracking: migrate to
data.uspto.gov / USPTO Open Data Portal in a follow-up PR.
"""

import hashlib
import os
import time
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from utils.logging import get_logger

logger = get_logger(__name__)

# Kept for reference only; the old endpoint no longer responds.
_DEFUNCT_PATENTSVIEW_BASE = "https://search.patentsview.org/api/v1/patent/"
API_KEY = os.environ.get("PATENTSVIEW_API_KEY", "")

POLITE_DELAY = 1.5  # ~40 req/min stays under 45 limit (legacy)

_DEPRECATION_LOGGED = False


def _log_deprecation_once() -> None:
    """Log the deprecation warning at most once per process to avoid
    flooding the logs when sync_tech_data iterates across all tracked
    tech companies."""
    global _DEPRECATION_LOGGED
    if not _DEPRECATION_LOGGED:
        logger.warning(
            "connectors.patentsview is deprecated: PatentsView was retired by USPTO. "
            "Patent ingest is paused. Migrate to data.uspto.gov in a follow-up PR."
        )
        _DEPRECATION_LOGGED = True


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def fetch_patents(
    assignee_name: str,
    date_from: Optional[str] = None,
    limit: int = 1000,
) -> List[Dict[str, Any]]:
    """
    Fetch granted patents for a company from PatentsView v1 API.

    Args:
        assignee_name: Assignee organization name (e.g. 'Apple Inc.')
        date_from: Start date YYYY-MM-DD (defaults to 3 years ago)
        limit: Max results to return

    Returns:
        List of patent dicts with keys: patent_number, patent_title,
        patent_date, patent_abstract, num_claims, cpc_codes, dedupe_hash
    """
    # PatentsView retired. Short-circuit and return empty so the sync
    # job continues without raising; the ~4,200 patents already in the
    # per-company cache continue to serve the Patent Explorer UI.
    # The pre-deprecation request body / pagination logic is preserved
    # in git history at the parent of this commit. Re-enable once a
    # migration to data.uspto.gov / USPTO Open Data Portal is in place.
    _log_deprecation_once()
    # Suppress unused-arg lint for symbols the public signature still
    # accepts (so existing callers compile without changes).
    _ = (assignee_name, date_from, limit, time, datetime, timedelta)
    return []
