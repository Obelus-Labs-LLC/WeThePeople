"""
Database dialect compatibility layer.

Provides functions that emit the correct SQL for SQLite, PostgreSQL, or Oracle
depending on the configured DATABASE_URL. Import these instead of using raw
func.strftime(), func.group_concat(), LIMIT, date('now'), etc.

Usage:
    from utils.db_compat import extract_year, group_concat, now_minus_days, limit_clause, is_sqlite, is_oracle
"""

import os
import re
from sqlalchemy import func, text, literal_column, event, JSON, case
from sqlalchemy.sql import expression
from sqlalchemy.types import TypeDecorator, Text as SAText

DATABASE_URL = os.getenv("WTP_DB_URL") or "sqlite:///./wethepeople.db"


# --- Oracle JSON compatibility ---
# Oracle 19c doesn't have native JSON type in SQLAlchemy.
# This hook remaps JSON columns to CLOB at DDL time for Oracle.

def patch_types_for_oracle(metadata):
    """Call before create_all() when targeting Oracle 19c.

    Fixes two Oracle incompatibilities:
    1. JSON → CLOB (Oracle 19c doesn't support JSON DDL through SQLAlchemy)
    2. VARCHAR2 without length → VARCHAR2(4000) (Oracle requires explicit lengths)

    The data is still stored as JSON strings in CLOB columns, and varchar
    data works the same — just with an explicit max length.
    """
    if not is_oracle():
        return
    from sqlalchemy import Text, String
    from sqlalchemy.types import String as SAString
    # Oracle reserved words that may be used as column names
    ORACLE_RESERVED = {
        'session', 'comment', 'order', 'group', 'user', 'date', 'number',
        'level', 'size', 'type', 'key', 'index', 'resource', 'share',
        'start', 'end', 'mode', 'uid', 'timestamp',
    }
    for table in metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, JSON):
                column.type = Text()
            elif isinstance(column.type, SAString) and not column.type.length:
                column.type = SAString(4000)
            # Quote column names that are Oracle reserved words
            if column.name.lower() in ORACLE_RESERVED and not column.name.startswith('"'):
                column.name = column.key  # keep Python attribute name
                column.quote = True  # force quoting in DDL


def is_sqlite() -> bool:
    return DATABASE_URL.startswith("sqlite")


def is_oracle() -> bool:
    return "oracle" in DATABASE_URL.lower()


def is_postgres() -> bool:
    return DATABASE_URL.startswith("postgresql")


# --- Year extraction ---

def extract_year(column):
    """Extract year from a date/datetime column. Works on SQLite, PostgreSQL, and Oracle."""
    if is_sqlite():
        return func.strftime('%Y', column)
    else:
        # Both PostgreSQL and Oracle support EXTRACT(YEAR FROM col)
        return func.extract('year', column)


def extract_year_week(column):
    """Extract year-week string (e.g., '2026-12') from a date column."""
    if is_sqlite():
        return func.strftime('%Y-%W', column)
    elif is_oracle():
        return func.to_char(column, 'IYYY-IW')
    else:
        return func.to_char(column, 'IYYY-IW')


# --- String aggregation ---

def group_concat(column, separator=','):
    """Aggregate strings with a separator. Handles DISTINCT automatically.

    Usage:
        group_concat(Model.column)                    # concatenate all values
        group_concat(Model.column.distinct())          # concatenate distinct values
    """
    if is_sqlite():
        # SQLite group_concat doesn't accept DISTINCT + separator as two args.
        # When column has .distinct(), strip it and use plain group_concat.
        if hasattr(column, 'element') and hasattr(column, 'modifier'):
            # column is a UnaryExpression like DISTINCT(col) — not supported with separator in SQLite
            return func.group_concat(column)  # DISTINCT without separator
        return func.group_concat(column, separator)
    elif is_oracle():
        # Oracle 19c LISTAGG doesn't handle DISTINCT passed via SQLAlchemy well.
        # Strip the distinct modifier and use the base column for WITHIN GROUP.
        base_col = column.element if hasattr(column, 'element') and hasattr(column, 'modifier') else column
        return func.listagg(column, separator).within_group(base_col)
    else:
        # PostgreSQL
        return func.string_agg(func.cast(column, expression.literal_column("TEXT")), separator)


# --- Date arithmetic ---

