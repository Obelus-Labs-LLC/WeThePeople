"""
Enrich existing stories with "What Were They Lobbying For?" sections.

For each published story that references company entity_ids, this script:
1. Looks up those companies' lobbying filings
2. Aggregates the top issues they lobby on
3. Shows which government agencies they targeted
4. Appends a new section to the story body with source citations

Run on production server:
  cd ~/wethepeople-backend && python scripts/enrich_stories_with_lobbying_issues.py --dry-run
  cd ~/wethepeople-backend && python scripts/enrich_stories_with_lobbying_issues.py
"""

import sys
import os
import argparse
import json
import logging
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Base, engine
from models.stories_models import Story
from sqlalchemy import text

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# All lobbying tables mapped to their entity ID columns
LOBBYING_TABLES = [
    ("lobbying_records", "company_id"),
    ("finance_lobbying_records", "institution_id"),
    ("health_lobbying_records", "company_id"),
    ("energy_lobbying_records", "company_id"),
    ("transportation_lobbying_records", "company_id"),
    ("defense_lobbying_records", "company_id"),
    ("chemical_lobbying_records", "company_id"),
    ("agriculture_lobbying_records", "company_id"),
    ("telecom_lobbying_records", "company_id"),
    ("education_lobbying_records", "company_id"),
]

ENRICHMENT_MARKER = "## What Were They Lobbying For?"


def fmt_money(n):
    if n >= 1e9:
        return f"${n / 1e9:.1f}B"
    if n >= 1e6:
        return f"${n / 1e6:.1f}M"
    if n >= 1e3:
        return f"${n / 1e3:.0f}K"
    return f"${n:,.0f}"


def is_company_id(eid):
    """Heuristic: company IDs use dashes (e.g., 'lockheed-martin'),
    person IDs use underscores (e.g., 'markwayne_mullin').
    Single-word IDs like 'nvidia' or 'microsoft' are companies."""
    if "_" in eid and not "-" in eid:
        # Could be a person (first_last) unless it's a known company pattern
        parts = eid.split("_")
        # Person IDs typically have 2-3 parts that are names
        if len(parts) <= 3 and all(p.isalpha() for p in parts):
            return False
    return True


def get_lobbying_data_for_entity(db, entity_id):
    """Search all lobbying tables for filings matching this entity ID.

    Deduplicates by filing_uuid across sector tables so entities tracked
    in multiple sectors (e.g. Anduril in tech + defense) are not double-counted.
    """
    issue_spend = defaultdict(float)
    issue_filings = defaultdict(int)
    gov_entity_spend = defaultdict(float)
    gov_entity_filings = defaultdict(int)
    total_spend = 0
    total_filings = 0
    seen_uuids = set()

    for table, id_col in LOBBYING_TABLES:
        try:
            rows = db.execute(text(
                f"SELECT filing_uuid, lobbying_issues, government_entities, income "
                f"FROM {table} "
                f"WHERE {id_col} = :eid "
                f"AND lobbying_issues IS NOT NULL AND lobbying_issues != ''"
            ), {"eid": entity_id}).fetchall()
        except Exception:
            continue

        for filing_uuid, issues_str, entities_str, income in rows:
            if filing_uuid and filing_uuid in seen_uuids:
                continue
            if filing_uuid:
                seen_uuids.add(filing_uuid)
            inc = float(income) if income else 0
            total_spend += inc
            total_filings += 1
            issues = [i.strip() for i in issues_str.split(",") if i.strip()]
            per_issue = inc / max(len(issues), 1)
            for issue in issues:
                issue_spend[issue] += per_issue
                issue_filings[issue] += 1

            if entities_str:
                entities = [e.strip() for e in entities_str.split(",") if e.strip()]
                per_entity = inc / max(len(entities), 1)
                for entity in entities:
                    gov_entity_spend[entity] += per_entity
                    gov_entity_filings[entity] += 1

    return {
        "total_spend": total_spend,
        "total_filings": total_filings,
        "top_issues": sorted(issue_spend.items(), key=lambda x: -x[1])[:6],
        "top_gov_entities": sorted(gov_entity_spend.items(), key=lambda x: -x[1])[:5],
    }


