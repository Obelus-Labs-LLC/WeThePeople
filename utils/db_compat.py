"""
Database dialect compatibility layer.

Provides functions that emit the correct SQL for SQLite, PostgreSQL, or Oracle
depending on the configured DATABASE_URL. Import these instead of using raw
func.strftime(), func.group_concat(), LIMIT, date('now'), etc.

Usage:
    from utils.db_compat import extract_year, group_concat, now_minus_days, limit_clause, is_sqlite, is_oracle
"""

import os
from sqlalchemy import func, text, literal_column, event, JSON
from sqlalchemy.sql import expression
from sqlalchemy.types import TypeDecorator, Text as SAText

DATABASE_URL = os.getenv("WTP_DB_URL") or "sqlite:///./wethepeople.db"


# --- Oracle JSON compatibility ---
# Oracle 19c doesn't have native JSON type in SQLAlchemy.
# This hook remaps JSON columns to CLOB at DDL time for Oracle.

def patch_json_for_oracle(metadata):
    """Call before create_all() when targeting Oracle 19c.

    Replaces JSON column types with Text (CLOB) since Oracle 19c
    doesn't support the JSON DDL type through SQLAlchemy's Oracle dialect.
    The data is still stored as JSON strings — just in CLOB columns.
    """
    if not is_oracle():
        return
    from sqlalchemy import Text
    for table in metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, JSON):
                column.type = Text()


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
        return func.group_concat(column, separator)
    elif is_oracle():
        # Oracle 19c+ supports LISTAGG with DISTINCT
        # LISTAGG(col, sep) WITHIN GROUP (ORDER BY col)
        return func.listagg(column, separator).within_group(column)
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

def table_exists_sql(table_name: str) -> str:
    """Return SQL to check if a table exists."""
    if is_sqlite():
        return f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    elif is_oracle():
        return f"SELECT table_name FROM user_tables WHERE table_name='{table_name.upper()}'"
    else:
        return f"SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='{table_name}'"


def table_columns_sql(table_name: str) -> str:
    """Return SQL to list columns of a table."""
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
