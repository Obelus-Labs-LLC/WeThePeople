"""
USASpending.gov Connector — Federal Government Contracts

Fetch federal contract awards for tracked companies.

API docs: https://api.usaspending.gov/
Rate limit: None documented (be polite — 1s between calls)
Auth: None required (free public API)

---

## Name-match bug (April 2026)

The `/search/spending_by_award/` endpoint uses `recipient_search_text`, which is
a SUBSTRING search against the recipient name. That meant a query for
"AVIENT" would match "AVIENT CORPORATION" (correct) as well as completely
unrelated vendors whose name happens to contain "avient". Worst observed
case: Avient inflated by ~7,600× because of unrelated match-ups.

Similar problem for defense primes: a query for "LOCKHEED MARTIN" matches
every Lockheed Martin subsidiary (Sikorsky, Aerojet Rocketdyne, …) and some
unrelated small businesses with "Lockheed" in the name. That confused the
story detectors into reporting cumulative-parent numbers as if they were
single-subsidiary numbers.

Fix:
  * `fetch_contracts(..., strict_match=True)` (the new default) applies a
    post-fetch filter: a row is kept ONLY if its normalized
    `Recipient Name` starts with the normalized `recipient_name` we asked
    for, OR matches one of the `allowed_recipient_patterns` the caller
    opts into.
  * Callers that legitimately want subsidiary aggregation pass those
    subsidiary names as `allowed_recipient_patterns`, which makes the
    intent explicit rather than accidental.

## Award-ID modification dedupe

USASpending issues each contract modification as its own row. They share
the same base PIID but differ by modification suffix. A single $1B award
that's been modified 12 times appears as 12 rows of ~$1B each — a 12×
inflation when summed naïvely. `fetch_contracts` now dedupes on the
parent award ID before returning, keeping only the most-recent
modification's row.
"""

import hashlib
import re
import time
import requests
from typing import Optional, List, Dict, Any
from datetime import datetime

from utils.logging import get_logger

logger = get_logger(__name__)

USASPENDING_BASE = "https://api.usaspending.gov/api/v2"

