"""
FARA (Foreign Agents Registration Act) data sync job.

Fetches bulk CSV data from efile.fara.gov and upserts into:
- fara_registrants
- fara_foreign_principals
- fara_short_forms

Usage:
    python jobs/sync_fara_data.py
"""

import os
import sys
import hashlib
import logging
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base
from models.fara_models import FARARegistrant, FARAForeignPrincipal, FARAShortForm
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_fara")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")

engine = create_engine(DB_PATH, echo=False)

if is_sqlite():
    @sa_event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.close()

Session = sessionmaker(bind=engine)


def ensure_tables():
    """Create FARA tables if they don't exist."""
    Base.metadata.create_all(engine, tables=[
        FARARegistrant.__table__,
        FARAForeignPrincipal.__table__,
        FARAShortForm.__table__,
    ])
    log.info("FARA tables ensured")


def sync_registrants(session):
    """Fetch and upsert FARA registrants."""
    from connectors.fara import fetch_registrants

    records = fetch_registrants()
    inserted, skipped = 0, 0

    for rec in records:
        existing = session.query(FARARegistrant).filter_by(
            dedupe_hash=rec["dedupe_hash"]
        ).first()

        if existing:
            # Update mutable fields
            existing.status = rec["status"] or existing.status
            existing.termination_date = rec["termination_date"] or existing.termination_date
            skipped += 1
        else:
            session.add(FARARegistrant(
                registration_number=rec["registration_number"],
                registrant_name=rec["registrant_name"],
                address=rec["address"],
                city=rec["city"],
                state=rec["state"],
                country=rec["country"],
                registration_date=rec["registration_date"],
                termination_date=rec["termination_date"],
                status=rec["status"],
                dedupe_hash=rec["dedupe_hash"],
            ))
            inserted += 1

    session.commit()
    log.info("Registrants: %d inserted, %d updated/skipped", inserted, skipped)
    return inserted, skipped


def sync_foreign_principals(session):
    """Fetch and upsert FARA foreign principals."""
    from connectors.fara import fetch_foreign_principals

    records = fetch_foreign_principals()
    inserted, skipped = 0, 0

    for rec in records:
        existing = session.query(FARAForeignPrincipal).filter_by(
            dedupe_hash=rec["dedupe_hash"]
        ).first()

        if existing:
            existing.status = rec["status"] or existing.status
            existing.principal_termination_date = rec["principal_termination_date"] or existing.principal_termination_date
            skipped += 1
        else:
            session.add(FARAForeignPrincipal(
                registration_number=rec["registration_number"],
                registrant_name=rec["registrant_name"],
                foreign_principal_name=rec["foreign_principal_name"],
                country=rec["country"],
                principal_registration_date=rec["principal_registration_date"],
                principal_termination_date=rec["principal_termination_date"],
                status=rec["status"],
                dedupe_hash=rec["dedupe_hash"],
            ))
            inserted += 1

    session.commit()
    log.info("Foreign principals: %d inserted, %d updated/skipped", inserted, skipped)
    return inserted, skipped


def sync_short_forms(session):
    """Fetch and upsert FARA short forms (individual agents)."""
    from connectors.fara import fetch_short_forms

    records = fetch_short_forms()
    inserted, skipped = 0, 0

    for rec in records:
        existing = session.query(FARAShortForm).filter_by(
            dedupe_hash=rec["dedupe_hash"]
        ).first()

        if existing:
            existing.status = rec["status"] or existing.status
            skipped += 1
        else:
            session.add(FARAShortForm(
                registration_number=rec["registration_number"],
                registrant_name=rec["registrant_name"],
                agent_name=rec["agent_name"],
                agent_address=rec["agent_address"],
                agent_city=rec["agent_city"],
                agent_state=rec["agent_state"],
                short_form_date=rec["short_form_date"],
                status=rec["status"],
                dedupe_hash=rec["dedupe_hash"],
            ))
            inserted += 1

    session.commit()
    log.info("Short forms: %d inserted, %d updated/skipped", inserted, skipped)
    return inserted, skipped


def main():
    log.info("=" * 60)
    log.info("FARA data sync starting")
    log.info("=" * 60)

    ensure_tables()
    session = Session()

    try:
        r_ins, r_skip = sync_registrants(session)
        fp_ins, fp_skip = sync_foreign_principals(session)
        sf_ins, sf_skip = sync_short_forms(session)

        log.info("=" * 60)
        log.info("FARA sync complete:")
        log.info("  Registrants:        %d new, %d existing", r_ins, r_skip)
        log.info("  Foreign principals: %d new, %d existing", fp_ins, fp_skip)
        log.info("  Short forms:        %d new, %d existing", sf_ins, sf_skip)
        log.info("=" * 60)

    except Exception:
        session.rollback()
        log.exception("FARA sync failed")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