def now_minus_days(days: int) -> str:
    """Return a SQL expression for 'current date minus N days' as raw SQL string.

    Use with text() for raw SQL queries.
    """
    if is_sqlite():
        return f"date('now', '-{days} days')"
    elif is_oracle():
        return f"SYSDATE - {days}"
    else:
        return f"CURRENT_DATE - INTERVAL '{days} days'"


def datetime_now_minus_days(days: int) -> str:
    """Return a SQL expression for 'current datetime minus N days' as raw SQL string."""
    if is_sqlite():
        return f"datetime('now', '-{days} days')"
    elif is_oracle():
        return f"SYSTIMESTAMP - INTERVAL '{days}' DAY"
    else:
        return f"NOW() - INTERVAL '{days} days'"


def current_year_sql() -> str:
    """Return SQL expression for the current year as a string."""
    if is_sqlite():
        return "strftime('%Y', 'now')"
    elif is_oracle():
        return "TO_CHAR(SYSDATE, 'YYYY')"
    else:
        return "TO_CHAR(NOW(), 'YYYY')"


# --- LIMIT / pagination ---

def limit_sql(n: int) -> str:
    """Return the appropriate LIMIT clause for the current dialect.

    Usage in raw SQL: f"SELECT * FROM table {limit_sql(10)}"
    """
    if is_oracle():
        return f"FETCH FIRST {n} ROWS ONLY"
    else:
        # SQLite and PostgreSQL both support LIMIT
        return f"LIMIT {n}"


# --- Table introspection ---

_SAFE_IDENTIFIER_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')


def _validate_identifier(name: str) -> str:
    """Validate that a SQL identifier contains only safe characters.

    Prevents SQL injection in table/column name interpolation.
    """
    if not _SAFE_IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid SQL identifier: {name!r}")
    return name


def table_exists_sql(table_name: str) -> str:
    """Return SQL to check if a table exists."""
    _validate_identifier(table_name)
    if is_sqlite():
        return f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    elif is_oracle():
        return f"SELECT table_name FROM user_tables WHERE table_name='{table_name.upper()}'"
    else:
        return f"SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='{table_name}'"


def table_columns_sql(table_name: str) -> str:
    """Return SQL to list columns of a table."""
    _validate_identifier(table_name)
    if is_sqlite():
        return f"PRAGMA table_info({table_name})"
    elif is_oracle():
        return f"SELECT column_name FROM all_tab_columns WHERE table_name='{table_name.upper()}'"
    else:
        return f"SELECT column_name FROM information_schema.columns WHERE table_name='{table_name}'"


def all_tables_sql() -> str:
    """Return SQL to list all user tables."""
    if is_sqlite():
        return "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    elif is_oracle():
        return "SELECT table_name FROM user_tables ORDER BY table_name"
    else:
        return "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"


def table_row_count_sql(table_name: str) -> str:
    """Return SQL to count rows in a table. Uses quoted identifier for safety."""
    _validate_identifier(table_name)
    if is_oracle():
        return f'SELECT COUNT(*) FROM "{table_name.upper()}"'
    else:
        return f'SELECT COUNT(*) FROM "{table_name}"'


def index_count_sql() -> str:
    """Return SQL to count indexes."""
    if is_sqlite():
        return "SELECT COUNT(*) FROM sqlite_master WHERE type='index'"
    elif is_oracle():
        return "SELECT COUNT(*) FROM user_indexes"
    else:
        return "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public'"


# --- PRAGMA guards ---

def set_pragmas_if_sqlite(connection):
    """Set WAL mode and busy timeout if the connection is SQLite. No-op otherwise."""
    if is_sqlite():
        connection.execute(text("PRAGMA journal_mode=WAL"))
        connection.execute(text("PRAGMA busy_timeout=60000"))


# --- Engine configuration helpers ---

def get_engine_kwargs() -> dict:
    """Return appropriate engine kwargs based on dialect."""
    if is_sqlite():
        return {"connect_args": {"check_same_thread": False, "timeout": 60}}
    elif is_oracle():
        return {
            "pool_size": 10,
            "max_overflow": 20,
            "pool_pre_ping": True,
        }
    else:
        # PostgreSQL
        return {
            "pool_size": 10,
            "max_overflow": 20,
            "pool_pre_ping": True,
        }