def get_entity_name(db, entity_id):
    """Try to find a display name for this entity across all tracked tables."""
    tables = [
        ("tracked_tech_companies", "company_id"),
        ("tracked_institutions", "institution_id"),
        ("tracked_companies", "company_id"),
        ("tracked_energy_companies", "company_id"),
        ("tracked_transportation_companies", "company_id"),
        ("tracked_defense_companies", "company_id"),
        ("tracked_chemical_companies", "company_id"),
        ("tracked_agriculture_companies", "company_id"),
        ("tracked_telecom_companies", "company_id"),
        ("tracked_education_companies", "company_id"),
    ]
    for table, id_col in tables:
        try:
            row = db.execute(text(
                f"SELECT display_name FROM {table} WHERE {id_col} = :eid"
            ), {"eid": entity_id}).fetchone()
            if row:
                return row[0]
        except Exception:
            continue
    return entity_id.replace("-", " ").title()


def build_enrichment_section(db, company_ids):
    """Build the 'What Were They Lobbying For?' markdown section."""
    all_data = {}
    for cid in company_ids:
        data = get_lobbying_data_for_entity(db, cid)
        if data["total_filings"] > 0:
            name = get_entity_name(db, cid)
            all_data[cid] = {"name": name, **data}

    if not all_data:
        return None

    section = f"\n\n{ENRICHMENT_MARKER}\n\n"

    if len(all_data) == 1:
        cid, d = list(all_data.items())[0]
        section += (
            f"{d['name']} filed {d['total_filings']:,} lobbying disclosures "
            f"totaling {fmt_money(d['total_spend'])}. "
            f"Here is what they spent it on:\n\n"
        )
        for issue, spend in d["top_issues"]:
            section += f"- **{issue}**: {fmt_money(spend)}\n"
        if d["top_gov_entities"]:
            section += f"\nAgencies and bodies lobbied:\n\n"
            for entity, spend in d["top_gov_entities"]:
                section += f"- {entity} ({fmt_money(spend)})\n"
    else:
        section += "Here is what these companies were specifically lobbying for:\n\n"
        for cid, d in all_data.items():
            section += f"**{d['name']}** ({fmt_money(d['total_spend'])}, {d['total_filings']:,} filings):\n"
            for issue, spend in d["top_issues"][:4]:
                section += f"- {issue}: {fmt_money(spend)}\n"
            section += "\n"

        # Aggregate top gov entities across all companies
        combined_entities = defaultdict(float)
        for d in all_data.values():
            for entity, spend in d["top_gov_entities"]:
                combined_entities[entity] += spend
        top_combined = sorted(combined_entities.items(), key=lambda x: -x[1])[:5]
        if top_combined:
            section += "Government bodies lobbied by these companies:\n\n"
            for entity, spend in top_combined:
                section += f"- {entity} ({fmt_money(spend)})\n"

    section += (
        "\n*Lobbying data from Senate Lobbying Disclosure Act filings (senate.gov). "
        "Spend per issue is estimated by dividing each filing's income across its listed issues.*"
    )

    return section


def main():
    parser = argparse.ArgumentParser(description="Enrich stories with lobbying issue data")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without saving")
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    db = SessionLocal()

    stories = db.query(Story).filter(
        Story.status == "published",
        Story.category != "lobbying_breakdown",
    ).order_by(Story.id).all()

    enriched = 0
    skipped_no_companies = 0
    skipped_already_enriched = 0
    skipped_no_data = 0

    for story in stories:
        # Check if already enriched
        if ENRICHMENT_MARKER in (story.body or ""):
            skipped_already_enriched += 1
            continue

        # Get company IDs from entity_ids
        eids = story.entity_ids if story.entity_ids else []
        if isinstance(eids, str):
            eids = json.loads(eids)

        company_ids = [eid for eid in eids if is_company_id(eid)]
        if not company_ids:
            skipped_no_companies += 1
            continue

        section = build_enrichment_section(db, company_ids[:5])
        if not section:
            skipped_no_data += 1
            continue

        if args.dry_run:
            log.info(f"[DRY-RUN] Would enrich: {story.title[:60]}")
            log.info(f"  Companies: {company_ids[:5]}")
            log.info(f"  Section preview: {section[:200]}...")
        else:
            story.body = (story.body or "") + section
            enriched += 1
            log.info(f"Enriched: {story.title[:60]}")

    if not args.dry_run and enriched:
        db.commit()

    log.info(f"\nResults: {enriched} enriched, {skipped_already_enriched} already had it, "
             f"{skipped_no_companies} no company IDs, {skipped_no_data} no lobbying data found")
    db.close()


if __name__ == "__main__":
    main()
