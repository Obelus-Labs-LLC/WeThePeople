"""Repair the body-substitution bug in the lobbying-double-count
correction script.

Bug
----
``jobs/correct_lobby_double_count_stories.py`` did::

    new_body = correction_note + (body or "")
    if old_match and old_label in new_body:
        new_body = new_body.replace(old_label, corrected_label, 1)

Because the correction notice mentions ``old_label`` (e.g. "$76.4M")
in its "originally reported" sentence, the FIRST occurrence of
``old_label`` in ``new_body`` is INSIDE the correction notice. The
``replace(..., 1)`` therefore overwrote the notice's transparent
record of the original figure, leaving the body's actual numbers
unchanged.

Net effect on, e.g., story 127::

    Correction note: "originally reported $51.0M" (was $76.4M)
    Body lead:       "totaling **$76.4M** in federal lobbying" (still old)

Repair
------
For each affected story:

  1. Recover ``old_label`` and ``corrected_label`` from the
     ``correction_history`` entry tagged ``lobby_double_count_v2``.
  2. Find the correction notice (paragraph starting with
     ``> **Correction``).
  3. Replace ``corrected_label`` with ``old_label`` in the SECOND
     "originally reported" position so the notice reads correctly
     again. (We left the original ``corrected_label`` in the
     "corrected figure of" position untouched.)
  4. In the body AFTER the correction notice, replace ``old_label``
     with ``corrected_label`` everywhere (not just first occurrence)
     so the lead paragraph and any later mentions match the headline.

Idempotent: if the body no longer contains ``old_label`` and the
correction notice already reads "originally reported {old_label}",
the script reports ``already_repaired`` and skips.

Adds a ``correction_history`` entry tagged
``lobby_double_count_repair_v1`` so a subsequent run is a no-op.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from models.database import SessionLocal  # noqa: E402

CORRECTION_TAG_ORIGINAL = "lobby_double_count_v2"
CORRECTION_TAG_REPAIR = "lobby_double_count_repair_v1"

# Stories that received the original correction.
AFFECTED = [125, 127, 128, 143, 166, 220, 226, 228]


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _find_correction_history(history_raw: Optional[str], tag: str) -> Optional[dict]:
    if not history_raw:
        return None
    try:
        history = json.loads(history_raw) if isinstance(history_raw, str) else history_raw
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(history, list):
        return None
    for entry in history:
        if isinstance(entry, dict) and entry.get("method") == tag:
            return entry
    return None


def _append_history(history_raw: Optional[str], entry: dict) -> str:
    try:
        history = json.loads(history_raw) if isinstance(history_raw, str) else history_raw
        if not isinstance(history, list):
            history = []
    except (json.JSONDecodeError, TypeError):
        history = []
    history.append(entry)
    return json.dumps(history)


def repair_one(db, sid: int, dry_run: bool = False) -> dict:
    row = db.execute(
        text("SELECT id, title, body, correction_history "
             "FROM stories WHERE id = :id"),
        {"id": sid},
    ).fetchone()
    if row is None:
        return {"id": sid, "status": "missing"}

    _id, title, body, history_raw = row

    if _find_correction_history(history_raw, CORRECTION_TAG_REPAIR):
        return {"id": sid, "status": "already_repaired"}

    original = _find_correction_history(history_raw, CORRECTION_TAG_ORIGINAL)
    if not original:
        return {"id": sid, "status": "no_original_correction"}

    old_label = original.get("old_value") or ""
    new_label = original.get("new_value") or ""
    if not old_label or not new_label:
        return {"id": sid, "status": "missing_labels", "old": old_label, "new": new_label}

    if old_label == new_label:
        # Story 220 Stride was a no-op correction (dedup, value unchanged).
        # Mark repaired so we don't re-check next run.
        new_body = body
        repair_action = "no-op (old==new)"
    else:
        if not body:
            return {"id": sid, "status": "empty_body"}

        # Step 1: split off the correction notice. It begins with
        # `> **Correction (` and ends at the first blank-line break.
        notice_marker = "> **Correction"
        notice_start = body.find(notice_marker)

        new_body = body
        notice_repaired = False

        if notice_start == 0:
            # The notice IS the prefix. Find where it ends — first
            # double newline after the marker.
            notice_end_rel = body.find("\n\n", notice_start)
            if notice_end_rel == -1:
                # Pathological — notice never terminated. Just rebuild.
                notice = body
                rest = ""
            else:
                notice = body[: notice_end_rel + 2]
                rest = body[notice_end_rel + 2 :]

            # Within the notice, the bug overwrote the "originally
            # reported" mention of old_label with new_label. Restore it.
            # The notice phrase is "originally reported {label} in
            # lobbying spend" — so we look for the new_label sitting
            # between "originally reported " and " in lobbying".
            target_phrase = f"originally reported {new_label} in lobbying"
            corrected_phrase = f"originally reported {old_label} in lobbying"
            if target_phrase in notice:
                notice = notice.replace(target_phrase, corrected_phrase, 1)
                notice_repaired = True

            # Step 2: in the rest of the body, replace every old_label
            # with new_label. Not capped — the original detect_stories
            # output frequently mentioned the same total in the lead
            # AND the closing paragraph.
            new_rest = rest.replace(old_label, new_label)
            new_body = notice + new_rest

            body_replacements = rest.count(old_label)
            repair_action = (
                f"notice_repaired={notice_repaired}, "
                f"body_replacements={body_replacements}"
            )
        else:
            # Notice not at the front — story body somehow mangled.
            # Apply replace globally as a fallback.
            new_body = body.replace(old_label, new_label)
            repair_action = "global_fallback"

    if new_body == body:
        # Nothing to change beyond stamping the history entry.
        return {"id": sid, "status": "no_change", "note": repair_action}

    history_entry = {
        "ts": _now_iso(),
        "method": CORRECTION_TAG_REPAIR,
        "old_label": old_label,
        "new_label": new_label,
        "action": repair_action,
        "reason": (
            "lobby_double_count_v2 prepended correction notice, then "
            "replace(...,1) overwrote the notice's reference to the "
            "original figure instead of fixing body mentions. This "
            "repair restores the notice and updates body mentions."
        ),
    }
    new_history = _append_history(history_raw, history_entry)

    if dry_run:
        return {
            "id": sid,
            "status": "would_repair",
            "old_label": old_label,
            "new_label": new_label,
            "action": repair_action,
        }

    db.execute(
        text(
            "UPDATE stories SET body = :body, correction_history = :history, "
            "updated_at = :now WHERE id = :id"
        ),
        {"body": new_body, "history": new_history, "now": datetime.now(timezone.utc), "id": sid},
    )
    db.commit()
    return {
        "id": sid,
        "status": "repaired",
        "old_label": old_label,
        "new_label": new_label,
        "action": repair_action,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        for sid in AFFECTED:
            result = repair_one(db, sid, dry_run=args.dry_run)
            print(f"  story {sid}: {result}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
