import os

from sqlalchemy import create_engine, event, Column, String, Integer, DateTime, ForeignKey, Text, Table, JSON, Date, Float, UniqueConstraint
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.sql import func

DATABASE_URL = os.getenv("WTP_DB_URL") or "sqlite:///./wethepeople.db"

print(f"Database: {DATABASE_URL}")

# SQLite needs check_same_thread=False; PostgreSQL doesn't accept that arg
_engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 60}
else:
    # PostgreSQL: use connection pooling
    _engine_kwargs["pool_size"] = 10
    _engine_kwargs["max_overflow"] = 20
    _engine_kwargs["pool_pre_ping"] = True

engine = create_engine(DATABASE_URL, **_engine_kwargs)

# Ensure WAL mode and busy timeout on every SQLite connection
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Many-to-many association table for action tags
action_tags = Table(
    'action_tags', Base.metadata,
    Column('action_id', Integer, ForeignKey('actions.id')),
    Column('tag', String)
)

class Person(Base):
    __tablename__ = "people"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    role = Column(String)
    party = Column(String)
    photo_url = Column(String)
    
    # Timestamps for audit trail
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class SourceDocument(Base):
    """Citation-first design: normalize source documents for traceability"""
    __tablename__ = "source_documents"
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, unique=True, nullable=False)
    publisher = Column(String)
    retrieved_at = Column(DateTime(timezone=True))
    content_hash = Column(String)  # For detecting changes to source
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Action(Base):
    __tablename__ = "actions"
    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(String, nullable=True, index=True)
    source_id = Column(Integer, ForeignKey("source_documents.id"))  # Normalized source reference
    title = Column(String)
    summary = Column(Text)
    date = Column(DateTime)
    metadata_json = Column(JSON, nullable=True)  # Structured metadata from API responses
    
    # Bill identifiers for efficient querying
    bill_congress = Column(Integer, nullable=True)
    bill_type = Column(String, nullable=True)
    bill_number = Column(String, nullable=True)
    
    # Enriched data fields (extracted from metadata_json for faster querying)
    policy_area = Column(String, nullable=True)
    latest_action_text = Column(Text, nullable=True)
    latest_action_date = Column(String, nullable=True)
    
    # Timestamps for versioning and debugging
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    source = relationship("SourceDocument", backref="actions")

