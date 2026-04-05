"""
Story Detection Job - Automated Data Story Generation

Scans all sector data for patterns and generates 5+ unique stories per day.
Each run picks from a rotation of pattern types, ensures no duplicate slugs,
and publishes directly.

Patterns:
1. Top lobbying spender per sector (rotates sectors daily)
2. Contract windfall (companies with >$100M in contracts)
3. Trade-committee overlap (congress members trading stocks they oversee)
4. Lobbying issue breakdown (sector-specific "where does the money go")
5. Penalty gap (companies with contracts but zero enforcement penalties)
6. Cross-sector influence (companies appearing in multiple sectors)
7. Lobbying surge (YoY increase >50%)
8. Foreign lobbying highlights (FARA data)
9. Congressional trade cluster (multiple trades in same ticker)
10. PAC donation spread (bipartisan giving patterns)

Usage:
    python jobs/detect_stories.py
    python jobs/detect_stories.py --dry-run
    python jobs/detect_stories.py --max-stories 8
"""

import sys
import os
import random
import hashlib
import argparse
import logging
from datetime import datetime, timezone
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Base, engine, CongressionalTrade
from models.stories_models import Story
from sqlalchemy import text, func, desc

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("detect_stories")

# All lobbying tables with their sector label and entity ID column
LOBBYING_TABLES = [
    ("lobbying_records", "tech", "company_id", "tracked_tech_companies"),
    ("finance_lobbying_records", "finance", "institution_id", "tracked_institutions"),
    ("health_lobbying_records", "health", "company_id", "tracked_companies"),
    ("energy_lobbying_records", "energy", "company_id", "tracked_energy_companies"),
    ("transportation_lobbying_records", "transportation", "company_id", "tracked_transportation_companies"),
    ("defense_lobbying_records", "defense", "company_id", "tracked_defense_companies"),
    ("chemical_lobbying_records", "chemicals", "company_id", "tracked_chemical_companies"),
    ("agriculture_lobbying_records", "agriculture", "company_id", "tracked_agriculture_companies"),
    ("telecom_lobbying_records", "telecom", "company_id", "tracked_telecom_companies"),
    ("education_lobbying_records", "education", "company_id", "tracked_education_companies"),
]

CONTRACT_TABLES = [
    ("government_contracts", "tech", "company_id", "tracked_tech_companies"),
    ("finance_government_contracts", "finance", "institution_id", "tracked_institutions"),
    ("health_government_contracts", "health", "company_id", "tracked_companies"),
    ("energy_government_contracts", "energy", "company_id", "tracked_energy_companies"),
    ("transportation_government_contracts", "transportation", "company_id", "tracked_transportation_companies"),
    ("defense_government_contracts", "defense", "company_id", "tracked_defense_companies"),
    ("chemical_government_contracts", "chemicals", "company_id", "tracked_chemical_companies"),
    ("agriculture_government_contracts", "agriculture", "company_id", "tracked_agriculture_companies"),
    ("telecom_government_contracts", "telecom", "company_id", "tracked_telecom_companies"),
    ("education_government_contracts", "education", "company_id", "tracked_education_companies"),
]

ENFORCEMENT_TABLES = [
    ("enforcement_actions", "tech", "company_id", "tracked_tech_companies"),
    ("finance_enforcement_actions", "finance", "institution_id", "tracked_institutions"),
    ("health_enforcement_actions", "health", "company_id", "tracked_companies"),
    ("energy_enforcement_actions", "energy", "company_id", "tracked_energy_companies"),
    ("transportation_enforcement_actions", "transportation", "company_id", "tracked_transportation_companies"),
    ("defense_enforcement_actions", "defense", "company_id", "tracked_defense_companies"),
    ("chemical_enforcement_actions", "chemicals", "company_id", "tracked_chemical_companies"),
    ("agriculture_enforcement_actions", "agriculture", "company_id", "tracked_agriculture_companies"),
    ("telecom_enforcement_actions", "telecom", "company_id", "tracked_telecom_companies"),
    ("education_enforcement_actions", "education", "company_id", "tracked_education_companies"),
]


