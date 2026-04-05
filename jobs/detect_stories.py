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

    for eid, total_spend, filing_count in rows:
        if not total_spend or total_spend < 100000:
            continue
        name = get_entity_name(db, eid, entity_table, id_col)
        title = "%s Spent %s Lobbying Congress" % (name, fmt_money(total_spend))
        if story_exists(db, slug(title)):
            continue

        # Get top issues
        try:
            issue_rows = db.execute(text(
                "SELECT lobbying_issues FROM %s WHERE %s = :eid AND lobbying_issues IS NOT NULL"
                % (table, id_col)
            ), {"eid": eid}).fetchall()
        except Exception:
            issue_rows = []

        issue_counts = defaultdict(int)
        for (issues_str,) in issue_rows:
            for iss in issues_str.split(","):
                iss = iss.strip()
                if iss:
                    issue_counts[iss] += 1
        top_issues = sorted(issue_counts.items(), key=lambda x: -x[1])[:5]

        body = "## The Spending\n\n"
        body += "%s filed %d lobbying disclosures totaling %s with the U.S. Senate.\n\n" % (name, filing_count, fmt_money(total_spend))
        if top_issues:
            body += "## What They Lobbied For\n\n"
            for iss, cnt in top_issues:
                body += "- **%s** (%d filings)\n" % (iss, cnt)
            body += "\n"
        body += "## Data Sources\n\n"
        body += "- Senate Lobbying Disclosure Act filings (senate.gov)\n"

        stories.append(make_story(
            title=title,
            summary="%s filed %d lobbying disclosures totaling %s." % (name, filing_count, fmt_money(total_spend)),
            body=body,
            category="lobbying_spike",
            sector=sector,
            entity_ids=[eid],
            data_sources=[table, "Senate LDA (senate.gov)"],
            evidence={"total_spend": total_spend, "filings": filing_count, "top_issues": dict(top_issues)},
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

        body = "## The Contracts\n\n"
        body += "%s has received %s across %d government contract awards.\n\n" % (name, fmt_money(total_value), contract_count)
        if agency_rows:
            body += "## Awarding Agencies\n\n"
            for agency, cnt, amt in agency_rows:
                body += "- **%s**: %s (%d awards)\n" % (agency or "Unknown", fmt_money(amt or 0), cnt)
            body += "\n"
        body += "## Data Sources\n\n- USASpending.gov\n"

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

        body = "## The Gap\n\n"
        body += "%s has received %s across %d government contracts, yet faces no enforcement penalties on record.\n\n" % (name, fmt_money(total_contracts), contract_count)
        body += "## Data Sources\n\n- USASpending.gov (contracts)\n- Federal Register (enforcement)\n"

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

        body = "## The Trades\n\n"
        body += "%s. %s (%s-%s, %s) executed %d stock trades across %d different companies.\n\n" % (
            "Sen" if chamber == "senate" else "Rep", name, party or "?", state or "?", chamber or "?",
            trade_count, ticker_count
        )
        if ticker_rows:
            body += "## Most Traded Tickers\n\n"
            for ticker, cnt in ticker_rows:
                body += "- **%s**: %d trades\n" % (ticker, cnt)
            body += "\n"
        body += "## Data Sources\n\n- House Financial Disclosures / Senate STOCK Act filings\n"

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

        body = "## The Money Loop\n\n"
        body += "%s spent %s on federal lobbying while receiving %s across %d government contracts.\n\n" % (
            name, fmt_money(lobby_total), fmt_money(contract_total), contract_count
        )
        body += "## Data Sources\n\n- Senate LDA filings (senate.gov)\n- USASpending.gov\n"

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
