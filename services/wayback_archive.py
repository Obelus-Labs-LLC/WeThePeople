"""Internet Archive auto-snapshot.

Press-credential applications and academic citations both rely on a
permanent archived URL: even if the publication eventually folds or
moves, the cited record survives. The Wayback Machine's `Save Page
Now` API is the lightest-weight way to get that.

We fire the snapshot request when a story moves from draft to
published. Best-effort: we log success, log failure, and never block
the publish path on the snapshot succeeding (their API is rate-
limited and occasionally slow). If the snapshot fails, we flag the
story for a retry sweep that runs daily.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_S = 15
SAVE_API = "https://web.archive.org/save/"


def archive_url(target_url: str, timeout_s: int = DEFAULT_TIMEOUT_S) -> Optional[str]:
    """Submit a URL to the Wayback Machine. Returns the archived URL
    on success, or None on any failure (network, timeout, rate limit,
    invalid URL). Never raises.

    The archived URL is the canonical Wayback URL of the form
    https://web.archive.org/web/<timestamp>/<original> if we got it
    from the response headers, or a best-guess timestampless URL
    otherwise. Either form resolves to the most-recent snapshot.
    """
    if not target_url or not target_url.startswith(("http://", "https://")):
        return None

    try:
        import requests
    except ImportError:
        logger.info("wayback_archive: requests not installed; skipping")
        return None

    try:
        resp = requests.get(
            SAVE_API + target_url,
            timeout=timeout_s,
            allow_redirects=True,
            headers={"User-Agent": "WeThePeople-Journal/1.0 (+https://wethepeopleforus.com)"},
        )
    except Exception as e:
        logger.warning("wayback_archive: request failed for %s: %s", target_url, e)
        return None

    if resp.status_code >= 400:
        logger.warning(
            "wayback_archive: %s returned HTTP %d", target_url, resp.status_code
        )
        return None

    # The Wayback `Save Page Now` API returns the snapshot URL in the
    # `Content-Location` header (or, for legacy responses, embedded
    # in the URL of the redirect chain). Either is fine; try both.
    snapshot_url = resp.headers.get("Content-Location")
    if snapshot_url and not snapshot_url.startswith("http"):
        snapshot_url = "https://web.archive.org" + snapshot_url
    if not snapshot_url:
        snapshot_url = resp.url
    if not snapshot_url or "web.archive.org" not in snapshot_url:
        return None
    return snapshot_url


def archive_published_story(slug: str, journal_base: Optional[str] = None) -> Optional[str]:
    """Submit a published story URL to the Wayback Machine."""
    base = journal_base or os.getenv(
        "WTP_JOURNAL_BASE", "https://journal.wethepeopleforus.com"
    )
    if not slug:
        return None
    target = f"{base.rstrip('/')}/story/{slug}"
    snapshot = archive_url(target)
    if snapshot:
        logger.info("wayback_archive: snapshotted %s -> %s", target, snapshot)
    return snapshot