def slug(title):
    s = title.lower()
    for ch in ["'", '"', ":", ",", ".", "?", "!", "(", ")", "$", "%", "+", "&", "#"]:
        s = s.replace(ch, "")
    s = s.replace(" ", "-").replace("--", "-").strip("-")
    return s[:120]


def fmt_money(n):
    if n >= 1e9:
        return "$%.1fB" % (n / 1e9)
    if n >= 1e6:
        return "$%.1fM" % (n / 1e6)
    if n >= 1e3:
        return "$%.0fK" % (n / 1e3)
    return "$%s" % f"{n:,.0f}"


def story_exists(db, story_slug):
    return db.query(Story).filter(Story.slug == story_slug).first() is not None


def get_entity_name(db, entity_id, entity_table, id_col):
    try:
        row = db.execute(text(
            "SELECT display_name FROM %s WHERE %s = :eid" % (entity_table, id_col)
        ), {"eid": entity_id}).fetchone()
        return row[0] if row else entity_id.replace("-", " ").title()
    except Exception:
        return entity_id.replace("-", " ").title()


def make_story(title, summary, body, category, sector, entity_ids, data_sources, evidence):
    return Story(
        title=title,
        slug=slug(title),
        summary=summary,
        body=body,
        category=category,
        sector=sector,
        entity_ids=entity_ids,
        data_sources=data_sources,
        evidence=evidence,
        status="published",
        published_at=datetime.now(timezone.utc),
    )


# ── Pattern 1: Top Lobbying Spender ──

