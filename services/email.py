"""
Centralized email sending via Resend API.

All outgoing emails go through this module to avoid hardcoding the Resend URL
in multiple places.
"""

import os
from typing import Dict, List, Optional

import requests as http_requests

from utils.logging import get_logger

logger = get_logger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


def send_email(
    to: List[str],
    subject: str,
    html: str,
    from_addr: Optional[str] = None,
    resend_key: Optional[str] = None,
) -> bool:
    """Send an email via Resend. Returns True on success, False on failure."""
    key = resend_key or os.getenv("RESEND_API_KEY", "")
    if not key:
        logger.warning("No RESEND_API_KEY set — skipping email to %s", to)
        return False

    sender = from_addr or os.getenv("WTP_DIGEST_FROM", "digest@wethepeopleforus.com")
    try:
        resp = http_requests.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"from": sender, "to": to, "subject": subject, "html": html},
            timeout=10,
        )
        if resp.status_code >= 400:
            logger.error("Resend email failed: %s %s", resp.status_code, resp.text[:200])
            return False
        return True
    except Exception as e:
        logger.error("Resend email error: %s", e)
        return False
