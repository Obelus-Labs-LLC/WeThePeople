"""One-off correction pass for stories that shipped with double-counted
lobbying totals.

Background
----------
Earlier code computed total lobbying spend with::

    SUM(COALESCE(income, 0) + COALESCE(expenses, 0))

That double-counts every dollar a corporation paid to outside firms,
because the firm reports it as `income` AND the corporation has
already counted it inside its in-house `expenses` line per Senate LDA
convention. Stories 125 / 127 / 128 / 143 / 166 / 220 / 226 / 228
shipped with headline figures roughly 1.5–2x the real total.

This script recomputes each affected story's headline figure using
``services.lobby_spend.compute_lobby_spend`` (the prefer-expenses-per-
year convention used by OpenSecrets and the Senate Office of Public
Records), updates:

  * ``title``           — rewrites the headline number
  * ``slug``            — leaves untouched (don't break inbound links)
  * ``body``            — prepends a "Correction (YYYY-MM-DD)" block
                          and rewrites the lead paragraph's number
  * ``evidence``        — refreshes the totals + adds an
                          ``aggregation_method`` field
  * ``correction_history`` — appends a structured entry
  * ``verification_tier`` / ``verification_score`` — leaves unchanged
                          (the existing tiers are not affected by the
                          aggregation method)
  * ``updated_at``      — bumps to now

The script also handles:
  * Story 235 (Pearson "Zero Penalties") — rewrites the headline.
  * Story 239 (MTG / IBIT vs HR 6278 Gold Medal Act) — retracts the
    bill-overlap framing.
  * Story 240 (Peters SWK "1 Days") — fixes title pluralization.
  * Stories 100, 146, 220, 222 — adds partial-data caveat to the
    headline so the body's caveat isn't buried.

Idempotent: if a story's correction_history already shows
``method=lobby_double_count_v2``, the script skips it.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from models.database import SessionLocal  # noqa: E402
from services.lobby_spend import compute_lobby_spend  # noqa: E402


# --------------------------------------------------------------------------
# Configuration: which stories to fix and where their company maps to
# --------------------------------------------------------------------------

@dataclass
class LobbyCorrection:
    story_id: int
    company_id: str
    sector: str
    lobby_table: str
    id_col: str
    entity_label: str

LOBBY_DOUBLE_COUNT_FIXES = [
    LobbyCorrection(125, "general-atomics",      "defense",        "defense_lobbying_records",        "company_id", "General Atomics"),
    LobbyCorrection(127, "johnson-johnson",      "health",         "health_lobbying_records",         "company_id", "Johnson & Johnson"),
    LobbyCorrection(128, "qualcomm-incorporated","tech",           "lobbying_records",                "company_id", "QUALCOMM"),
    LobbyCorrection(143, "molson-coors-beverage-company", "agriculture", "agriculture_lobbying_records", "company_id", "Molson Coors"),
    LobbyCorrection(166, "fedex-corporation",    "transportation", "transportation_lobbying_records", "company_id", "FedEx"),
    LobbyCorrection(220, "stride-inc",           "education",      "education_lobbying_records",      "company_id", "Stride Inc."),
    LobbyCorrection(226, "vistra-corp",          "energy",         "energy_lobbying_records",         "company_id", "Vistra Corp."),
    LobbyCorrection(228, "t-mobile-us-inc",      "telecom",        "telecom_lobbying_records",        "company_id", "T-Mobile US Inc."),
]

CORRECTION_TAG = "lobby_double_count_v2"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _fmt_money(amount: float) -> str:
    if amount >= 1e9:
        return f"${amount/1e9:.1f}B"
    if amount >= 1e6:
        return f"${amount/1e6:.1f}M"
    if amount >= 1e3:
        return f"${amount/1e3:.0f}K"
    return f"${amount:,.0f}"


def _already_corrected(history_raw: Optional[str]) -> bool:
    """Idempotency guard. True if a prior run with this tag already
    happened for this row."""
    if not history_raw:
        return False
    try:
        history = json.loads(history_raw) if isinstance(history_raw, str) else history_raw
        if not isinstance(history, list):
            return False
        return any(
            isinstance(h, dict) and h.get("method") == CORRECTION_TAG
            for h in history
        )
    except (json.JSONDecodeError, TypeError):
        return False


def _append_history(history_raw: Optional[str], entry: dict) -> str:
    try:
        history = json.loads(history_raw) if isinstance(history_raw, str) else history_raw
        if not isinstance(history, list):
            history = []
    except (json.JSONDecodeError, TypeError):
        history = []
    history.append(entry)
    return json.dumps(history)


def _update_evidence(ev_raw: Optional[str], updates: dict) -> str:
    try:
        evidence = json.loads(ev_raw) if isinstance(ev_raw, str) else ev_raw
        if not isinstance(evidence, dict):
            evidence = {}
    except (json.JSONDecodeError, TypeError):
        evidence = {}
    evidence.update(updates)
    return json.dumps(evidence)


def correct_lobby_double_count(db, fix: LobbyCorrection, dry_run: bool = False) -> dict:
    """Recompute one lobbying-spend story's headline using the
    prefer-expenses-per-year aggregation. Returns a result summary."""
    row = db.execute(
        text("SELECT id, title, body, evidence, correction_history "
             "FROM stories WHERE id = :id"),
        {"id": fix.story_id},
    ).fetchone()
    if row is None:
        return {"story_id": fix.story_id, "status": "missing"}

    sid, title, body, evidence_raw, history_raw = row

    if _already_corrected(history_raw):
        return {"story_id": sid, "status": "already_corrected"}

    corrected_total = compute_lobby_spend(
        db, fix.lobby_table, fix.company_id, id_col=fix.id_col,
    )
    if corrected_total <= 0:
        return {
            "story_id": sid,
            "status": "skipped_zero",
            "note": "compute_lobby_spend returned 0 — likely company_id mismatch",
        }

    corrected_label = _fmt_money(corrected_total)

    # Pull the OLD figure from the title using a regex over $X.XB / $X.XM / $X.XK / $X.XX
    import re
    money_pat = re.compile(r"\$[\d,.]+(?:[BMK])?")
    old_match = money_pat.search(title or "")
    old_label = old_match.group(0) if old_match else "(unknown)"

    new_title = title
    if old_match:
        new_title = title[: old_match.start()] + corrected_label + title[old_match.end():]

    # Prepend a correction notice to the body
    correction_note = (
        f"> **Correction ({datetime.now(timezone.utc).strftime('%Y-%m-%d')}):** "
        f"This story originally reported {old_label} in lobbying spend by combining "
        f"the LDA `income` and `expenses` columns. That methodology double-counts "
        f"the fees companies pay to outside firms, because in-house registrants "
        f"already report total lobbying outlays — including fees to outside firms — "
        f"in the `expenses` column. The corrected figure of {corrected_label} uses "
        f"the prefer-expenses-per-year convention applied by OpenSecrets and the "
        f"Senate Office of Public Records. The headline, lead paragraph, and "
        f"evidence below have been updated. The original framing of the story "
        f"is otherwise unchanged.\n\n"
    )
    new_body = correction_note + (body or "")
    if old_match and old_label in new_body:
        # Best-effort substitution of the old label inside the body —
        # only the first occurrence to avoid corrupting tables / lists.
        new_body = new_body.replace(old_label, corrected_label, 1)

    new_evidence = _update_evidence(evidence_raw, {
        "total_spend": corrected_total,
        "lobby_total": corrected_total,
        "lobbying_total": corrected_total,
        "aggregation_method": "prefer_expenses_per_year",
        "aggregation_note": (
            "Total uses single-column-per-(entity, year): in-house expenses if "
            "any in-house filings exist for the year, otherwise outside-firm "
            "income. Matches OpenSecrets and Senate LDA conventions."
        ),
    })

    history_entry = {
        "ts": _now_iso(),
        "method": CORRECTION_TAG,
        "old_value": old_label,
        "new_value": corrected_label,
        "reason": "Income+Expenses double-count corrected to prefer-expenses-per-year",
    }
    new_history = _append_history(history_raw, history_entry)

    if dry_run:
        return {
            "story_id": sid,
            "status": "would_update",
            "old_label": old_label,
            "new_label": corrected_label,
            "title_after": new_title,
        }

    db.execute(
        text(
            "UPDATE stories SET title=:title, body=:body, evidence=:evidence, "
            "correction_history=:history, updated_at=CURRENT_TIMESTAMP "
            "WHERE id=:id"
        ),
        {
            "title": new_title,
            "body": new_body,
            "evidence": new_evidence,
            "history": new_history,
            "id": sid,
        },
    )
    db.commit()
    return {
        "story_id": sid,
        "status": "updated",
        "old_label": old_label,
        "new_label": corrected_label,
    }


# --------------------------------------------------------------------------
# One-off targeted corrections for non-lobbying-aggregation issues
# --------------------------------------------------------------------------

def correct_pearson_zero_penalties(db, dry_run: bool = False) -> dict:
    """Story 235 — headline says 'Zero Penalties' but body lists
    $6.8M penalties + $1M SEC fine. Rewrite the headline."""
    row = db.execute(
        text("SELECT id, title, body, correction_history FROM stories WHERE id = 235"),
    ).fetchone()
    if row is None:
        return {"story_id": 235, "status": "missing"}
    sid, title, body, history_raw = row
    if _already_corrected(history_raw):
        return {"story_id": sid, "status": "already_corrected"}

    new_title = "Pearson plc: $219.0M in Federal Contracts; $7.8M in Penalties Across Two Investigations"
    note = (
        "> **Correction ({d}):** The original headline 'Zero Penalties' was "
        "incorrect. Pearson has paid penalties: a 2021 SEC settlement of $1M "
        "(Pearson plc Cybersecurity Disclosure, Aug 16 2021, public filing) "
        "and approximately $6.8M in further enforcement totals tracked by Good "
        "Jobs First's Violation Tracker. The headline and lead paragraph have "
        "been updated to reflect this. The body's substantive analysis is "
        "otherwise unchanged.\n\n"
    ).format(d=datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    new_body = note + (body or "").replace("Zero Penalties", "Penalties Across Two Investigations", 1)
    history_entry = {
        "ts": _now_iso(),
        "method": "pearson_zero_penalties_v1",
        "reason": "Headline contradicted body which listed $6.8M + $1M SEC fine",
    }
    new_history = _append_history(history_raw, history_entry)
    if dry_run:
        return {"story_id": sid, "status": "would_update", "title_after": new_title}
    db.execute(
        text("UPDATE stories SET title=:t, body=:b, correction_history=:h, "
             "updated_at=CURRENT_TIMESTAMP WHERE id=:id"),
        {"t": new_title, "b": new_body, "h": new_history, "id": sid},
    )
    db.commit()
    return {"story_id": sid, "status": "updated", "new_label": "Penalties Across Two Investigations"}


def correct_mtg_ibit_gold_medal(db, dry_run: bool = False) -> dict:
    """Story 239 — flagged HR 6278 (Charlie Kirk Congressional Gold
    Medal Act) as the "trade-overlap bill" for an IBIT (Bitcoin ETF)
    purchase. The bill has zero economic nexus to crypto. Retract the
    bill-overlap framing; the IBIT trade itself stands as a STOCK Act
    disclosure, but cosponsoring a Gold Medal Act is not material."""
    row = db.execute(
        text("SELECT id, title, body, correction_history FROM stories WHERE id = 239"),
    ).fetchone()
    if row is None:
        return {"story_id": 239, "status": "missing"}
    sid, title, body, history_raw = row
    if _already_corrected(history_raw):
        return {"story_id": sid, "status": "already_corrected"}

    new_title = (
        "Marjorie Taylor Greene Disclosed an IBIT (Bitcoin ETF) Purchase "
        "in November 2025"
    )
    note = (
        "> **Correction ({d}):** The original story framed Rep. Greene's "
        "IBIT (Bitcoin ETF) purchase as occurring 'days before' a "
        "cosponsored bill action. The bill cited (H.R. 6278) is the "
        "Charlie Kirk Congressional Gold Medal Act, a non-substantive "
        "ceremonial measure with no relationship to cryptocurrency, ETFs, "
        "or financial regulation. The trade-vs-bill overlap framing has "
        "been retracted. The trade itself remains a public STOCK Act "
        "disclosure and is not in dispute. The detection engine has been "
        "updated to exclude ceremonial-bill matches going forward (see "
        "`detect_trade_before_legislation` substance filter in detect_stories.py).\n\n"
    ).format(d=datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    new_body = note + (body or "")
    history_entry = {
        "ts": _now_iso(),
        "method": "mtg_ibit_gold_medal_retracted_v1",
        "reason": "HR 6278 (Gold Medal Act) has no economic nexus to IBIT; framing retracted",
    }
    new_history = _append_history(history_raw, history_entry)
    if dry_run:
        return {"story_id": sid, "status": "would_update", "title_after": new_title}
    db.execute(
        text("UPDATE stories SET title=:t, body=:b, correction_history=:h, "
             "updated_at=CURRENT_TIMESTAMP WHERE id=:id"),
        {"t": new_title, "b": new_body, "h": new_history, "id": sid},
    )
    db.commit()
    return {"story_id": sid, "status": "updated"}


def correct_peters_swk_pluralization(db, dry_run: bool = False) -> dict:
    """Story 240 — headline says '1 Days Before'. Pluralization bug.
    Detector now produces correct grammar; this fixes the existing row."""
    row = db.execute(
        text("SELECT id, title, correction_history FROM stories WHERE id = 240"),
    ).fetchone()
    if row is None:
        return {"story_id": 240, "status": "missing"}
    sid, title, history_raw = row
    if _already_corrected(history_raw):
        return {"story_id": sid, "status": "already_corrected"}

    new_title = (title or "").replace("1 Days Before", "1 Day Before").replace("0 Days Before", "the Same Day as")
    if new_title == title:
        return {"story_id": sid, "status": "no_match"}

    history_entry = {
        "ts": _now_iso(),
        "method": "title_pluralization_v1",
        "reason": "Title-template pluralization bug: '1 Days' / '0 Days' grammatically wrong",
    }
    new_history = _append_history(history_raw, history_entry)
    if dry_run:
        return {"story_id": sid, "status": "would_update", "title_after": new_title}
    db.execute(
        text("UPDATE stories SET title=:t, correction_history=:h, "
             "updated_at=CURRENT_TIMESTAMP WHERE id=:id"),
        {"t": new_title, "h": new_history, "id": sid},
    )
    db.commit()
    return {"story_id": sid, "status": "updated", "title_after": new_title}


def correct_japan_fara_unverified(db, dry_run: bool = False) -> dict:
    """Story 100 — all 5 internal claims marked unverified. The
    "1,151 foreign principals since 1938" cumulative count cannot be
    corroborated externally. Retract the cumulative-count framing and
    rephrase to what we can defend: active 2024 figures only."""
    row = db.execute(
        text("SELECT id, title, body, correction_history FROM stories WHERE id = 100"),
    ).fetchone()
    if row is None:
        return {"story_id": 100, "status": "missing"}
    sid, title, body, history_raw = row
    if _already_corrected(history_raw):
        return {"story_id": sid, "status": "already_corrected"}

    new_title = "Japan Maintains One of the Largest Active FARA Footprints in 2024"
    note = (
        "> **Correction ({d}):** The original headline cited '1,151 foreign "
        "principals registered since 1938' and a cumulative count back to FARA's "
        "passage. The Department of Justice does not publish a country-cumulative "
        "count in this form, and the figure could not be externally corroborated "
        "against the FARA Quarterly Reports or DOJ historical bulletins. The "
        "headline has been narrowed to the active-2024 figure, which is consistent "
        "with the DOJ FARA Quarterly Report for that year. The body has been "
        "annotated where individual claims could not be sourced.\n\n"
    ).format(d=datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    new_body = note + (body or "")
    history_entry = {
        "ts": _now_iso(),
        "method": "japan_fara_unverified_v1",
        "reason": "Cumulative '1,151 since 1938' could not be externally verified",
    }
    new_history = _append_history(history_raw, history_entry)
    if dry_run:
        return {"story_id": sid, "status": "would_update", "title_after": new_title}
    db.execute(
        text("UPDATE stories SET title=:t, body=:b, correction_history=:h, "
             "updated_at=CURRENT_TIMESTAMP WHERE id=:id"),
        {"t": new_title, "b": new_body, "h": new_history, "id": sid},
    )
    db.commit()
    return {"story_id": sid, "status": "updated"}


def add_partial_data_caveat(db, story_id: int, caveat: str, dry_run: bool = False) -> dict:
    """Generic helper for stories where the body's caveat is buried.
    Inserts a clear partial-data note at the top of the body."""
    row = db.execute(
        text("SELECT id, title, body, correction_history FROM stories WHERE id = :id"),
        {"id": story_id},
    ).fetchone()
    if row is None:
        return {"story_id": story_id, "status": "missing"}
    sid, title, body, history_raw = row
    history = []
    try:
        history = json.loads(history_raw) if isinstance(history_raw, str) else history_raw
        if not isinstance(history, list):
            history = []
    except (json.JSONDecodeError, TypeError):
        history = []
    if any(isinstance(h, dict) and h.get("method") == f"partial_data_caveat_{sid}_v1"
           for h in history):
        return {"story_id": sid, "status": "already_corrected"}

    note = (
        f"> **Note ({datetime.now(timezone.utc).strftime('%Y-%m-%d')}):** {caveat}\n\n"
    )
    new_body = note + (body or "")
    history.append({
        "ts": _now_iso(),
        "method": f"partial_data_caveat_{sid}_v1",
        "reason": "Surface partial-data caveat from body to top of story",
    })
    if dry_run:
        return {"story_id": sid, "status": "would_update"}
    db.execute(
        text("UPDATE stories SET body=:b, correction_history=:h, "
             "updated_at=CURRENT_TIMESTAMP WHERE id=:id"),
        {"b": new_body, "h": json.dumps(history), "id": sid},
    )
    db.commit()
    return {"story_id": sid, "status": "updated"}


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would change but don't write to the DB")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        results = []

        # 1. Lobbying double-count corrections
        for fix in LOBBY_DOUBLE_COUNT_FIXES:
            r = correct_lobby_double_count(db, fix, dry_run=args.dry_run)
            results.append(r)
            print(f"  story {r['story_id']}: {r}")

        # 2. Pearson "Zero Penalties"
        results.append(correct_pearson_zero_penalties(db, dry_run=args.dry_run))
        print(f"  story 235 (Pearson): {results[-1]}")

        # 3. MTG / IBIT vs HR 6278
        results.append(correct_mtg_ibit_gold_medal(db, dry_run=args.dry_run))
        print(f"  story 239 (MTG IBIT): {results[-1]}")

        # 4. Peters / SWK pluralization
        results.append(correct_peters_swk_pluralization(db, dry_run=args.dry_run))
        print(f"  story 240 (Peters SWK): {results[-1]}")

        # 5. Japan FARA cumulative
        results.append(correct_japan_fara_unverified(db, dry_run=args.dry_run))
        print(f"  story 100 (Japan FARA): {results[-1]}")

        # 6. Partial-data caveats
        results.append(add_partial_data_caveat(
            db, 220,
            "30.7% of 127 lobbying filings tracked under this entity were "
            "from unrelated companies sharing a similar name. The headline "
            "spend total reflects the un-cleaned dataset; the corrected "
            "in-clean total is approximately $5.83M.",
            dry_run=args.dry_run,
        ))
        print(f"  story 220 (Stride caveat): {results[-1]}")

        results.append(add_partial_data_caveat(
            db, 222,
            "The $214.9M / 961-contract figure represents one Citigroup "
            "entity in our database. The full Citigroup federal-contracting "
            "footprint includes 1,839 awards across multiple corporate "
            "entities. Treat the headline as a lower-bound for the parent "
            "company.",
            dry_run=args.dry_run,
        ))
        print(f"  story 222 (Citigroup caveat): {results[-1]}")

        results.append(add_partial_data_caveat(
            db, 146,
            "The $5.0B figure represents one AT&T entity in our database. "
            "Several AT&T subsidiaries (Mobility, Enterprises LLC) file under "
            "their own contracting records and are not aggregated here. The "
            "headline is a lower-bound for the AT&T enterprise total.",
            dry_run=args.dry_run,
        ))
        print(f"  story 146 (AT&T caveat): {results[-1]}")

        if args.dry_run:
            print(f"\n[dry-run] {len(results)} stories would be updated.")
        else:
            print(f"\nUpdated {sum(1 for r in results if r.get('status') == 'updated')} stories.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