def detect_top_spender(db, sector_idx=None):
    """Find the top lobbying spender in a sector that doesn't already have a story."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(LOBBYING_TABLES) - 1)
    table, sector, id_col, entity_table = LOBBYING_TABLES[idx]

    try:
        rows = db.execute(text(
            "SELECT %s, SUM(income) as total, COUNT(*) as cnt "
            "FROM %s GROUP BY %s ORDER BY total DESC LIMIT 5" % (id_col, table, id_col)
        )).fetchall()
    except Exception as e:
        log.warning("Top spender query failed for %s: %s", sector, e)
        return stories

    c_table = CONTRACT_TABLES[idx][0]

    for eid, total_spend, filing_count in rows:
        if not total_spend or total_spend < 100000:
            continue
        name = get_entity_name(db, eid, entity_table, id_col)
        title = "%s Spent %s Lobbying Congress" % (name, fmt_money(total_spend))
        if story_exists(db, slug(title)):
            continue

        # Get top issues with spend breakdown
        try:
            issue_rows = db.execute(text(
                "SELECT lobbying_issues, income, government_entities FROM %s WHERE %s = :eid AND lobbying_issues IS NOT NULL"
                % (table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            issue_rows = []

        issue_spend = defaultdict(float)
        issue_filings = defaultdict(int)
        gov_entity_spend = defaultdict(float)
        gov_entity_filings = defaultdict(int)
        for issues_str, income, entities_str in issue_rows:
            inc = float(income) if income else 0
            issues = [i.strip() for i in issues_str.split(",") if i.strip()]
            per_issue = inc / max(len(issues), 1)
            for iss in issues:
                issue_spend[iss] += per_issue
                issue_filings[iss] += 1
            if entities_str:
                entities = [e.strip() for e in entities_str.split(",") if e.strip()]
                per_ent = inc / max(len(entities), 1)
                for ent in entities:
                    gov_entity_spend[ent] += per_ent
                    gov_entity_filings[ent] += 1

        top_issues = sorted(issue_spend.items(), key=lambda x: -x[1])[:8]
        top_gov = sorted(gov_entity_spend.items(), key=lambda x: -x[1])[:6]

        # Get contract cross-reference
        contract_total = 0
        contract_count = 0
        try:
            cr = db.execute(text(
                "SELECT SUM(award_amount), COUNT(*) FROM %s WHERE %s = :eid" % (c_table, id_col)
            ), {"eid": eid}).fetchone()
            if cr:
                contract_total = float(cr[0] or 0)
                contract_count = int(cr[1] or 0)
        except Exception:
            pass

        body = "## The Spending\n\n"
        body += "%s filed %d lobbying disclosures totaling %s with the U.S. Senate.\n\n" % (name, filing_count, fmt_money(total_spend))

        if top_issues:
            body += "## What They Lobbied For\n\n"
            body += "| Issue | Est. Spend | Filings |\n"
            body += "|-------|-----------|--------|\n"
            for iss, spend in top_issues:
                body += "| %s | %s | %d |\n" % (iss, fmt_money(spend), issue_filings[iss])
            body += "\n*Spend estimated by dividing each filing's income across its listed issues.*\n\n"

        if top_gov:
            body += "## Government Bodies Targeted\n\n"
            for ent, spend in top_gov:
                body += "- **%s**: %s (%d filings)\n" % (ent, fmt_money(spend), gov_entity_filings[ent])
            body += "\n"

        if contract_total > 0:
            body += "## The Contract Connection\n\n"
            body += "%s also received **%s** across **%d government contracts** from federal agencies.\n\n" % (name, fmt_money(contract_total), contract_count)

        body += "## Data Sources\n\n"
        body += "- **Lobbying disclosures**: Senate Lobbying Disclosure Act filings (senate.gov/legislative/Public_Disclosure/database_download.htm)\n"
        if contract_total > 0:
            body += "- **Government contracts**: USASpending.gov (usaspending.gov/search)\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s filed %d lobbying disclosures totaling %s, targeting %d policy areas including %s." % (
                name, filing_count, fmt_money(total_spend), len(issue_spend),
                top_issues[0][0] if top_issues else "various issues"
            ),
            body=body,
            category="lobbying_spike",
            sector=sector,
            entity_ids=[eid],
            data_sources=[table, "Senate LDA (senate.gov)", c_table, "USASpending.gov"],
            evidence={
                "total_spend": total_spend, "filings": filing_count,
                "issue_count": len(issue_spend),
                "contract_total": contract_total, "contract_count": contract_count,
                "top_issues": {k: v for k, v in top_issues[:5]},
            },
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 2: Contract Windfall ──

def detect_contract_windfall(db, sector_idx=None):
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(CONTRACT_TABLES) - 1)
    table, sector, id_col, entity_table = CONTRACT_TABLES[idx]

    try:
        rows = db.execute(text(
            "SELECT %s, SUM(award_amount) as total, COUNT(*) as cnt "
            "FROM %s GROUP BY %s HAVING total > 100000000 ORDER BY total DESC LIMIT 5"
            % (id_col, table, id_col)
        )).fetchall()
    except Exception as e:
        log.warning("Contract windfall query failed for %s: %s", sector, e)
        return stories

    for eid, total_value, contract_count in rows:
        name = get_entity_name(db, eid, entity_table, id_col)
        title = "%s Has %s in Government Contracts" % (name, fmt_money(total_value))
        if story_exists(db, slug(title)):
            continue

        # Get top agencies
        try:
            agency_rows = db.execute(text(
                "SELECT awarding_agency, COUNT(*), SUM(award_amount) FROM %s "
                "WHERE %s = :eid AND awarding_agency IS NOT NULL "
                "GROUP BY awarding_agency ORDER BY SUM(award_amount) DESC LIMIT 5"
                % (table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            agency_rows = []

        # Cross-reference: did they also lobby?
        l_table = LOBBYING_TABLES[idx][0]
        lobby_total = 0
        lobby_count = 0
        try:
            lr = db.execute(text(
                "SELECT SUM(income), COUNT(*) FROM %s WHERE %s = :eid" % (l_table, id_col)
            ), {"eid": eid}).fetchone()
            if lr:
                lobby_total = float(lr[0] or 0)
                lobby_count = int(lr[1] or 0)
        except Exception:
            pass

        body = "## The Contracts\n\n"
        body += "%s has received **%s** across **%d government contract awards**.\n\n" % (name, fmt_money(total_value), contract_count)
        if agency_rows:
            body += "## Awarding Agencies\n\n"
            body += "| Agency | Contract Value | Awards |\n"
            body += "|--------|---------------|--------|\n"
            for agency, cnt, amt in agency_rows:
                body += "| %s | %s | %d |\n" % (agency or "Unknown", fmt_money(amt or 0), cnt)
            body += "\n"
        if lobby_total > 0:
            body += "## The Lobbying Connection\n\n"
            body += "%s also spent **%s** on federal lobbying across **%d disclosures** with the Senate.\n\n" % (name, fmt_money(lobby_total), lobby_count)
        body += "## Data Sources\n\n"
        body += "- **Government contracts**: USASpending.gov (usaspending.gov/search)\n"
        if lobby_total > 0:
            body += "- **Lobbying disclosures**: Senate LDA filings (senate.gov)\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s received %s in %d government contracts." % (name, fmt_money(total_value), contract_count),
            body=body,
            category="contract_windfall",
            sector=sector,
            entity_ids=[eid],
            data_sources=[table, "USASpending.gov"],
            evidence={"total_value": total_value, "contracts": contract_count},
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 3: Penalty Gap ──

def detect_penalty_gap(db, sector_idx=None):
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(CONTRACT_TABLES) - 1)
    c_table, sector, id_col, entity_table = CONTRACT_TABLES[idx]
    e_table = ENFORCEMENT_TABLES[idx][0]

    try:
        # Companies with big contracts but no enforcement actions with actual penalties
        rows = db.execute(text(
            "SELECT c.%s, SUM(c.award_amount) as total_contracts, COUNT(c.id) as contract_count "
            "FROM %s c "
            "LEFT JOIN %s e ON c.%s = e.%s AND e.penalty_amount IS NOT NULL AND e.penalty_amount > 0 "
            "WHERE e.id IS NULL "
            "GROUP BY c.%s HAVING total_contracts > 50000000 "
            "ORDER BY total_contracts DESC LIMIT 5"
            % (id_col, c_table, e_table, id_col, id_col, id_col)
        )).fetchall()
    except Exception as e:
        log.warning("Penalty gap query failed for %s: %s", sector, e)
        return stories

    for eid, total_contracts, contract_count in rows:
        name = get_entity_name(db, eid, entity_table, id_col)
        title = "%s: %s in Contracts, Zero Penalties" % (name, fmt_money(total_contracts))
        if story_exists(db, slug(title)):
            continue

        # Get top contract agencies
        try:
            pa_rows = db.execute(text(
                "SELECT awarding_agency, COUNT(*), SUM(award_amount) FROM %s "
                "WHERE %s = :eid AND awarding_agency IS NOT NULL "
                "GROUP BY awarding_agency ORDER BY SUM(award_amount) DESC LIMIT 5"
                % (c_table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            pa_rows = []

        # Get lobbying spend
        l_table = LOBBYING_TABLES[idx][0]
        lobby_total = 0
        try:
            lr = db.execute(text(
                "SELECT SUM(income) FROM %s WHERE %s = :eid" % (l_table, id_col)
            ), {"eid": eid}).fetchone()
            if lr and lr[0]:
                lobby_total = float(lr[0])
        except Exception:
            pass

        body = "## The Gap\n\n"
        body += "%s has received **%s** across **%d government contracts**, yet faces no enforcement penalties with documented fines on record.\n\n" % (name, fmt_money(total_contracts), contract_count)
        if pa_rows:
            body += "## Where the Contracts Come From\n\n"
            body += "| Agency | Contract Value | Awards |\n"
            body += "|--------|---------------|--------|\n"
            for agency, cnt, amt in pa_rows:
                body += "| %s | %s | %d |\n" % (agency or "Unknown", fmt_money(amt or 0), cnt)
            body += "\n"
        if lobby_total > 0:
            body += "## The Lobbying Spend\n\n"
            body += "%s also spent **%s** lobbying the same government that awards its contracts.\n\n" % (name, fmt_money(lobby_total))
        body += "## Data Sources\n\n"
        body += "- **Government contracts**: USASpending.gov\n"
        body += "- **Enforcement actions**: Federal Register\n"
        if lobby_total > 0:
            body += "- **Lobbying**: Senate LDA filings (senate.gov)\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s has %s in government contracts with zero recorded penalties." % (name, fmt_money(total_contracts)),
            body=body,
            category="penalty_contract_ratio",
            sector=sector,
            entity_ids=[eid],
            data_sources=[c_table, e_table, "USASpending.gov", "Federal Register"],
            evidence={"total_contracts": total_contracts, "contract_count": contract_count, "penalties": 0},
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 4: Congressional Trade Cluster ──

def detect_trade_cluster(db):
    stories = []
    try:
        rows = db.execute(text(
            "SELECT ct.person_id, tm.display_name, tm.party, tm.state, tm.chamber, "
            "COUNT(*) as trade_count, COUNT(DISTINCT ct.ticker) as ticker_count "
            "FROM congressional_trades ct "
            "JOIN tracked_members tm ON tm.person_id = ct.person_id "
            "GROUP BY ct.person_id "
            "HAVING trade_count >= 20 "
            "ORDER BY trade_count DESC LIMIT 10"
        )).fetchall()
    except Exception as e:
        log.warning("Trade cluster query failed: %s", e)
        return stories

    for pid, name, party, state, chamber, trade_count, ticker_count in rows:
        title = "%s Made %d Stock Trades Across %d Companies" % (name, trade_count, ticker_count)
        if story_exists(db, slug(title)):
            continue

        # Get top tickers
        try:
            ticker_rows = db.execute(text(
                "SELECT ticker, COUNT(*) as cnt FROM congressional_trades "
                "WHERE person_id = :pid GROUP BY ticker ORDER BY cnt DESC LIMIT 8"
            ), {"pid": pid}).fetchall()
        except Exception:
            ticker_rows = []

        # Get committee assignments
        try:
            comm_rows = db.execute(text(
                "SELECT c.name FROM committees c "
                "JOIN committee_memberships cm ON cm.committee_thomas_id = c.thomas_id "
                "WHERE cm.person_id = :pid"
            ), {"pid": pid}).fetchall()
        except Exception:
            comm_rows = []
        committees = [c[0] for c in comm_rows] if comm_rows else []

        # Get donations received
        try:
            don_rows = db.execute(text(
                "SELECT SUM(amount), COUNT(*) FROM company_donations WHERE person_id = :pid"
            ), {"pid": pid}).fetchone()
            don_total = float(don_rows[0] or 0) if don_rows else 0
            don_count = int(don_rows[1] or 0) if don_rows else 0
        except Exception:
            don_total = 0
            don_count = 0

        body = "## The Trades\n\n"
        body += "%s. %s (%s-%s, %s) executed **%d stock trades** across **%d different companies** per STOCK Act disclosures.\n\n" % (
            "Sen" if chamber == "senate" else "Rep", name, party or "?", state or "?", chamber or "?",
            trade_count, ticker_count
        )
        if ticker_rows:
            body += "## Most Traded Tickers\n\n"
            body += "| Ticker | Trades |\n"
            body += "|--------|--------|\n"
            for ticker, cnt in ticker_rows:
                body += "| %s | %d |\n" % (ticker, cnt)
            body += "\n"
        if committees:
            body += "## Committee Assignments\n\n"
            body += "This member sits on committees that may oversee industries they trade in:\n\n"
            for c in committees[:6]:
                body += "- %s\n" % c
            body += "\n"
        if don_total > 0:
            body += "## PAC Donations Received\n\n"
            body += "%s received **%s** across **%d** corporate PAC donations.\n\n" % (name, fmt_money(don_total), don_count)
        body += "## Data Sources\n\n"
        body += "- **Stock trades**: House Financial Disclosures / Senate STOCK Act filings\n"
        body += "- **Committees**: congress-legislators (congress.gov)\n"
        if don_total > 0:
            body += "- **PAC donations**: FEC Campaign Finance Data\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s executed %d stock trades across %d companies per STOCK Act disclosures." % (name, trade_count, ticker_count),
            body=body,
            category="prolific_trader",
            sector=None,
            entity_ids=[pid],
            data_sources=["congressional_trades", "House Financial Disclosures"],
            evidence={"trade_count": trade_count, "ticker_count": ticker_count, "party": party, "state": state},
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 5: Lobbying vs Contracts Same Agency ──

def detect_lobby_contract_loop(db, sector_idx=None):
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(LOBBYING_TABLES) - 1)
    l_table, sector, id_col, entity_table = LOBBYING_TABLES[idx]
    c_table = CONTRACT_TABLES[idx][0]

    try:
        # Find companies that both lobby and get contracts
        rows = db.execute(text(
            "SELECT l.%s, SUM(l.income) as lobby_total, "
            "(SELECT SUM(c.award_amount) FROM %s c WHERE c.%s = l.%s) as contract_total, "
            "(SELECT COUNT(*) FROM %s c2 WHERE c2.%s = l.%s) as contract_count "
            "FROM %s l "
            "GROUP BY l.%s "
            "HAVING lobby_total > 50000 AND contract_total > 1000000 "
            "ORDER BY contract_total DESC LIMIT 5"
            % (id_col, c_table, id_col, id_col, c_table, id_col, id_col, l_table, id_col)
        )).fetchall()
    except Exception as e:
        log.warning("Lobby-contract loop query failed for %s: %s", sector, e)
        return stories

    for eid, lobby_total, contract_total, contract_count in rows:
        if not contract_total:
            continue
        name = get_entity_name(db, eid, entity_table, id_col)
        title = "%s Lobbied %s and Received %s in Contracts" % (name, fmt_money(lobby_total), fmt_money(contract_total))
        if story_exists(db, slug(title)):
            continue

        # Get lobbying issues
        try:
            li_rows = db.execute(text(
                "SELECT lobbying_issues, income FROM %s WHERE %s = :eid AND lobbying_issues IS NOT NULL"
                % (l_table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            li_rows = []
        issue_spend = defaultdict(float)
        for issues_str, income in li_rows:
            inc = float(income) if income else 0
            issues = [i.strip() for i in issues_str.split(",") if i.strip()]
            per = inc / max(len(issues), 1)
            for iss in issues:
                issue_spend[iss] += per
        loop_top_issues = sorted(issue_spend.items(), key=lambda x: -x[1])[:5]

        # Get top contract agencies
        try:
            ca_rows = db.execute(text(
                "SELECT awarding_agency, SUM(award_amount) FROM %s WHERE %s = :eid "
                "AND awarding_agency IS NOT NULL GROUP BY awarding_agency ORDER BY SUM(award_amount) DESC LIMIT 5"
                % (c_table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            ca_rows = []

        body = "## The Money Loop\n\n"
        body += "%s spent **%s** on federal lobbying while receiving **%s** across **%d government contracts**.\n\n" % (
            name, fmt_money(lobby_total), fmt_money(contract_total), contract_count
        )
        if loop_top_issues:
            body += "## What They Lobbied For\n\n"
            body += "| Issue | Est. Spend |\n"
            body += "|-------|----------|\n"
            for iss, spend in loop_top_issues:
                body += "| %s | %s |\n" % (iss, fmt_money(spend))
            body += "\n"
        if ca_rows:
            body += "## Who Awarded the Contracts\n\n"
            for agency, amt in ca_rows:
                body += "- **%s**: %s\n" % (agency or "Unknown", fmt_money(amt or 0))
            body += "\n"
        body += "## Data Sources\n\n"
        body += "- **Lobbying**: Senate LDA filings (senate.gov)\n"
        body += "- **Contracts**: USASpending.gov\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s spent %s lobbying and received %s in %d contracts." % (name, fmt_money(lobby_total), fmt_money(contract_total), contract_count),
            body=body,
            category="cross_sector",
            sector=sector,
            entity_ids=[eid],
            data_sources=[l_table, c_table, "Senate LDA (senate.gov)", "USASpending.gov"],
            evidence={"lobby_total": lobby_total, "contract_total": contract_total, "contract_count": contract_count},
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 6: Tax Lobbying by Sector ──

def detect_tax_lobbying(db, sector_idx=None):
    """Find sectors/companies spending big on tax policy lobbying."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(LOBBYING_TABLES) - 1)
    table, sector, id_col, entity_table = LOBBYING_TABLES[idx]

    try:
        rows = db.execute(text(
            "SELECT %s, lobbying_issues, income FROM %s "
            "WHERE lobbying_issues LIKE '%%Taxation%%' AND income > 0"
            % (id_col, table)
        )).fetchall()
    except Exception as e:
        log.warning("Tax lobbying query failed for %s: %s", sector, e)
        return stories

    company_tax_spend = defaultdict(float)
    company_filings = defaultdict(int)
    for eid, issues_str, income in rows:
        inc = float(income) if income else 0
        issues = [i.strip() for i in issues_str.split(",") if i.strip()]
        per_issue = inc / max(len(issues), 1)
        company_tax_spend[eid] += per_issue
        company_filings[eid] += 1

    if not company_tax_spend:
        return stories

    total_tax_spend = sum(company_tax_spend.values())
    top_companies = sorted(company_tax_spend.items(), key=lambda x: -x[1])[:8]

    sector_label = sector.capitalize()
    title = "%s Companies Spent %s Lobbying on Tax Policy" % (sector_label, fmt_money(total_tax_spend))
    if story_exists(db, slug(title)):
        return stories

    body = "## Tax Policy Lobbying\n\n"
    body += "%s sector companies spent an estimated **%s** specifically on tax policy lobbying " % (sector_label, fmt_money(total_tax_spend))
    body += "across **%d filings** that listed Taxation/Internal Revenue Code as an issue.\n\n" % sum(company_filings.values())

    body += "## Top Tax Lobbying Spenders\n\n"
    body += "| Company | Est. Tax Lobbying | Filings |\n"
    body += "|---------|------------------|--------|\n"
    for eid, spend in top_companies:
        name = get_entity_name(db, eid, entity_table, id_col)
        body += "| %s | %s | %d |\n" % (name, fmt_money(spend), company_filings[eid])
    body += "\n*Spend estimated by dividing each filing's income across all listed issues.*\n\n"

    body += "## Data Sources\n\n"
    body += "- **Lobbying disclosures**: Senate LDA filings (senate.gov)\n"
    body += "\n*All data from public government records.*"

    stories.append(make_story(
        title=title,
        summary="%s companies spent %s lobbying on tax policy across %d filings." % (sector_label, fmt_money(total_tax_spend), sum(company_filings.values())),
        body=body,
        category="tax_lobbying",
        sector=sector,
        entity_ids=[eid for eid, _ in top_companies[:5]],
        data_sources=[table, "Senate LDA (senate.gov)"],
        evidence={"total_tax_spend": total_tax_spend, "filing_count": sum(company_filings.values()), "company_count": len(company_tax_spend)},
    ))
    return stories


