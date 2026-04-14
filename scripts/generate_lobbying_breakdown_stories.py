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
    "telecom": {
        "label": "Telecommunications",
        "lobbying_table": "telecom_lobbying_records",
        "contracts_table": "telecom_government_contracts",
        "entity_table": "tracked_telecom_companies",
        "entity_id_col": "company_id",
        "enforcement_table": "telecom_enforcement_actions",
    },
    "education": {
        "label": "Education",
        "lobbying_table": "education_lobbying_records",
        "contracts_table": "education_government_contracts",
        "entity_table": "tracked_education_companies",
        "entity_id_col": "company_id",
        "enforcement_table": "education_enforcement_actions",
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
    id_col = cfg["entity_id_col"]
    rows = db.execute(text(
        f"SELECT lobbying_issues, government_entities, income, {id_col} "
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

    for sector_key in sector_data:
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
        f"*This analysis covers all Senate LDA filings associated with tracked companies "
        f"across {len(sector_data)} sectors. Spend per issue is estimated, not reported directly by filers.*"
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


def generate_tax_budget_stories(db):
    """Generate 4 cross-cutting story types: tax lobbying ROI, budget influence,
    telecom regulatory loop, and education loan pipeline."""
    stories = []

    # ── 1. Tax Lobbying ROI ──
    log.info("  Generating tax lobbying ROI story...")
    tax_sector_rows = []
    for sector_key, cfg in SECTORS.items():
        lobbying_table = cfg["lobbying_table"]
        contracts_table = cfg["contracts_table"]
        entity_table = cfg["entity_table"]
        id_col = cfg["entity_id_col"]
        try:
            rows = db.execute(text(
                f"SELECT {id_col}, lobbying_issues, government_entities, income "
                f"FROM {lobbying_table} "
                f"WHERE lobbying_issues IS NOT NULL AND lobbying_issues LIKE '%Taxation%'"
            )).fetchall()
        except Exception:
            continue

        if not rows:
            continue

        # Get display names
        company_names = {}
        try:
            name_rows = db.execute(text(
                f"SELECT {id_col}, display_name FROM {entity_table}"
            )).fetchall()
            for cid, name in name_rows:
                company_names[cid] = name
        except Exception:
            pass

        # Get Treasury contracts
        treasury_contracts = {}
        try:
            crows = db.execute(text(
                f"SELECT {id_col}, COUNT(*) as cnt, COALESCE(SUM(award_amount), 0) as total "
                f"FROM {contracts_table} "
                f"WHERE awarding_agency LIKE '%Treasury%' "
                f"GROUP BY {id_col}"
            )).fetchall()
            for cid, cnt, total in crows:
                treasury_contracts[cid] = {"count": cnt, "total": float(total)}
        except Exception:
            pass

        company_tax_spend = defaultdict(float)
        company_entities = defaultdict(set)
        sector_total = 0
        for cid, issues_str, entities_str, income in rows:
            inc = float(income) if income else 0
            issues = [i.strip() for i in issues_str.split(",") if i.strip()]
            per_issue = inc / max(len(issues), 1)
            company_tax_spend[cid] += per_issue
            sector_total += per_issue
            if entities_str:
                for e in entities_str.split(","):
                    company_entities[cid].add(e.strip())

        tax_sector_rows.append({
            "sector": sector_key,
            "label": cfg["label"],
            "total": sector_total,
            "filings": len(rows),
            "companies": company_tax_spend,
            "company_names": company_names,
            "company_entities": company_entities,
            "treasury_contracts": treasury_contracts,
        })

    if tax_sector_rows:
        grand_total = sum(s["total"] for s in tax_sector_rows)
        title = f"Corporate America Spent {fmt_money(grand_total)} Lobbying on Tax Policy"

        summary = (
            f"Companies across {len(tax_sector_rows)} sectors spent {fmt_money(grand_total)} "
            f"lobbying specifically on taxation issues, targeting Treasury, House Ways and Means, "
            f"and Senate Finance Committee."
        )

        body = "## The Big Picture\n\n"
        body += (
            f"Taxation is one of the most heavily lobbied policy areas in Washington. "
            f"Across {len(tax_sector_rows)} sectors, companies filed lobbying disclosures "
            f"totaling an estimated {fmt_money(grand_total)} directed at tax policy. "
            f"The lobbying targets include the Department of the Treasury, the House Ways "
            f"and Means Committee, and the Senate Finance Committee.\n\n"
        )

        body += "## Tax Lobbying by Sector\n\n"
        body += "| Sector | Est. Tax Lobbying | Filings | Companies |\n"
        body += "|--------|-------------------|---------|----------|\n"
        for sd in sorted(tax_sector_rows, key=lambda x: -x["total"]):
            body += (
                f"| {sd['label']} | {fmt_money(sd['total'])} | "
                f"{sd['filings']:,} | {len(sd['companies'])} |\n"
            )
        body += "\n"

        body += "## Top Companies Lobbying on Taxation\n\n"
        all_companies = []
        all_names = {}
        all_entities = {}
        all_treasury = {}
        for sd in tax_sector_rows:
            for cid, spend in sd["companies"].items():
                all_companies.append((cid, spend, sd["label"]))
                all_names.update(sd["company_names"])
                all_entities.update(sd["company_entities"])
                all_treasury.update(sd["treasury_contracts"])

        top_tax = sorted(all_companies, key=lambda x: -x[1])[:15]
        body += "| Company | Sector | Tax Lobbying | Gov Targets | Treasury Contracts |\n"
        body += "|---------|--------|-------------|-------------|-------------------|\n"
        for cid, spend, sector_label in top_tax:
            name = all_names.get(cid, str(cid))
            entities = all_entities.get(cid, set())
            tax_targets = [e for e in entities if any(
                kw in e.lower() for kw in ["treasury", "ways and means", "finance committee", "senate finance"]
            )]
            target_str = ", ".join(tax_targets[:2]) if tax_targets else "Various"
            tc = all_treasury.get(cid)
            tc_str = f"{tc['count']} ({fmt_money(tc['total'])})" if tc else "None found"
            body += f"| {name} | {sector_label} | {fmt_money(spend)} | {target_str} | {tc_str} |\n"
        body += "\n"

        body += "## Data Sources\n\n"
        body += "- **Lobbying disclosures**: Senate Lobbying Disclosure Act filings (senate.gov)\n"
        body += "- **Government contracts**: USASpending.gov\n"
        body += "- **Tax lobbying filter**: Filings where lobbying_issues contains \"Taxation\"\n\n"
        body += (
            "*Spend is estimated by dividing each filing's reported income evenly across "
            "the issues listed. Treasury contract matches are based on awarding agency.*"
        )

        s = Story(
            title=title,
            slug=slug(title),
            summary=summary,
            body=body,
            category="tax_lobbying",
            sector=None,
            entity_ids=[cid for cid, _, _ in top_tax[:10]],
            data_sources=["Senate LDA (senate.gov)", "USASpending.gov"],
            evidence={
                "grand_total": grand_total,
                "sector_count": len(tax_sector_rows),
                "sectors": {s["sector"]: s["total"] for s in tax_sector_rows},
            },
            status="published",
            published_at=datetime.now(timezone.utc),
        )
        stories.append(s)

    # ── 2. Budget Appropriation Influence ──
    log.info("  Generating budget appropriation influence story...")
    budget_sector_rows = []
    for sector_key, cfg in SECTORS.items():
        lobbying_table = cfg["lobbying_table"]
        contracts_table = cfg["contracts_table"]
        entity_table = cfg["entity_table"]
        id_col = cfg["entity_id_col"]
        try:
            rows = db.execute(text(
                f"SELECT {id_col}, lobbying_issues, government_entities, income "
                f"FROM {lobbying_table} "
                f"WHERE lobbying_issues IS NOT NULL "
                f"AND (lobbying_issues LIKE '%Budget%' OR lobbying_issues LIKE '%Appropriations%')"
            )).fetchall()
        except Exception:
            continue

        if not rows:
            continue

        company_names = {}
        try:
            name_rows = db.execute(text(
                f"SELECT {id_col}, display_name FROM {entity_table}"
            )).fetchall()
            for cid, name in name_rows:
                company_names[cid] = name
        except Exception:
            pass

        # Get all contracts grouped by agency
        agency_contracts = {}
        try:
            crows = db.execute(text(
                f"SELECT awarding_agency, COUNT(*) as cnt, COALESCE(SUM(award_amount), 0) as total "
                f"FROM {contracts_table} "
                f"WHERE awarding_agency IS NOT NULL "
                f"GROUP BY awarding_agency ORDER BY total DESC"
            )).fetchall()
            for agency, cnt, total in crows:
                agency_contracts[agency] = {"count": cnt, "total": float(total)}
        except Exception:
            pass

        company_budget_spend = defaultdict(float)
        company_agencies = defaultdict(set)
        sector_total = 0
        for cid, issues_str, entities_str, income in rows:
            inc = float(income) if income else 0
            issues = [i.strip() for i in issues_str.split(",") if i.strip()]
            per_issue = inc / max(len(issues), 1)
            company_budget_spend[cid] += per_issue
            sector_total += per_issue
            if entities_str:
                for e in entities_str.split(","):
                    e_clean = e.strip()
                    mapped = ENTITY_TO_AGENCY.get(e_clean)
                    if mapped:
                        company_agencies[cid].add(mapped)

        budget_sector_rows.append({
            "sector": sector_key,
            "label": cfg["label"],
            "total": sector_total,
            "filings": len(rows),
            "companies": company_budget_spend,
            "company_names": company_names,
            "company_agencies": company_agencies,
            "agency_contracts": agency_contracts,
        })

    if budget_sector_rows:
        grand_total = sum(s["total"] for s in budget_sector_rows)
        n_sectors = len(budget_sector_rows)
        title = f"Who Lobbies Congress on the Federal Budget: {fmt_money(grand_total)} Across {n_sectors} Sectors"

        summary = (
            f"Companies across {n_sectors} sectors spent an estimated {fmt_money(grand_total)} "
            f"lobbying on budget and appropriations issues, often targeting the same agencies "
            f"that award them contracts."
        )

        body = "## The Big Picture\n\n"
        body += (
            f"Budget and appropriations lobbying is how companies influence where federal "
            f"dollars flow. Across {n_sectors} sectors, companies filed lobbying disclosures "
            f"totaling an estimated {fmt_money(grand_total)} on budget-related issues. "
            f"Many of these same companies then receive contracts from the agencies they lobbied.\n\n"
        )

        body += "## Sector-by-Sector Breakdown\n\n"
        for sd in sorted(budget_sector_rows, key=lambda x: -x["total"]):
            body += f"### {sd['label']} ({fmt_money(sd['total'])})\n\n"
            body += f"*{sd['filings']:,} filings from {len(sd['companies'])} companies*\n\n"
            top_cos = sorted(sd["companies"].items(), key=lambda x: -x[1])[:5]
            for cid, spend in top_cos:
                name = sd["company_names"].get(cid, str(cid))
                agencies = sd["company_agencies"].get(cid, set())
                agency_str = ", ".join(list(agencies)[:2]) if agencies else "Various"
                # Check if they got contracts from lobbied agencies
                contract_match = []
                for ag in agencies:
                    if ag in sd["agency_contracts"]:
                        ac = sd["agency_contracts"][ag]
                        contract_match.append(f"{ag}: {ac['count']} contracts ({fmt_money(ac['total'])})")
                match_str = "; ".join(contract_match[:2]) if contract_match else "No direct match found"
                body += f"- **{name}**: {fmt_money(spend)} lobbying -> {agency_str} | Contracts: {match_str}\n"
            body += "\n"

        body += "## Data Sources\n\n"
        body += "- **Lobbying disclosures**: Senate Lobbying Disclosure Act filings (senate.gov)\n"
        body += "- **Government contracts**: USASpending.gov\n"
        body += "- **Budget lobbying filter**: Filings where lobbying_issues contains \"Budget\" or \"Appropriations\"\n\n"
        body += (
            "*Spend is estimated by dividing each filing's reported income evenly across "
            "the issues listed. Contract matches are sector-wide, not company-specific.*"
        )

        s = Story(
            title=title,
            slug=slug(title),
            summary=summary,
            body=body,
            category="budget_influence",
            sector=None,
            entity_ids=[],
            data_sources=["Senate LDA (senate.gov)", "USASpending.gov"],
            evidence={
                "grand_total": grand_total,
                "sector_count": n_sectors,
                "sectors": {s["sector"]: s["total"] for s in budget_sector_rows},
            },
            status="published",
            published_at=datetime.now(timezone.utc),
        )
        stories.append(s)

    # ── 3. Telecom Regulatory Loop ──
    log.info("  Generating telecom regulatory loop story...")
    if "telecom" in SECTORS:
        tcfg = SECTORS["telecom"]
        lobbying_table = tcfg["lobbying_table"]
        contracts_table = tcfg["contracts_table"]
        entity_table = tcfg["entity_table"]
        id_col = tcfg["entity_id_col"]

        try:
            rows = db.execute(text(
                f"SELECT {id_col}, lobbying_issues, government_entities, income "
                f"FROM {lobbying_table} "
                f"WHERE lobbying_issues IS NOT NULL "
                f"AND lobbying_issues LIKE '%Telecommunications%'"
            )).fetchall()
        except Exception:
            rows = []

        if rows:
            company_names = {}
            try:
                name_rows = db.execute(text(
                    f"SELECT {id_col}, display_name FROM {entity_table}"
                )).fetchall()
                for cid, name in name_rows:
                    company_names[cid] = name
            except Exception:
                pass

            # FCC-related contracts
            fcc_contracts = {}
            try:
                crows = db.execute(text(
                    f"SELECT {id_col}, COUNT(*) as cnt, COALESCE(SUM(award_amount), 0) as total "
                    f"FROM {contracts_table} "
                    f"WHERE awarding_agency LIKE '%Communications%' OR awarding_agency LIKE '%FCC%' "
                    f"GROUP BY {id_col}"
                )).fetchall()
                for cid, cnt, total in crows:
                    fcc_contracts[cid] = {"count": cnt, "total": float(total)}
            except Exception:
                pass

            company_spend = defaultdict(float)
            company_fcc_filings = defaultdict(int)
            total_telecom_spend = 0
            for cid, issues_str, entities_str, income in rows:
                inc = float(income) if income else 0
                issues = [i.strip() for i in issues_str.split(",") if i.strip()]
                per_issue = inc / max(len(issues), 1)
                company_spend[cid] += per_issue
                total_telecom_spend += per_issue
                if entities_str and "FCC" in entities_str.upper():
                    company_fcc_filings[cid] += 1

            title = f"Telecom Companies Spend {fmt_money(total_telecom_spend)} Lobbying the Agency That Regulates Them"

            summary = (
                f"Telecommunications companies spent an estimated {fmt_money(total_telecom_spend)} "
                f"lobbying on telecom issues, with many filings targeting the FCC directly -- "
                f"the same agency responsible for regulating them."
            )

            body = "## The Big Picture\n\n"
            body += (
                f"The Federal Communications Commission regulates the telecommunications industry, "
                f"setting rules on spectrum allocation, net neutrality, mergers, and consumer protection. "
                f"Yet the companies subject to these regulations spent an estimated "
                f"{fmt_money(total_telecom_spend)} lobbying on telecommunications issues, "
                f"often targeting the FCC itself.\n\n"
            )

            body += "## Telecom Companies Lobbying on Telecom Issues\n\n"
            body += "| Company | Telecom Lobbying | FCC Filings | FCC Contracts |\n"
            body += "|---------|-----------------|-------------|---------------|\n"
            top_telecom = sorted(company_spend.items(), key=lambda x: -x[1])[:15]
            for cid, spend in top_telecom:
                name = company_names.get(cid, str(cid))
                fcc_f = company_fcc_filings.get(cid, 0)
                fc = fcc_contracts.get(cid)
                fc_str = f"{fc['count']} ({fmt_money(fc['total'])})" if fc else "None found"
                body += f"| {name} | {fmt_money(spend)} | {fcc_f} | {fc_str} |\n"
            body += "\n"

            body += (
                "When companies lobby the agency that regulates them, it raises questions about "
                "regulatory capture -- whether the regulator is serving the public interest or "
                "the interests of the industry it oversees.\n\n"
            )

            body += "## Data Sources\n\n"
            body += "- **Lobbying disclosures**: Senate Lobbying Disclosure Act filings (senate.gov)\n"
            body += "- **FCC contract data**: USASpending.gov\n"
            body += "- **Telecom lobbying filter**: Filings where lobbying_issues contains \"Telecommunications\"\n\n"
            body += (
                "*Spend is estimated by dividing each filing's reported income evenly across "
                "the issues listed. FCC filing count is based on government_entities field mentioning FCC.*"
            )

            s = Story(
                title=title,
                slug=slug(title),
                summary=summary,
                body=body,
                category="regulatory_loop",
                sector="telecom",
                entity_ids=[cid for cid, _ in top_telecom[:10]],
                data_sources=["Senate LDA (senate.gov)"],
                evidence={
                    "total_telecom_lobbying": total_telecom_spend,
                    "companies": len(company_spend),
                    "fcc_filers": len(company_fcc_filings),
                },
                status="published",
                published_at=datetime.now(timezone.utc),
            )
            stories.append(s)

    # ── 4. Education Loan Pipeline ──
    log.info("  Generating education loan pipeline story...")
    if "education" in SECTORS:
        ecfg = SECTORS["education"]
        lobbying_table = ecfg["lobbying_table"]
        contracts_table = ecfg["contracts_table"]
        entity_table = ecfg["entity_table"]
        id_col = ecfg["entity_id_col"]

        try:
            rows = db.execute(text(
                f"SELECT {id_col}, lobbying_issues, government_entities, income "
                f"FROM {lobbying_table} "
                f"WHERE lobbying_issues IS NOT NULL "
                f"AND lobbying_issues LIKE '%Education%'"
            )).fetchall()
        except Exception:
            rows = []

        if rows:
            company_names = {}
            try:
                name_rows = db.execute(text(
                    f"SELECT {id_col}, display_name FROM {entity_table}"
                )).fetchall()
                for cid, name in name_rows:
                    company_names[cid] = name
            except Exception:
                pass

            # Dept of Education contracts
            doe_contracts = {}
            try:
                crows = db.execute(text(
                    f"SELECT {id_col}, COUNT(*) as cnt, COALESCE(SUM(award_amount), 0) as total "
                    f"FROM {contracts_table} "
                    f"WHERE awarding_agency LIKE '%Education%' "
                    f"GROUP BY {id_col}"
                )).fetchall()
                for cid, cnt, total in crows:
                    doe_contracts[cid] = {"count": cnt, "total": float(total)}
            except Exception:
                pass

            company_spend = defaultdict(float)
            company_doe_filings = defaultdict(int)
            total_ed_spend = 0
            for cid, issues_str, entities_str, income in rows:
                inc = float(income) if income else 0
                issues = [i.strip() for i in issues_str.split(",") if i.strip()]
                per_issue = inc / max(len(issues), 1)
                company_spend[cid] += per_issue
                total_ed_spend += per_issue
                if entities_str and "Education" in entities_str:
                    company_doe_filings[cid] += 1

            title = f"Student Loan Companies Spend {fmt_money(total_ed_spend)} Lobbying the Department That Awards Their Contracts"

            summary = (
                f"Education companies spent an estimated {fmt_money(total_ed_spend)} lobbying on "
                f"education issues, with many filings targeting the Department of Education -- "
                f"the same agency that awards student lending and servicing contracts."
            )

            body = "## The Big Picture\n\n"
            body += (
                f"The Department of Education oversees federal student loans, awarding contracts "
                f"to private companies for loan servicing, collections, and financial aid processing. "
                f"These same companies spent an estimated {fmt_money(total_ed_spend)} lobbying on "
                f"education issues, frequently targeting the department that controls their revenue.\n\n"
            )

            body += "## Education Companies Lobbying on Education Issues\n\n"
            body += "| Company | Education Lobbying | DoE Filings | DoE Contracts |\n"
            body += "|---------|-------------------|-------------|---------------|\n"
            top_ed = sorted(company_spend.items(), key=lambda x: -x[1])[:15]
            for cid, spend in top_ed:
                name = company_names.get(cid, str(cid))
                doe_f = company_doe_filings.get(cid, 0)
                dc = doe_contracts.get(cid)
                dc_str = f"{dc['count']} ({fmt_money(dc['total'])})" if dc else "None found"
                body += f"| {name} | {fmt_money(spend)} | {doe_f} | {dc_str} |\n"
            body += "\n"

            body += (
                "The pipeline is straightforward: companies lobby the Department of Education "
                "on education policy, then receive contracts from that same department to service "
                "student loans. This creates an incentive for companies to shape the very policies "
                "that determine how much money flows through their contracts.\n\n"
            )

            body += "## Data Sources\n\n"
            body += "- **Lobbying disclosures**: Senate Lobbying Disclosure Act filings (senate.gov)\n"
            body += "- **DoE contract data**: USASpending.gov\n"
            body += "- **Education lobbying filter**: Filings where lobbying_issues contains \"Education\"\n\n"
            body += (
                "*Spend is estimated by dividing each filing's reported income evenly across "
                "the issues listed. DoE filing count is based on government_entities field mentioning "
                "Department of Education.*"
            )

            s = Story(
                title=title,
                slug=slug(title),
                summary=summary,
                body=body,
                category="education_pipeline",
                sector="education",
                entity_ids=[cid for cid, _ in top_ed[:10]],
                data_sources=["Senate LDA (senate.gov)", "USASpending.gov"],
                evidence={
                    "total_education_lobbying": total_ed_spend,
                    "companies": len(company_spend),
                    "doe_filers": len(company_doe_filings),
                    "doe_contracts_found": len(doe_contracts),
                },
                status="published",
                published_at=datetime.now(timezone.utc),
            )
            stories.append(s)

    return stories


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

    # Tax/budget/regulatory loop stories
    if not args.sector:
        log.info("Generating tax, budget, regulatory loop, and education pipeline stories...")
        tax_budget = generate_tax_budget_stories(db)
        stories.extend(tax_budget)

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