class GoldLedgerEntry(Base):
    """Gold Layer: canonical, query-friendly ledger rows.

    This table materializes the current "best" evaluation for each claim into a
    stable schema designed for API consumption and analytics.

    Invariant: at most one row per Claim (unique claim_id).
    """

    __tablename__ = "gold_ledger"

    __table_args__ = (
        UniqueConstraint("claim_id", name="uq_gold_ledger_claim_id"),
    )

    id = Column(Integer, primary_key=True, index=True)

    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False, index=True)
    evaluation_id = Column(Integer, ForeignKey("claim_evaluations.id"), nullable=False, index=True)

    # Canonical identity fields
    person_id = Column(String, nullable=False, index=True)
    claim_date = Column(Date, nullable=True, index=True)
    source_url = Column(Text, nullable=True)
    normalized_text = Column(Text, nullable=False)

    # Canonical intent/policy
    intent_type = Column(String, nullable=True)
    policy_area = Column(String, nullable=True)

    # Canonical match outputs (mirrors ClaimEvaluation, but materialized)
    matched_bill_id = Column(String, nullable=True, index=True)
    best_action_id = Column(Integer, ForeignKey("actions.id"), nullable=True, index=True)
    score = Column(Float, nullable=True)
    tier = Column(String, nullable=False, index=True)
    relevance = Column(String, nullable=True, index=True)
    progress = Column(String, nullable=True, index=True)
    timing = Column(String, nullable=True, index=True)
    evidence_json = Column(Text, nullable=True)
    why_json = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Claim(Base):
    __tablename__ = "claims"
    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(String, index=True, nullable=False)
    text = Column(Text, nullable=False)
    category = Column(String, index=True, nullable=False, server_default="general")
    intent = Column(String, index=True, nullable=True)  # sponsored, voted_for, etc.
    claim_date = Column(Date, nullable=True)
    claim_source_url = Column(String, nullable=True)
    
    # Bill references extracted from source article text
    # JSON array of bill IDs: ["H.R. 1234", "S. 5678"]
    bill_refs_json = Column(Text, nullable=True)
    
    # Deduplication: stable hash of (person_id + normalized_text + source_url)
    # Normalized = lowercase, collapse whitespace, strip punctuation
    claim_hash = Column(String, unique=True, nullable=False, index=True)
    
    # Dirty flag system: track when evaluations need recomputation
    # Set to True when matched bill lifecycle data changes
    # Cleared when recompute job runs
    needs_recompute = Column(Integer, nullable=False, server_default="0", index=True)  # SQLite: 0=False, 1=True
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class ClaimEvaluation(Base):
    __tablename__ = "claim_evaluations"

    id = Column(Integer, primary_key=True, index=True)

    claim_id = Column(Integer, ForeignKey("claims.id"), index=True, nullable=False)
    person_id = Column(String, index=True, nullable=False)

    # best matched action (nullable if none)
    best_action_id = Column(Integer, ForeignKey("actions.id"), index=True, nullable=True)

    score = Column(Float, nullable=True)

    # Evidence framework outputs
    tier = Column(String, index=True, nullable=False)          # strong/moderate/weak/none
    relevance = Column(String, index=True, nullable=True)      # high/medium/low/none
    progress = Column(String, index=True, nullable=True)       # enacted/passed_committee/unknown/etc
    timing = Column(String, index=True, nullable=True)         # follow_through/retroactive_credit

    # Explainability fields for web app justification
    matched_bill_id = Column(String, index=True, nullable=True)  # "hr3562-119" (for quick queries)
    evidence_json = Column(Text, nullable=True)                  # JSON array: ["url_title_match:defiance act", "policy_area:crime", ...]
    
    # Legacy explainability snapshot (optional but useful)
    why_json = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class Vote(Base):
    """
    Roll call votes from Congress.gov (House and Senate).
    Primary source for vote evidence.
    """
    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, index=True)
    
    # Congress.gov identifiers
    congress = Column(Integer, index=True, nullable=False)       # 118, 119, etc.
    chamber = Column(String, index=True, nullable=False)          # "house" or "senate"
    roll_number = Column(Integer, index=True, nullable=False)     # roll call number
    session = Column(Integer, nullable=True)                      # 1, 2, etc.
    
    # Vote metadata
    question = Column(Text, nullable=True)                        # "On Passage", "On Agreeing to Amendment", etc.
    vote_date = Column(Date, index=True, nullable=True)
    
    # Related legislation (if any)
    related_bill_congress = Column(Integer, nullable=True, index=True)
    related_bill_type = Column(String, nullable=True)             # HR, S, HJRES, etc.
    related_bill_number = Column(Integer, nullable=True)
    
    # Outcome
    result = Column(String, nullable=True)                        # "Passed", "Failed", "Agreed to", etc.
    yea_count = Column(Integer, nullable=True)
    nay_count = Column(Integer, nullable=True)
    present_count = Column(Integer, nullable=True)
    not_voting_count = Column(Integer, nullable=True)
    
    # Source citation
    source_url = Column(String, nullable=True)                    # Link to official vote page
    metadata_json = Column(JSON, nullable=True)                   # Full API response for debugging
    
    # AI-generated summary of this vote
    ai_summary = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class MemberVote(Base):
    """
    Individual member positions on roll call votes.
    The critical evidence for vote claims.
    """
    __tablename__ = "member_votes"

    # NOTE: SQLite treats NULLs as distinct in unique constraints. PostgreSQL does not.
    # If bioguide_id is NULL, SQLite allows duplicate (vote_id, NULL) rows.
    __table_args__ = (
        UniqueConstraint("vote_id", "bioguide_id", name="uq_member_votes_vote_bioguide"),
    )

    id = Column(Integer, primary_key=True, index=True)
    
    vote_id = Column(Integer, ForeignKey("votes.id"), index=True, nullable=False)
    person_id = Column(String, index=True, nullable=True)         # "aoc", "schumer", etc. — nullable for members not yet in our system
    
    # Vote position
    position = Column(String, index=True, nullable=False)         # "Yea", "Nay", "Present", "Not Voting"
    
    # Member identifiers from Congress.gov (for matching)
    bioguide_id = Column(String, index=True, nullable=True)       # Official bioguide ID
    member_name = Column(String, nullable=True)                   # As recorded in vote
    party = Column(String, nullable=True)                         # R, D, I
    state = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    vote = relationship("Vote", backref="member_votes")


