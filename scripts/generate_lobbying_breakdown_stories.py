"""
Generate "Where Does the Money Go?" lobbying breakdown stories.

For each sector, this script:
1. Splits lobbying_issues into individual topics and aggregates spend per topic
2. Identifies which government agencies are being lobbied
3. Cross-references: companies lobbying Agency X that also have contracts from Agency X
4. Cites all data sources (Senate LDA, USASpending.gov, FEC)

Run on production server:
  cd ~/wethepeople-backend && python scripts/generate_lobbying_breakdown_stories.py
  cd ~/wethepeople-backend && python scripts/generate_lobbying_breakdown_stories.py --dry-run
  cd ~/wethepeople-backend && python scripts/generate_lobbying_breakdown_stories.py --sector tech
"""

import sys
import os
import argparse
import logging
from datetime import datetime, timezone
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Base, engine
from models.stories_models import Story
from sqlalchemy import text

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── Sector config ──

SECTORS = {
    "tech": {
        "label": "Tech",
        "lobbying_table": "lobbying_records",
        "contracts_table": "government_contracts",
        "entity_table": "tracked_tech_companies",
        "entity_id_col": "company_id",
        "enforcement_table": "enforcement_actions",
    },
    "finance": {
        "label": "Finance",
        "lobbying_table": "finance_lobbying_records",
        "contracts_table": "finance_government_contracts",
        "entity_table": "tracked_institutions",
        "entity_id_col": "institution_id",
        "enforcement_table": "finance_enforcement_actions",
    },
    "health": {
        "label": "Health",
        "lobbying_table": "health_lobbying_records",
        "contracts_table": "health_government_contracts",
        "entity_table": "tracked_companies",
        "entity_id_col": "company_id",
        "enforcement_table": "health_enforcement_actions",
    },
    "energy": {
        "label": "Energy",
        "lobbying_table": "energy_lobbying_records",
        "contracts_table": "energy_government_contracts",
        "entity_table": "tracked_energy_companies",
        "entity_id_col": "company_id",
        "enforcement_table": "energy_enforcement_actions",
    },
    "transportation": {
        "label": "Transportation",
        "lobbying_table": "transportation_lobbying_records",
        "contracts_table": "transportation_government_contracts",
        "entity_table": "tracked_transportation_companies",
        "entity_id_col": "company_id",
        "enforcement_table": "transportation_enforcement_actions",
    },
    "defense": {
        "label": "Defense",
        "lobbying_table": "defense_lobbying_records",
        "contracts_table": "defense_government_contracts",
        "entity_table": "tracked_defense_companies",
        "entity_id_col": "company_id",
        "enforcement_table": "defense_enforcement_actions",
    },
}

# Map government entities from LDA to awarding agencies from USASpending
ENTITY_TO_AGENCY = {
    "Department of Defense": "Department of Defense",
    "Defense, Dept of": "Department of Defense",
    "Dept of Defense": "Department of Defense",
    "DOD": "Department of Defense",
    "Health & Human Services, Dept of (HHS)": "Department of Health and Human Services",
    "Health and Human Services, Dept of (HHS)": "Department of Health and Human Services",
    "HOUSE OF REPRESENTATIVES": None,  # Legislative, not an awarding agency
    "SENATE": None,
    "Energy, Dept of": "Department of Energy",
    "Environmental Protection Agency (EPA)": "Environmental Protection Agency",
    "Commerce, Dept of (DOC)": "Department of Commerce",
    "Treasury, Dept of": "Department of the Treasury",
    "Transportation, Dept of (DOT)": "Department of Transportation",
    "Homeland Security, Dept of (DHS)": "Department of Homeland Security",
    "Veterans Affairs, Dept of (VA)": "Department of Veterans Affairs",
    "Agriculture, Dept of": "Department of Agriculture",
    "Justice, Dept of (DOJ)": "Department of Justice",
    "Interior, Dept of": "Department of the Interior",
    "State, Dept of": "Department of State",
    "Education, Dept of": "Department of Education",
    "Labor, Dept of": "Department of Labor",
    "Federal Communications Commission (FCC)": "Federal Communications Commission",
    "Federal Trade Commission (FTC)": "Federal Trade Commission",
    "Securities & Exchange Commission (SEC)": "Securities and Exchange Commission",
    "General Services Administration (GSA)": "General Services Administration",
}


def slug(title):
    s = title.lower()
    for ch in ["'", '"', ":", ",", ".", "?", "!", "(", ")", "$", "%", "+", "&"]:
        s = s.replace(ch, "")
    s = s.replace(" ", "-").replace("--", "-").strip("-")
    return s[:120]


