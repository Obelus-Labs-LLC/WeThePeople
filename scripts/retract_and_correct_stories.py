"""
Retract stories with severe lobbying undercounts and correct stories with
moderate issues.

Based on external verification against OpenSecrets, USASpending, FEC, and
Congress.gov conducted April 2026.

Retractions (our all-time total <= 1 year on OpenSecrets):
  - #187 Boeing $12.7M  (OpenSecrets: $11.93M in 2024 ALONE)
  - #227 Amgen $23.4M   (OpenSecrets: $11.78M in 2024 ALONE)
  - #229 Verizon $19.0M  (OpenSecrets: $11.38M in 2024 ALONE)
  - #186 Corteva $3.7M   (OpenSecrets: $3.36M in 2025 ALONE)

Corrections:
  - #113 NVIDIA: 2025 lobbying $930K -> real $4.95M (add disclaimer)
  - #228 T-Mobile: $20.3M all-time understated (add disclaimer)
  - #222 Citigroup: $214.9M is ~70% of USASpending total (add disclaimer)
  - #86  Ally Financial: assets $180B -> $196B (minor factual correction)

Run:
  ssh root@138.199.214.174
  cd /home/dshon/wethepeople-backend
  python scripts/retract_and_correct_stories.py --dry-run
  python scripts/retract_and_correct_stories.py
"""

import sys
import os
import argparse
import logging
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Base, engine
from models.stories_models import Story, StoryCorrection
from sqlalchemy import text

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

LOBBYING_DISCLAIMER = (
    "\n\n---\n\n"
    "**Editor's note (April 2026):** The lobbying totals in this story reflect "
    "filings tracked in our sector-specific database, which captures a subset of "
    "each company's total Senate LDA disclosures. The actual total lobbying spend "
    "reported to the Senate may be higher. For comprehensive lobbying totals, see "
    "[OpenSecrets.org](https://www.opensecrets.org)."
)

CONTRACT_DISCLAIMER = (
    "\n\n---\n\n"
    "**Editor's note (April 2026):** Contract totals reflect awards tracked in "
    "our database from USASpending.gov data. The full USASpending database may "
    "contain additional awards under subsidiary names or different date ranges."
)


# ── Retractions ──

RETRACTIONS = [
    {
        "id": 187,
        "slug": "the-boeing-company-spent-127m-lobbying-congress",
        "reason": (
            "External verification found this story's lobbying total ($12.7M all-time) "
            "dramatically understates Boeing's actual lobbying. OpenSecrets reports Boeing "
            "spent $11.93M in 2024 alone and $11.34M in 2025. Our sector-specific database "
            "captured only a fraction of Boeing's total Senate LDA filings. The story's "
            "framing is therefore misleading."
        ),
    },
    {
        "id": 227,
        "slug": "amgen-inc-spent-234m-lobbying-congress",
        "reason": (
            "External verification found this story's lobbying total ($23.4M all-time) "
            "dramatically understates Amgen's actual lobbying. OpenSecrets reports Amgen "
            "spent $11.78M in 2024 alone. Our sector-specific database captured only a "
            "portion of Amgen's total Senate LDA filings."
        ),
    },
    {
        "id": 229,
        "slug": "verizon-communications-inc-spent-190m-lobbying-congress",
        "reason": (
            "External verification found this story's lobbying total ($19.0M all-time) "
            "dramatically understates Verizon's actual lobbying. OpenSecrets reports Verizon "
            "spent $11.38M in 2024 alone. Our sector-specific database captured only a "
            "portion of Verizon's total Senate LDA filings."
        ),
    },
    {
        "id": 186,
        "slug": "corteva-agriscience-spent-37m-lobbying-congress",
        "reason": (
            "External verification found this story's lobbying total ($3.7M all-time) "
            "understates Corteva's actual lobbying. OpenSecrets reports Corteva spent "
            "$3.36M in 2025 alone, nearly equaling our entire all-time total. Our "
            "sector-specific database captured only a subset of Corteva's filings."
        ),
    },
]

# ── Corrections ──

