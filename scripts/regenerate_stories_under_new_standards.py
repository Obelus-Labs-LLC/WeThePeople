#!/usr/bin/env python3
"""
Regenerate published stories under research/EDITORIAL_STANDARDS.md.

Runs in batches so the user can review each batch before continuing.

Workflow per story:
  1. Pull current row (id, title, category, sector, evidence, data_date_range)
     from .planning/published_stories.json (already on disk from the audit pull).
  2. Hand evidence + context to ``jobs.generate_under_standards.regenerate_story``.
  3. If the result is HALTED, save the halt reasons to
     .planning/regenerated/<id>__HALTED.md.
  4. If the result is clean, save the new draft to
     .planning/regenerated/<id>__draft.md and append to the batch report.
  5. Do NOT touch the production database. The user reviews drafts and
     approves promotion explicitly in a follow-up step.

Usage:
    python scripts/regenerate_stories_under_new_standards.py --limit 5
    python scripts/regenerate_stories_under_new_standards.py --limit 10 --offset 5
    python scripts/regenerate_stories_under_new_standards.py --ids 93,95,230  # specific stories

Cost: ~$0.15 per story.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Load .env so ANTHROPIC_API_KEY is available
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

from jobs.generate_under_standards import regenerate_story  # noqa: E402

INPUT_PATH = ROOT / ".planning" / "published_stories.json"
OUTPUT_DIR = ROOT / ".planning" / "regenerated"
BATCH_REPORT = ROOT / ".planning" / "REGENERATION_BATCH_REPORT.md"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("regen")


def _coerce_evidence(raw):
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return None
    return None


def _save_clean(story, result):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"{story['id']:04d}__draft.md"
    metadata = (
        f"<!--\n"
        f"story_id: {story['id']}\n"
        f"original_slug: {story['slug']}\n"
        f"original_title: {story['title']}\n"
        f"original_category: {story['category']}\n"
        f"original_verification_tier: {story['verification_tier']}\n"
        f"original_data_date_range: {story.get('data_date_range')}\n"
        f"regenerated_at: {datetime.now(timezone.utc).isoformat()}\n"
        f"new_title: {result.new_title}\n"
        f"verification_label: {result.verification_label}\n"
        f"cost_usd: {result.cost_usd:.4f}\n"
        f"input_tokens: {result.input_tokens}\n"
        f"output_tokens: {result.output_tokens}\n"
        f"-->\n\n"
    )
    out_path.write_text(metadata + result.body, encoding="utf-8")
    return out_path


def _save_halted(story, result):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"{story['id']:04d}__HALTED.md"
    body = [
        f"# Story #{story['id']} HALTED",
        "",
        f"- original_slug: `{story['slug']}`",
        f"- original_title: {story['title']}",
        f"- original_category: `{story['category']}`",
        f"- original_verification_tier: `{story['verification_tier']}`",
        f"- regenerated_at: {datetime.now(timezone.utc).isoformat()}",
        f"- cost_usd: ${result.cost_usd:.4f}",
        "",
        "## Halt reasons",
        "",
    ]
    for r in result.halt_reasons:
        body.append(f"- {r}")
    body.append("")
    if result.raw:
        body.append("## Raw model output (first 4000 chars)")
        body.append("")
        body.append("```")
        body.append(result.raw[:4000])
        body.append("```")
    out_path.write_text("\n".join(body), encoding="utf-8")
    return out_path


def _select_stories(stories, args):
    if args.ids:
        wanted = {int(x.strip()) for x in args.ids.split(",") if x.strip()}
        return [s for s in stories if s["id"] in wanted]
    sliced = stories[args.offset: args.offset + args.limit]
    return sliced


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=5, help="Batch size (default 5)")
    parser.add_argument("--offset", type=int, default=0, help="Skip N stories before batching")
    parser.add_argument("--ids", type=str, default=None, help="Comma-separated story IDs to regenerate (overrides --limit/--offset)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen, don't call Opus")
    args = parser.parse_args()

    if not INPUT_PATH.exists():
        log.error("Input not found: %s", INPUT_PATH)
        sys.exit(1)

    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        stories = json.load(f)

    selected = _select_stories(stories, args)
    log.info("Batch size: %d stories (of %d total published)", len(selected), len(stories))

    if not selected:
        log.warning("No stories selected.")
        sys.exit(0)

    if args.dry_run:
        for s in selected:
            log.info("  would regenerate #%d %s", s["id"], s["title"][:80])
        sys.exit(0)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        log.error("ANTHROPIC_API_KEY not set. Cannot regenerate.")
        sys.exit(2)

    batch_log = []
    total_cost = 0.0
    clean_count = 0
    halted_count = 0

    for s in selected:
        evidence = _coerce_evidence(s.get("evidence"))
        if not evidence:
            log.warning("  #%d: evidence missing/unparseable, skipping", s["id"])
            batch_log.append({
                "id": s["id"], "decision": "skipped",
                "reason": "evidence_missing",
            })
            continue

        result = regenerate_story(
            evidence,
            story_id=s["id"],
            title=s.get("title") or "",
            category=s.get("category") or "",
            sector=s.get("sector"),
            data_date_range=s.get("data_date_range"),
            ai_generated=s.get("ai_generated") or "algorithmic",
        )

        total_cost += result.cost_usd

        if result.halted:
            path = _save_halted(s, result)
            halted_count += 1
            log.info("  #%d HALTED -> %s", s["id"], path.name)
            batch_log.append({
                "id": s["id"], "decision": "halted",
                "halt_reasons": result.halt_reasons,
                "cost_usd": result.cost_usd,
            })
        else:
            path = _save_clean(s, result)
            clean_count += 1
            log.info("  #%d clean -> %s", s["id"], path.name)
            batch_log.append({
                "id": s["id"], "decision": "draft_ready",
                "new_title": result.new_title,
                "verification_label": result.verification_label,
                "cost_usd": result.cost_usd,
            })

    # Write batch report
    BATCH_REPORT.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    lines.append(f"# Regeneration batch report")
    lines.append("")
    lines.append(f"- generated_at: {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"- batch_size: {len(selected)}")
    lines.append(f"- offset: {args.offset}")
    lines.append(f"- ids: {args.ids or '(slice)'}")
    lines.append(f"- clean drafts: {clean_count}")
    lines.append(f"- halted: {halted_count}")
    lines.append(f"- skipped: {len(selected) - clean_count - halted_count}")
    lines.append(f"- batch cost: ${total_cost:.4f}")
    lines.append("")
    lines.append("## Per-story result")
    lines.append("")
    for entry in batch_log:
        lines.append(f"### #{entry['id']}")
        for k, v in entry.items():
            if k == "id":
                continue
            lines.append(f"- {k}: {v}")
        lines.append("")
    BATCH_REPORT.write_text("\n".join(lines), encoding="utf-8")

    log.info("\nBatch complete.")
    log.info("  clean drafts: %d", clean_count)
    log.info("  halted: %d", halted_count)
    log.info("  skipped: %d", len(selected) - clean_count - halted_count)
    log.info("  batch cost: $%.4f", total_cost)
    log.info("\nReports:")
    log.info("  %s", BATCH_REPORT)
    log.info("  %s/", OUTPUT_DIR)


if __name__ == "__main__":
    main()
