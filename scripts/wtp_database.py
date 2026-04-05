"""
WeThePeople Database Evidence Source for Veritas

Searches the WTP SQLite database for evidence matching claims.
Always searches ALL data types (lobbying, contracts, trades, committees,
donations, enforcement) for every matched entity. No keyword gating.
Snippets are written to maximize BM25 score overlap with claim text.

Place this file at: veritas-service/src/veritas/evidence_sources/wtp_database.py
"""

import logging
import os
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)

WTP_DB_PATH = os.environ.get(
    "WTP_DB_PATH",
    "/home/dshon/wethepeople-backend/wethepeople.db"
)

LOBBYING_TABLES = [
    ("lobbying_records", "company_id", "tech"),
    ("finance_lobbying_records", "institution_id", "finance"),
    ("health_lobbying_records", "company_id", "health"),
    ("energy_lobbying_records", "company_id", "energy"),
    ("transportation_lobbying_records", "company_id", "transportation"),
    ("defense_lobbying_records", "company_id", "defense"),
    ("chemical_lobbying_records", "company_id", "chemicals"),
    ("agriculture_lobbying_records", "company_id", "agriculture"),
    ("telecom_lobbying_records", "company_id", "telecom"),
    ("education_lobbying_records", "company_id", "education"),
]

CONTRACT_TABLES = [
    ("government_contracts", "company_id", "tech"),
    ("finance_government_contracts", "institution_id", "finance"),
    ("health_government_contracts", "company_id", "health"),
    ("energy_government_contracts", "company_id", "energy"),
    ("transportation_government_contracts", "company_id", "transportation"),
    ("defense_government_contracts", "company_id", "defense"),
    ("chemical_government_contracts", "company_id", "chemicals"),
    ("agriculture_government_contracts", "company_id", "agriculture"),
    ("telecom_government_contracts", "company_id", "telecom"),
    ("education_government_contracts", "company_id", "education"),
]

ENFORCEMENT_TABLES = [
    ("ftc_enforcement_actions", "company_id", "tech"),
    ("finance_enforcement_actions", "institution_id", "finance"),
    ("health_enforcement_actions", "company_id", "health"),
    ("energy_enforcement_actions", "company_id", "energy"),
    ("transportation_enforcement_actions", "company_id", "transportation"),
    ("defense_enforcement_actions", "company_id", "defense"),
    ("chemical_enforcement_actions", "company_id", "chemicals"),
    ("agriculture_enforcement_actions", "company_id", "agriculture"),
    ("telecom_enforcement_actions", "company_id", "telecom"),
    ("education_enforcement_actions", "company_id", "education"),
]

ENTITY_TABLES = [
    ("tracked_members", "person_id", "display_name", "politician"),
    ("tracked_tech_companies", "company_id", "display_name", "tech"),
    ("tracked_institutions", "institution_id", "display_name", "finance"),
    ("tracked_companies", "company_id", "display_name", "health"),
    ("tracked_energy_companies", "company_id", "display_name", "energy"),
    ("tracked_transportation_companies", "company_id", "display_name", "transportation"),
    ("tracked_defense_companies", "company_id", "display_name", "defense"),
    ("tracked_chemical_companies", "company_id", "display_name", "chemicals"),
    ("tracked_agriculture_companies", "company_id", "display_name", "agriculture"),
    ("tracked_telecom_companies", "company_id", "display_name", "telecom"),
    ("tracked_education_companies", "company_id", "display_name", "education"),
]