POLITE_DELAY = 1.0


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _safe_float(val) -> float | None:
    """Safely convert a value to float."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _parse_date(val) -> Optional[str]:
    """Parse USASpending date strings (YYYY-MM-DD). Returns string or None."""
    if val is None:
        return None
    s = str(val).strip()[:10]
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return s
    except (ValueError, TypeError):
        return None


# ──────────────────────────────────────────────────────────────────────────
# Name-matching helpers
# ──────────────────────────────────────────────────────────────────────────

_PUNCT_RE = re.compile(r"[^A-Z0-9 ]+")
_WS_RE = re.compile(r"\s+")

# Corporate suffixes we strip before comparison so "LOCKHEED MARTIN" and
# "LOCKHEED MARTIN CORPORATION" compare equal.
_CORP_SUFFIXES = (
    " CORPORATION", " CORP", " COMPANY", " CO", " INCORPORATED",
    " INC", " LLC", " LLP", " LTD", " LIMITED", " PLC", " HOLDINGS",
    " HOLDING", " GROUP", " N V", " NV", " SA", " SE", " AG",
)


def _normalize_name(name: str) -> str:
    """Uppercase, strip punctuation, collapse whitespace, trim corp suffix.

    Used for strict recipient-name matching. Idempotent.

    Examples:
        'The Boeing Company'    -> 'BOEING'
        'AT&T Inc.'             -> 'AT T'
        'Lockheed Martin Corp.' -> 'LOCKHEED MARTIN'
        "Moody's Analytics"     -> 'MOODYS ANALYTICS'
    """
    if not name:
        return ""
    s = str(name).upper()
    # Strip apostrophes FIRST (and any typographic variants) so "MOODY'S"
    # collapses to "MOODYS" rather than splitting into "MOODY S" when the
    # general punctuation pass converts apostrophes to spaces. Without this
    # step we create orphan single-letter tokens that confuse matching.
    s = s.replace("'", "").replace("\u2019", "").replace("\u2018", "")
    # Normalize remaining punctuation to spaces, collapse whitespace.
    s = _PUNCT_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    # Strip leading "THE " so "THE BOEING COMPANY" compares equal to
    # "BOEING COMPANY" (our tracked names typically don't include "THE").
    if s.startswith("THE "):
        s = s[4:].strip()
    # Strip trailing corporate suffix so "X CORP" compares equal to "X".
    for sfx in _CORP_SUFFIXES:
        if s.endswith(sfx):
            s = s[: -len(sfx)].strip()
            break  # one pass is enough; avoid chopping real words
    return s


def _recipient_matches(
    candidate: str,
    canonical: str,
    patterns: Optional[List[str]] = None,
) -> bool:
    """True iff `candidate` is the same recipient as `canonical`.

    Rules:
      * Default: candidate must match canonical EXACTLY after normalization.
        Prevents false positives like "AVIENT PACIFIC INC" matching a
        canonical of "AVIENT" (different entity, same prefix).
      * If `patterns` is supplied, candidate may ALSO match any pattern
        via word-boundary startswith — e.g. patterns=["SIKORSKY"] will
        match "SIKORSKY AIRCRAFT CORP" but not "SIKORSKY-ALLIED LTD".

    Callers that want subsidiary aggregation for a tracked parent (e.g.
    Lockheed Martin with Lockheed Martin Aeronautics, Sikorsky, Aerojet
    Rocketdyne as subsidiaries) pass each subsidiary prefix as a pattern.
    This keeps subsidiary inclusion explicit and auditable rather than an
    emergent property of substring matching.
    """
    c = _normalize_name(candidate)
    canon = _normalize_name(canonical)
    if not c or not canon:
        return False
    if c == canon:
        return True
    if patterns:
        for p in patterns:
            pn = _normalize_name(p)
            if not pn:
                continue
            # word-boundary startswith: c == pn OR c starts with "pn "
            if c == pn or c.startswith(pn + " "):
                return True
    return False


def filter_contracts_by_recipient(
    awards: List[Dict[str, Any]],
    canonical_name: str,
    patterns: Optional[List[str]] = None,
    recipient_name_key: str = "Recipient Name",
) -> List[Dict[str, Any]]:
    """Drop awards whose Recipient Name doesn't belong to the canonical entity.

    Used by the 7+ inline `fetch_contracts(session, company)` functions in
    `jobs/sync_*_data.py` to patch the same name-collision bug without
    refactoring every sync to the shared connector call.

    If an award row has no `Recipient Name` field (old responses or tests),
    we keep it — we can't confidently reject, and dropping silently would
    make the fix itself a regression. Those rows will be logged at DEBUG.
    """
    kept: List[Dict[str, Any]] = []
    dropped = 0
    for a in awards:
        rn = a.get(recipient_name_key) or a.get("recipient_name")
        if rn is None:
            logger.debug("award missing Recipient Name, keeping: %s", a.get("Award ID"))
            kept.append(a)
            continue
        if _recipient_matches(rn, canonical_name, patterns):
            kept.append(a)
        else:
            dropped += 1
    if dropped:
        logger.info(
            "filter_contracts_by_recipient('%s'): kept %d, dropped %d unrelated",
            canonical_name, len(kept), dropped,
        )
    return kept


# ──────────────────────────────────────────────────────────────────────────
# Modification dedupe helpers
# ──────────────────────────────────────────────────────────────────────────

def _award_parent_key(award_id: str) -> str:
    """Reduce an Award ID to its parent (pre-modification) key.

    USASpending's "Award ID" for a DOD contract looks like
    `HR001122C0001_P00012` or similar — the `_P\\d+` / `_A\\d+` suffix is
    a modification number. We dedupe on the parent so a single $1B award
    that's been modified 12 times doesn't count as $12B.
    """
    if not award_id:
        return ""
    # Strip common modification suffixes (P##, A##, -P##) at the end.
    return re.sub(r"[-_][PAM]\d+$", "", str(award_id), flags=re.IGNORECASE)


# ──────────────────────────────────────────────────────────────────────────
# Main fetch
# ──────────────────────────────────────────────────────────────────────────

def fetch_contracts(
    recipient_name: str,
    limit: int = 100,
    fiscal_year: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    strict_match: bool = True,
    allowed_recipient_patterns: Optional[List[str]] = None,
    dedupe_modifications: bool = True,
    max_pages: int = 50,
) -> List[Dict[str, Any]]:
    """
    Fetch federal contract awards for a recipient from USASpending.gov.
    Paginates through all pages (API max 100 per page).

    Args:
        recipient_name:  Canonical recipient name, e.g. 'LOCKHEED MARTIN'.
                         The API's `recipient_search_text` is a substring
                         match, so we always post-filter unless
                         strict_match=False.
        limit:           Results per page (max 100).
        fiscal_year:     Optional fiscal year filter.
        start_date:      Optional 'YYYY-MM-DD' — overrides fiscal_year if set.
        end_date:        Optional 'YYYY-MM-DD' — used with start_date.
        strict_match:    (default True) Drop rows whose Recipient Name
                         doesn't match the canonical name or one of the
                         allowed patterns. Set False only for debug or
                         exploratory flows.
        allowed_recipient_patterns:
                         Optional list of additional name prefixes to
                         accept, e.g. ["SIKORSKY", "AEROJET ROCKETDYNE"]
                         for Lockheed Martin subsidiaries.
        dedupe_modifications:
                         (default True) Collapse award rows that are just
                         modifications of the same base award into one row
                         (the highest-amount row is kept). Prevents N×
                         inflation when a long contract has many mods.
        max_pages:       Safety cap. At 100/page this is 5,000 awards per
                         recipient; primes rarely need more than ~2,000.

    Returns:
        List of contract dicts with keys: award_id, award_amount,
        awarding_agency, description, start_date, end_date,
        contract_type, recipient_name, recipient_uei, dedupe_hash.
    """
    page_size = min(limit, 100)  # API max per page is 100
    url = f"{USASPENDING_BASE}/search/spending_by_award/"
    results: List[Dict[str, Any]] = []
    page = 1

    # Build time_period filter. Explicit start/end takes precedence over
    # fiscal_year so callers can request a lobbying-aligned 2020-present
    # window without having to loop through fiscal years.
    time_period = None
    if start_date and end_date:
        time_period = [{"start_date": start_date, "end_date": end_date}]
    elif fiscal_year:
        time_period = [
            {"start_date": f"{fiscal_year - 1}-10-01",
             "end_date": f"{fiscal_year}-09-30"}
        ]

    while page <= max_pages:
        payload = {
            "filters": {
                "recipient_search_text": [recipient_name],
                "award_type_codes": ["A", "B", "C", "D"],  # Contracts only, no IDV parents
            },
            "fields": [
                "Award ID",
                "Award Amount",
                "Awarding Agency",
                "Description",
                "Start Date",
                "End Date",
                "Award Type",
                "Recipient Name",
                "Recipient UEI",
            ],
            "limit": page_size,
            "page": page,
            "sort": "Award Amount",
            "order": "desc",
        }

        if time_period:
            payload["filters"]["time_period"] = time_period

        try:
            time.sleep(POLITE_DELAY)
            resp = requests.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error("USASpending fetch failed for '%s' (page %d): %s", recipient_name, page, e)
            break

        results_raw = data.get("results", [])
        if not results_raw:
            break

        for award in results_raw:
            award_id = award.get("Award ID") or award.get("generated_internal_id", "")
            award_amount = _safe_float(award.get("Award Amount"))
            awarding_agency = award.get("Awarding Agency")
            description = (award.get("Description") or "")[:500]
            start_date_val = _parse_date(award.get("Start Date"))
            end_date_val = _parse_date(award.get("End Date"))
            contract_type = award.get("Award Type")
            recip_name = award.get("Recipient Name")
            recip_uei = award.get("Recipient UEI")

            results.append({
                "award_id": award_id,
                "award_amount": award_amount,
                "awarding_agency": awarding_agency,
                "description": description,
                "start_date": start_date_val,
                "end_date": end_date_val,
                "contract_type": contract_type,
                "recipient_name": recip_name,
                "recipient_uei": recip_uei,
                "dedupe_hash": _compute_hash(award_id or (description or "")[:50]),
            })

        # Stop if we got fewer than a full page (no more results)
        if len(results_raw) < page_size:
            break

        page += 1

    raw_count = len(results)

    # Post-fetch name filter. This is the fix for the Avient/Olin/Lockheed
    # collision bug — `recipient_search_text` is a substring match, so we
    # throw away rows whose Recipient Name doesn't belong to the
    # canonical entity.
    if strict_match:
        kept: List[Dict[str, Any]] = []
        dropped = 0
        for a in results:
            rn = a.get("recipient_name")
            if rn is None:
                # Missing field — keep (old behavior) and log for audit.
                logger.debug("award missing Recipient Name, keeping: %s", a.get("award_id"))
                kept.append(a)
                continue
            if _recipient_matches(rn, recipient_name, allowed_recipient_patterns):
                kept.append(a)
            else:
                dropped += 1
        if dropped:
            logger.info(
                "USASpending '%s': dropped %d/%d rows with unrelated Recipient Name",
                recipient_name, dropped, raw_count,
            )
        results = kept

    # Modification dedupe: collapse rows that are modifications of the
    # same base award, keeping the row with the highest award_amount
    # (the final cumulative obligation after all mods have landed).
    if dedupe_modifications and results:
        by_parent: Dict[str, Dict[str, Any]] = {}
        for a in results:
            parent = _award_parent_key(a.get("award_id") or "")
            key = parent or a.get("award_id") or a["dedupe_hash"]
            prev = by_parent.get(key)
            if prev is None:
                by_parent[key] = a
            else:
                prev_amt = prev.get("award_amount") or 0
                cur_amt = a.get("award_amount") or 0
                if cur_amt > prev_amt:
                    by_parent[key] = a
        before = len(results)
        results = list(by_parent.values())
        collapsed = before - len(results)
        if collapsed:
            logger.info(
                "USASpending '%s': collapsed %d modification rows into parent awards",
                recipient_name, collapsed,
            )

    logger.info(
        "USASpending '%s': %d contracts (raw %d)",
        recipient_name, len(results), raw_count,
    )
    return results


# ──────────────────────────────────────────────────────────────────────────
# Authoritative parent-level totals
# ──────────────────────────────────────────────────────────────────────────

def fetch_recipient_totals(
    recipient_name: str,
    recipient_uei: Optional[str] = None,
    fiscal_year: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """Query USASpending's authoritative `/recipient/` endpoint.

    This is the correct endpoint for story-level sanity totals, because
    it returns the recipient's obligated / outlayed totals rolled up at
    the parent level — no name-collision risk, no modification
    double-counting. Pair with `fetch_contracts` to verify that the
    sum of per-award amounts agrees with the recipient-level total
    before writing a story.

    Returns a dict with at least:
        recipient_hash, recipient_id (= hash-level),
        name, uei, duns,
        total_obligation_amount, total_outlay_amount, total_transactions,
        or None if the recipient cannot be found.
    """
    # Step 1: discover recipient_id if we only have a name.
    rid = None
    if recipient_uei:
        # Try UEI-based lookup directly.
        try:
            time.sleep(POLITE_DELAY)
            url = f"{USASPENDING_BASE}/recipient/{recipient_uei}/"
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200:
                body = resp.json()
                if body.get("recipient_id"):
                    return body
        except Exception as e:
            logger.debug("recipient/ UEI lookup failed for %s: %s", recipient_uei, e)

    # Step 2: fall back to the autocomplete/search endpoint.
    try:
        time.sleep(POLITE_DELAY)
        url = f"{USASPENDING_BASE}/recipient/"
        payload = {
            "keyword": recipient_name,
            "order": "desc",
            "sort": "amount",
            "limit": 5,
            "page": 1,
            "award_type": "contracts",
        }
        resp = requests.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        body = resp.json()
        candidates = body.get("results") or []
    except Exception as e:
        logger.warning("recipient/ search failed for '%s': %s", recipient_name, e)
        return None

    for c in candidates:
        if _recipient_matches(c.get("name", ""), recipient_name):
            rid = c.get("id") or c.get("recipient_id")
            break

    if not rid:
        logger.info("recipient/ search found no match for '%s'", recipient_name)
        return None

    # Step 3: fetch the matched recipient's detail for total obligation.
    try:
        time.sleep(POLITE_DELAY)
        url = f"{USASPENDING_BASE}/recipient/{rid}/"
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("recipient/ detail fetch failed for %s: %s", rid, e)
        return None
