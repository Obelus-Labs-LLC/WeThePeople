"""
Query Analysis — WeThePeople Database

Runs EXPLAIN QUERY PLAN on the 10 most common query patterns used by the API.
Detects table scans (missing index usage) and outputs a markdown report.

Usage:
    python tests/performance/query_analysis.py
    python tests/performance/query_analysis.py --db sqlite:///./wethepeople.db
    python tests/performance/query_analysis.py --output report.md

Requires: sqlalchemy (already in requirements.txt)
"""

import argparse
import os
import sys
import textwrap
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from sqlalchemy import create_engine, text


# ---------------------------------------------------------------------------
# Query patterns — the 10 most common queries the API executes
# ---------------------------------------------------------------------------

QUERY_PATTERNS: list[dict] = [
    {
        "name": "1. People list with pagination",
        "description": "GET /people?limit=20 — People directory filtered by active status",
        "sql": """
            SELECT tracked_members.*
            FROM tracked_members
            WHERE tracked_members.is_active = 1
            ORDER BY tracked_members.display_name
            LIMIT 20 OFFSET 0
        """,
        "tables": ["tracked_members"],
        "expected_indexes": ["tracked_members.is_active or primary key"],
    },
    {
        "name": "2. Person profile lookup by person_id",
        "description": "GET /people/{person_id} — Single person directory entry",
        "sql": """
            SELECT tracked_members.*
            FROM tracked_members
            WHERE tracked_members.person_id = 'P000197'
        """,
        "tables": ["tracked_members"],
        "expected_indexes": ["tracked_members.person_id (unique)"],
    },
    {
        "name": "3. Lobbying records by company name",
        "description": "GET /finance/{id}/lobbying — Lobbying filings for a specific institution",
        "sql": """
            SELECT finance_lobbying_records.*
            FROM finance_lobbying_records
            WHERE finance_lobbying_records.client_name = 'JPMorgan Chase & Co'
            ORDER BY finance_lobbying_records.filing_year DESC
            LIMIT 50 OFFSET 0
        """,
        "tables": ["finance_lobbying_records"],
        "expected_indexes": ["finance_lobbying_records.client_name"],
    },
    {
        "name": "4. Contracts by awarding agency",
        "description": "Aggregate endpoint — contracts filtered by awarding agency",
        "sql": """
            SELECT government_contracts.*
            FROM government_contracts
            WHERE government_contracts.awarding_agency LIKE '%Defense%'
            ORDER BY government_contracts.start_date DESC
            LIMIT 50 OFFSET 0
        """,
        "tables": ["government_contracts"],
        "expected_indexes": ["government_contracts.awarding_agency"],
    },
    {
        "name": "5. Congressional trades ordered by date",
        "description": "GET /trades — Congressional stock trades, newest first",
        "sql": """
            SELECT congressional_trades.*
            FROM congressional_trades
            ORDER BY congressional_trades.transaction_date DESC
            LIMIT 50 OFFSET 0
        """,
        "tables": ["congressional_trades"],
        "expected_indexes": ["congressional_trades.transaction_date"],
    },
    {
        "name": "6. Search across multiple entity tables",
        "description": "GET /search?q=pfizer — Global search hitting 7 entity tables",
        "sql": """
            SELECT tracked_members.*
            FROM tracked_members
            WHERE tracked_members.display_name LIKE '%pfizer%'
               OR tracked_members.state LIKE '%pfizer%'
               OR tracked_members.bioguide_id LIKE '%pfizer%'
               OR tracked_members.person_id LIKE '%pfizer%'
            LIMIT 5
        """,
        "tables": ["tracked_members"],
        "expected_indexes": ["tracked_members.display_name (LIKE may not use index)"],
        "note": "LIKE with leading wildcard forces table scan; FTS5 would fix this",
    },
    {
        "name": "6b. Search — company table",
        "description": "GET /search?q=pfizer — Health company search portion",
        "sql": """
            SELECT tracked_companies.*
            FROM tracked_companies
            WHERE tracked_companies.display_name LIKE '%pfizer%'
               OR tracked_companies.ticker LIKE '%pfizer%'
            LIMIT 5
        """,
        "tables": ["tracked_companies"],
        "expected_indexes": ["tracked_companies.display_name"],
    },
    {
        "name": "7. Influence stats aggregation",
        "description": "GET /influence/stats — SUM across 4 lobbying tables",
        "sql": """
            SELECT COALESCE(SUM(COALESCE(finance_lobbying_records.income, 0) + COALESCE(finance_lobbying_records.expenses, 0)), 0)
            FROM finance_lobbying_records
        """,
        "tables": ["finance_lobbying_records"],
        "expected_indexes": ["(full table scan expected for SUM aggregation)"],
    },
    {
        "name": "7b. Influence stats — contract count",
        "description": "GET /influence/stats — COUNT across contract tables",
        "sql": """
            SELECT COUNT(government_contracts.id)
            FROM government_contracts
        """,
        "tables": ["government_contracts"],
        "expected_indexes": ["(covering index on id for COUNT)"],
    },
    {
        "name": "8. Enforcement by sector (health)",
        "description": "GET /health/{id}/enforcement — Enforcement actions for a company",
        "sql": """
            SELECT health_enforcement_actions.*
            FROM health_enforcement_actions
            WHERE health_enforcement_actions.company_id = 'pfizer'
            ORDER BY health_enforcement_actions.case_date DESC
            LIMIT 50 OFFSET 0
        """,
        "tables": ["health_enforcement_actions"],
        "expected_indexes": ["health_enforcement_actions.company_id"],
    },
    {
        "name": "9. Vote detail with member votes join",
        "description": "GET /votes/{id} — Single vote with all member positions",
        "sql": """
            SELECT member_votes.*, tracked_members.display_name, tracked_members.party,
                   tracked_members.state, tracked_members.chamber, tracked_members.photo_url
            FROM member_votes
            LEFT OUTER JOIN tracked_members
                ON tracked_members.bioguide_id = member_votes.bioguide_id
            WHERE member_votes.vote_id = 1
        """,
        "tables": ["member_votes", "tracked_members"],
        "expected_indexes": ["member_votes.vote_id", "tracked_members.bioguide_id"],
    },
    {
        "name": "10. Claims by person_id",
        "description": "GET /verifications?entity_id=P000197 — Claims for a politician",
        "sql": """
            SELECT claims.*, claim_evaluations.*
            FROM claims
            LEFT OUTER JOIN claim_evaluations ON claim_evaluations.claim_id = claims.id
            WHERE claims.person_id = 'P000197'
            ORDER BY claims.id DESC
            LIMIT 50 OFFSET 0
        """,
        "tables": ["claims", "claim_evaluations"],
        "expected_indexes": ["claims.person_id", "claim_evaluations.claim_id"],
    },
    {
        "name": "BONUS: Dashboard stats — politics",
        "description": "GET /politics/dashboard/stats — Multiple COUNT queries",
        "sql": """
            SELECT COUNT(tracked_members.id)
            FROM tracked_members
            WHERE tracked_members.is_active = 1
        """,
        "tables": ["tracked_members"],
        "expected_indexes": ["tracked_members.is_active or covering index"],
    },
    {
        "name": "BONUS: Data freshness — lobbying max date",
        "description": "GET /influence/data-freshness — MAX(created_at) across lobbying tables",
        "sql": """
            SELECT MAX(finance_lobbying_records.created_at), COUNT(finance_lobbying_records.id)
            FROM finance_lobbying_records
        """,
        "tables": ["finance_lobbying_records"],
        "expected_indexes": ["(index on created_at would help MAX)"],
    },
]