def _get_conn():
    if not os.path.exists(WTP_DB_PATH):
        logger.warning("WTP database not found at %s", WTP_DB_PATH)
        return None
    conn = sqlite3.connect(WTP_DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def _find_entities(conn, claim_text):
    words = claim_text.split()
    names = []
    i = 0
    while i < len(words):
        w = words[i].strip(".,;:\"'()")
        if w and w[0].isupper() and len(w) > 2:
            parts = [w]
            j = i + 1
            while j < len(words):
                nw = words[j].strip(".,;:\"'()")
                if nw and nw[0].isupper():
                    parts.append(nw)
                    j += 1
                else:
                    break
            name = " ".join(parts)
            skip = {"the", "and", "for", "this", "that", "house", "senate",
                    "congress", "committee", "department", "united", "states",
                    "while", "between", "during", "after", "before", "also",
                    "evidence", "sources", "insufficient", "claim", "checked"}
            if name.lower() not in skip:
                names.append(name)
            i = j
        else:
            i += 1

    found = []
    seen = set()
    for entity_name in names:
        for table, id_col, name_col, sector in ENTITY_TABLES:
            try:
                cur = conn.execute(
                    "SELECT %s, %s FROM %s WHERE LOWER(%s) LIKE ?" % (id_col, name_col, table, name_col),
                    ("%" + entity_name.lower() + "%",)
                )
                for row in cur.fetchall():
                    key = (row[0], sector)
                    if key not in seen:
                        seen.add(key)
                        found.append({
                            "entity_id": row[0], "entity_name": row[1],
                            "sector": sector, "id_col": id_col,
                        })
            except Exception:
                continue
    return found


def _fmt(n):
    if n >= 1e9:
        return "$%.1fB" % (n / 1e9)
    if n >= 1e6:
        return "$%.1fM" % (n / 1e6)
    if n >= 1e3:
        return "$%.0fK" % (n / 1e3)
    return "$%s" % "{:,.0f}".format(n)


def _profile_url(sector, eid):
    base = "https://wethepeopleforus.com"
    if sector == "politician":
        return "%s/politics/people/%s" % (base, eid)
    route = {"tech": "technology"}.get(sector, sector)
    return "%s/%s/%s" % (base, route, eid)


def search_wtp(query: str, **kwargs: Any) -> list[dict[str, Any]]:
    """Search the WeThePeople database for ALL evidence on matched entities.

    Unlike other sources, this searches ALL data types (lobbying, contracts,
    trades, committees, donations, enforcement) for every matched entity.
    No keyword gating. Snippets echo claim language for better BM25 scoring.
    """
    conn = _get_conn()
    if not conn:
        return []

    results = []

    try:
        entities = _find_entities(conn, query)

        for entity in entities[:5]:
            eid = entity["entity_id"]
            ename = entity["entity_name"]
            sector = entity["sector"]
            url = _profile_url(sector, eid)

            # ALWAYS search contracts
            for ct, cc, cs in CONTRACT_TABLES:
                if cs == sector:
                    try:
                        r = conn.execute(
                            "SELECT SUM(award_amount), COUNT(*) FROM %s WHERE %s = ?" % (ct, cc), (eid,)
                        ).fetchone()
                        if r and r[0] and float(r[0]) > 0:
                            total = float(r[0])
                            count = int(r[1])
                            # Get top agency
                            agency_row = conn.execute(
                                "SELECT awarding_agency, SUM(award_amount) FROM %s WHERE %s = ? AND awarding_agency IS NOT NULL GROUP BY awarding_agency ORDER BY SUM(award_amount) DESC LIMIT 1" % (ct, cc), (eid,)
                            ).fetchone()
                            agency = agency_row[0] if agency_row else "federal agencies"
                            results.append({
                                "url": url,
                                "title": "%s received %s in government contracts" % (ename, _fmt(total)),
                                "snippet": "%s received %s across %d government contracts awarded by %s, according to USASpending.gov federal procurement records." % (
                                    ename, _fmt(total), count, agency
                                ),
                                "source": "wtp_database",
                                "evidence_type": "primary_source",
                            })
                    except Exception:
                        pass
                    break

            # ALWAYS search lobbying
            for lt, lc, ls in LOBBYING_TABLES:
                if ls == sector:
                    try:
                        r = conn.execute(
                            "SELECT SUM(income), COUNT(*) FROM %s WHERE %s = ?" % (lt, lc), (eid,)
                        ).fetchone()
                        if r and r[0] and float(r[0]) > 0:
                            total = float(r[0])
                            count = int(r[1])
                            results.append({
                                "url": url,
                                "title": "%s spent %s lobbying Congress" % (ename, _fmt(total)),
                                "snippet": "%s spent %s on lobbying across %d Senate Lobbying Disclosure Act filings, targeting Congress and federal agencies." % (
                                    ename, _fmt(total), count
                                ),
                                "source": "wtp_database",
                                "evidence_type": "primary_source",
                            })
                    except Exception:
                        pass
                    break

            # ALWAYS search enforcement
            for et, ec, es in ENFORCEMENT_TABLES:
                if es == sector:
                    try:
                        r = conn.execute(
                            "SELECT COUNT(*), SUM(CASE WHEN penalty_amount IS NOT NULL AND penalty_amount > 0 THEN penalty_amount ELSE 0 END) FROM %s WHERE %s = ?" % (et, ec), (eid,)
                        ).fetchone()
                        if r and r[0] and int(r[0]) > 0:
                            count = int(r[0])
                            penalties = float(r[1] or 0)
                            if penalties > 0:
                                snippet = "%s faced %d enforcement actions with %s in total penalties, per Federal Register records." % (ename, count, _fmt(penalties))
                            else:
                                snippet = "%s faced %d enforcement actions with no documented financial penalties, per Federal Register records." % (ename, count)
                            results.append({
                                "url": url,
                                "title": "%s enforcement actions (%d total)" % (ename, count),
                                "snippet": snippet,
                                "source": "wtp_database",
                                "evidence_type": "primary_source",
                            })
                    except Exception:
                        pass
                    break

            # Congressional trades (politicians only)
            if sector == "politician":
                try:
                    r = conn.execute(
                        "SELECT COUNT(*), COUNT(DISTINCT ticker) FROM congressional_trades WHERE person_id = ?", (eid,)
                    ).fetchone()
                    if r and r[0] and int(r[0]) > 0:
                        results.append({
                            "url": url,
                            "title": "%s traded stocks %d times" % (ename, int(r[0])),
                            "snippet": "%s traded stocks %d times across %d different tickers, per House Financial Disclosures and Senate STOCK Act filings." % (
                                ename, int(r[0]), int(r[1])
                            ),
                            "source": "wtp_database",
                            "evidence_type": "primary_source",
                        })
                except Exception:
                    pass

            # Committee memberships (politicians only)
            if sector == "politician":
                try:
                    rows = conn.execute(
                        "SELECT c.name FROM committees c "
                        "JOIN committee_memberships cm ON cm.committee_thomas_id = c.thomas_id "
                        "WHERE cm.person_id = ?", (eid,)
                    ).fetchall()
                    if rows:
                        committees = [r[0] for r in rows[:5]]
                        results.append({
                            "url": url,
                            "title": "%s serves on %d congressional committees" % (ename, len(rows)),
                            "snippet": "%s serves on the following congressional committees: %s. Source: Congress.gov committee records." % (
                                ename, ", ".join(committees)
                            ),
                            "source": "wtp_database",
                            "evidence_type": "primary_source",
                        })
                except Exception:
                    pass

            # PAC donations
            try:
                r = conn.execute(
                    "SELECT SUM(amount), COUNT(*) FROM company_donations WHERE entity_id = ? OR person_id = ?", (eid, eid)
                ).fetchone()
                if r and r[0] and float(r[0]) > 0:
                    results.append({
                        "url": url,
                        "title": "%s PAC donations totaling %s" % (ename, _fmt(float(r[0]))),
                        "snippet": "%s is associated with %s in PAC donations across %d contributions, per Federal Election Commission campaign finance records." % (
                            ename, _fmt(float(r[0])), int(r[1])
                        ),
                        "source": "wtp_database",
                        "evidence_type": "primary_source",
                    })
            except Exception:
                pass

    finally:
        conn.close()

    logger.info("WTP database: %d evidence records for '%s'", len(results), query[:60])
    return results
