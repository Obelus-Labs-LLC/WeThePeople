"""Evaluate the legislative Claim rows produced by
`backfill_claims_from_actions.py` and write matching
ClaimEvaluation rows so the "Actions Scored" badge populates on
politician profile pages.

Why a separate script:
  The full matching pipeline lives in `wtp_core` (private package).
  The open-source build ships a stub (`services/claims/match.py`) whose
  `compute_matches_for_claim()` returns an empty dict and whose
  `get_profile()` returns `{}`. Without those, the existing
  ClaimEvaluation writer never fires for our new backfilled claims.

  But the legislative claims I generated have a strict 1:1 mapping
  back to a specific Action row (by person_id + intent +
  bill_congress/type/number). The Action IS the strong evidence.
  So we can write the ClaimEvaluation deterministically without any
  matcher.

What it does:
  1. Iterate Claim rows where category='legislative' and intent in
     {'sponsored', 'cosponsored'} that don't yet have a
     ClaimEvaluation.
  2. Find the Action with the same person_id + matching action_type
     (Sponsored/Cosponsored) + same bill_congress/bill_type/bill_number
     parsed out of the claim text.
  3. Write ClaimEvaluation(tier='strong', score=1.0, relevance='high',
     best_action_id=action.id, matched_bill_id=bill_id, ...).

Idempotent — re-running adds zero new rows once everything is
evaluated. Safe to schedule.

Usage:
  python jobs/evaluate_legislative_claims.py
  python jobs/evaluate_legislative_claims.py --dry-run
  python jobs/evaluate_legislative_claims.py --limit 100
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import (  # noqa: E402
    SessionLocal, Claim, ClaimEvaluation, Action,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("evaluate_legislative_claims")


# Pattern matches the canonical claim text format produced by
# backfill_claims_from_actions.py:
#     "Rep. Bill Huizenga sponsored HR 7888-119 (...) on April 12, 2024."
#     "Senator Slotkin cosponsored S 3819-119 on Feb 16, 2026."
_BILL_SHORT_RE = re.compile(
    r"\b([A-Z]{1,7})\s*(\d+)\s*-\s*(\d+)\b"
)
# In our generator we wrote `verb` as 'sponsored' or 'cosponsored';
# Action.action_type uses 'Sponsored' / 'Cosponsored' (title-case).
_VERB_TO_ACTION_TYPE = {
    "sponsored": "Sponsored",
    "cosponsored": "Cosponsored",
}


def _parse_bill_from_claim(claim_text: str) -> tuple[str, int, int] | None:
    """Pull (bill_type, bill_number, congress) out of the claim text.

    bill_type is returned UPPERCASE because Action.bill_type is stored
    uppercase ('HR', 'S', 'HRES', …). Comparing lowercase 'hr' against
    'HR' under SQLite's default case-sensitive collation matches nothing
    — the original implementation lowercased it and silently scored
    zero claims as a result."""
    m = _BILL_SHORT_RE.search(claim_text or "")
    if not m:
        return None
    bill_type = m.group(1).upper()
    try:
        bill_number = int(m.group(2))
        congress = int(m.group(3))
    except ValueError:
        return None
    return bill_type, bill_number, congress


def _action_progress(action: Action) -> str | None:
    """Map Action latest-action info to the ClaimEvaluation `progress`
    vocabulary so the per-evaluation badge reads sensibly. Conservative
    defaults: anything we can't classify becomes 'unknown' rather than
    a misleading 'enacted'."""
    text = (action.latest_action_text or action.title or "").lower()
    if "became public law" in text or "signed into law" in text or "enacted" in text:
        return "enacted"
    if "passed senate" in text and "passed house" in text:
        return "passed_both"
    if "passed senate" in text or "passed house" in text:
        return "passed_chamber"
    if "ordered to be reported" in text or "reported" in text:
        return "passed_committee"
    if "referred to" in text or "introduced" in text:
        return "introduced"
    return "unknown"


def run(limit: int, dry_run: bool) -> int:
    db = SessionLocal()
    created = 0
    skipped_no_bill = 0
    skipped_no_action = 0
    skipped_already_evaluated = 0
    examined = 0
    try:
        # Walk legislative-category claims that don't yet have an evaluation.
        # LEFT-JOIN -> NULL on the eval side means "no evaluation".
        from sqlalchemy.orm import aliased

        ce_alias = aliased(ClaimEvaluation)
        q = (
            db.query(Claim)
              .outerjoin(ce_alias, ce_alias.claim_id == Claim.id)
              .filter(Claim.category == "legislative")
              .filter(Claim.intent.in_(list(_VERB_TO_ACTION_TYPE.keys())))
              .filter(ce_alias.id.is_(None))
              .order_by(Claim.id.asc())
        )
        if limit > 0:
            q = q.limit(limit)
        claims = q.all()
        log.info("found %d unevaluated legislative claims to score", len(claims))

        for claim in claims:
            examined += 1
            parsed = _parse_bill_from_claim(claim.text)
            if not parsed:
                skipped_no_bill += 1
                continue
            bill_type, bill_number, congress = parsed
            action_type = _VERB_TO_ACTION_TYPE.get((claim.intent or "").lower())
            if not action_type:
                skipped_no_action += 1
                continue

            action = (
                db.query(Action)
                  .filter(Action.person_id == claim.person_id)
                  .filter(Action.bill_type == bill_type)
                  .filter(Action.bill_number == bill_number)
                  .filter(Action.bill_congress == congress)
                  .filter(Action.action_type == action_type)
                  .order_by(Action.date.desc().nullslast())
                  .first()
            )
            if not action:
                skipped_no_action += 1
                continue

            # The action IS the evidence — strong tier, full score.
            evidence = [
                f"action:{action.action_type.lower()}",
                f"bill:{bill_type}{bill_number}-{congress}",
            ]
            if action.policy_area:
                evidence.append(f"policy_area:{action.policy_area}")

            payload = dict(
                claim_id=claim.id,
                person_id=claim.person_id,
                best_action_id=action.id,
                score=1.0,
                tier="strong",
                relevance="high",
                progress=_action_progress(action),
                timing=None,
                matched_bill_id=f"{bill_type}{bill_number}-{congress}",
                evidence_json=json.dumps(evidence),
                why_json=json.dumps({
                    "rule": "deterministic_legislative_match",
                    "claim_intent": claim.intent,
                    "action_type": action.action_type,
                }),
            )

            if dry_run:
                log.info("DRY: claim_id=%d -> action_id=%d %s", claim.id, action.id, payload["matched_bill_id"])
                created += 1
                continue

            db.add(ClaimEvaluation(**payload))
            created += 1
            if created % 200 == 0:
                db.commit()
                log.info("committed %d evaluations…", created)

        if not dry_run:
            db.commit()

        # Note: skipped_already_evaluated is implicit — the LEFT-JOIN
        # filtered them out before we examined them.
        log.info(
            "done. examined=%d created=%d skipped_no_bill=%d skipped_no_action=%d",
            examined, created, skipped_no_bill, skipped_no_action,
        )
    except Exception as exc:
        db.rollback()
        log.exception("evaluation pass aborted: %s", exc)
        return 1
    finally:
        db.close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=0,
                        help="Cap claims processed per run (0 = unlimited)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    return run(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
