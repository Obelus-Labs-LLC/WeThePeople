"""
Shared pytest fixtures for WeThePeople backend tests.

Uses an in-memory SQLite database so tests pass without any real data.
The FastAPI TestClient wraps the app for synchronous HTTP calls.
"""

import os

# Force in-memory SQLite BEFORE any model/app imports touch the engine
os.environ["WTP_DB_URL"] = "sqlite://"
os.environ["DISABLE_STARTUP_FETCH"] = "1"
os.environ["WTP_REQUIRE_AUTH"] = "0"
os.environ.setdefault("WTP_JWT_SECRET", "test-secret-key-do-not-use-in-prod")

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from models.database import Base


@pytest.fixture(scope="session")
def engine():
    """Create an in-memory SQLite engine shared across the test session."""
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False})

    @event.listens_for(eng, "connect")
    def _set_pragmas(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.close()

    Base.metadata.create_all(bind=eng)
    return eng


@pytest.fixture(scope="session")
def db_session(engine):
    """Provide a SQLAlchemy session bound to the in-memory engine."""
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture(scope="session")
def client(engine):
    """FastAPI TestClient using the in-memory database.

    Patches SessionLocal so all route handlers query the test DB.
    """
    from unittest.mock import patch
    from fastapi.testclient import TestClient

    TestSession = sessionmaker(bind=engine)

    def _override_session_local():
        return TestSession()

    with patch("models.database.SessionLocal", _override_session_local):
        from main import app
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c


# ---------------------------------------------------------------------------
# Seed data fixtures — insert test records into the in-memory DB
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def seed_data(db_session):
    """Seed minimal data for all sector tests."""
    from models.finance_models import TrackedInstitution
    from models.tech_models import TrackedTechCompany
    from models.energy_models import TrackedEnergyCompany
    from models.defense_models import TrackedDefenseCompany
    from models.transportation_models import TrackedTransportationCompany
    from models.health_models import TrackedCompany as TrackedHealthCompany
    from models.state_models import StateLegislator
    from models.stories_models import Story
    from models.database import TrackedMember, Claim, ClaimEvaluation, Person

    # --- Finance ---
    inst = TrackedInstitution(
        institution_id="test-bank",
        display_name="Test Bank Corp",
        ticker="TSTB",
        sector_type="bank",
        headquarters="New York, NY",
        is_active=1,
    )
    db_session.add(inst)

    # --- Tech ---
    tech = TrackedTechCompany(
        company_id="test-tech",
        display_name="Test Tech Inc",
        ticker="TTCH",
        sector_type="platform",
        headquarters="San Francisco, CA",
        is_active=1,
    )
    db_session.add(tech)

    # --- Energy ---
    energy = TrackedEnergyCompany(
        company_id="test-energy",
        display_name="Test Energy Corp",
        ticker="TENG",
        sector_type="oil_gas",
        headquarters="Houston, TX",
        is_active=1,
    )
    db_session.add(energy)

    # --- Defense ---
    defense = TrackedDefenseCompany(
        company_id="test-defense",
        display_name="Test Defense Systems",
        ticker="TDEF",
        sector_type="defense_prime",
        headquarters="Arlington, VA",
        is_active=1,
    )
    db_session.add(defense)

    # --- Transportation ---
    transport = TrackedTransportationCompany(
        company_id="test-transport",
        display_name="Test Airlines Inc",
        ticker="TAIR",
        sector_type="aviation",
        headquarters="Atlanta, GA",
        is_active=1,
    )
    db_session.add(transport)

    # --- Health ---
    health = TrackedHealthCompany(
        company_id="test-health",
        display_name="Test Pharma Corp",
        ticker="TPHA",
        sector_type="pharma",
        headquarters="Cambridge, MA",
        is_active=1,
    )
    db_session.add(health)

    # --- Politics: a tracked member ---
    member = TrackedMember(
        person_id="test-senator",
        display_name="Test Senator",
        bioguide_id="T000001",
        state="MI",
        party="D",
        chamber="senate",
        is_active=1,
    )
    db_session.add(member)

    # --- Person ---
    person = Person(
        id="test-senator",
        name="Test Senator",
        role="Senator",
        party="D",
    )
    db_session.add(person)

    # --- State legislator ---
    state_leg = StateLegislator(
        ocd_id="ocd-person/test-mi-001",
        name="Test State Rep",
        state="MI",
        chamber="lower",
        party="D",
        district="42",
        is_active=True,
        dedupe_hash="test-mi-state-rep-hash",
    )
    db_session.add(state_leg)

    # --- Story ---
    story = Story(
        title="Test Story: Lobbying Surge",
        slug="test-lobbying-surge",
        summary="A test data story for unit tests.",
        body="Full body of the test story.",
        category="lobbying_spike",
        sector="finance",
        status="published",
    )
    db_session.add(story)

    # --- Claim + Evaluation ---
    import hashlib
    claim_hash = hashlib.sha256(b"test-senator|test claim text|").hexdigest()
    claim = Claim(
        person_id="test-senator",
        text="Test Senator voted to increase the defense budget by 10 percent",
        category="voting_record",
        intent="voted_for",
        claim_hash=claim_hash,
    )
    db_session.add(claim)
    db_session.flush()  # get claim.id

    evaluation = ClaimEvaluation(
        claim_id=claim.id,
        person_id="test-senator",
        tier="moderate",
        score=0.65,
        relevance="medium",
        progress="passed_committee",
        timing="follow_through",
    )
    db_session.add(evaluation)

    db_session.commit()
