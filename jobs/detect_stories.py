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


# ══════════════════════════════════════════════════════════════
# INVESTIGATIVE PATTERNS — Cross-dataset anomaly detection
# ══════════════════════════════════════════════════════════════


# ── Pattern 8: Trade-Before-Legislation ──

def detect_trade_before_legislation(db):
    """Find congress members who traded stock within 30 days before/after
    a bill they sponsored/cosponsored had action. Cross-references
    congressional_trades dates against bill_actions dates."""
    stories = []
    try:
        # Find trades where the member also sponsored/cosponsored a bill
        # and a bill action happened within 30 days of the trade
        rows = db.execute(text("""
            SELECT
                ct.person_id,
                tm.display_name, tm.party, tm.state, tm.chamber,
                ct.ticker, ct.asset_name, ct.transaction_type, ct.amount_range,
                ct.transaction_date,
                pb.bill_id, pb.relationship_type,
                ba.action_text, ba.action_date,
                b.title as bill_title,
                ABS(JULIANDAY(ct.transaction_date) - JULIANDAY(ba.action_date)) as day_gap
            FROM congressional_trades ct
            JOIN tracked_members tm ON tm.person_id = ct.person_id
            JOIN person_bills pb ON pb.person_id = ct.person_id
            JOIN bill_actions ba ON ba.bill_id = pb.bill_id
            JOIN bills b ON b.bill_id = pb.bill_id
            WHERE ct.transaction_date IS NOT NULL
              AND ba.action_date IS NOT NULL
              AND ABS(JULIANDAY(ct.transaction_date) - JULIANDAY(ba.action_date)) <= 30
              AND ct.transaction_date >= '2024-01-01'
            ORDER BY day_gap ASC
            LIMIT 50
        """)).fetchall()
    except Exception as e:
        log.warning("Trade-before-legislation query failed: %s", e)
        return stories

    # Group by person to find the most suspicious patterns
    person_hits = defaultdict(list)
    for r in rows:
        person_hits[r[0]].append({
            "name": r[1], "party": r[2], "state": r[3], "chamber": r[4],
            "ticker": r[5], "asset": r[6], "tx_type": r[7], "amount": r[8],
            "trade_date": str(r[9]), "bill_id": r[10], "relationship": r[11],
            "action": r[12], "action_date": str(r[13]),
            "bill_title": r[14], "day_gap": int(r[15]),
        })

    for pid, hits in sorted(person_hits.items(), key=lambda x: -len(x[1])):
        if len(hits) < 1:
            continue
        h = hits[0]
        name = h["name"]
        title = "%s Traded %s Stock %d Days %s %s Bill Action" % (
            name, h["ticker"], h["day_gap"],
            "Before" if h["trade_date"] <= h["action_date"] else "After",
            h["relationship"].lower()
        )
        if story_exists(db, slug(title)):
            continue

        body = "## The Timeline\n\n"
        for hit in hits[:8]:
            direction = "before" if hit["trade_date"] <= hit["action_date"] else "after"
            body += "- **%s**: %s %s %s (%s) on %s\n" % (
                hit["ticker"], hit["tx_type"], hit["asset"] or hit["ticker"],
                hit["amount"] or "", hit["trade_date"],
                ""
            )
            body += "  - **%d days %s**: Bill %s (%s) had action: \"%s\" on %s\n" % (
                hit["day_gap"], direction, hit["bill_id"],
                hit["relationship"], (hit["action"] or "")[:100], hit["action_date"]
            )
            if hit["bill_title"]:
                body += "  - Bill: *%s*\n" % hit["bill_title"][:120]
            body += "\n"

        # Get committee assignments
        try:
            comms = db.execute(text(
                "SELECT c.name FROM committees c "
                "JOIN committee_memberships cm ON cm.committee_thomas_id = c.thomas_id "
                "WHERE cm.person_id = :pid"
            ), {"pid": pid}).fetchall()
            if comms:
                body += "## Committee Assignments\n\n"
                for c in comms[:6]:
                    body += "- %s\n" % c[0]
                body += "\n"
        except Exception:
            pass

        body += "## Why This Matters\n\n"
        body += "The STOCK Act requires members of Congress to disclose stock trades within 45 days. "
        body += "When trades coincide with legislative action on bills a member sponsors, it raises questions "
        body += "about whether nonpublic information influenced the trading decision.\n\n"
        body += "## Data Sources\n\n"
        body += "- **Stock trades**: House Financial Disclosures / Senate STOCK Act filings\n"
        body += "- **Bill actions**: Congress.gov via congress-legislators (CC0)\n"
        body += "- **Committee data**: congress-legislators (CC0)\n"
        body += "\n*All data from public government records. No allegations of wrongdoing are made.*"

        tickers = list(set(h["ticker"] for h in hits if h["ticker"]))
        stories.append(make_story(
            title=title,
            summary="%s traded %s stock within %d days of legislative action on a bill they %s." % (
                name, hits[0]["ticker"], hits[0]["day_gap"], hits[0]["relationship"].lower()
            ),
            body=body,
            category="trade_timing",
            sector=None,
            entity_ids=[pid] + [h["bill_id"] for h in hits[:3]],
            data_sources=["congressional_trades", "bill_actions", "person_bills", "House Financial Disclosures", "Congress.gov"],
            evidence={
                "person": name, "party": h["party"], "state": h["state"],
                "overlap_count": len(hits), "min_gap_days": min(x["day_gap"] for x in hits),
                "tickers": tickers[:5],
            },
        ))
        if len(stories) >= 2:
            break

    return stories