# ---------------------------------------------------------------------------
# Analysis helpers
# ---------------------------------------------------------------------------

@dataclass
class QueryResult:
    name: str
    description: str
    sql: str
    plan_lines: list[str] = field(default_factory=list)
    uses_index: bool = False
    has_table_scan: bool = False
    note: str = ""
    error: Optional[str] = None


# Indicators that SQLite is using an index
_INDEX_KEYWORDS = [
    "USING INDEX",
    "USING COVERING INDEX",
    "USING INTEGER PRIMARY KEY",
    "USING ROWID",
]

# Indicators of a table scan (no index)
_SCAN_KEYWORDS = [
    "SCAN TABLE",
    "SCAN",
]


def classify_plan(plan_lines: list[str]) -> tuple[bool, bool]:
    """Return (uses_index, has_table_scan) from EXPLAIN QUERY PLAN output."""
    uses_index = False
    has_scan = False

    for line in plan_lines:
        upper = line.upper()
        if any(kw in upper for kw in _INDEX_KEYWORDS):
            uses_index = True
        # "SCAN TABLE" without "USING INDEX" is a full scan
        if "SCAN TABLE" in upper or "SCAN " in upper:
            # Check if this scan line also mentions an index
            if not any(kw in upper for kw in _INDEX_KEYWORDS):
                has_scan = True

    return uses_index, has_scan