def fmt_money(n):
    if n >= 1e9:
        return f"${n / 1e9:.1f}B"
    if n >= 1e6:
        return f"${n / 1e6:.1f}M"
    if n >= 1e3:
        return f"${n / 1e3:.0f}K"
    return f"${n:,.0f}"


def story_exists(db, story_slug):
    return db.query(Story).filter(Story.slug == story_slug).first() is not None


def generate_sector_breakdown(db, sector_key, cfg):
    """Generate lobbying issue breakdown story for a sector."""
    label = cfg["label"]
    lobbying_table = cfg["lobbying_table"]
    contracts_table = cfg["contracts_table"]

    # 1. Get all lobbying filings with issues
    rows = db.execute(text(
        f"SELECT lobbying_issues, government_entities, income, company_id "
        f"FROM {lobbying_table} "
        f"WHERE lobbying_issues IS NOT NULL AND lobbying_issues != ''"
    )).fetchall()

    if not rows:
        log.info(f"  [{sector_key}] No lobbying data with issues found, skipping")
        return None

    # Aggregate by individual issue (split comma-separated)
    issue_spend = defaultdict(float)
    issue_filings = defaultdict(int)
    issue_companies = defaultdict(set)
    gov_entity_spend = defaultdict(float)
    gov_entity_filings = defaultdict(int)
    company_issues = defaultdict(lambda: defaultdict(float))
    total_spend = 0

    for issues_str, entities_str, income, company_id in rows:
        inc = float(income) if income else 0
        total_spend += inc
        issues = [i.strip() for i in issues_str.split(",") if i.strip()]
        # Divide spend evenly across issues in a filing
        per_issue = inc / max(len(issues), 1)
        for issue in issues:
            issue_spend[issue] += per_issue
            issue_filings[issue] += 1
            issue_companies[issue].add(company_id)
            company_issues[company_id][issue] += per_issue

        if entities_str:
            entities = [e.strip() for e in entities_str.split(",") if e.strip()]
            per_entity = inc / max(len(entities), 1)
            for entity in entities:
                gov_entity_spend[entity] += per_entity
                gov_entity_filings[entity] += 1

    # 2. Get contract data by awarding agency
    agency_contracts = {}
    try:
        contract_rows = db.execute(text(
            f"SELECT awarding_agency, COUNT(*) as cnt, COALESCE(SUM(award_amount), 0) as total "
            f"FROM {contracts_table} "
            f"WHERE awarding_agency IS NOT NULL "
            f"GROUP BY awarding_agency ORDER BY total DESC"
        )).fetchall()
        for agency, cnt, total in contract_rows:
            agency_contracts[agency] = {"count": cnt, "total": float(total)}
    except Exception:
        pass

    # 3. Get top lobbying companies by total spend
    company_spend = defaultdict(float)
    for issues_str, entities_str, income, company_id in rows:
        company_spend[company_id] += float(income) if income else 0

    # Get display names
    entity_table = cfg["entity_table"]
    id_col = cfg["entity_id_col"]
    company_names = {}
    try:
        name_rows = db.execute(text(
            f"SELECT {id_col}, display_name FROM {entity_table}"
        )).fetchall()
        for cid, name in name_rows:
            company_names[cid] = name
    except Exception:
        pass

    # Sort issues by spend
    top_issues = sorted(issue_spend.items(), key=lambda x: -x[1])[:10]
    top_entities = sorted(gov_entity_spend.items(), key=lambda x: -x[1])[:10]
    top_companies = sorted(company_spend.items(), key=lambda x: -x[1])[:10]
    total_filings = len(rows)

    if not top_issues:
        return None

    # 4. Find lobby-to-contract connections
    connections = []
    for gov_entity, lob_spend in gov_entity_spend.items():
        # Try to match to a contract awarding agency
        usaspending_agency = ENTITY_TO_AGENCY.get(gov_entity)
        if usaspending_agency and usaspending_agency in agency_contracts:
            ac = agency_contracts[usaspending_agency]
            connections.append({
                "lobbied_entity": gov_entity,
                "agency": usaspending_agency,
                "lobby_spend": lob_spend,
                "lobby_filings": gov_entity_filings[gov_entity],
                "contract_count": ac["count"],
                "contract_value": ac["total"],
            })
    connections.sort(key=lambda x: -x["contract_value"])

    # ── Build the story ──

    top_issue_name = top_issues[0][0]
    title = f"Where {label} Lobbying Money Goes: {fmt_money(total_spend)} Across {len(issue_spend)} Policy Areas"

    summary = (
        f"{label} companies filed {total_filings:,} lobbying disclosures "
        f"totaling {fmt_money(total_spend)}, with {top_issue_name} as the most funded issue. "
        f"Here is where every dollar went and which agencies received the attention."
    )

    # Body
    body = f"## The Big Picture\n\n"
    body += (
        f"Across {total_filings:,} Senate lobbying disclosures, {label.lower()} companies "
        f"reported {fmt_money(total_spend)} in lobbying spending. That money was not a single "
        f"lump sum paid to \"politicians\" in general. It was targeted at specific policy areas, "
        f"specific agencies, and specific legislation.\n\n"
    )

    body += f"## Top Policy Issues by Lobbying Spend\n\n"
    body += f"| Issue | Est. Spend | Filings | Companies |\n"
    body += f"|-------|-----------|---------|----------|\n"
    for issue, spend in top_issues:
        body += (
            f"| {issue} | {fmt_money(spend)} | "
            f"{issue_filings[issue]:,} | {len(issue_companies[issue])} |\n"
        )
    body += "\n"
    body += (
        "*Spend is estimated by dividing each filing's reported income evenly across "
        "the issues listed in that filing. Source: Senate Lobbying Disclosure Act filings "
        "via senate.gov.*\n\n"
    )

    body += f"## Government Agencies Lobbied\n\n"
    body += (
        "These are the specific government bodies that {0} lobbyists targeted, "
        "ranked by estimated spend:\n\n".format(label.lower())
    )
    for entity, spend in top_entities[:8]:
        body += f"- **{entity}**: {fmt_money(spend)} ({gov_entity_filings[entity]:,} filings)\n"
    body += "\n*Source: Senate LDA filings, government_entities field.*\n\n"

    # Lobby-to-contract connections
    if connections:
        body += f"## The Money Loop: Lobbying to Contracts\n\n"
        body += (
            "When companies lobby a government agency, they often also receive contracts "
            "from that same agency. Here is where lobbying targets overlap with contract awards:\n\n"
        )
        for conn in connections[:5]:
            body += (
                f"- **{conn['agency']}**: {label} companies spent "
                f"{fmt_money(conn['lobby_spend'])} lobbying this agency across "
                f"{conn['lobby_filings']:,} filings. The same sector received "
                f"**{conn['contract_count']:,} contracts** worth "
                f"**{fmt_money(conn['contract_value'])}** from this agency.\n"
            )
        body += (
            "\n*Lobbying data from Senate LDA filings (senate.gov). "
            "Contract data from USASpending.gov.*\n\n"
        )

    # Top spenders
    body += f"## Top {label} Lobbying Spenders\n\n"
    for i, (cid, spend) in enumerate(top_companies[:10], 1):
        name = company_names.get(cid, cid)
        top_co_issues = sorted(company_issues[cid].items(), key=lambda x: -x[1])[:3]
        issue_tags = ", ".join(iss for iss, _ in top_co_issues)
        body += f"{i}. **{name}**: {fmt_money(spend)} ({issue_tags})\n"
    body += "\n*Source: Senate LDA filings.*\n\n"

    body += f"## Data Sources\n\n"
    body += "All data in this story comes from public government records:\n\n"
    body += "- **Lobbying disclosures**: Senate Lobbying Disclosure Act filings (senate.gov/legislative/Public_Disclosure/database_download.htm)\n"
    body += "- **Government contracts**: USASpending.gov (usaspending.gov/search)\n"
    body += "- **Company tracking**: WeThePeople entity database\n\n"
    body += (
        "*Lobbying spend estimates are based on the income reported per filing, divided "
        "evenly across the issues and entities listed. Actual per-issue allocation may vary. "
        "Contract totals include all awards to tracked companies in this sector.*"
    )

    entity_ids = [cid for cid, _ in top_companies[:10]]
    data_sources_list = [
        f"{lobbying_table}",
        f"{contracts_table}",
        "Senate LDA (senate.gov)",
        "USASpending.gov",
    ]

    evidence = {
        "total_lobbying_spend": total_spend,
        "total_filings": total_filings,
        "issue_count": len(issue_spend),
        "top_issue": top_issue_name,
        "top_issue_spend": top_issues[0][1],
        "connections_found": len(connections),
    }

    return Story(
        title=title,
        slug=slug(title),
        summary=summary,
        body=body,
        category="lobbying_breakdown",
        sector=sector_key,
        entity_ids=entity_ids,
        data_sources=data_sources_list,
        evidence=evidence,
        status="published",
        published_at=datetime.now(timezone.utc),
    )