class Bill(Base):
    """
    Bill-level summary table (one row per bill).
    Tracks lifecycle status and metadata separate from politician actions.
    """
    __tablename__ = "bills"

    # Composite primary key from Congress.gov
    bill_id = Column(String, primary_key=True)                    # "hr2670-118", "s1234-119"
    congress = Column(Integer, index=True, nullable=False)
    bill_type = Column(String, index=True, nullable=False)        # "hr", "s", "hjres", etc.
    bill_number = Column(Integer, nullable=False)
    
    # Bill metadata
    title = Column(String, nullable=True)
    policy_area = Column(String, index=True, nullable=True)
    
    # Status tracking (computed from BillAction timeline)
    status_bucket = Column(String, index=True, nullable=True)     # "introduced", "in_committee", "passed_house", etc.
    status_reason = Column(String, nullable=True)                 # Triggering action_text snippet (for transparency)
    latest_action_text = Column(String, nullable=True)
    latest_action_date = Column(DateTime, nullable=True)
    
    # Enrichment flag: mark bills that need full detail fetch
    needs_enrichment = Column(Integer, nullable=False, server_default="1", index=True)  # SQLite: 0=enriched, 1=needs_enrichment

    # Enrichment data (populated by enrich_bills job)
    summary_text = Column(Text, nullable=True)                    # CRS summary from Congress API
    summary_date = Column(String, nullable=True)                  # Date of the summary version
    full_text_url = Column(String, nullable=True)                 # URL to latest text version on congress.gov
    introduced_date = Column(DateTime, nullable=True)             # Date bill was introduced
    subjects_json = Column(JSON, nullable=True)                   # JSON array of subject strings from Congress API

    # Raw data
    metadata_json = Column(JSON, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class BillAction(Base):
    """
    Bill timeline table (many rows per bill).
    Stores complete action history from Congress.gov.
    Used to compute bill status and track legislative milestones.
    """
    __tablename__ = "bill_actions"

    id = Column(Integer, primary_key=True, index=True)
    
    # Bill reference
    bill_id = Column(String, ForeignKey("bills.bill_id"), index=True, nullable=False)
    
    # Action details
    action_date = Column(DateTime, index=True, nullable=False)
    action_text = Column(String, nullable=False)                  # Full text from Congress.gov
    action_code = Column(String, index=True, nullable=True)       # "Intro-H", "H11100", "Passed/agreed to in House"
    
    # Context
    chamber = Column(String, index=True, nullable=True)           # "House", "Senate", null (for signing)
    committee = Column(String, nullable=True)                     # Committee name if applicable
    
    # Raw data + deduplication
    raw_json = Column(JSON, nullable=True)
    dedupe_hash = Column(String, unique=True, nullable=True)      # Hash of (bill_id, action_date, action_text)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    
    # Relationships
    bill = relationship("Bill", backref="actions")


class TrackedMember(Base):
    """
    Tracked members table - curated list of officials to monitor.
    Replaces hardcoded MEMBERS dict for maintainable expansion.
    """
    __tablename__ = "tracked_members"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(String, unique=True, nullable=False, index=True)  # 'aoc', 'sanders'
    bioguide_id = Column(String, unique=True, nullable=False, index=True)  # 'O000172'
    display_name = Column(String, nullable=False)  # 'Alexandria Ocasio-Cortez'
    chamber = Column(String, nullable=False, index=True)  # 'house' or 'senate'
    state = Column(String, nullable=True)  # 'NY', 'VT', etc.
    party = Column(String, nullable=True)  # 'D', 'R', 'I'
    is_active = Column(Integer, nullable=False, server_default="1", index=True)  # SQLite: 0=inactive, 1=active
    photo_url = Column(String, nullable=True)  # Wikipedia thumbnail URL

    # Claim ingestion sources (JSON list of source objects)
    # Example: [{"url":"https://...","type":"press"},{"url":"https://...","type":"statement"}]
    claim_sources_json = Column(Text, nullable=True)

    # AI-generated profile summary
    ai_profile_summary = Column(Text, nullable=True)

    # OpenSanctions status
    sanctions_status = Column(String, nullable=True)  # sanctioned, pep, listed, clear, or NULL
    sanctions_data = Column(Text, nullable=True)  # JSON blob with match details
    sanctions_checked_at = Column(DateTime(timezone=True), nullable=True)

    # Policy 1 scheduling state
    # needs_ingest=1 indicates the member should receive a full refresh ASAP.
    needs_ingest = Column(Integer, nullable=False, server_default="1", index=True)
    # Updated only when a full refresh completes successfully.
    last_full_refresh_at = Column(DateTime(timezone=True), nullable=True, index=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class PersonBill(Base):
    """
    Link table for person-to-bill relationships (sponsored/cosponsored).
    Separates sponsorship metadata from Action evidence table.
    """
    __tablename__ = "person_bills"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(String, index=True, nullable=False)       # 'aoc', 'sanders', etc.
    bill_id = Column(String, ForeignKey("bills.bill_id"), index=True, nullable=False)  # 'hr2670-118'
    relationship_type = Column(String, index=True, nullable=False)  # 'Sponsored' or 'Cosponsored'
    
    # Source citation
    source_url = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    bill = relationship("Bill", backref="person_links")


class MemberBillGroundTruth(Base):
    """
    Ground truth: Member bill relationships from authoritative Congress.gov API.
    Uses bioguide_id as canonical identity (not person_id).
    
    This table serves as the "rail" to constrain matching - we only match claims
    to bills that the member actually sponsored/cosponsored.
    """
    __tablename__ = "member_bills_groundtruth"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Member identity (Congress.gov canonical)
    bioguide_id = Column(String, index=True, nullable=False)    # "O000172" for AOC
    
    # Bill identity
    bill_id = Column(String, index=True, nullable=False)        # "hr3562-119"
    
    # Relationship type
    role = Column(String, index=True, nullable=False)           # "sponsor" or "cosponsor"
    
    # Provenance
    source = Column(String, nullable=False)                     # "congress.gov.api.v3"
    fetched_at = Column(DateTime, server_default=func.now(), nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class PipelineRun(Base):
    """Run manifest table for the daily orchestrator.

    Stores one row per pipeline execution, including args, summary counts, status, and errors.
    """

    __tablename__ = "pipeline_runs"

    run_id = Column(String, primary_key=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    git_sha = Column(String, nullable=True)
    args_json = Column(Text, nullable=True)
    counts_json = Column(Text, nullable=True)

    status = Column(String, nullable=False, index=True)  # running|success|failed
    error = Column(Text, nullable=True)


class CompanyDonation(Base):
    """
    Cross-sector: PAC/corporate donations from any tracked entity to politicians.
    Links companies in any sector → politicians in the politics sector via FEC data.
    """
    __tablename__ = "company_donations"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_company_donations_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Source entity (polymorphic across sectors)
    entity_type = Column(String, nullable=False, index=True)  # 'finance', 'health', 'tech', 'energy'
    entity_id = Column(String, nullable=False, index=True)  # 'jpmorgan', 'pfizer', etc.

    # Recipient politician (nullable FK — some donations go to candidates we don't track)
    person_id = Column(String, nullable=True, index=True)  # FK to tracked_members.person_id if matched

    # FEC data
    committee_name = Column(String, nullable=True)  # PAC name
    committee_id = Column(String, nullable=True, index=True)  # FEC committee ID
    candidate_name = Column(String, nullable=True)
    candidate_id = Column(String, nullable=True, index=True)  # FEC candidate ID
    amount = Column(Float, nullable=True, index=True)
    cycle = Column(String, nullable=True, index=True)  # '2024', '2026'
    donation_date = Column(Date, nullable=True, index=True)
    source_url = Column(String, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CongressionalTrade(Base):
    """
    Congressional stock trades from STOCK Act financial disclosure reports.
    Powers the "Congress trades" feature alongside corporate insider trading.
    """
    __tablename__ = "congressional_trades"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_congressional_trades_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)

    person_id = Column(String, nullable=False, index=True)  # FK to tracked_members.person_id

    ticker = Column(String, nullable=True, index=True)  # 'AAPL', 'PFE', etc.
    asset_name = Column(String, nullable=True)  # Full asset description
    transaction_type = Column(String, nullable=False, index=True)  # 'purchase', 'sale', 'exchange'
    amount_range = Column(String, nullable=True)  # '$1,001 - $15,000', '$50,001 - $100,000'
    disclosure_date = Column(Date, nullable=True, index=True)
    transaction_date = Column(Date, nullable=True, index=True)
    owner = Column(String, nullable=True)  # 'Self', 'Spouse', 'Child', 'Joint'
    source_url = Column(String, nullable=True)
    reporting_gap = Column(String, nullable=True)  # '13 Days', '38 Days' — time between trade and disclosure

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Anomaly(Base):
    """
    Anomalies detected by the nightly anomaly detection job.
    Each row represents a suspicious pattern found in the data.
    """
    __tablename__ = "anomalies"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_anomalies_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    pattern_type = Column(String(50), nullable=False, index=True)  # trade_near_vote, lobbying_spike, enforcement_gap, revolving_door
    entity_type = Column(String(50), nullable=False, index=True)   # person, company
    entity_id = Column(String(100), nullable=False, index=True)
    entity_name = Column(String(200), nullable=True)
    score = Column(Float, nullable=False, index=True)              # 1-10 suspicion score
    title = Column(String(500), nullable=False)                    # Human-readable headline
    description = Column(Text, nullable=True)                      # Detailed explanation
    evidence = Column(Text, nullable=True)                         # JSON: related records
    detected_at = Column(DateTime, server_default=func.now(), nullable=False)
    dedupe_hash = Column(String(64), nullable=False, index=True)


import models.finance_models  # noqa: F401 — register finance tables for Alembic
import models.health_models  # noqa: F401 — register health tables for Alembic
import models.market_models  # noqa: F401 — register market/stock tables for Alembic
import models.tech_models  # noqa: F401 — register tech tables for Alembic
import models.energy_models  # noqa: F401 — register energy tables for Alembic
import models.transportation_models  # noqa: F401 — register transportation tables for Alembic
import models.defense_models  # noqa: F401 — register defense tables for Alembic
import models.state_models  # noqa: F401 — register state legislature tables
import models.committee_models  # noqa: F401 — register committee tables
import models.digest_models  # noqa: F401 — register digest subscriber table


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
