"""Tests for SQLAlchemy model creation and constraints."""

import hashlib
import pytest
from sqlalchemy.exc import IntegrityError


def test_tracked_institution_creation(db_session):
    """TrackedInstitution can be created with required fields."""
    from models.finance_models import TrackedInstitution
    inst = db_session.query(TrackedInstitution).filter_by(institution_id="test-bank").first()
    assert inst is not None
    assert inst.display_name == "Test Bank Corp"
    assert inst.is_active == 1


def test_tracked_tech_company_creation(db_session):
    """TrackedTechCompany can be queried from seeded data."""
    from models.tech_models import TrackedTechCompany
    company = db_session.query(TrackedTechCompany).filter_by(company_id="test-tech").first()
    assert company is not None
    assert company.ticker == "TTCH"


def test_claim_creation(db_session):
    """Claim is created with hash and linked to person."""
    from models.database import Claim
    claim = db_session.query(Claim).filter_by(person_id="test-senator").first()
    assert claim is not None
    assert claim.claim_hash is not None
    assert len(claim.claim_hash) == 64  # SHA-256 hex digest


def test_claim_evaluation_relationship(db_session):
    """ClaimEvaluation is linked to its Claim."""
    from models.database import Claim, ClaimEvaluation
    claim = db_session.query(Claim).filter_by(person_id="test-senator").first()
    evaluation = db_session.query(ClaimEvaluation).filter_by(claim_id=claim.id).first()
    assert evaluation is not None
    assert evaluation.tier == "moderate"
    assert evaluation.score == 0.65


def test_claim_hash_uniqueness(db_session):
    """Duplicate claim_hash raises IntegrityError."""
    from models.database import Claim
    existing = db_session.query(Claim).first()
    duplicate = Claim(
        person_id="other-person",
        text="Some other text",
        category="general",
        claim_hash=existing.claim_hash,  # duplicate hash
    )
    db_session.add(duplicate)
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_tracked_member_creation(db_session):
    """TrackedMember can be queried."""
    from models.database import TrackedMember
    member = db_session.query(TrackedMember).filter_by(person_id="test-senator").first()
    assert member is not None
    assert member.state == "MI"
    assert member.chamber == "senate"


def test_story_slug_unique(db_session):
    """Duplicate story slug raises IntegrityError."""
    from models.stories_models import Story
    dup = Story(
        title="Duplicate Story",
        slug="test-lobbying-surge",  # already exists
        category="lobbying_spike",
        status="draft",
    )
    db_session.add(dup)
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_person_model_creation(db_session):
    """Person model queried from seeded data."""
    from models.database import Person
    person = db_session.query(Person).filter_by(id="test-senator").first()
    assert person is not None
    assert person.party == "D"


def test_state_legislator_creation(db_session):
    """StateLegislator queried from seeded data."""
    from models.state_models import StateLegislator
    leg = db_session.query(StateLegislator).filter_by(state="MI").first()
    assert leg is not None
    assert leg.name == "Test State Rep"
    assert leg.chamber == "lower"