# --- Lobbying-spend sum (income + expenses) ---
#
# Senate LDA filings report dollars in two mutually-exclusive columns:
#   - income:   populated when a firm hires an outside lobbyist (the outside
#               firm registers as the registrant and reports income received).
#   - expenses: populated when a firm self-lobbies in-house (the firm is its
#               own registrant and reports expenses paid).
#
# Our earlier aggregator code used SUM(income) only, which silently omitted
# the entire in-house-lobbying share of sector totals. For firms like Boeing,
# Lockheed Martin, and Northrop Grumman — canonical in-house lobbyists —
# this understated totals by 80-90% and caused multiple published stories
# to be retracted in April 2026. See .planning/batch2_rehab_verdict.json.
#
# Empirical check confirmed no row in our sector lobbying tables has both
# income AND expenses populated at once, so summing them is safe (no
# double-count). COALESCE wraps each column so NULL doesn't zero out the
# whole sum.
#
# Use one of these helpers anywhere you previously wrote
#   func.sum(Model.income)             # SQLAlchemy
#   SUM(income)                        # raw SQL
# to stay dialect-portable and include in-house spend.


def lobby_spend(model):
    """SQLAlchemy expression: per-row dollar value for an LDA filing.

    Senate LDA convention: a filing is either an *outside-firm* filing
    (the firm reports `income` from its client) OR an *in-house* filing
    (the registrant reports its own `expenses`, which already include
    fees paid to outside firms). Earlier code summed both columns —
    which double-counted every dollar a company paid to an outside
    firm, since the firm reported it as income AND the company already
    counted it under expenses.

    This expression returns ``expenses`` when the row is an in-house
    filing, otherwise ``income``. Wrap with func.sum(...) for a
    correctly-deduplicated aggregate.

    NOTE: For per-(entity, year) totals where you want the
    prefer-expenses-when-present convention, use
    ``services.lobby_spend.lobby_spend_total_sql`` — that helper does
    the right thing across mixed in-house + outside-firm filings for
    the same (entity, year). This row-level helper is correct for
    things like CSV exports of individual filings, where each row
    stands on its own.
    """
    # NOTE: use the top-level `case` expression from sqlalchemy, NOT
    # `func.case`. `func.X` constructs a generic SQL function literally
    # named X, which doesn't accept `else_`. `case` is a special
    # expression class — that's the right primitive.
    return case(
        (func.coalesce(model.expenses, 0) > 0, func.coalesce(model.expenses, 0)),
        else_=func.coalesce(model.income, 0),
    )


def lobby_spend_sql(alias: str = "") -> str:
    """Raw-SQL fragment for per-row dollar value of a single filing.

    Senate LDA convention: take ``expenses`` when populated (in-house
    filing — already includes any outside-firm fees), otherwise
    ``income`` (outside-firm filing). Adding both double-counts.

    For per-(entity, year) aggregates that span mixed filing types,
    use ``services.lobby_spend.lobby_spend_total_sql`` — the
    prefer-expenses convention has to be applied per-year, not
    per-row, to be fully correct.
    """
    if alias:
        p = f"{alias}."
    else:
        p = ""
    return (
        f"CASE WHEN COALESCE({p}expenses, 0) > 0 "
        f"THEN COALESCE({p}expenses, 0) "
        f"ELSE COALESCE({p}income, 0) END"
    )


def get_oracle_connection_url() -> str:
    """Build Oracle connection URL from environment variables.

    Requires: ORACLE_USER, ORACLE_PASSWORD, ORACLE_DSN, ORACLE_WALLET_DIR
    Returns: oracle+oracledb://user:pass@dsn?config_dir=...&wallet_location=...
    """
    user = os.getenv("ORACLE_USER", "ADMIN")
    password = os.getenv("ORACLE_PASSWORD", "")
    dsn = os.getenv("ORACLE_DSN", "wtpdb_tp")
    wallet_dir = os.getenv("ORACLE_WALLET_DIR", "")
    wallet_password = os.getenv("ORACLE_WALLET_PASSWORD", "")

    # oracledb thick mode needs TNS_ADMIN; thin mode uses config_dir
    url = f"oracle+oracledb://{user}:{password}@{dsn}"
    params = []
    if wallet_dir:
        params.append(f"config_dir={wallet_dir}")
        params.append(f"wallet_location={wallet_dir}")
    if wallet_password:
        params.append(f"wallet_password={wallet_password}")
    if params:
        url += "?" + "&".join(params)
    return url