CORRECTIONS = [
    {
        "id": 113,
        "slug": "nvidia-lobbying-spending-surged-while-10-congress-members-bought-its-stock",
        "correction_type": "correction",
        "description": (
            "NVIDIA's 2025 lobbying total was reported as $930,000 based on our "
            "sector-specific tech lobbying database. OpenSecrets reports NVIDIA spent "
            "$4,950,000 lobbying in 2025 — over 5x our figure. Our database captures "
            "only filings matched to the tech sector. A disclaimer has been added."
        ),
        "body_append": LOBBYING_DISCLAIMER,
    },
    {
        "id": 228,
        "slug": "t-mobile-us-inc-spent-203m-lobbying-congress",
        "correction_type": "correction",
        "description": (
            "T-Mobile's lobbying total of $20.3M reflects our telecom sector database. "
            "OpenSecrets reports T-Mobile spent approximately $9M per year in 2021-2022 "
            "alone, suggesting our multi-year total captures roughly 40-50% of actual "
            "filings. A disclaimer has been added."
        ),
        "body_append": LOBBYING_DISCLAIMER,
    },
    {
        "id": 222,
        "slug": "citigroup-inc-has-2149m-in-government-contracts",
        "correction_type": "correction",
        "description": (
            "Citigroup's contract total of $214.9M across 961 awards reflects our "
            "database subset. USASpending.gov shows 1,839 total contracts for Citibank "
            "N.A. with a higher aggregate value. The difference is due to subsidiary "
            "name matching and date filtering. A disclaimer has been added."
        ),
        "body_append": CONTRACT_DISCLAIMER,
    },
    {
        "id": 86,
        "slug": "ally-financial-split-donations-evenly-across-house-financial-services-panel",
        "correction_type": "correction",
        "description": (
            "Ally Financial's assets were described as 'approximately $180 billion'. "
            "As of December 2025, Ally Financial reports $196 billion in total assets. "
            "The figure has been updated."
        ),
        "body_find": "approximately $180 billion in assets",
        "body_replace": "approximately $196 billion in assets",
    },
]


def main():
    parser = argparse.ArgumentParser(description="Retract and correct stories based on external verification")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without saving")
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    db = SessionLocal()

    retracted = 0
    corrected = 0

    # ── Process Retractions ──
    for r in RETRACTIONS:
        story = db.query(Story).filter(Story.id == r["id"]).first()
        if not story:
            log.warning("Story #%d not found, skipping retraction", r["id"])
            continue

        if story.status == "retracted":
            log.info("Story #%d already retracted, skipping", r["id"])
            continue

        if args.dry_run:
            log.info("[DRY-RUN] Would retract #%d: %s", r["id"], story.title[:60])
            log.info("  Reason: %s", r["reason"][:100])
        else:
            story.status = "retracted"
            story.retraction_reason = r["reason"]
            correction = StoryCorrection(
                story_id=story.id,
                correction_type="retraction",
                description=r["reason"],
                corrected_by="editorial",
            )
            db.add(correction)
            retracted += 1
            log.info("Retracted #%d: %s", r["id"], story.title[:60])

    # ── Process Corrections ──
    for c in CORRECTIONS:
        story = db.query(Story).filter(Story.id == c["id"]).first()
        if not story:
            log.warning("Story #%d not found, skipping correction", c["id"])
            continue

        if story.status == "retracted":
            log.info("Story #%d already retracted, skipping correction", c["id"])
            continue

        body = story.body or ""

        if args.dry_run:
            log.info("[DRY-RUN] Would correct #%d: %s", c["id"], story.title[:60])
            log.info("  Type: %s", c["correction_type"])
            log.info("  Description: %s", c["description"][:100])
            if c.get("body_append"):
                log.info("  Would append disclaimer (%d chars)", len(c["body_append"]))
            if c.get("body_find"):
                found = c["body_find"] in body
                log.info("  Would replace '%s' -> '%s' (found: %s)",
                         c["body_find"][:40], c["body_replace"][:40], found)
        else:
            # Apply body changes
            if c.get("body_append"):
                # Don't double-add disclaimer
                if "Editor's note (April 2026)" not in body:
                    story.body = body + c["body_append"]
                else:
                    log.info("Story #%d already has disclaimer, skipping append", c["id"])

            if c.get("body_find"):
                if c["body_find"] in body:
                    story.body = (story.body or body).replace(
                        c["body_find"], c["body_replace"]
                    )
                else:
                    log.warning("Story #%d: text '%s' not found in body",
                                c["id"], c["body_find"][:40])

            # Record correction
            correction = StoryCorrection(
                story_id=story.id,
                correction_type=c["correction_type"],
                description=c["description"],
                corrected_by="editorial",
            )
            db.add(correction)
            corrected += 1
            log.info("Corrected #%d: %s", c["id"], story.title[:60])

    if not args.dry_run and (retracted or corrected):
        db.commit()
        log.info("Committed: %d retractions, %d corrections", retracted, corrected)
    elif args.dry_run:
        log.info("[DRY-RUN] Would have done: %d retractions, %d corrections",
                 len(RETRACTIONS), len(CORRECTIONS))
    else:
        log.info("No changes needed")

    db.close()


if __name__ == "__main__":
    main()