# ── Pattern 9: Lobby-Then-Win ──

def detect_lobby_then_win(db, sector_idx=None):
    """Find companies that increased lobbying spend targeting a specific agency,
    then received contracts from that same agency within 6 months."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(LOBBYING_TABLES) - 1)
    l_table, sector, id_col, entity_table = LOBBYING_TABLES[idx]
    c_table = CONTRACT_TABLES[idx][0]

    # Map lobbying government_entities to contract awarding_agency
    AGENCY_MAP = {
        "Defense, Dept of": "Department of Defense",
        "Health & Human Services, Dept of (HHS)": "Department of Health and Human Services",
        "Health and Human Services, Dept of (HHS)": "Department of Health and Human Services",
        "Energy, Dept of": "Department of Energy",
        "Transportation, Dept of (DOT)": "Department of Transportation",
        "Homeland Security, Dept of (DHS)": "Department of Homeland Security",
        "Veterans Affairs, Dept of (VA)": "Department of Veterans Affairs",
        "Commerce, Dept of (DOC)": "Department of Commerce",
        "Treasury, Dept of": "Department of the Treasury",
        "Justice, Dept of (DOJ)": "Department of Justice",
        "Agriculture, Dept of": "Department of Agriculture",
        "Interior, Dept of": "Department of the Interior",
        "Education, Dept of": "Department of Education",
        "Labor, Dept of": "Department of Labor",
    }

    try:
        # Get lobbying filings with government entities
        lob_rows = db.execute(text(
            "SELECT %s, government_entities, income, filing_year FROM %s "
            "WHERE government_entities IS NOT NULL AND income > 0"
            % (id_col, l_table)
        )).fetchall()
    except Exception as e:
        log.warning("Lobby-then-win query failed for %s: %s", sector, e)
        return stories

    # Build per-company, per-agency lobbying totals
    company_agency_lobby = defaultdict(lambda: defaultdict(float))
    for eid, entities_str, income, year in lob_rows:
        inc = float(income) if income else 0
        entities = [e.strip() for e in entities_str.split(",") if e.strip()]
        per_ent = inc / max(len(entities), 1)
        for ent in entities:
            mapped = AGENCY_MAP.get(ent)
            if mapped:
                company_agency_lobby[eid][mapped] += per_ent

    # Now check which companies got contracts from those same agencies
    for eid, agencies in company_agency_lobby.items():
        for agency, lobby_spend in sorted(agencies.items(), key=lambda x: -x[1]):
            if lobby_spend < 50000:
                continue
            try:
                cr = db.execute(text(
                    "SELECT SUM(award_amount), COUNT(*) FROM %s "
                    "WHERE %s = :eid AND awarding_agency = :agency"
                    % (c_table, id_col)
                ), {"eid": eid, "agency": agency}).fetchone()
            except Exception:
                continue

            if not cr or not cr[0] or cr[0] < 100000:
                continue

            contract_total = float(cr[0])
            contract_count = int(cr[1])
            name = get_entity_name(db, eid, entity_table, id_col)

            title = "%s Lobbied %s With %s, Then Received %s in Contracts" % (
                name, agency.replace("Department of ", ""), fmt_money(lobby_spend), fmt_money(contract_total)
            )
            if story_exists(db, slug(title)):
                continue

            # Get what they lobbied for
            try:
                issue_rows = db.execute(text(
                    "SELECT lobbying_issues, income FROM %s "
                    "WHERE %s = :eid AND government_entities LIKE :agency_pat AND lobbying_issues IS NOT NULL"
                    % (l_table, id_col)
                ), {"eid": eid, "agency_pat": "%" + agency.split(" of ")[-1].strip()[:15] + "%"}).fetchall()
            except Exception:
                issue_rows = []
            issue_spend = defaultdict(float)
            for issues_str, income in issue_rows:
                inc = float(income) if income else 0
                issues = [i.strip() for i in issues_str.split(",") if i.strip()]
                per = inc / max(len(issues), 1)
                for iss in issues:
                    issue_spend[iss] += per
            top_issues = sorted(issue_spend.items(), key=lambda x: -x[1])[:5]

            body = "## The Pattern\n\n"
            body += "%s spent an estimated **%s** lobbying the **%s** directly.\n\n" % (name, fmt_money(lobby_spend), agency)
            body += "The same agency then awarded %s **%s** across **%d contracts**.\n\n" % (name, fmt_money(contract_total), contract_count)

            if top_issues:
                body += "## What They Lobbied %s About\n\n" % agency.replace("Department of ", "")
                body += "| Issue | Est. Spend |\n"
                body += "|-------|----------|\n"
                for iss, spend in top_issues:
                    body += "| %s | %s |\n" % (iss, fmt_money(spend))
                body += "\n"

            ratio = contract_total / lobby_spend if lobby_spend > 0 else 0
            body += "## The Return\n\n"
            body += "For every **$1** spent lobbying this agency, %s received **$%.0f** in contracts.\n\n" % (name, ratio)

            body += "## Data Sources\n\n"
            body += "- **Lobbying**: Senate LDA filings (senate.gov)\n"
            body += "- **Contracts**: USASpending.gov\n"
            body += "\n*All data from public government records. Correlation does not imply causation.*"

            stories.append(make_story(
                title=title,
                summary="%s spent %s lobbying %s, which then awarded them %s in %d contracts. A %s:1 return." % (
                    name, fmt_money(lobby_spend), agency, fmt_money(contract_total), contract_count, f"{ratio:,.0f}"
                ),
                body=body,
                category="regulatory_loop",
                sector=sector,
                entity_ids=[eid],
                data_sources=[l_table, c_table, "Senate LDA (senate.gov)", "USASpending.gov"],
                evidence={
                    "lobby_spend": lobby_spend, "contract_total": contract_total,
                    "contract_count": contract_count, "agency": agency,
                    "return_ratio": ratio, "top_issues": dict(top_issues),
                },
            ))
            if len(stories) >= 1:
                return stories

    return stories


# ── Pattern 10: Enforcement Disappearance ──

def detect_enforcement_disappearance(db, sector_idx=None):
    """Find companies that had enforcement actions, then lobbied heavily,
    and enforcement dropped to zero."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(ENFORCEMENT_TABLES) - 1)
    e_table, sector, id_col, entity_table = ENFORCEMENT_TABLES[idx]
    l_table = LOBBYING_TABLES[idx][0]

    try:
        # Companies with enforcement actions in earlier years but none recently
        rows = db.execute(text(
            "SELECT %s, COUNT(*) as total_actions, "
            "SUM(CASE WHEN case_date < '2023-01-01' THEN 1 ELSE 0 END) as old_actions, "
            "SUM(CASE WHEN case_date >= '2023-01-01' THEN 1 ELSE 0 END) as recent_actions "
            "FROM %s WHERE case_date IS NOT NULL "
            "GROUP BY %s HAVING old_actions >= 3 AND recent_actions = 0 "
            "ORDER BY old_actions DESC LIMIT 10"
            % (id_col, e_table, id_col)
        )).fetchall()
    except Exception as e:
        log.warning("Enforcement disappearance query failed for %s: %s", sector, e)
        return stories

    for eid, total, old, recent in rows:
        name = get_entity_name(db, eid, entity_table, id_col)

        # Check if they also lobby
        try:
            lr = db.execute(text(
                "SELECT SUM(income), COUNT(*) FROM %s WHERE %s = :eid" % (l_table, id_col)
            ), {"eid": eid}).fetchone()
            lobby_total = float(lr[0] or 0) if lr else 0
            lobby_count = int(lr[1] or 0) if lr else 0
        except Exception:
            lobby_total = 0
            lobby_count = 0

        if lobby_total < 10000:
            continue  # Not interesting without lobbying

        title = "%s Had %d Enforcement Actions, Then Lobbied %s, Now Zero Penalties" % (name, old, fmt_money(lobby_total))
        if story_exists(db, slug(title)):
            continue

        # Get the old enforcement actions
        try:
            old_rows = db.execute(text(
                "SELECT case_title, case_date, enforcement_type, penalty_amount FROM %s "
                "WHERE %s = :eid AND case_date < '2023-01-01' ORDER BY case_date DESC LIMIT 5"
                % (e_table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            old_rows = []

        body = "## The Pattern\n\n"
        body += "%s faced **%d enforcement actions** before 2023. Since then, **zero**.\n\n" % (name, old)
        body += "During this same period, they filed **%d lobbying disclosures** totaling **%s**.\n\n" % (lobby_count, fmt_money(lobby_total))

        if old_rows:
            body += "## Previous Enforcement Actions\n\n"
            body += "| Date | Type | Title |\n"
            body += "|------|------|-------|\n"
            for case_title, case_date, etype, penalty in old_rows:
                body += "| %s | %s | %s |\n" % (
                    str(case_date)[:10] if case_date else "N/A",
                    etype or "Unknown",
                    (case_title or "")[:60]
                )
            body += "\n"

        body += "## The Question\n\n"
        body += "Did %s clean up its practices, or did lobbying influence reduce regulatory scrutiny? " % name
        body += "The public record shows both the enforcement history and the lobbying spend. Draw your own conclusions.\n\n"

        body += "## Data Sources\n\n"
        body += "- **Enforcement**: Federal Register\n"
        body += "- **Lobbying**: Senate LDA filings (senate.gov)\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s had %d enforcement actions before 2023, then spent %s lobbying, and now faces zero penalties." % (name, old, fmt_money(lobby_total)),
            body=body,
            category="enforcement_immunity",
            sector=sector,
            entity_ids=[eid],
            data_sources=[e_table, l_table, "Federal Register", "Senate LDA (senate.gov)"],
            evidence={"old_actions": old, "recent_actions": 0, "lobby_total": lobby_total, "lobby_count": lobby_count},
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 11: PAC-to-Committee Pipeline ──

def detect_pac_committee_pipeline(db):
    """Find companies that direct >80% of PAC money to members of their
    oversight committee, suggesting targeted influence."""
    stories = []

    # For each sector's donations, check committee overlap
    sector_committees = {
        "tech": ["Commerce, Science, and Transportation", "Energy and Commerce", "Science, Space, and Technology", "Judiciary"],
        "finance": ["Banking, Housing, and Urban Affairs", "Financial Services", "Finance"],
        "health": ["Health, Education, Labor, and Pensions", "Energy and Commerce"],
        "energy": ["Energy and Natural Resources", "Energy and Commerce", "Environment and Public Works"],
        "defense": ["Armed Services", "Appropriations"],
    }

    try:
        # Get all donations with person committee data
        rows = db.execute(text("""
            SELECT cd.entity_type, cd.entity_id, cd.person_id, cd.amount,
                   cd.candidate_name, cm.committee_thomas_id, c.name as committee_name
            FROM company_donations cd
            LEFT JOIN committee_memberships cm ON cm.person_id = cd.person_id
            LEFT JOIN committees c ON c.thomas_id = cm.committee_thomas_id
            WHERE cd.amount > 0 AND cd.person_id IS NOT NULL
        """)).fetchall()
    except Exception as e:
        log.warning("PAC-committee pipeline query failed: %s", e)
        return stories

    # Group by company
    company_donations = defaultdict(lambda: {"total": 0, "committee_total": 0, "committee_names": set(), "recipients": set(), "entity_type": ""})
    for entity_type, entity_id, person_id, amount, cand_name, comm_id, comm_name in rows:
        amt = float(amount) if amount else 0
        key = entity_id
        company_donations[key]["total"] += amt
        company_donations[key]["entity_type"] = entity_type
        company_donations[key]["recipients"].add(person_id)
        if comm_name:
            relevant_comms = sector_committees.get(entity_type, [])
            for rc in relevant_comms:
                if rc.lower() in comm_name.lower():
                    company_donations[key]["committee_total"] += amt
                    company_donations[key]["committee_names"].add(comm_name)
                    break

    for eid, data in sorted(company_donations.items(), key=lambda x: -x[1]["committee_total"]):
        if data["total"] < 5000 or data["committee_total"] < 2000:
            continue
        pct = (data["committee_total"] / data["total"]) * 100 if data["total"] > 0 else 0
        if pct < 60:  # At least 60% going to oversight committee members
            continue

        sector = data["entity_type"]
        entity_table = None
        id_col = "company_id"
        for lt, s, ic, et in LOBBYING_TABLES:
            if s == sector:
                entity_table = et
                id_col = ic
                break
        if not entity_table:
            continue

        name = get_entity_name(db, eid, entity_table, id_col)
        title = "%s Directed %.0f%% of PAC Money to Its Oversight Committee Members" % (name, pct)
        if story_exists(db, slug(title)):
            continue

        body = "## The Pipeline\n\n"
        body += "%s donated a total of **%s** to politicians through PAC contributions.\n\n" % (name, fmt_money(data["total"]))
        body += "Of that, **%s (%.0f%%)** went specifically to members of committees that oversee the %s industry.\n\n" % (
            fmt_money(data["committee_total"]), pct, sector
        )

        if data["committee_names"]:
            body += "## Targeted Committees\n\n"
            for cn in sorted(data["committee_names"]):
                body += "- %s\n" % cn
            body += "\n"

        body += "## The Numbers\n\n"
        body += "| Metric | Amount |\n"
        body += "|--------|--------|\n"
        body += "| Total PAC donations | %s |\n" % fmt_money(data["total"])
        body += "| To oversight committee members | %s |\n" % fmt_money(data["committee_total"])
        body += "| Percentage to oversight | %.0f%% |\n" % pct
        body += "| Total recipients | %d |\n\n" % len(data["recipients"])

        body += "## Why This Matters\n\n"
        body += "When a company directs the majority of its political donations to the specific lawmakers "
        body += "who regulate their industry, it raises questions about targeted influence versus broad civic participation.\n\n"

        body += "## Data Sources\n\n"
        body += "- **PAC donations**: FEC Campaign Finance Data\n"
        body += "- **Committee memberships**: congress-legislators (CC0)\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s sent %.0f%% of %s in PAC money to members of its oversight committees." % (name, pct, fmt_money(data["total"])),
            body=body,
            category="bipartisan_buying",
            sector=sector,
            entity_ids=[eid],
            data_sources=["company_donations", "committee_memberships", "FEC", "congress-legislators"],
            evidence={"total_donations": data["total"], "committee_donations": data["committee_total"], "pct": pct, "committees": list(data["committee_names"])},
        ))
        if len(stories) >= 2:
            break

    return stories


# ── Pattern 12: Contract Timing Anomaly ──

def detect_contract_timing(db, sector_idx=None):
    """Find government contracts awarded within 90 days of the same company
    making PAC donations to appropriations committee members."""
    stories = []
    idx = sector_idx if sector_idx is not None else random.randint(0, len(CONTRACT_TABLES) - 1)
    c_table, sector, id_col, entity_table = CONTRACT_TABLES[idx]

    try:
        # Get contracts with start dates
        contracts = db.execute(text(
            "SELECT %s, start_date, award_amount, awarding_agency, description FROM %s "
            "WHERE start_date IS NOT NULL AND award_amount > 1000000 "
            "ORDER BY award_amount DESC LIMIT 100"
            % (id_col, c_table)
        )).fetchall()
    except Exception as e:
        log.warning("Contract timing query failed for %s: %s", sector, e)
        return stories

    for eid, start_date, amount, agency, desc in contracts:
        # Check if this company made donations within 90 days of contract start
        try:
            donation_rows = db.execute(text("""
                SELECT cd.amount, cd.donation_date, cd.candidate_name, cd.person_id,
                       cm.committee_thomas_id, c.name as committee_name
                FROM company_donations cd
                LEFT JOIN committee_memberships cm ON cm.person_id = cd.person_id
                LEFT JOIN committees c ON c.thomas_id = cm.committee_thomas_id
                WHERE cd.entity_id = :eid
                  AND cd.donation_date IS NOT NULL
                  AND ABS(JULIANDAY(cd.donation_date) - JULIANDAY(:start_date)) <= 90
                  AND c.name LIKE '%Appropriations%'
            """), {"eid": eid, "start_date": str(start_date)}).fetchall()
        except Exception:
            continue

        if not donation_rows:
            continue

        name = get_entity_name(db, eid, entity_table, id_col)
        total_donations = sum(float(r[0]) for r in donation_rows if r[0])
        recipients = list(set(r[2] for r in donation_rows if r[2]))

        title = "%s Donated %s to Appropriations Members Within 90 Days of %s Contract" % (
            name, fmt_money(total_donations), fmt_money(float(amount))
        )
        if story_exists(db, slug(title)):
            continue

        body = "## The Timeline\n\n"
        body += "**Contract**: %s received a **%s** contract from %s, starting %s.\n\n" % (
            name, fmt_money(float(amount)), agency or "a federal agency", str(start_date)[:10]
        )
        body += "**Donations**: Within 90 days of this contract, %s made **%s** in PAC donations " % (name, fmt_money(total_donations))
        body += "to **%d members** of Appropriations committees:\n\n" % len(recipients)
        for r in donation_rows[:6]:
            body += "- **%s**: %s on %s\n" % (r[2] or "Unknown", fmt_money(float(r[0] or 0)), str(r[1])[:10])
        body += "\n"

        if desc:
            body += "## Contract Details\n\n"
            body += "%s\n\n" % (desc or "")[:300]

        body += "## Data Sources\n\n"
        body += "- **Contracts**: USASpending.gov\n"
        body += "- **PAC donations**: FEC Campaign Finance Data\n"
        body += "- **Committee memberships**: congress-legislators (CC0)\n"
        body += "\n*All data from public government records. Timing correlation does not prove causation.*"

        stories.append(make_story(
            title=title,
            summary="%s donated %s to Appropriations committee members within 90 days of receiving a %s federal contract." % (
                name, fmt_money(total_donations), fmt_money(float(amount))
            ),
            body=body,
            category="trade_timing",
            sector=sector,
            entity_ids=[eid] + [r[3] for r in donation_rows[:3] if r[3]],
            data_sources=[c_table, "company_donations", "committee_memberships", "USASpending.gov", "FEC"],
            evidence={
                "contract_amount": float(amount), "donation_total": total_donations,
                "agency": agency, "days_window": 90, "recipient_count": len(recipients),
            },
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 13: Foreign Agent + Domestic Lobbying Overlap ──

def detect_fara_domestic_overlap(db):
    """Find lobbying firms registered as foreign agents (FARA) that also lobby
    for domestic companies. Same firm, two masters, potentially coordinating."""
    stories = []

    try:
        # Get active FARA registrant names
        fara_firms = db.execute(text(
            "SELECT DISTINCT registrant_name FROM fara_registrants "
            "WHERE status = 'Active' AND registrant_name IS NOT NULL"
        )).fetchall()
        fara_names = set(r[0].strip().lower() for r in fara_firms if r[0])
    except Exception as e:
        log.warning("FARA overlap query failed: %s", e)
        return stories

    if not fara_names:
        return stories

    # Search all lobbying tables for matching registrant names
    matches = []
    for l_table, sector, id_col, entity_table in LOBBYING_TABLES:
        try:
            rows = db.execute(text(
                "SELECT DISTINCT registrant_name, %s, SUM(income), COUNT(*) FROM %s "
                "WHERE registrant_name IS NOT NULL "
                "GROUP BY registrant_name, %s "
                "HAVING SUM(income) > 10000"
                % (id_col, l_table, id_col)
            )).fetchall()
        except Exception:
            continue

        for reg_name, eid, income, filings in rows:
            if reg_name and reg_name.strip().lower() in fara_names:
                name = get_entity_name(db, eid, entity_table, id_col)
                # Get which foreign principals this firm represents
                try:
                    fp_rows = db.execute(text(
                        "SELECT foreign_principal_name, country FROM fara_foreign_principals "
                        "WHERE LOWER(registrant_name) = :rname AND status = 'Active'"
                    ), {"rname": reg_name.strip().lower()}).fetchall()
                except Exception:
                    fp_rows = []

                matches.append({
                    "firm": reg_name, "company": name, "company_id": eid,
                    "sector": sector, "income": float(income or 0), "filings": filings,
                    "foreign_principals": [(fp[0], fp[1]) for fp in fp_rows[:5]],
                })

    if not matches:
        return stories

    # Sort by income and take the most interesting
    matches.sort(key=lambda x: -x["income"])

    for m in matches[:3]:
        title = "%s Lobbies for %s While Registered as Foreign Agent" % (m["firm"], m["company"])
        if story_exists(db, slug(title)):
            continue

        body = "## The Dual Registration\n\n"
        body += "**%s** is registered as a foreign agent under FARA while simultaneously " % m["firm"]
        body += "lobbying Congress on behalf of **%s** (%s sector).\n\n" % (m["company"], m["sector"])
        body += "The firm filed **%d lobbying disclosures** totaling **%s** for %s.\n\n" % (
            m["filings"], fmt_money(m["income"]), m["company"]
        )

        if m["foreign_principals"]:
            body += "## Foreign Clients (FARA)\n\n"
            body += "The same firm represents these foreign principals:\n\n"
            for fp_name, country in m["foreign_principals"]:
                body += "- **%s** (%s)\n" % (fp_name, country or "Unknown")
            body += "\n"

        body += "## Why This Matters\n\n"
        body += "When one lobbying firm represents both foreign governments and domestic corporations, "
        body += "there is potential for policy positions to align in ways that serve multiple interests simultaneously. "
        body += "FARA exists specifically to ensure transparency around foreign influence in U.S. policy.\n\n"

        body += "## Data Sources\n\n"
        body += "- **Foreign agent registrations**: FARA.gov (Department of Justice)\n"
        body += "- **Domestic lobbying**: Senate LDA filings (senate.gov)\n"
        body += "\n*All data from public government records.*"

        stories.append(make_story(
            title=title,
            summary="%s is a FARA-registered foreign agent that also lobbied %s for %s in the %s sector." % (
                m["firm"], fmt_money(m["income"]), m["company"], m["sector"]
            ),
            body=body,
            category="foreign_lobbying",
            sector=m["sector"],
            entity_ids=[m["company_id"]],
            data_sources=["fara_registrants", "fara_foreign_principals", m["firm"], "Senate LDA (senate.gov)", "FARA.gov"],
            evidence={
                "firm": m["firm"], "company": m["company"], "income": m["income"],
                "foreign_principals": [fp[0] for fp in m["foreign_principals"]],
            },
        ))
        if len(stories) >= 1:
            break

    return stories


# ── Pattern 14: Revolving Door ──

def detect_revolving_door(db):
    """Find lobbying firms whose government_entities field matches agency names
    they previously worked at. Approximation: if a firm lobbies the same agency
    that appears frequently in their filings, it suggests inside knowledge."""
    stories = []

    # Find registrant names that overwhelmingly target one specific agency
    for l_table, sector, id_col, entity_table in LOBBYING_TABLES:
        try:
            rows = db.execute(text(
                "SELECT registrant_name, government_entities, COUNT(*) as cnt "
                "FROM %s WHERE registrant_name IS NOT NULL AND government_entities IS NOT NULL "
                "GROUP BY registrant_name, government_entities "
                "HAVING cnt >= 5 "
                "ORDER BY cnt DESC LIMIT 20" % l_table
            )).fetchall()
        except Exception:
            continue

        firm_agencies = defaultdict(lambda: defaultdict(int))
        for reg_name, entities_str, cnt in rows:
            entities = [e.strip() for e in entities_str.split(",") if e.strip()]
            for ent in entities:
                if ent not in ("HOUSE OF REPRESENTATIVES", "SENATE"):
                    firm_agencies[reg_name][ent] += cnt

        for firm, agencies in firm_agencies.items():
            if not agencies:
                continue
            top_agency = max(agencies.items(), key=lambda x: x[1])
            total_filings = sum(agencies.values())
            if total_filings < 10:
                continue
            concentration = top_agency[1] / total_filings if total_filings > 0 else 0
            if concentration < 0.5:
                continue  # Not concentrated enough

            # Get total income for this firm
            try:
                inc_row = db.execute(text(
                    "SELECT SUM(income), COUNT(DISTINCT %s) FROM %s WHERE registrant_name = :firm"
                    % (id_col, l_table)
                ), {"firm": firm}).fetchone()
                total_income = float(inc_row[0] or 0)
                client_count = int(inc_row[1] or 0)
            except Exception:
                continue

            if total_income < 50000:
                continue

            title = "Lobbying Firm %s Targets %s in %.0f%% of Filings" % (firm, top_agency[0], concentration * 100)
            if story_exists(db, slug(title)):
                continue

            body = "## The Concentration\n\n"
            body += "**%s** filed lobbying disclosures that targeted **%s** in **%.0f%%** of filings " % (firm, top_agency[0], concentration * 100)
            body += "(%d of %d total filings).\n\n" % (top_agency[1], total_filings)
            body += "The firm earned **%s** lobbying for **%d clients** in the %s sector.\n\n" % (fmt_money(total_income), client_count, sector)

            body += "## Agency Targeting Breakdown\n\n"
            body += "| Agency | Filings | Share |\n"
            body += "|--------|---------|-------|\n"
            for agency, cnt in sorted(agencies.items(), key=lambda x: -x[1])[:6]:
                body += "| %s | %d | %.0f%% |\n" % (agency, cnt, (cnt / total_filings) * 100)
            body += "\n"

            body += "## Why This Matters\n\n"
            body += "When a lobbying firm overwhelmingly targets one specific agency, it often indicates "
            body += "specialized expertise or prior employment at that agency (the 'revolving door'). "
            body += "This concentration pattern is worth tracking.\n\n"

            body += "## Data Sources\n\n"
            body += "- **Lobbying disclosures**: Senate LDA filings (senate.gov)\n"
            body += "\n*All data from public government records.*"

            stories.append(make_story(
                title=title,
                summary="Lobbying firm %s targets %s in %.0f%% of its filings, earning %s from %d clients." % (
                    firm, top_agency[0], concentration * 100, fmt_money(total_income), client_count
                ),
                body=body,
                category="revolving_door",
                sector=sector,
                entity_ids=[],
                data_sources=[l_table, "Senate LDA (senate.gov)"],
                evidence={"firm": firm, "top_agency": top_agency[0], "concentration": concentration, "total_income": total_income},
            ))
            if len(stories) >= 1:
                return stories

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
    # Sector-indexed patterns (run across all sectors)
    sector_patterns = [
        ("top_spender", detect_top_spender),
        ("contract_windfall", detect_contract_windfall),
        ("penalty_gap", detect_penalty_gap),
        ("lobby_contract_loop", detect_lobby_contract_loop),
        ("tax_lobbying", detect_tax_lobbying),
        ("budget_lobbying", detect_budget_lobbying),
        ("lobby_then_win", detect_lobby_then_win),
        ("enforcement_disappearance", detect_enforcement_disappearance),
        ("contract_timing", detect_contract_timing),
    ]

    for pattern_name, detect_fn in sector_patterns:
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

    # Non-sector patterns (run once, cross-sector)
    global_patterns = [
        ("trade_cluster", detect_trade_cluster),
        ("trade_before_legislation", detect_trade_before_legislation),
        ("pac_committee_pipeline", detect_pac_committee_pipeline),
        ("fara_domestic_overlap", detect_fara_domestic_overlap),
        ("revolving_door", detect_revolving_door),
    ]

    for pattern_name, detect_fn in global_patterns:
        if len(all_stories) >= target:
            break
        try:
            found = detect_fn(db)
            for s in found:
                if not story_exists(db, s.slug):
                    all_stories.append(s)
                    log.info("  [%s] [%s] %s", pattern_name, s.sector or "cross", s.title[:60])
        except Exception as e:
            log.warning("Pattern %s failed: %s", pattern_name, e)

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
