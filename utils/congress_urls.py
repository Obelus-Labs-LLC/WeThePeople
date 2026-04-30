"""Shared helpers for constructing congress.gov URLs.

Two failure modes we hit before this module existed:
  1. Building URLs as `{bill_type}-bill/{number}` (e.g. `hr-bill/5516`).
     congress.gov rejects this format with "invalid request parameters".
     The correct slug is `house-bill` for HR and `senate-bill` for S,
     plus the longer slugs for joint / concurrent / simple resolutions.
  2. Building the congress segment as `{n}th-congress` for every n —
     fails for 1st / 2nd / 3rd / 21st / 22nd / 23rd / etc. Use the
     ordinal-aware version.

Use these helpers anywhere a congress.gov URL is built so the bug
doesn't drift back in via copy-paste.
"""

from __future__ import annotations

# Map our internal bill_type values (lowercase) to the slug congress.gov
# expects in URLs. Keys are case-insensitive on lookup.
_BILL_TYPE_TO_CONGRESS_SLUG = {
    "hr":      "house-bill",
    "s":       "senate-bill",
    "hjres":   "house-joint-resolution",
    "sjres":   "senate-joint-resolution",
    "hconres": "house-concurrent-resolution",
    "sconres": "senate-concurrent-resolution",
    "hres":    "house-resolution",
    "sres":    "senate-resolution",
}


def bill_type_slug(bill_type: str | None) -> str:
    """Translate a bill_type code to its congress.gov URL slug.

    Returns the input unchanged if it's already in the long form, or
    if we don't recognize it. Lowercase comparison; trims whitespace.
    """
    if not bill_type:
        return ""
    key = bill_type.strip().lower()
    return _BILL_TYPE_TO_CONGRESS_SLUG.get(key, key)


def ordinal(n: int) -> str:
    """Return the English ordinal suffix for n (1st / 2nd / 3rd / 4th)."""
    if 11 <= (n % 100) <= 13:
        return f"{n}th"
    suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def congress_bill_url(
    congress: int | str | None,
    bill_type: str | None,
    bill_number: str | int | None,
) -> str | None:
    """Build the canonical congress.gov bill URL.

    Returns None when any required component is missing. Raising would
    blow up ingest pipelines on partial records; None lets callers
    fall back to a no-source-url state.
    """
    if not congress or not bill_type or not bill_number:
        return None
    try:
        congress_int = int(congress)
    except (ValueError, TypeError):
        return None
    slug = bill_type_slug(bill_type)
    if not slug:
        return None
    return (
        f"https://www.congress.gov/bill/{ordinal(congress_int)}-congress/"
        f"{slug}/{bill_number}"
    )


def congress_bill_text_url(
    congress: int | str | None,
    bill_type: str | None,
    bill_number: str | int | None,
) -> str | None:
    """Build the /text variant of the canonical bill URL.

    Used by the bill-text fetcher. Same defensive None-on-incomplete
    semantics as congress_bill_url().
    """
    base = congress_bill_url(congress, bill_type, bill_number)
    if not base:
        return None
    return f"{base}/text"