# ── Pattern 7: Budget/Appropriations Influence ──

def detect_budget_lobbying(db, sector_idx=None):
    """Find companies lobbying on budget/appropriations and getting contracts."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(LOBBYING_TABLES) - 1)
    table, sector, id_col, entity_table = LOBBYING_TABLES[idx]
    c_table = CONTRACT_TABLES[idx][0]

    try:
        rows = db.execute(text(
            "SELECT %s, lobbying_issues, income FROM %s "
            "WHERE (lobbying_issues LIKE '%%Budget%%' OR lobbying_issues LIKE '%%Appropriation%%') AND income > 0"
            % (id_col, table)
        )).fetchall()
    except Exception as e:
        log.warning("Budget lobbying query failed for %s: %s", sector, e)
        return stories

    company_budget_spend = defaultdict(float)
    company_filings = defaultdict(int)
    for eid, issues_str, income in rows:
        inc = float(income) if income else 0
        issues = [i.strip() for i in issues_str.split(",") if i.strip()]
        per_issue = inc / max(len(issues), 1)
        company_budget_spend[eid] += per_issue
        company_filings[eid] += 1

    if not company_budget_spend:
        return stories

    total_budget_spend = sum(company_budget_spend.values())
    top_companies = sorted(company_budget_spend.items(), key=lambda x: -x[1])[:8]

    sector_label = sector.capitalize()
    title = "%s Companies Spent %s Lobbying on Budget and Appropriations" % (sector_label, fmt_money(total_budget_spend))
    if story_exists(db, slug(title)):
        return stories

    body = "## Budget Lobbying\n\n"
    body += "%s sector companies spent an estimated **%s** lobbying on budget and appropriations, " % (sector_label, fmt_money(total_budget_spend))
    body += "directly trying to influence how federal money gets allocated.\n\n"

    body += "## Top Budget Lobbying Spenders\n\n"
    body += "| Company | Est. Budget Lobbying | Filings |\n"
    body += "|---------|---------------------|--------|\n"
    for eid, spend in top_companies:
        name = get_entity_name(db, eid, entity_table, id_col)
        # Cross-reference contracts
        try:
            cr = db.execute(text(
                "SELECT SUM(award_amount) FROM %s WHERE %s = :eid" % (c_table, id_col)
            ), {"eid": eid}).fetchone()
            ct = fmt_money(float(cr[0])) if cr and cr[0] else "N/A"
        except Exception:
            ct = "N/A"
        body += "| %s | %s | %d |\n" % (name, fmt_money(spend), company_filings[eid])
    body += "\n"

    body += "## Data Sources\n\n"
    body += "- **Lobbying disclosures**: Senate LDA filings (senate.gov)\n"
    body += "- **Contracts**: USASpending.gov\n"
    body += "\n*All data from public government records.*"

    stories.append(make_story(
        title=title,
        summary="%s companies spent %s lobbying on federal budget and appropriations." % (sector_label, fmt_money(total_budget_spend)),
        body=body,
        category="budget_influence",
        sector=sector,
        entity_ids=[eid for eid, _ in top_companies[:5]],
        data_sources=[table, c_table, "Senate LDA (senate.gov)", "USASpending.gov"],
        evidence={"total_budget_spend": total_budget_spend, "filing_count": sum(company_filings.values())},
    ))
    return stories


# ── Main ──

def main():
    parser = argparse.ArgumentParser(description="Detect and generate data stories")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-stories", type=int, default=8)
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    db = SessionLocal()

    all_stories = []
    target = args.max_stories

    # Rotate through sectors to spread coverage
    sector_order = list(range(len(LOBBYING_TABLES)))
    random.shuffle(sector_order)

    log.info("Running story detection (target: %d stories)...", target)

    # Run each pattern across shuffled sectors until we hit target
    patterns = [
        ("top_spender", detect_top_spender),
        ("contract_windfall", detect_contract_windfall),
        ("penalty_gap", detect_penalty_gap),
        ("lobby_contract_loop", detect_lobby_contract_loop),
        ("tax_lobbying", detect_tax_lobbying),
        ("budget_lobbying", detect_budget_lobbying),
    ]

    for pattern_name, detect_fn in patterns:
        if len(all_stories) >= target:
            break
        for si in sector_order:
            if len(all_stories) >= target:
                break
            try:
                found = detect_fn(db, sector_idx=si)
                for s in found:
                    if not story_exists(db, s.slug):
                        all_stories.append(s)
                        log.info("  [%s] [%s] %s", pattern_name, s.sector or "cross", s.title[:60])
            except Exception as e:
                log.warning("Pattern %s failed for sector %d: %s", pattern_name, si, e)

    # Trade cluster (no sector index)
    if len(all_stories) < target:
        try:
            found = detect_trade_cluster(db)
            for s in found:
                if not story_exists(db, s.slug):
                    all_stories.append(s)
                    log.info("  [trade_cluster] %s", s.title[:60])
        except Exception as e:
            log.warning("Trade cluster detection failed: %s", e)

    log.info("\nGenerated %d stories", len(all_stories))

    if args.dry_run:
        for s in all_stories:
            log.info("  [DRY-RUN] [%s] %s", s.category, s.title)
        db.close()
        return

    saved = 0
    for s in all_stories:
        if not story_exists(db, s.slug):
            db.add(s)
            saved += 1
    if saved:
        db.commit()
        log.info("Saved %d new stories", saved)
    else:
        log.info("No new stories to save (all duplicates)")

    db.close()


if __name__ == "__main__":
    main()
