"""Alembic environment configuration.

Imports all SQLAlchemy models so autogenerate can detect schema changes.
Reads the database URL from the WTP_DB_URL environment variable,
falling back to the value in alembic.ini.
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# ── Ensure project root is on sys.path ────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# ── Import models (registers all tables on Base.metadata) ─────────────
# models/database.py already imports every sector model file at the bottom,
# so importing Base is sufficient to pull in every table.
from models.database import Base  # noqa: E402

# ── Alembic Config object ────────────────────────────────────────────
config = context.config

# Override sqlalchemy.url with WTP_DB_URL env var if set
db_url = os.getenv("WTP_DB_URL")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Target metadata for autogenerate ──────────────────────────────────
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Configures the context with just a URL so we don't need a live DB
    connection. Emits SQL to stdout instead.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode with a live DB connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=True,  # Required for SQLite ALTER TABLE support
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
