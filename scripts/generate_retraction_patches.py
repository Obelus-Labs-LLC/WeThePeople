#!/usr/bin/env python3
"""
Generate retraction patches from the story audit report.

Reads:
    .planning/STORY_AUDIT_REPORT.json

Writes:
    .planning/STORY_RETRACTION_PATCHES.json

Each patch is a proposed status transition for a story, with the
specific audit findings that justify it. The user reviews the
patches file, sets `approved: true` on the ones they agree with,
then runs `scripts/apply_retraction_patches.py` to commit them.

Decision → patch mapping
------------------------
  UNPUBLISH PERMANENTLY  → status: 'retracted'
                           retraction_reason: derived from findings
                           proposed_correction_type: 'retraction'

  REVISE AND REPUBLISH   → status: 'draft'
                           proposed_correction_type: 'revision_required'
                           (no retraction_reason; story moves to draft for fixes)

  HALT AND REVIEW        → no automatic patch; flagged for manual editorial read
  REPUBLISH AS-IS        → no patch (the audit script never assigns this)

Patches are idempotent: re-running on the same audit produces the
same output. The applier checks current status before applying.

Usage
-----
    python scripts/generate_retraction_patches.py
    python scripts/generate_retraction_patches.py --audit-input /tmp/audit.json
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

DEFAULT_AUDIT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    ".planning",
    "STORY_AUDIT_REPORT.json",
)

DEFAULT_PATCHES = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    ".planning",
    "STORY_RETRACTION_PATCHES.json",
)


# Human-readable retraction reasons keyed off the audit's finding codes.
# When a story has multiple HIGH findings, the most-severe wins (top of
# list takes precedence). Add new codes here as the audit script adds
# new check functions.
_RETRACTION_REASON_BY_CODE = {
    "DEFAMATION_RISK": (
        "Retracted because the story implied a specific entity engaged in "
        "wrongdoing without sufficient primary-source attestation. "
        "Per editorial standards, every named entity must be primary-source "
        "attested in a specific filing."
    ),
    "CATEGORY_FIRST_FRAMING": (
        "Retracted because the story's framing was assigned before the "
        "underlying facts were examined. Per editorial standards, the data "
        "tells the story; the frame follows the facts."
    ),
    "DOLLAR_TIME_WINDOW_CONFLATION": (
        "Retracted because dollar figures were presented without their "
        "underlying time window in the same sentence, which can convey "
        "a multi-year total as a single-year figure."
    ),
    "ENTITY_LIST_LARGE": (
        "Retracted because the entities-referenced list included entities "
        "that may have been inferred from sector classification rather "
        "than primary-source attested."
    ),
    "PARTIALLY_VERIFIED_LABEL": (
        "Retracted because the story carried a 'Partially Verified' label, "
        "which the editorial standards retire in favor of a binary "
        "'verified' / 'not human-verified' tier."
    ),
    "UNVERIFIED_TIER": (
        "Retracted because the story was published without passing the "
        "verification floor required by the editorial standards."
    ),
    "MISSING_DATA_LIMITS": (
        "Retracted because the story did not include the mandatory "
        "'What the Data Doesn't Show' section."
    ),
    "CAUSAL_LANGUAGE": (
        "Retracted because the story used causal language linking "
        "donations to votes without explicit evidence of a causal "
        "relationship."
    ),
}


def _retraction_reason(findings: list) -> str:
    """Pick the most specific retraction-reason text for the highest-
    priority HIGH finding. Falls back to a generic reason if no code
    matches our reason table."""
    high_codes = [f["code"] for f in findings if f.get("severity") == "HIGH"]
    # Priority order: most-specific first.
    for preferred in (
        "DEFAMATION_RISK",
        "CATEGORY_FIRST_FRAMING",
        "DOLLAR_TIME_WINDOW_CONFLATION",
        "ENTITY_LIST_LARGE",
        "UNVERIFIED_TIER",
        "PARTIALLY_VERIFIED_LABEL",
        "MISSING_DATA_LIMITS",
        "CAUSAL_LANGUAGE",
    ):
        if preferred in high_codes:
            return _RETRACTION_REASON_BY_CODE[preferred]
    if high_codes:
        return (
            "Retracted because the story failed one or more high-severity "
            f"checks under the editorial standards (codes: {', '.join(high_codes)})."
        )
    return (
        "Retracted under the May 2026 editorial-standards rebuild. "
        "See the audit report for specific findings."
    )


def _build_patch(audited_story: dict) -> dict | None:
    decision = audited_story.get("decision")
    if decision == "UNPUBLISH PERMANENTLY":
        return {
            "story_id": audited_story.get("id"),
            "slug": audited_story.get("slug"),
            "title": audited_story.get("title"),
            "current_status_assumed": "published",  # audit only sees published+archived
            "proposed_status": "retracted",
            "proposed_correction_type": "retraction",
            "proposed_retraction_reason": _retraction_reason(audited_story.get("findings", [])),
            "audit_finding_codes": [f["code"] for f in audited_story.get("findings", [])],
            "audit_severity_summary": audited_story.get("severity_summary", {}),
            "audit_decision": decision,
            "approved": False,
        }
    if decision == "REVISE AND REPUBLISH":
        return {
            "story_id": audited_story.get("id"),
            "slug": audited_story.get("slug"),
            "title": audited_story.get("title"),
            "current_status_assumed": "published",
            "proposed_status": "draft",
            "proposed_correction_type": "revision_required",
            "proposed_retraction_reason": None,
            "audit_finding_codes": [f["code"] for f in audited_story.get("findings", [])],
            "audit_severity_summary": audited_story.get("severity_summary", {}),
            "audit_decision": decision,
            "approved": False,
        }
    # HALT AND REVIEW / REPUBLISH AS-IS / unknown → no patch.
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit-input", default=DEFAULT_AUDIT,
                        help=f"Audit JSON path (default: {DEFAULT_AUDIT})")
    parser.add_argument("--output", default=DEFAULT_PATCHES,
                        help=f"Patches output path (default: {DEFAULT_PATCHES})")
    args = parser.parse_args()

    audit_path = Path(args.audit_input)
    if not audit_path.exists():
        print(f"Audit JSON not found: {audit_path}")
        print("Run scripts/audit_published_stories.py first.")
        return 2

    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    audited_stories = audit if isinstance(audit, list) else audit.get("stories", [])

    patches = []
    for s in audited_stories:
        p = _build_patch(s)
        if p is not None:
            patches.append(p)

    output = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "audit_input": str(audit_path),
        "instructions": (
            "Review each patch. Set `approved: true` on the ones you "
            "agree with, then run scripts/apply_retraction_patches.py "
            "to commit them. Patches with approved=false are skipped. "
            "Re-running this generator overwrites the file but the "
            "applier records every approved patch in story_corrections "
            "before changing the story row, so re-applying is safe."
        ),
        "patch_count": len(patches),
        "by_decision": {
            "UNPUBLISH PERMANENTLY": sum(1 for p in patches if p["audit_decision"] == "UNPUBLISH PERMANENTLY"),
            "REVISE AND REPUBLISH": sum(1 for p in patches if p["audit_decision"] == "REVISE AND REPUBLISH"),
        },
        "patches": patches,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2, default=str), encoding="utf-8")
    print(f"Wrote {len(patches)} patches to {out_path}")
    print(f"  UNPUBLISH PERMANENTLY: {output['by_decision']['UNPUBLISH PERMANENTLY']}")
    print(f"  REVISE AND REPUBLISH:  {output['by_decision']['REVISE AND REPUBLISH']}")
    print()
    print("Next: review the patches file, set `approved: true` on the ones you")
    print("agree with, then run scripts/apply_retraction_patches.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
