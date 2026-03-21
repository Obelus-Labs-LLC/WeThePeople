"""
Sync Job: OpenSanctions Entity Check

Checks all tracked entities (politicians + companies across all sectors)
against the OpenSanctions database for sanctions/PEP status.

Run: python3 jobs/sync_opensanctions.py [--dry-run] [--limit N] [--sector SECTOR]
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, TrackedMember
from models.finance_models import TrackedInstitution
from models.health_models import TrackedCompany
from models.tech_models import TrackedTechCompany
from models.energy_models import TrackedEnergyCompany
from connectors.opensanctions import check_entity
from utils.logging import get_logger

logger = get_logger(__name__)

ENTITY_CONFIGS = [
    {
        "name": "politics",
        "model": TrackedMember,
        "id_field": "person_id",
        "name_field": "display_name",
        "entity_type": "person",
    },
    {
        "name": "finance",
        "model": TrackedInstitution,
        "id_field": "institution_id",
        "name_field": "display_name",
        "entity_type": "company",
    },
    {
        "name": "health",
        "model": TrackedCompany,
        "id_field": "company_id",
        "name_field": "display_name",
        "entity_type": "company",
    },
    {
        "name": "technology",
        "model": TrackedTechCompany,
        "id_field": "company_id",
        "name_field": "display_name",
        "entity_type": "company",
    },
    {
        "name": "energy",
        "model": TrackedEnergyCompany,
        "id_field": "company_id",
        "name_field": "display_name",
        "entity_type": "company",
    },
]


def sync_sector(config: dict, dry_run: bool = False, limit: int = 0):
    """Check all entities in a sector against OpenSanctions."""
    db = SessionLocal()
    try:
        query = db.query(config["model"]).filter_by(is_active=1)
        entities = query.all()
        total = len(entities)
        if limit:
            entities = entities[:limit]

        logger.info("=== %s: checking %d/%d entities ===", config["name"], len(entities), total)

        flagged = 0
        checked = 0

        for entity in entities:
            name = getattr(entity, config["name_field"])
            entity_id = getattr(entity, config["id_field"])

            # Skip if already checked recently (within 7 days)
            if entity.sanctions_checked_at:
                days_since = (datetime.now(timezone.utc) - entity.sanctions_checked_at).days
                if days_since < 7:
                    logger.debug("  Skipping %s (checked %d days ago)", entity_id, days_since)
                    continue

            logger.info("  Checking: %s (%s)", name, entity_id)
            result = check_entity(name, entity_type=config["entity_type"])

            if dry_run:
                logger.info("    [DRY RUN] Status: %s", result["status"])
                if result["best_match"]:
                    logger.info("    Match: %s (score %.2f, datasets: %s)",
                                result["best_match"]["caption"],
                                result["best_match"]["score"],
                                ", ".join(result["best_match"]["datasets"][:3]))
                checked += 1
                continue

            # Update entity
            entity.sanctions_status = result["status"]
            entity.sanctions_checked_at = datetime.now(timezone.utc)

            if result["best_match"]:
                entity.sanctions_data = json.dumps(result["best_match"])
                flagged += 1
                logger.warning("  FLAGGED: %s — status=%s, score=%.2f",
                               name, result["status"], result["best_match"]["score"])
            else:
                entity.sanctions_data = None

            checked += 1

            if checked % 10 == 0:
                db.commit()
                logger.info("  Progress: %d/%d checked, %d flagged", checked, len(entities), flagged)

        db.commit()
        logger.info("=== %s complete: %d checked, %d flagged ===", config["name"], checked, flagged)

    except Exception as e:
        logger.error("Error syncing %s: %s", config["name"], e)
        db.rollback()
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Check entities against OpenSanctions")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    parser.add_argument("--limit", type=int, default=0, help="Max entities per sector")
    parser.add_argument("--sector", type=str, help="Only check one sector (politics, finance, health, technology, energy)")
    args = parser.parse_args()

    configs = ENTITY_CONFIGS
    if args.sector:
        configs = [c for c in configs if c["name"] == args.sector]
        if not configs:
            print(f"Unknown sector: {args.sector}")
            sys.exit(1)

    for config in configs:
        sync_sector(config, dry_run=args.dry_run, limit=args.limit)


if __name__ == "__main__":
    main()
