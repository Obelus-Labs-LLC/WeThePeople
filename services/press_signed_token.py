"""Per-story, per-action signed tokens for Gate-5 review emails.

The review digest email embeds one-click Approve/Reject links. Previously
these carried `?key=<WTP_PRESS_API_KEY>` — the root press key — in every
link, exposing it to every mail server, mailbox archive, forwarded message,
and (via the two-step confirmation page) browser history and screenshots.

Signed tokens replace that raw key with a payload that:
  - authorizes exactly one (story_id, action) pair,
  - expires (default 72h),
  - can't be reused for other stories or actions,
  - is invalidated when WTP_PRESS_API_KEY rotates.

Token format:
  base64url(payload) + "." + base64url(hmac)
  where payload = "{story_id}|{action}|{expiry_unix}"
        hmac    = HMAC-SHA256(WTP_PRESS_API_KEY, payload)

The press key doubles as the signing key so there's one secret to manage.
Rotating the press key immediately invalidates all outstanding tokens,
which is the right behavior.
"""

from __future__ import annotations

import base64
import hmac
import hashlib
import os
import time
from typing import Tuple

_ALLOWED_ACTIONS = frozenset({"approve", "reject", "view"})
_DEFAULT_TTL_SECONDS = 72 * 3600


def _signing_key() -> bytes:
    key = os.getenv("WTP_PRESS_API_KEY", "") or os.getenv("WTP_PRESS_KEY", "")
    if not key:
        raise RuntimeError("WTP_PRESS_API_KEY must be set to sign/verify story review tokens")
    return key.encode("utf-8")


def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64d(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def sign_story_action(story_id: int, action: str, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> str:
    """Produce a signed token authorizing (story_id, action) until expiry."""
    if action not in _ALLOWED_ACTIONS:
        raise ValueError(f"action must be one of {sorted(_ALLOWED_ACTIONS)}, got {action!r}")
    expiry = int(time.time()) + int(ttl_seconds)
    payload = f"{int(story_id)}|{action}|{expiry}".encode("utf-8")
    sig = hmac.new(_signing_key(), payload, hashlib.sha256).digest()
    return f"{_b64e(payload)}.{_b64e(sig)}"


def verify_story_action(token: str, story_id: int, action: str) -> Tuple[bool, str]:
    """Return (ok, reason). reason is "" on success; a short diagnostic otherwise.

    Reviewer never sees `reason` — it's for server-side logging only.
    """
    if action not in _ALLOWED_ACTIONS:
        return False, "unknown_action"
    if not token or "." not in token:
        return False, "malformed"

    try:
        payload_b64, sig_b64 = token.split(".", 1)
        payload = _b64d(payload_b64)
        sig = _b64d(sig_b64)
    except (ValueError, base64.binascii.Error):
        return False, "decode_error"

    expected_sig = hmac.new(_signing_key(), payload, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected_sig):
        return False, "bad_signature"

    try:
        sid_str, act, exp_str = payload.decode("utf-8").split("|")
        sid = int(sid_str)
        exp = int(exp_str)
    except (ValueError, UnicodeDecodeError):
        return False, "payload_parse_error"

    if sid != int(story_id):
        return False, "story_id_mismatch"
    if act != action:
        return False, "action_mismatch"
    if time.time() > exp:
        return False, "expired"

    return True, ""
