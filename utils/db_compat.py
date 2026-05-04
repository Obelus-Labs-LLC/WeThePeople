"""
Database dialect compatibility layer.

Provides functions that emit the correct SQL for SQLite or PostgreSQL
depending on the configured DATABASE_URL. Import these instead of using raw
func.strftime(), func.group_concat(), LIMIT, date('now'), etc.

Usage:
    from utils.db_compat import extract_year, group_concat, now_minus_days, limit_clause, is_sqlite

Note: prior versions of this module supported Oracle 19c. Oracle has been
removed from the supported backends. SQLite remains the production target;
PostgreSQL branches are kept for local-dev parity. Any URL starting with
"oracle" raises at import time with an explanatory error.
"""

import os
import re
from sqlalchemy import func, text, literal_column, event, JSON, case
from sqlalchemy.sql import expression
from sqlalchemy.types import TypeDecorator, Text as SAText

DATABASE_URL = os.getenv("WTP_DB_URL") or "sqlite:///./wethepeople.db"

if DATABASE_URL.lower().startswith("oracle") or "oracle" in DATABASE_URL.lower().split("://", 1)[0]:
    raise RuntimeError(
        "Oracle is no longer a supported backend. "
        "Use sqlite:/// or postgresql:// in WTP_DB_URL."
    )


def is_sqlite() -> bool:
    return DATABASE_URL.startswith("sqlite")


def is_postgres() -> bool:
    return DATABASE_URL.startswith("postgresql")


# --- Year extraction ---

def extract_year(column):
    """Extract year from a date/datetime column. Works on SQLite and PostgreSQL."""
    if is_sqlite():
        return func.strftime('%Y', column)
    return func.extract('year', column)


def extract_year_week(column):
    """Extract year-week string (e.g., '2026-12') from a date column."""
    if is_sqlite():
        return func.strftime('%Y-%W', column)
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
            return func.group_concat(column)
        return func.group_concat(column, separator)
    # PostgreSQL
    return func.string_agg(func.cast(column, expression.literal_column("TEXT")), separator)


# --- Date arithmetic ---

def now_minus_days(days: int) -> str:
    """Return a SQL expression for 'current date minus N days' as raw SQL string."""
    if is_sqlite():
        return f"date('now', '-{days} days')"
    return f"CURRENT_DATE - INTERVAL '{days} days'"


def datetime_now_minus_days(days: int) -> str:
    """Return a SQL expression for 'current datetime minus N days' as raw SQL string."""
    if is_sqlite():
        return f"datetime('now', '-{days} days')"
    return f"NOW() - INTERVAL '{days} days'"


def current_year_sql() -> str:
    """Return SQL expression for the current year as a string."""
    if is_sqlite():
        return "strftime('%Y', 'now')"
    return "TO_CHAR(NOW(), 'YYYY')"


# --- LIMIT / pagination ---

def limit_sql(n: int) -> str:
    """Return the appropriate LIMIT clause for the current dialect."""
    return f"LIMIT {n}"


# --- Table introspection ---

_SAFE_IDENTIFIER_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')


def _validate_identifier(name: str) -> str:
    """Validate that a SQL identifier contains only safe characters."""
    if not _SAFE_IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid SQL identifier: {name!r}")
    return name


def table_exists_sql(table_name: str) -> str:
    """Return SQL to check if a table exists."""
    _validate_identifier(table_name)
    if is_sqlite():
        return f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    return f"SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='{table_name}'"


def table_columns_sql(table_name: str) -> str:
    """Return SQL to list columns of a table."""
    _validate_identifier(table_name)
    if is_sqlite():
        return f"PRAGMA table_info({table_name})"
    return f"SELECT column_name FROM information_schema.columns WHERE table_name='{table_name}'"


def all_tables_sql() -> str:
    """Return SQL to list all user tables."""
    if is_sqlite():
        return "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    return "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"


def table_row_count_sql(table_name: str) -> str:
    """Return SQL to count rows in a table. Uses quoted identifier for safety."""
    _validate_identifier(table_name)
    return f'SELECT COUNT(*) FROM "{table_name}"'


def index_count_sql() -> str:
    """Return SQL to count indexes."""
    if is_sqlite():
        return "SELECT COUNT(*) FROM sqlite_master WHERE type='index'"
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
# the entire in-house-lobbying share of sector totals. For firms that are
# canonical in-house lobbyists this understated totals by 80-90% and caused
# multiple published stories to be retracted in April 2026.
#
# Empirical check confirmed no row in our sector lobbying tables has both
# income AND expenses populated at once, so summing them is safe (no
# double-count). COALESCE wraps each column so NULL doesn't zero out the
# whole sum.


def lobby_spend(model):
    """SQLAlchemy expression: per-row dollar value for an LDA filing.

    Senate LDA convention: a filing is either an outside-firm filing
    (the firm reports income from its client) OR an in-house filing
    (the registrant reports its own expenses, which already include
    fees paid to outside firms). Earlier code summed both columns,
    which double-counted every dollar a company paid to an outside
    firm.

    This expression returns ``expenses`` when the row is an in-house
    filing, otherwise ``income``. Wrap with func.sum(...) for a
    correctly-deduplicated aggregate.
    """
    return case(
        (func.coalesce(model.expenses, 0) > 0, func.coalesce(model.expenses, 0)),
        else_=func.coalesce(model.income, 0),
    )


def lobby_spend_sql(alias: str = "") -> str:
    """Raw-SQL fragment for per-row dollar value of a single filing."""
    if alias:
        p = f"{alias}."
    else:
        p = ""
    return (
        f"CASE WHEN COALESCE({p}expenses, 0) > 0 "
        f"THEN COALESCE({p}expenses, 0) "
        f"ELSE COALESCE({p}income, 0) END"
    )