def run_analysis(db_url: str) -> list[QueryResult]:
    """Run EXPLAIN QUERY PLAN on all query patterns and classify results."""
    engine = create_engine(db_url)
    results = []

    with engine.connect() as conn:
        # Verify we can connect
        try:
            conn.execute(text("SELECT 1"))
        except Exception as e:
            print(f"ERROR: Cannot connect to database: {e}", file=sys.stderr)
            sys.exit(1)

        for pattern in QUERY_PATTERNS:
            result = QueryResult(
                name=pattern["name"],
                description=pattern["description"],
                sql=pattern["sql"].strip(),
                note=pattern.get("note", ""),
            )

            try:
                # SQLite EXPLAIN QUERY PLAN
                explain_sql = f"EXPLAIN QUERY PLAN {pattern['sql']}"
                rows = conn.execute(text(explain_sql)).fetchall()

                plan_lines = []
                for row in rows:
                    # SQLite returns (selectid, order, from, detail)
                    # The detail column has the useful info
                    if len(row) >= 4:
                        plan_lines.append(str(row[3]))
                    else:
                        plan_lines.append(str(row))

                result.plan_lines = plan_lines
                result.uses_index, result.has_table_scan = classify_plan(plan_lines)

            except Exception as e:
                result.error = str(e)

            results.append(result)

    return results


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def generate_report(results: list[QueryResult]) -> str:
    """Generate a markdown report from query analysis results."""
    lines = []
    lines.append("# Query Performance Analysis Report")
    lines.append("")
    lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")

    # Summary
    total = len(results)
    indexed = sum(1 for r in results if r.uses_index and not r.has_table_scan)
    scans = sum(1 for r in results if r.has_table_scan)
    errors = sum(1 for r in results if r.error)
    mixed = sum(1 for r in results if r.uses_index and r.has_table_scan)

    lines.append("## Summary")
    lines.append("")
    lines.append(f"| Metric | Count |")
    lines.append(f"|--------|-------|")
    lines.append(f"| Total queries analyzed | {total} |")
    lines.append(f"| Fully indexed (no scan) | {indexed} |")
    lines.append(f"| Table scan detected | {scans} |")
    lines.append(f"| Mixed (index + scan) | {mixed} |")
    lines.append(f"| Errors (table missing?) | {errors} |")
    lines.append("")

    if scans > 0:
        lines.append("> **Action needed**: Queries with table scans should be reviewed for missing indexes.")
        lines.append("")

    # Detail for each query
    lines.append("## Query Details")
    lines.append("")

    for r in results:
        status_icon = "PASS" if (r.uses_index and not r.has_table_scan) else ("ERROR" if r.error else ("SCAN" if r.has_table_scan else "OK"))
        lines.append(f"### {r.name} [{status_icon}]")
        lines.append("")
        lines.append(f"**Endpoint**: {r.description}")
        lines.append("")

        if r.error:
            lines.append(f"**Error**: `{r.error}`")
            lines.append("")
            lines.append("This likely means the table does not exist in the database.")
            lines.append("")
            continue

        lines.append("**Query**:")
        lines.append("```sql")
        lines.append(textwrap.dedent(r.sql).strip())
        lines.append("```")
        lines.append("")

        lines.append("**Query Plan**:")
        lines.append("```")
        for plan_line in r.plan_lines:
            lines.append(f"  {plan_line}")
        lines.append("```")
        lines.append("")

        lines.append(f"- Uses index: **{'Yes' if r.uses_index else 'No'}**")
        lines.append(f"- Table scan: **{'Yes' if r.has_table_scan else 'No'}**")

        if r.note:
            lines.append(f"- Note: {r.note}")

        if r.has_table_scan and not r.uses_index:
            lines.append("")
            lines.append("**Recommendation**: Add an index to eliminate the full table scan.")

            # Suggest specific indexes based on the query
            sql_upper = r.sql.upper()
            if "WHERE" in sql_upper:
                lines.append("Consider indexing the column(s) used in the WHERE clause.")
            if "ORDER BY" in sql_upper:
                lines.append("A covering index on the ORDER BY column(s) would also help.")

        lines.append("")
        lines.append("---")
        lines.append("")

    # Recommendations section
    lines.append("## Recommendations")
    lines.append("")

    scan_queries = [r for r in results if r.has_table_scan and not r.error]
    if scan_queries:
        lines.append("### Missing Indexes")
        lines.append("")
        lines.append("The following queries perform full table scans and would benefit from indexes:")
        lines.append("")

        suggested_indexes = []

        for r in scan_queries:
            lines.append(f"- **{r.name}**: {r.description}")

            # Parse SQL to suggest indexes
            sql_lower = r.sql.lower()

            # Extract table and WHERE columns (basic heuristic)
            if "like '%" in sql_lower:
                lines.append("  - LIKE with leading wildcard prevents index usage.")
                lines.append("  - Consider SQLite FTS5 for full-text search, or prefix-only LIKE patterns.")
            elif "where" in sql_lower:
                # Try to extract column from simple WHERE clauses
                import re
                where_cols = re.findall(r"where\s+\w+\.(\w+)\s*=", sql_lower)
                for col in where_cols:
                    suggested_indexes.append(f"  - Column: `{col}`")

        lines.append("")

        if suggested_indexes:
            lines.append("### Suggested CREATE INDEX statements")
            lines.append("")
            lines.append("Review these suggestions and add indexes where appropriate:")
            lines.append("")
            lines.append("```sql")
            lines.append("-- Example indexes for common query patterns:")
            lines.append("CREATE INDEX IF NOT EXISTS ix_tracked_members_active ON tracked_members(is_active, display_name);")
            lines.append("CREATE INDEX IF NOT EXISTS ix_finance_lobbying_client ON finance_lobbying_records(client_name, filing_year);")
            lines.append("CREATE INDEX IF NOT EXISTS ix_govt_contracts_agency ON government_contracts(awarding_agency, start_date);")
            lines.append("CREATE INDEX IF NOT EXISTS ix_congressional_trades_date ON congressional_trades(transaction_date DESC);")
            lines.append("CREATE INDEX IF NOT EXISTS ix_health_enforcement_company ON health_enforcement_actions(company_id, case_date);")
            lines.append("CREATE INDEX IF NOT EXISTS ix_member_votes_voteid ON member_votes(vote_id);")
            lines.append("CREATE INDEX IF NOT EXISTS ix_claim_evals_claimid ON claim_evaluations(claim_id);")
            lines.append("```")
            lines.append("")
    else:
        lines.append("All analyzed queries use indexes. No missing indexes detected.")
        lines.append("")

    lines.append("### General Recommendations")
    lines.append("")
    lines.append("1. **LIKE with leading wildcard** (`%pfizer%`) forces table scans in SQLite.")
    lines.append("   Consider FTS5 virtual tables for the search endpoint.")
    lines.append("")
    lines.append("2. **Aggregate queries** (SUM, COUNT, MAX) on large tables scan all rows.")
    lines.append("   Cache these results in-memory with short TTLs (see caching strategy).")
    lines.append("")
    lines.append("3. **SQLite locking**: Under concurrent load, WAL mode helps but does not")
    lines.append("   eliminate reader-writer contention. PostgreSQL migration will fix this.")
    lines.append("")
    lines.append("4. **Covering indexes**: For queries that only need a few columns,")
    lines.append("   consider covering indexes to avoid row lookups.")
    lines.append("")
    lines.append("5. Run this analysis after adding new indexes to verify they are used:")
    lines.append("   ```")
    lines.append("   python tests/performance/query_analysis.py --output report.md")
    lines.append("   ```")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Analyze WeThePeople query patterns")
    parser.add_argument(
        "--db",
        default=os.getenv("WTP_DB_URL", "sqlite:///./wethepeople.db"),
        help="SQLAlchemy database URL (default: sqlite:///./wethepeople.db)",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output file path (default: stdout)",
    )
    args = parser.parse_args()

    print(f"Analyzing queries against: {args.db}", file=sys.stderr)
    results = run_analysis(args.db)
    report = generate_report(results)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"Report written to: {args.output}", file=sys.stderr)
    else:
        print(report)


if __name__ == "__main__":
    main()