def generate_cross_sector_story(db):
    """Generate a cross-sector story comparing lobbying issue priorities."""
    sector_data = {}

    for sector_key, cfg in SECTORS.items():
        lobbying_table = cfg["lobbying_table"]
        try:
            rows = db.execute(text(
                f"SELECT lobbying_issues, income FROM {lobbying_table} "
                f"WHERE lobbying_issues IS NOT NULL AND lobbying_issues != ''"
            )).fetchall()
        except Exception:
            continue

        issue_spend = defaultdict(float)
        total_spend = 0
        for issues_str, income in rows:
            inc = float(income) if income else 0
            total_spend += inc
            issues = [i.strip() for i in issues_str.split(",") if i.strip()]
            per_issue = inc / max(len(issues), 1)
            for issue in issues:
                issue_spend[issue] += per_issue

        if issue_spend:
            top = sorted(issue_spend.items(), key=lambda x: -x[1])[:5]
            sector_data[sector_key] = {
                "label": cfg["label"],
                "total": total_spend,
                "filing_count": len(rows),
                "top_issues": top,
            }

    if len(sector_data) < 3:
        return None

    grand_total = sum(d["total"] for d in sector_data.values())
    title = f"Follow the Money: {fmt_money(grand_total)} in Lobbying Across {len(sector_data)} Sectors"
    summary = (
        f"A sector-by-sector breakdown of where {fmt_money(grand_total)} in corporate "
        f"lobbying money is actually going, from defense spending to healthcare regulation."
    )

    body = "## What Do They Actually Lobby For?\n\n"
    body += (
        "When companies spend millions on lobbying, every dollar has a target: "
        "a specific policy area, a specific agency, a specific bill. "
        "Here is the breakdown across every sector we track.\n\n"
    )

    for sector_key in ["tech", "finance", "health", "energy", "defense", "transportation"]:
        if sector_key not in sector_data:
            continue
        sd = sector_data[sector_key]
        body += f"### {sd['label']} Sector ({fmt_money(sd['total'])})\n\n"
        body += f"*{sd['filing_count']:,} lobbying filings*\n\n"
        for issue, spend in sd["top_issues"]:
            pct = (spend / sd["total"] * 100) if sd["total"] > 0 else 0
            body += f"- **{issue}**: {fmt_money(spend)} ({pct:.0f}%)\n"
        body += "\n"

    body += "## Data Sources\n\n"
    body += "- **All lobbying data**: Senate Lobbying Disclosure Act filings (senate.gov)\n"
    body += "- **Spend estimates**: Income per filing divided across listed issues\n"
    body += "- **Sector definitions**: WeThePeople tracked entity database\n\n"
    body += (
        "*This analysis covers all Senate LDA filings associated with tracked companies "
        "across 6 sectors. Spend per issue is estimated, not reported directly by filers.*"
    )

    return Story(
        title=title,
        slug=slug(title),
        summary=summary,
        body=body,
        category="lobbying_breakdown",
        sector=None,
        entity_ids=[],
        data_sources=["Senate LDA (senate.gov)", "USASpending.gov"],
        evidence={
            "grand_total": grand_total,
            "sector_count": len(sector_data),
            "sectors": {k: v["total"] for k, v in sector_data.items()},
        },
        status="published",
        published_at=datetime.now(timezone.utc),
    )


def main():
    parser = argparse.ArgumentParser(description="Generate lobbying breakdown stories")
    parser.add_argument("--dry-run", action="store_true", help="Print stories without saving")
    parser.add_argument("--sector", type=str, help="Generate for a specific sector only")
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    db = SessionLocal()

    stories = []

    # Per-sector stories
    for sector_key, cfg in SECTORS.items():
        if args.sector and args.sector != sector_key:
            continue
        log.info(f"Generating {cfg['label']} lobbying breakdown...")
        story = generate_sector_breakdown(db, sector_key, cfg)
        if story:
            stories.append(story)

    # Cross-sector overview (only if not filtering to one sector)
    if not args.sector:
        log.info("Generating cross-sector lobbying overview...")
        cross = generate_cross_sector_story(db)
        if cross:
            stories.append(cross)

    log.info(f"\nGenerated {len(stories)} stories:")
    for s in stories:
        exists = story_exists(db, s.slug)
        status = "EXISTS (skip)" if exists else "NEW"
        log.info(f"  [{status}] [{s.sector or 'cross-sector'}] {s.title}")
        if args.dry_run:
            log.info(f"    Summary: {s.summary}")
            log.info(f"    Sources: {s.data_sources}")
            log.info(f"    Evidence: {s.evidence}")

    if not args.dry_run:
        saved = 0
        for s in stories:
            if not story_exists(db, s.slug):
                db.add(s)
                saved += 1
        if saved:
            db.commit()
            log.info(f"\nSaved {saved} new stories to database")
        else:
            log.info("\nNo new stories to save (all already exist)")

    db.close()


if __name__ == "__main__":
    main()
