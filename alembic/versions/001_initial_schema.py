"""Initial schema snapshot — all tables as of 2026-03-24.

Revision ID: 001_initial
Revises: (none)
Create Date: 2026-03-24

This migration captures the complete current schema.
Run `alembic stamp head` on an existing database to mark it as up-to-date
without re-creating tables.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── action_tags (association table) ────────────────────────────────
    op.create_table(
        "action_tags",
        sa.Column("action_id", sa.Integer(), sa.ForeignKey("actions.id")),
        sa.Column("tag", sa.String()),
    )

    # ── people ─────────────────────────────────────────────────────────
    op.create_table(
        "people",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), index=True),
        sa.Column("role", sa.String()),
        sa.Column("party", sa.String()),
        sa.Column("photo_url", sa.String()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_people_id", "people", ["id"])

    # ── source_documents ───────────────────────────────────────────────
    op.create_table(
        "source_documents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("url", sa.String(), unique=True, nullable=False),
        sa.Column("publisher", sa.String()),
        sa.Column("retrieved_at", sa.DateTime(timezone=True)),
        sa.Column("content_hash", sa.String()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_source_documents_id", "source_documents", ["id"])

    # ── actions ────────────────────────────────────────────────────────
    op.create_table(
        "actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("person_id", sa.String(), index=True),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("source_documents.id")),
        sa.Column("title", sa.String()),
        sa.Column("summary", sa.Text()),
        sa.Column("date", sa.DateTime()),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("bill_congress", sa.Integer()),
        sa.Column("bill_type", sa.String()),
        sa.Column("bill_number", sa.String()),
        sa.Column("policy_area", sa.String()),
        sa.Column("latest_action_text", sa.Text()),
        sa.Column("latest_action_date", sa.String()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_actions_id", "actions", ["id"])

    # ── bills ──────────────────────────────────────────────────────────
    op.create_table(
        "bills",
        sa.Column("bill_id", sa.String(), primary_key=True),
        sa.Column("congress", sa.Integer(), nullable=False, index=True),
        sa.Column("bill_type", sa.String(), nullable=False, index=True),
        sa.Column("bill_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String()),
        sa.Column("policy_area", sa.String(), index=True),
        sa.Column("status_bucket", sa.String(), index=True),
        sa.Column("status_reason", sa.String()),
        sa.Column("latest_action_text", sa.String()),
        sa.Column("latest_action_date", sa.DateTime()),
        sa.Column("needs_enrichment", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("summary_text", sa.Text()),
        sa.Column("summary_date", sa.String()),
        sa.Column("full_text_url", sa.String()),
        sa.Column("introduced_date", sa.DateTime()),
        sa.Column("subjects_json", sa.JSON()),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    # ── bill_actions ───────────────────────────────────────────────────
    op.create_table(
        "bill_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bill_id", sa.String(), sa.ForeignKey("bills.bill_id"), nullable=False, index=True),
        sa.Column("action_date", sa.DateTime(), nullable=False, index=True),
        sa.Column("action_text", sa.String(), nullable=False),
        sa.Column("action_code", sa.String(), index=True),
        sa.Column("chamber", sa.String(), index=True),
        sa.Column("committee", sa.String()),
        sa.Column("raw_json", sa.JSON()),
        sa.Column("dedupe_hash", sa.String(), unique=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_bill_actions_id", "bill_actions", ["id"])

    # ── votes ──────────────────────────────────────────────────────────
    op.create_table(
        "votes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("congress", sa.Integer(), nullable=False, index=True),
        sa.Column("chamber", sa.String(), nullable=False, index=True),
        sa.Column("roll_number", sa.Integer(), nullable=False, index=True),
        sa.Column("session", sa.Integer()),
        sa.Column("question", sa.Text()),
        sa.Column("vote_date", sa.Date(), index=True),
        sa.Column("related_bill_congress", sa.Integer(), index=True),
        sa.Column("related_bill_type", sa.String()),
        sa.Column("related_bill_number", sa.Integer()),
        sa.Column("result", sa.String()),
        sa.Column("yea_count", sa.Integer()),
        sa.Column("nay_count", sa.Integer()),
        sa.Column("present_count", sa.Integer()),
        sa.Column("not_voting_count", sa.Integer()),
        sa.Column("source_url", sa.String()),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_votes_id", "votes", ["id"])

    # ── member_votes ───────────────────────────────────────────────────
    op.create_table(
        "member_votes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vote_id", sa.Integer(), sa.ForeignKey("votes.id"), nullable=False, index=True),
        sa.Column("person_id", sa.String(), index=True),
        sa.Column("position", sa.String(), nullable=False, index=True),
        sa.Column("bioguide_id", sa.String(), index=True),
        sa.Column("member_name", sa.String()),
        sa.Column("party", sa.String()),
        sa.Column("state", sa.String()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("vote_id", "bioguide_id", name="uq_member_votes_vote_bioguide"),
    )
    op.create_index("ix_member_votes_id", "member_votes", ["id"])

    # ── tracked_members ────────────────────────────────────────────────
    op.create_table(
        "tracked_members",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("person_id", sa.String(), unique=True, nullable=False, index=True),
        sa.Column("bioguide_id", sa.String(), unique=True, nullable=False, index=True),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("chamber", sa.String(), nullable=False, index=True),
        sa.Column("state", sa.String()),
        sa.Column("party", sa.String()),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("photo_url", sa.String()),
        sa.Column("claim_sources_json", sa.Text()),
        sa.Column("ai_profile_summary", sa.Text()),
        sa.Column("sanctions_status", sa.String()),
        sa.Column("sanctions_data", sa.Text()),
        sa.Column("sanctions_checked_at", sa.DateTime(timezone=True)),
        sa.Column("needs_ingest", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("last_full_refresh_at", sa.DateTime(timezone=True), index=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tracked_members_id", "tracked_members", ["id"])

    # ── person_bills ───────────────────────────────────────────────────
    op.create_table(
        "person_bills",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("person_id", sa.String(), nullable=False, index=True),
        sa.Column("bill_id", sa.String(), sa.ForeignKey("bills.bill_id"), nullable=False, index=True),
        sa.Column("relationship_type", sa.String(), nullable=False, index=True),
        sa.Column("source_url", sa.String()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_person_bills_id", "person_bills", ["id"])

    # ── member_bills_groundtruth ───────────────────────────────────────
    op.create_table(
        "member_bills_groundtruth",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bioguide_id", sa.String(), nullable=False, index=True),
        sa.Column("bill_id", sa.String(), nullable=False, index=True),
        sa.Column("role", sa.String(), nullable=False, index=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_member_bills_groundtruth_id", "member_bills_groundtruth", ["id"])

    # ── claims ─────────────────────────────────────────────────────────
    op.create_table(
        "claims",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("person_id", sa.String(), nullable=False, index=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("category", sa.String(), nullable=False, server_default="general", index=True),
        sa.Column("intent", sa.String(), index=True),
        sa.Column("claim_date", sa.Date()),
        sa.Column("claim_source_url", sa.String()),
        sa.Column("bill_refs_json", sa.Text()),
        sa.Column("claim_hash", sa.String(), unique=True, nullable=False, index=True),
        sa.Column("needs_recompute", sa.Integer(), nullable=False, server_default="0", index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_claims_id", "claims", ["id"])

    # ── claim_evaluations ──────────────────────────────────────────────
    op.create_table(
        "claim_evaluations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("claim_id", sa.Integer(), sa.ForeignKey("claims.id"), nullable=False, index=True),
        sa.Column("person_id", sa.String(), nullable=False, index=True),
        sa.Column("best_action_id", sa.Integer(), sa.ForeignKey("actions.id"), index=True),
        sa.Column("score", sa.Float()),
        sa.Column("tier", sa.String(), nullable=False, index=True),
        sa.Column("relevance", sa.String(), index=True),
        sa.Column("progress", sa.String(), index=True),
        sa.Column("timing", sa.String(), index=True),
        sa.Column("matched_bill_id", sa.String(), index=True),
        sa.Column("evidence_json", sa.Text()),
        sa.Column("why_json", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_claim_evaluations_id", "claim_evaluations", ["id"])

    # ── gold_ledger ────────────────────────────────────────────────────
    op.create_table(
        "gold_ledger",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("claim_id", sa.Integer(), sa.ForeignKey("claims.id"), nullable=False, index=True),
        sa.Column("evaluation_id", sa.Integer(), sa.ForeignKey("claim_evaluations.id"), nullable=False, index=True),
        sa.Column("person_id", sa.String(), nullable=False, index=True),
        sa.Column("claim_date", sa.Date(), index=True),
        sa.Column("source_url", sa.Text()),
        sa.Column("normalized_text", sa.Text(), nullable=False),
        sa.Column("intent_type", sa.String()),
        sa.Column("policy_area", sa.String()),
        sa.Column("matched_bill_id", sa.String(), index=True),
        sa.Column("best_action_id", sa.Integer(), sa.ForeignKey("actions.id"), index=True),
        sa.Column("score", sa.Float()),
        sa.Column("tier", sa.String(), nullable=False, index=True),
        sa.Column("relevance", sa.String(), index=True),
        sa.Column("progress", sa.String(), index=True),
        sa.Column("timing", sa.String(), index=True),
        sa.Column("evidence_json", sa.Text()),
        sa.Column("why_json", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("claim_id", name="uq_gold_ledger_claim_id"),
    )
    op.create_index("ix_gold_ledger_id", "gold_ledger", ["id"])

    # ── pipeline_runs ──────────────────────────────────────────────────
    op.create_table(
        "pipeline_runs",
        sa.Column("run_id", sa.String(), primary_key=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("git_sha", sa.String()),
        sa.Column("args_json", sa.Text()),
        sa.Column("counts_json", sa.Text()),
        sa.Column("status", sa.String(), nullable=False, index=True),
        sa.Column("error", sa.Text()),
    )

    # ── company_donations ──────────────────────────────────────────────
    op.create_table(
        "company_donations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.String(), nullable=False, index=True),
        sa.Column("entity_id", sa.String(), nullable=False, index=True),
        sa.Column("person_id", sa.String(), index=True),
        sa.Column("committee_name", sa.String()),
        sa.Column("committee_id", sa.String(), index=True),
        sa.Column("candidate_name", sa.String()),
        sa.Column("candidate_id", sa.String(), index=True),
        sa.Column("amount", sa.Float(), index=True),
        sa.Column("cycle", sa.String(), index=True),
        sa.Column("donation_date", sa.Date(), index=True),
        sa.Column("source_url", sa.String()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_company_donations_hash"),
    )
    op.create_index("ix_company_donations_id", "company_donations", ["id"])

    # ── congressional_trades ───────────────────────────────────────────
    op.create_table(
        "congressional_trades",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("person_id", sa.String(), nullable=False, index=True),
        sa.Column("ticker", sa.String(), index=True),
        sa.Column("asset_name", sa.String()),
        sa.Column("transaction_type", sa.String(), nullable=False, index=True),
        sa.Column("amount_range", sa.String()),
        sa.Column("disclosure_date", sa.Date(), index=True),
        sa.Column("transaction_date", sa.Date(), index=True),
        sa.Column("owner", sa.String()),
        sa.Column("source_url", sa.String()),
        sa.Column("reporting_gap", sa.String()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_congressional_trades_hash"),
    )
    op.create_index("ix_congressional_trades_id", "congressional_trades", ["id"])

    # ── anomalies ──────────────────────────────────────────────────────
    op.create_table(
        "anomalies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("pattern_type", sa.String(50), nullable=False, index=True),
        sa.Column("entity_type", sa.String(50), nullable=False, index=True),
        sa.Column("entity_id", sa.String(100), nullable=False, index=True),
        sa.Column("entity_name", sa.String(200)),
        sa.Column("score", sa.Float(), nullable=False, index=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("evidence", sa.Text()),
        sa.Column("detected_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("dedupe_hash", sa.String(64), nullable=False, index=True),
        sa.UniqueConstraint("dedupe_hash", name="uq_anomalies_hash"),
    )
    op.create_index("ix_anomalies_id", "anomalies", ["id"])

    # ══════════════════════════════════════════════════════════════════
    # FINANCE SECTOR
    # ══════════════════════════════════════════════════════════════════

    # ── tracked_institutions ───────────────────────────────────────────
    op.create_table(
        "tracked_institutions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("institution_id", sa.String(), unique=True, nullable=False, index=True),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("ticker", sa.String(), index=True),
        sa.Column("sector_type", sa.String(), nullable=False, index=True),
        sa.Column("sec_cik", sa.String(), index=True),
        sa.Column("fdic_cert", sa.String(), index=True),
        sa.Column("cfpb_company_name", sa.String()),
        sa.Column("logo_url", sa.String()),
        sa.Column("headquarters", sa.String()),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("ai_profile_summary", sa.Text()),
        sa.Column("sanctions_status", sa.String()),
        sa.Column("sanctions_data", sa.Text()),
        sa.Column("sanctions_checked_at", sa.DateTime(timezone=True)),
        sa.Column("needs_ingest", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("last_full_refresh_at", sa.DateTime(timezone=True), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tracked_institutions_id", "tracked_institutions", ["id"])

    # ── sec_filings ────────────────────────────────────────────────────
    op.create_table(
        "sec_filings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("institution_id", sa.String(), sa.ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True),
        sa.Column("accession_number", sa.String(), nullable=False, index=True),
        sa.Column("form_type", sa.String(), nullable=False, index=True),
        sa.Column("filing_date", sa.Date(), nullable=False, index=True),
        sa.Column("primary_doc_url", sa.String()),
        sa.Column("filing_url", sa.String()),
        sa.Column("description", sa.Text()),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("accession_number", name="uq_sec_filings_accession"),
    )
    op.create_index("ix_sec_filings_id", "sec_filings", ["id"])

    # ── sec_insider_trades ─────────────────────────────────────────────
    op.create_table(
        "sec_insider_trades",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("institution_id", sa.String(), sa.ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True),
        sa.Column("filer_name", sa.String(), nullable=False),
        sa.Column("filer_title", sa.String()),
        sa.Column("transaction_date", sa.Date(), nullable=False, index=True),
        sa.Column("transaction_type", sa.String()),
        sa.Column("shares", sa.Float()),
        sa.Column("price_per_share", sa.Float()),
        sa.Column("total_value", sa.Float()),
        sa.Column("accession_number", sa.String()),
        sa.Column("filing_url", sa.String()),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_sec_insider_trades_hash"),
    )
    op.create_index("ix_sec_insider_trades_id", "sec_insider_trades", ["id"])

    # ── fdic_financials ────────────────────────────────────────────────
    op.create_table(
        "fdic_financials",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("institution_id", sa.String(), sa.ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True),
        sa.Column("report_date", sa.Date(), nullable=False, index=True),
        sa.Column("total_assets", sa.Float()),
        sa.Column("total_deposits", sa.Float()),
        sa.Column("net_income", sa.Float()),
        sa.Column("net_loans", sa.Float()),
        sa.Column("roa", sa.Float()),
        sa.Column("roe", sa.Float()),
        sa.Column("tier1_capital_ratio", sa.Float()),
        sa.Column("efficiency_ratio", sa.Float()),
        sa.Column("noncurrent_loan_ratio", sa.Float()),
        sa.Column("net_charge_off_ratio", sa.Float()),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_fdic_financials_hash"),
    )
    op.create_index("ix_fdic_financials_id", "fdic_financials", ["id"])

    # ── cfpb_complaints ────────────────────────────────────────────────
    op.create_table(
        "cfpb_complaints",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("institution_id", sa.String(), sa.ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True),
        sa.Column("complaint_id", sa.String(), nullable=False, index=True),
        sa.Column("date_received", sa.Date(), nullable=False, index=True),
        sa.Column("product", sa.String(), index=True),
        sa.Column("sub_product", sa.String()),
        sa.Column("issue", sa.String(), index=True),
        sa.Column("sub_issue", sa.String()),
        sa.Column("company_response", sa.String()),
        sa.Column("timely_response", sa.String()),
        sa.Column("consumer_disputed", sa.String()),
        sa.Column("complaint_narrative", sa.Text()),
        sa.Column("state", sa.String(), index=True),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("complaint_id", name="uq_cfpb_complaints_id"),
    )
    op.create_index("ix_cfpb_complaints_id", "cfpb_complaints", ["id"])

    # ── finance_lobbying_records ───────────────────────────────────────
    op.create_table(
        "finance_lobbying_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("institution_id", sa.String(), sa.ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True),
        sa.Column("filing_uuid", sa.String(), index=True),
        sa.Column("filing_year", sa.Integer(), nullable=False, index=True),
        sa.Column("filing_period", sa.String()),
        sa.Column("income", sa.Float()),
        sa.Column("expenses", sa.Float()),
        sa.Column("registrant_name", sa.String(), index=True),
        sa.Column("client_name", sa.String()),
        sa.Column("lobbying_issues", sa.Text()),
        sa.Column("government_entities", sa.Text()),
        sa.Column("specific_issues", sa.Text()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_finance_lobbying_hash"),
    )
    op.create_index("ix_finance_lobbying_records_id", "finance_lobbying_records", ["id"])

    # ── finance_government_contracts ───────────────────────────────────
    op.create_table(
        "finance_government_contracts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("institution_id", sa.String(), sa.ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True),
        sa.Column("award_id", sa.String(), index=True),
        sa.Column("award_amount", sa.Float(), index=True),
        sa.Column("awarding_agency", sa.String(), index=True),
        sa.Column("description", sa.Text()),
        sa.Column("start_date", sa.Date(), index=True),
        sa.Column("end_date", sa.Date()),
        sa.Column("contract_type", sa.String(), index=True),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_finance_gov_contracts_hash"),
    )
    op.create_index("ix_finance_government_contracts_id", "finance_government_contracts", ["id"])

    # ── finance_enforcement_actions ────────────────────────────────────
    op.create_table(
        "finance_enforcement_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("institution_id", sa.String(), sa.ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True),
        sa.Column("case_title", sa.String(), nullable=False),
        sa.Column("case_date", sa.Date(), index=True),
        sa.Column("case_url", sa.String()),
        sa.Column("enforcement_type", sa.String(), index=True),
        sa.Column("penalty_amount", sa.Float()),
        sa.Column("description", sa.Text()),
        sa.Column("source", sa.String()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_finance_enforcement_hash"),
    )
    op.create_index("ix_finance_enforcement_actions_id", "finance_enforcement_actions", ["id"])

    # ── fred_observations ──────────────────────────────────────────────
    op.create_table(
        "fred_observations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("institution_id", sa.String(), sa.ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True),
        sa.Column("series_id", sa.String(), nullable=False, index=True),
        sa.Column("series_title", sa.String()),
        sa.Column("observation_date", sa.Date(), nullable=False, index=True),
        sa.Column("value", sa.Float()),
        sa.Column("units", sa.String()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_fred_observations_hash"),
    )
    op.create_index("ix_fred_observations_id", "fred_observations", ["id"])

    # ── fed_press_releases ─────────────────────────────────────────────
    op.create_table(
        "fed_press_releases",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("institution_id", sa.String(), sa.ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("link", sa.String(), nullable=False, index=True),
        sa.Column("published_at", sa.DateTime(timezone=True), index=True),
        sa.Column("category", sa.String(), index=True),
        sa.Column("summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("link", name="uq_fed_press_releases_link"),
    )
    op.create_index("ix_fed_press_releases_id", "fed_press_releases", ["id"])

    # ══════════════════════════════════════════════════════════════════
    # HEALTH SECTOR
    # ══════════════════════════════════════════════════════════════════

    # ── tracked_companies (health) ─────────────────────────────────────
    op.create_table(
        "tracked_companies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), unique=True, nullable=False, index=True),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("ticker", sa.String(), index=True),
        sa.Column("sector_type", sa.String(), nullable=False, index=True),
        sa.Column("fda_manufacturer_name", sa.String()),
        sa.Column("ct_sponsor_name", sa.String()),
        sa.Column("cms_company_name", sa.String()),
        sa.Column("sec_cik", sa.String(), index=True),
        sa.Column("logo_url", sa.String()),
        sa.Column("headquarters", sa.String()),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("ai_profile_summary", sa.Text()),
        sa.Column("sanctions_status", sa.String()),
        sa.Column("sanctions_data", sa.Text()),
        sa.Column("sanctions_checked_at", sa.DateTime(timezone=True)),
        sa.Column("needs_ingest", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("last_full_refresh_at", sa.DateTime(timezone=True), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tracked_companies_id", "tracked_companies", ["id"])

    # ── fda_adverse_events ─────────────────────────────────────────────
    op.create_table(
        "fda_adverse_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_companies.company_id"), nullable=False, index=True),
        sa.Column("report_id", sa.String(), nullable=False, index=True),
        sa.Column("receive_date", sa.Date(), index=True),
        sa.Column("serious", sa.Integer()),
        sa.Column("drug_name", sa.String(), index=True),
        sa.Column("reaction", sa.Text()),
        sa.Column("outcome", sa.String()),
        sa.Column("raw_json", sa.JSON()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("report_id", name="uq_fda_adverse_events_report_id"),
    )
    op.create_index("ix_fda_adverse_events_id", "fda_adverse_events", ["id"])

    # ── fda_recalls ────────────────────────────────────────────────────
    op.create_table(
        "fda_recalls",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_companies.company_id"), nullable=False, index=True),
        sa.Column("recall_number", sa.String(), index=True),
        sa.Column("classification", sa.String(), index=True),
        sa.Column("recall_initiation_date", sa.Date(), index=True),
        sa.Column("product_description", sa.Text()),
        sa.Column("reason_for_recall", sa.Text()),
        sa.Column("status", sa.String(), index=True),
        sa.Column("raw_json", sa.JSON()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_fda_recalls_hash"),
    )
    op.create_index("ix_fda_recalls_id", "fda_recalls", ["id"])

    # ── clinical_trials ────────────────────────────────────────────────
    op.create_table(
        "clinical_trials",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_companies.company_id"), nullable=False, index=True),
        sa.Column("nct_id", sa.String(), nullable=False, index=True),
        sa.Column("title", sa.Text()),
        sa.Column("overall_status", sa.String(), index=True),
        sa.Column("phase", sa.String(), index=True),
        sa.Column("start_date", sa.Date(), index=True),
        sa.Column("conditions", sa.Text()),
        sa.Column("interventions", sa.Text()),
        sa.Column("enrollment", sa.Integer()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("nct_id", name="uq_clinical_trials_nct_id"),
    )
    op.create_index("ix_clinical_trials_id", "clinical_trials", ["id"])

    # ── cms_payments ───────────────────────────────────────────────────
    op.create_table(
        "cms_payments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_companies.company_id"), nullable=False, index=True),
        sa.Column("record_id", sa.String(), nullable=False, index=True),
        sa.Column("payment_date", sa.Date(), index=True),
        sa.Column("amount", sa.Float(), index=True),
        sa.Column("payment_nature", sa.String(), index=True),
        sa.Column("physician_name", sa.String()),
        sa.Column("physician_specialty", sa.String(), index=True),
        sa.Column("state", sa.String(), index=True),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("record_id", name="uq_cms_payments_record_id"),
    )
    op.create_index("ix_cms_payments_id", "cms_payments", ["id"])

    # ── sec_health_filings ─────────────────────────────────────────────
    op.create_table(
        "sec_health_filings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_companies.company_id"), nullable=False, index=True),
        sa.Column("accession_number", sa.String(), nullable=False, index=True),
        sa.Column("form_type", sa.String(), nullable=False, index=True),
        sa.Column("filing_date", sa.Date(), index=True),
        sa.Column("primary_doc_url", sa.String()),
        sa.Column("filing_url", sa.String()),
        sa.Column("description", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("accession_number", name="uq_sec_health_filings_accession"),
    )
    op.create_index("ix_sec_health_filings_id", "sec_health_filings", ["id"])

    # ── health_lobbying_records ────────────────────────────────────────
    op.create_table(
        "health_lobbying_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_companies.company_id"), nullable=False, index=True),
        sa.Column("filing_uuid", sa.String(), index=True),
        sa.Column("filing_year", sa.Integer(), nullable=False, index=True),
        sa.Column("filing_period", sa.String()),
        sa.Column("income", sa.Float()),
        sa.Column("expenses", sa.Float()),
        sa.Column("registrant_name", sa.String(), index=True),
        sa.Column("client_name", sa.String()),
        sa.Column("lobbying_issues", sa.Text()),
        sa.Column("government_entities", sa.Text()),
        sa.Column("specific_issues", sa.Text()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_health_lobbying_hash"),
    )
    op.create_index("ix_health_lobbying_records_id", "health_lobbying_records", ["id"])

    # ── health_government_contracts ────────────────────────────────────
    op.create_table(
        "health_government_contracts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_companies.company_id"), nullable=False, index=True),
        sa.Column("award_id", sa.String(), index=True),
        sa.Column("award_amount", sa.Float(), index=True),
        sa.Column("awarding_agency", sa.String(), index=True),
        sa.Column("description", sa.Text()),
        sa.Column("start_date", sa.Date(), index=True),
        sa.Column("end_date", sa.Date()),
        sa.Column("contract_type", sa.String(), index=True),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_health_gov_contracts_hash"),
    )
    op.create_index("ix_health_government_contracts_id", "health_government_contracts", ["id"])

    # ── health_enforcement_actions ─────────────────────────────────────
    op.create_table(
        "health_enforcement_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_companies.company_id"), nullable=False, index=True),
        sa.Column("case_title", sa.String(), nullable=False),
        sa.Column("case_date", sa.Date(), index=True),
        sa.Column("case_url", sa.String()),
        sa.Column("enforcement_type", sa.String(), index=True),
        sa.Column("penalty_amount", sa.Float()),
        sa.Column("description", sa.Text()),
        sa.Column("source", sa.String()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_health_enforcement_hash"),
    )
    op.create_index("ix_health_enforcement_actions_id", "health_enforcement_actions", ["id"])

    # ══════════════════════════════════════════════════════════════════
    # TECH SECTOR
    # ══════════════════════════════════════════════════════════════════

    # ── tracked_tech_companies ─────────────────────────────────────────
    op.create_table(
        "tracked_tech_companies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), unique=True, nullable=False, index=True),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("ticker", sa.String(), index=True),
        sa.Column("sector_type", sa.String(), nullable=False, index=True),
        sa.Column("sec_cik", sa.String(), index=True),
        sa.Column("uspto_assignee_name", sa.String()),
        sa.Column("usaspending_recipient_name", sa.String()),
        sa.Column("logo_url", sa.String()),
        sa.Column("headquarters", sa.String()),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("ai_profile_summary", sa.Text()),
        sa.Column("sanctions_status", sa.String()),
        sa.Column("sanctions_data", sa.Text()),
        sa.Column("sanctions_checked_at", sa.DateTime(timezone=True)),
        sa.Column("needs_ingest", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("last_full_refresh_at", sa.DateTime(timezone=True), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tracked_tech_companies_id", "tracked_tech_companies", ["id"])

    # ── sec_tech_filings ───────────────────────────────────────────────
    op.create_table(
        "sec_tech_filings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True),
        sa.Column("accession_number", sa.String(), nullable=False, index=True),
        sa.Column("form_type", sa.String(), nullable=False, index=True),
        sa.Column("filing_date", sa.Date(), index=True),
        sa.Column("primary_doc_url", sa.String()),
        sa.Column("filing_url", sa.String()),
        sa.Column("description", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("accession_number", name="uq_sec_tech_filings_accession"),
    )
    op.create_index("ix_sec_tech_filings_id", "sec_tech_filings", ["id"])

    # ── tech_patents ───────────────────────────────────────────────────
    op.create_table(
        "tech_patents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True),
        sa.Column("patent_number", sa.String(), nullable=False, index=True),
        sa.Column("patent_title", sa.Text()),
        sa.Column("patent_date", sa.Date(), index=True),
        sa.Column("patent_abstract", sa.Text()),
        sa.Column("num_claims", sa.Integer()),
        sa.Column("cpc_codes", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("patent_number", name="uq_tech_patents_number"),
    )
    op.create_index("ix_tech_patents_id", "tech_patents", ["id"])

    # ── government_contracts (tech) ────────────────────────────────────
    op.create_table(
        "government_contracts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True),
        sa.Column("award_id", sa.String(), index=True),
        sa.Column("award_amount", sa.Float(), index=True),
        sa.Column("awarding_agency", sa.String(), index=True),
        sa.Column("description", sa.Text()),
        sa.Column("start_date", sa.Date(), index=True),
        sa.Column("end_date", sa.Date()),
        sa.Column("contract_type", sa.String(), index=True),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_government_contracts_hash"),
    )
    op.create_index("ix_government_contracts_id", "government_contracts", ["id"])

    # ── lobbying_records (tech) ────────────────────────────────────────
    op.create_table(
        "lobbying_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True),
        sa.Column("filing_uuid", sa.String(), index=True),
        sa.Column("filing_year", sa.Integer(), nullable=False, index=True),
        sa.Column("filing_period", sa.String()),
        sa.Column("income", sa.Float()),
        sa.Column("expenses", sa.Float()),
        sa.Column("registrant_name", sa.String(), index=True),
        sa.Column("client_name", sa.String()),
        sa.Column("lobbying_issues", sa.Text()),
        sa.Column("government_entities", sa.Text()),
        sa.Column("specific_issues", sa.Text()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_lobbying_records_hash"),
    )
    op.create_index("ix_lobbying_records_id", "lobbying_records", ["id"])

    # ── ftc_enforcement_actions ────────────────────────────────────────
    op.create_table(
        "ftc_enforcement_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True),
        sa.Column("case_title", sa.String(), nullable=False),
        sa.Column("case_date", sa.Date(), index=True),
        sa.Column("case_url", sa.String()),
        sa.Column("enforcement_type", sa.String(), index=True),
        sa.Column("penalty_amount", sa.Float()),
        sa.Column("description", sa.Text()),
        sa.Column("source", sa.String()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_ftc_enforcement_hash"),
    )
    op.create_index("ix_ftc_enforcement_actions_id", "ftc_enforcement_actions", ["id"])

    # ══════════════════════════════════════════════════════════════════
    # ENERGY SECTOR
    # ══════════════════════════════════════════════════════════════════

    # ── tracked_energy_companies ───────────────────────────────────────
    op.create_table(
        "tracked_energy_companies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), unique=True, nullable=False, index=True),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("ticker", sa.String(), index=True),
        sa.Column("sector_type", sa.String(), nullable=False, index=True),
        sa.Column("sec_cik", sa.String(), index=True),
        sa.Column("epa_facility_id", sa.String()),
        sa.Column("usaspending_recipient_name", sa.String()),
        sa.Column("eia_company_id", sa.String()),
        sa.Column("logo_url", sa.String()),
        sa.Column("headquarters", sa.String()),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("ai_profile_summary", sa.Text()),
        sa.Column("sanctions_status", sa.String()),
        sa.Column("sanctions_data", sa.Text()),
        sa.Column("sanctions_checked_at", sa.DateTime(timezone=True)),
        sa.Column("needs_ingest", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("last_full_refresh_at", sa.DateTime(timezone=True), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tracked_energy_companies_id", "tracked_energy_companies", ["id"])

    # ── sec_energy_filings ─────────────────────────────────────────────
    op.create_table(
        "sec_energy_filings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True),
        sa.Column("accession_number", sa.String(), nullable=False, index=True),
        sa.Column("form_type", sa.String(), nullable=False, index=True),
        sa.Column("filing_date", sa.Date(), index=True),
        sa.Column("primary_doc_url", sa.String()),
        sa.Column("filing_url", sa.String()),
        sa.Column("description", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("accession_number", name="uq_sec_energy_filings_accession"),
    )
    op.create_index("ix_sec_energy_filings_id", "sec_energy_filings", ["id"])

    # ── energy_emissions ───────────────────────────────────────────────
    op.create_table(
        "energy_emissions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True),
        sa.Column("facility_name", sa.String()),
        sa.Column("facility_id_epa", sa.String(), index=True),
        sa.Column("facility_city", sa.String()),
        sa.Column("facility_state", sa.String(), index=True),
        sa.Column("reporting_year", sa.Integer(), nullable=False, index=True),
        sa.Column("total_emissions", sa.Float()),
        sa.Column("emission_type", sa.String(), index=True),
        sa.Column("industry_type", sa.String()),
        sa.Column("source_url", sa.String()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_energy_emissions_hash"),
    )
    op.create_index("ix_energy_emissions_id", "energy_emissions", ["id"])

    # ── energy_government_contracts ────────────────────────────────────
    op.create_table(
        "energy_government_contracts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True),
        sa.Column("award_id", sa.String(), index=True),
        sa.Column("award_amount", sa.Float(), index=True),
        sa.Column("awarding_agency", sa.String(), index=True),
        sa.Column("description", sa.Text()),
        sa.Column("start_date", sa.Date(), index=True),
        sa.Column("end_date", sa.Date()),
        sa.Column("contract_type", sa.String(), index=True),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_energy_gov_contracts_hash"),
    )
    op.create_index("ix_energy_government_contracts_id", "energy_government_contracts", ["id"])

    # ── energy_lobbying_records ────────────────────────────────────────
    op.create_table(
        "energy_lobbying_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True),
        sa.Column("filing_uuid", sa.String(), index=True),
        sa.Column("filing_year", sa.Integer(), nullable=False, index=True),
        sa.Column("filing_period", sa.String()),
        sa.Column("income", sa.Float()),
        sa.Column("expenses", sa.Float()),
        sa.Column("registrant_name", sa.String(), index=True),
        sa.Column("client_name", sa.String()),
        sa.Column("lobbying_issues", sa.Text()),
        sa.Column("government_entities", sa.Text()),
        sa.Column("specific_issues", sa.Text()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_energy_lobbying_hash"),
    )
    op.create_index("ix_energy_lobbying_records_id", "energy_lobbying_records", ["id"])

    # ── energy_enforcement_actions ─────────────────────────────────────
    op.create_table(
        "energy_enforcement_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True),
        sa.Column("case_title", sa.String(), nullable=False),
        sa.Column("case_date", sa.Date(), index=True),
        sa.Column("case_url", sa.String()),
        sa.Column("enforcement_type", sa.String(), index=True),
        sa.Column("penalty_amount", sa.Float()),
        sa.Column("description", sa.Text()),
        sa.Column("source", sa.String()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_energy_enforcement_hash"),
    )
    op.create_index("ix_energy_enforcement_actions_id", "energy_enforcement_actions", ["id"])

    # ══════════════════════════════════════════════════════════════════
    # TRANSPORTATION SECTOR
    # ══════════════════════════════════════════════════════════════════

    # ── tracked_transportation_companies ───────────────────────────────
    op.create_table(
        "tracked_transportation_companies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), unique=True, nullable=False, index=True),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("ticker", sa.String(), index=True),
        sa.Column("sector_type", sa.String(), nullable=False, index=True),
        sa.Column("sec_cik", sa.String(), index=True),
        sa.Column("usaspending_recipient_name", sa.String()),
        sa.Column("website", sa.String()),
        sa.Column("logo_url", sa.String()),
        sa.Column("headquarters", sa.String()),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("ai_profile_summary", sa.Text()),
        sa.Column("sanctions_status", sa.String()),
        sa.Column("sanctions_data", sa.Text()),
        sa.Column("sanctions_checked_at", sa.DateTime(timezone=True)),
        sa.Column("needs_ingest", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("last_full_refresh_at", sa.DateTime(timezone=True), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tracked_transportation_companies_id", "tracked_transportation_companies", ["id"])

    # ── sec_transportation_filings ─────────────────────────────────────
    op.create_table(
        "sec_transportation_filings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True),
        sa.Column("accession_number", sa.String(), nullable=False, index=True),
        sa.Column("form_type", sa.String(), nullable=False, index=True),
        sa.Column("filing_date", sa.Date(), index=True),
        sa.Column("primary_doc_url", sa.String()),
        sa.Column("filing_url", sa.String()),
        sa.Column("description", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("accession_number", name="uq_sec_transportation_filings_accession"),
    )
    op.create_index("ix_sec_transportation_filings_id", "sec_transportation_filings", ["id"])

    # ── transportation_government_contracts ────────────────────────────
    op.create_table(
        "transportation_government_contracts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True),
        sa.Column("award_id", sa.String(), index=True),
        sa.Column("award_amount", sa.Float(), index=True),
        sa.Column("awarding_agency", sa.String(), index=True),
        sa.Column("description", sa.Text()),
        sa.Column("start_date", sa.Date(), index=True),
        sa.Column("end_date", sa.Date()),
        sa.Column("contract_type", sa.String(), index=True),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_transportation_gov_contracts_hash"),
    )
    op.create_index("ix_transportation_government_contracts_id", "transportation_government_contracts", ["id"])

    # ── transportation_lobbying_records ────────────────────────────────
    op.create_table(
        "transportation_lobbying_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True),
        sa.Column("filing_uuid", sa.String(), index=True),
        sa.Column("filing_year", sa.Integer(), nullable=False, index=True),
        sa.Column("filing_period", sa.String()),
        sa.Column("income", sa.Float()),
        sa.Column("expenses", sa.Float()),
        sa.Column("registrant_name", sa.String(), index=True),
        sa.Column("client_name", sa.String()),
        sa.Column("lobbying_issues", sa.Text()),
        sa.Column("government_entities", sa.Text()),
        sa.Column("specific_issues", sa.Text()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_transportation_lobbying_hash"),
    )
    op.create_index("ix_transportation_lobbying_records_id", "transportation_lobbying_records", ["id"])

    # ── transportation_enforcement_actions ─────────────────────────────
    op.create_table(
        "transportation_enforcement_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True),
        sa.Column("case_title", sa.String(), nullable=False),
        sa.Column("case_date", sa.Date(), index=True),
        sa.Column("case_url", sa.String()),
        sa.Column("enforcement_type", sa.String(), index=True),
        sa.Column("penalty_amount", sa.Float()),
        sa.Column("description", sa.Text()),
        sa.Column("source", sa.String()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_transportation_enforcement_hash"),
    )
    op.create_index("ix_transportation_enforcement_actions_id", "transportation_enforcement_actions", ["id"])

    # ── nhtsa_recalls ──────────────────────────────────────────────────
    op.create_table(
        "nhtsa_recalls",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True),
        sa.Column("recall_number", sa.String(), nullable=False, index=True),
        sa.Column("make", sa.String(), index=True),
        sa.Column("model", sa.String(), index=True),
        sa.Column("model_year", sa.Integer(), index=True),
        sa.Column("recall_date", sa.String(), index=True),
        sa.Column("component", sa.String()),
        sa.Column("summary", sa.Text()),
        sa.Column("consequence", sa.Text()),
        sa.Column("remedy", sa.Text()),
        sa.Column("manufacturer", sa.String()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_nhtsa_recalls_hash"),
    )
    op.create_index("ix_nhtsa_recalls_id", "nhtsa_recalls", ["id"])

    # ── nhtsa_complaints ───────────────────────────────────────────────
    op.create_table(
        "nhtsa_complaints",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True),
        sa.Column("odi_number", sa.String(), nullable=False, index=True),
        sa.Column("make", sa.String(), index=True),
        sa.Column("model", sa.String(), index=True),
        sa.Column("model_year", sa.Integer(), index=True),
        sa.Column("date_of_complaint", sa.String(), index=True),
        sa.Column("crash", sa.Boolean(), server_default="0"),
        sa.Column("fire", sa.Boolean(), server_default="0"),
        sa.Column("injuries", sa.Integer(), server_default="0"),
        sa.Column("deaths", sa.Integer(), server_default="0"),
        sa.Column("component", sa.String()),
        sa.Column("summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_nhtsa_complaints_hash"),
    )
    op.create_index("ix_nhtsa_complaints_id", "nhtsa_complaints", ["id"])

    # ── fuel_economy_vehicles ──────────────────────────────────────────
    op.create_table(
        "fuel_economy_vehicles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True),
        sa.Column("vehicle_id", sa.String(), nullable=False, index=True),
        sa.Column("year", sa.Integer(), index=True),
        sa.Column("make", sa.String(), index=True),
        sa.Column("model", sa.String(), index=True),
        sa.Column("mpg_city", sa.Float()),
        sa.Column("mpg_highway", sa.Float()),
        sa.Column("mpg_combined", sa.Float()),
        sa.Column("co2_tailpipe", sa.Float()),
        sa.Column("fuel_type", sa.String()),
        sa.Column("vehicle_class", sa.String()),
        sa.Column("ghg_score", sa.Integer()),
        sa.Column("smog_rating", sa.Integer()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_fuel_economy_vehicles_hash"),
    )
    op.create_index("ix_fuel_economy_vehicles_id", "fuel_economy_vehicles", ["id"])

    # ── nhtsa_safety_ratings ───────────────────────────────────────────
    op.create_table(
        "nhtsa_safety_ratings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True),
        sa.Column("vehicle_id", sa.String(50)),
        sa.Column("make", sa.String(100), index=True),
        sa.Column("model", sa.String(200), index=True),
        sa.Column("model_year", sa.Integer(), index=True),
        sa.Column("overall_rating", sa.Integer()),
        sa.Column("frontal_crash_rating", sa.Integer()),
        sa.Column("side_crash_rating", sa.Integer()),
        sa.Column("rollover_rating", sa.Integer()),
        sa.Column("dedupe_hash", sa.String(64), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_nhtsa_safety_ratings_hash"),
    )
    op.create_index("ix_nhtsa_safety_ratings_id", "nhtsa_safety_ratings", ["id"])

    # ══════════════════════════════════════════════════════════════════
    # DEFENSE SECTOR
    # ══════════════════════════════════════════════════════════════════

    # ── tracked_defense_companies ──────────────────────────────────────
    op.create_table(
        "tracked_defense_companies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), unique=True, nullable=False, index=True),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("ticker", sa.String(), index=True),
        sa.Column("sector_type", sa.String(), nullable=False, index=True),
        sa.Column("sec_cik", sa.String(), index=True),
        sa.Column("usaspending_recipient_name", sa.String()),
        sa.Column("website", sa.String()),
        sa.Column("logo_url", sa.String()),
        sa.Column("headquarters", sa.String()),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("ai_profile_summary", sa.Text()),
        sa.Column("sanctions_status", sa.String()),
        sa.Column("sanctions_data", sa.Text()),
        sa.Column("sanctions_checked_at", sa.DateTime(timezone=True)),
        sa.Column("needs_ingest", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("last_full_refresh_at", sa.DateTime(timezone=True), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tracked_defense_companies_id", "tracked_defense_companies", ["id"])

    # ── sec_defense_filings ────────────────────────────────────────────
    op.create_table(
        "sec_defense_filings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True),
        sa.Column("accession_number", sa.String(), nullable=False, index=True),
        sa.Column("form_type", sa.String(), nullable=False, index=True),
        sa.Column("filing_date", sa.Date(), index=True),
        sa.Column("primary_doc_url", sa.String()),
        sa.Column("filing_url", sa.String()),
        sa.Column("description", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("accession_number", name="uq_sec_defense_filings_accession"),
    )
    op.create_index("ix_sec_defense_filings_id", "sec_defense_filings", ["id"])

    # ── defense_government_contracts ───────────────────────────────────
    op.create_table(
        "defense_government_contracts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True),
        sa.Column("award_id", sa.String(), index=True),
        sa.Column("award_amount", sa.Float(), index=True),
        sa.Column("awarding_agency", sa.String(), index=True),
        sa.Column("description", sa.Text()),
        sa.Column("start_date", sa.Date(), index=True),
        sa.Column("end_date", sa.Date()),
        sa.Column("contract_type", sa.String(), index=True),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_defense_gov_contracts_hash"),
    )
    op.create_index("ix_defense_government_contracts_id", "defense_government_contracts", ["id"])

    # ── defense_lobbying_records ───────────────────────────────────────
    op.create_table(
        "defense_lobbying_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True),
        sa.Column("filing_uuid", sa.String(), index=True),
        sa.Column("filing_year", sa.Integer(), nullable=False, index=True),
        sa.Column("filing_period", sa.String()),
        sa.Column("income", sa.Float()),
        sa.Column("expenses", sa.Float()),
        sa.Column("registrant_name", sa.String(), index=True),
        sa.Column("client_name", sa.String()),
        sa.Column("lobbying_issues", sa.Text()),
        sa.Column("government_entities", sa.Text()),
        sa.Column("specific_issues", sa.Text()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_defense_lobbying_hash"),
    )
    op.create_index("ix_defense_lobbying_records_id", "defense_lobbying_records", ["id"])

    # ── defense_enforcement_actions ────────────────────────────────────
    op.create_table(
        "defense_enforcement_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True),
        sa.Column("case_title", sa.String(), nullable=False),
        sa.Column("case_date", sa.Date(), index=True),
        sa.Column("case_url", sa.String()),
        sa.Column("enforcement_type", sa.String(), index=True),
        sa.Column("penalty_amount", sa.Float()),
        sa.Column("description", sa.Text()),
        sa.Column("source", sa.String()),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_defense_enforcement_hash"),
    )
    op.create_index("ix_defense_enforcement_actions_id", "defense_enforcement_actions", ["id"])

    # ══════════════════════════════════════════════════════════════════
    # CROSS-SECTOR & AUXILIARY TABLES
    # ══════════════════════════════════════════════════════════════════

    # ── stock_fundamentals ─────────────────────────────────────────────
    op.create_table(
        "stock_fundamentals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.String(), nullable=False, index=True),
        sa.Column("entity_id", sa.String(), nullable=False, index=True),
        sa.Column("ticker", sa.String(), nullable=False, index=True),
        sa.Column("snapshot_date", sa.Date(), nullable=False, index=True),
        sa.Column("market_cap", sa.Float()),
        sa.Column("pe_ratio", sa.Float()),
        sa.Column("forward_pe", sa.Float()),
        sa.Column("peg_ratio", sa.Float()),
        sa.Column("price_to_book", sa.Float()),
        sa.Column("eps", sa.Float()),
        sa.Column("revenue_ttm", sa.Float()),
        sa.Column("profit_margin", sa.Float()),
        sa.Column("operating_margin", sa.Float()),
        sa.Column("return_on_equity", sa.Float()),
        sa.Column("dividend_yield", sa.Float()),
        sa.Column("dividend_per_share", sa.Float()),
        sa.Column("week_52_high", sa.Float()),
        sa.Column("week_52_low", sa.Float()),
        sa.Column("day_50_moving_avg", sa.Float()),
        sa.Column("day_200_moving_avg", sa.Float()),
        sa.Column("sector", sa.String()),
        sa.Column("industry", sa.String()),
        sa.Column("description", sa.String()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_stock_fundamentals_hash"),
    )
    op.create_index("ix_stock_fundamentals_id", "stock_fundamentals", ["id"])

    # ── committees ─────────────────────────────────────────────────────
    op.create_table(
        "committees",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("thomas_id", sa.String(), nullable=False, index=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("chamber", sa.String(), nullable=False, index=True),
        sa.Column("committee_type", sa.String(), index=True),
        sa.Column("url", sa.String()),
        sa.Column("phone", sa.String()),
        sa.Column("address", sa.String()),
        sa.Column("jurisdiction", sa.Text()),
        sa.Column("house_committee_id", sa.String()),
        sa.Column("senate_committee_id", sa.String()),
        sa.Column("parent_thomas_id", sa.String(), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("thomas_id", name="uq_committees_thomas_id"),
    )
    op.create_index("ix_committees_id", "committees", ["id"])

    # ── committee_memberships ──────────────────────────────────────────
    op.create_table(
        "committee_memberships",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("committee_thomas_id", sa.String(), sa.ForeignKey("committees.thomas_id"), nullable=False, index=True),
        sa.Column("bioguide_id", sa.String(), nullable=False, index=True),
        sa.Column("person_id", sa.String(), index=True),
        sa.Column("role", sa.String(), nullable=False, server_default="member", index=True),
        sa.Column("rank", sa.Integer()),
        sa.Column("party", sa.String()),
        sa.Column("member_name", sa.String()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("committee_thomas_id", "bioguide_id", name="uq_committee_memberships_committee_member"),
    )
    op.create_index("ix_committee_memberships_id", "committee_memberships", ["id"])

    # ── state_legislators ──────────────────────────────────────────────
    op.create_table(
        "state_legislators",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ocd_id", sa.String(), nullable=False, index=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("state", sa.String(2), nullable=False, index=True),
        sa.Column("chamber", sa.String()),
        sa.Column("party", sa.String()),
        sa.Column("district", sa.String()),
        sa.Column("photo_url", sa.String()),
        sa.Column("is_active", sa.Boolean(), server_default="1", index=True),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("ocd_id", name="uq_state_legislators_ocd_id"),
        sa.UniqueConstraint("dedupe_hash", name="uq_state_legislators_hash"),
    )
    op.create_index("ix_state_legislators_id", "state_legislators", ["id"])

    # ── state_bills ────────────────────────────────────────────────────
    op.create_table(
        "state_bills",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bill_id", sa.String(), nullable=False, index=True),
        sa.Column("state", sa.String(2), nullable=False, index=True),
        sa.Column("session", sa.String()),
        sa.Column("identifier", sa.String()),
        sa.Column("title", sa.String()),
        sa.Column("subjects", sa.String()),
        sa.Column("latest_action", sa.String()),
        sa.Column("latest_action_date", sa.Date()),
        sa.Column("sponsor_name", sa.String()),
        sa.Column("source_url", sa.String()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("bill_id", name="uq_state_bills_bill_id"),
        sa.UniqueConstraint("dedupe_hash", name="uq_state_bills_hash"),
    )
    op.create_index("ix_state_bills_id", "state_bills", ["id"])

    # ── digest_subscribers ─────────────────────────────────────────────
    op.create_table(
        "digest_subscribers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("zip_code", sa.String(10), nullable=False),
        sa.Column("state", sa.String(2)),
        sa.Column("frequency", sa.String(20)),
        sa.Column("verified", sa.Boolean(), server_default="0"),
        sa.Column("verification_token", sa.String(64), unique=True, index=True),
        sa.Column("unsubscribe_token", sa.String(64), unique=True, index=True),
        sa.Column("sectors", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_sent_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_digest_subscribers_id", "digest_subscribers", ["id"])

    # ── stories ────────────────────────────────────────────────────────
    op.create_table(
        "stories",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False, unique=True, index=True),
        sa.Column("summary", sa.Text()),
        sa.Column("body", sa.Text()),
        sa.Column("category", sa.String(), nullable=False, index=True),
        sa.Column("sector", sa.String(), index=True),
        sa.Column("entity_ids", sa.JSON()),
        sa.Column("data_sources", sa.JSON()),
        sa.Column("evidence", sa.JSON()),
        sa.Column("status", sa.String(), nullable=False, server_default="draft", index=True),
        sa.Column("published_at", sa.DateTime(timezone=True), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("slug", name="uq_story_slug"),
    )
    op.create_index("ix_stories_id", "stories", ["id"])

    # ── tweet_log ──────────────────────────────────────────────────────
    op.create_table(
        "tweet_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tweet_id", sa.String(50)),
        sa.Column("category", sa.String(50)),
        sa.Column("content_hash", sa.String(64), unique=True),
        sa.Column("text", sa.Text()),
        sa.Column("posted_at", sa.DateTime()),
    )

    # ══════════════════════════════════════════════════════════════════
    # GOVERNMENT DATA (cross-sector)
    # ══════════════════════════════════════════════════════════════════

    # ── sam_exclusions ─────────────────────────────────────────────────
    op.create_table(
        "sam_exclusions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), index=True),
        sa.Column("sam_number", sa.String(), index=True),
        sa.Column("entity_name", sa.String(), nullable=False, index=True),
        sa.Column("exclusion_type", sa.String(), index=True),
        sa.Column("exclusion_program", sa.String()),
        sa.Column("excluding_agency", sa.String(), index=True),
        sa.Column("classification", sa.String()),
        sa.Column("activation_date", sa.Date(), index=True),
        sa.Column("termination_date", sa.Date()),
        sa.Column("description", sa.Text()),
        sa.Column("city", sa.String()),
        sa.Column("state", sa.String()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_sam_exclusion_hash"),
    )
    op.create_index("ix_sam_exclusions_id", "sam_exclusions", ["id"])

    # ── sam_entities ───────────────────────────────────────────────────
    op.create_table(
        "sam_entities",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), index=True),
        sa.Column("uei", sa.String(), index=True),
        sa.Column("cage_code", sa.String(), index=True),
        sa.Column("legal_business_name", sa.String(), nullable=False, index=True),
        sa.Column("dba_name", sa.String()),
        sa.Column("physical_address", sa.Text()),
        sa.Column("naics_codes", sa.JSON()),
        sa.Column("parent_uei", sa.String(), index=True),
        sa.Column("parent_name", sa.String()),
        sa.Column("registration_status", sa.String()),
        sa.Column("registration_date", sa.String()),
        sa.Column("exclusion_status_flag", sa.String()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_sam_entity_hash"),
    )
    op.create_index("ix_sam_entities_id", "sam_entities", ["id"])

    # ── regulatory_comments ────────────────────────────────────────────
    op.create_table(
        "regulatory_comments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), index=True),
        sa.Column("comment_id", sa.String(), index=True),
        sa.Column("document_id", sa.String(), index=True),
        sa.Column("docket_id", sa.String(), index=True),
        sa.Column("agency_id", sa.String(), index=True),
        sa.Column("title", sa.String()),
        sa.Column("posted_date", sa.Date(), index=True),
        sa.Column("commenter_name", sa.String()),
        sa.Column("comment_text", sa.Text()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_regulatory_comment_hash"),
    )
    op.create_index("ix_regulatory_comments_id", "regulatory_comments", ["id"])

    # ── regulatory_dockets ─────────────────────────────────────────────
    op.create_table(
        "regulatory_dockets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("docket_id", sa.String(), nullable=False, unique=True, index=True),
        sa.Column("title", sa.String()),
        sa.Column("agency_id", sa.String(), index=True),
        sa.Column("docket_type", sa.String()),
        sa.Column("abstract", sa.Text()),
        sa.Column("rin", sa.String(), index=True),
        sa.Column("comment_start_date", sa.Date()),
        sa.Column("comment_end_date", sa.Date()),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_regulatory_docket_hash"),
    )
    op.create_index("ix_regulatory_dockets_id", "regulatory_dockets", ["id"])

    # ── it_investments ─────────────────────────────────────────────────
    op.create_table(
        "it_investments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("agency_code", sa.String(), index=True),
        sa.Column("agency_name", sa.String(), index=True),
        sa.Column("investment_title", sa.String()),
        sa.Column("unique_investment_id", sa.String(), index=True),
        sa.Column("cio_rating", sa.Integer(), index=True),
        sa.Column("total_it_spending", sa.Float()),
        sa.Column("lifecycle_cost", sa.Float()),
        sa.Column("schedule_variance", sa.Float()),
        sa.Column("cost_variance", sa.Float()),
        sa.Column("vendor_name", sa.String(), index=True),
        sa.Column("matched_company_id", sa.String(), index=True),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_it_investment_hash"),
    )
    op.create_index("ix_it_investments_id", "it_investments", ["id"])

    # ── government_website_scans ───────────────────────────────────────
    op.create_table(
        "government_website_scans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("target_url", sa.String(), nullable=False, index=True),
        sa.Column("final_url", sa.String()),
        sa.Column("agency", sa.String(), index=True),
        sa.Column("bureau", sa.String()),
        sa.Column("status_code", sa.Integer()),
        sa.Column("third_party_domains", sa.Text()),
        sa.Column("third_party_count", sa.Integer()),
        sa.Column("matched_company_ids", sa.JSON()),
        sa.Column("scan_date", sa.Date(), index=True),
        sa.Column("dedupe_hash", sa.String(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dedupe_hash", name="uq_gov_website_scan_hash"),
    )
    op.create_index("ix_government_website_scans_id", "government_website_scans", ["id"])

    # ══════════════════════════════════════════════════════════════════
    # AUTH TABLES
    # ══════════════════════════════════════════════════════════════════

    # ── users ──────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="free", index=True),
        sa.Column("api_key", sa.String(255), unique=True, index=True),
        sa.Column("display_name", sa.String(255)),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_login", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_users_id", "users", ["id"])

    # ── api_key_records ────────────────────────────────────────────────
    op.create_table(
        "api_key_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("key_hash", sa.String(64), unique=True, nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("scopes", sa.Text(), nullable=False, server_default='["read"]'),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1", index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_api_key_records_id", "api_key_records", ["id"])

    # ── audit_logs ─────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), index=True),
        sa.Column("action", sa.String(100), nullable=False, index=True),
        sa.Column("resource", sa.String(100), index=True),
        sa.Column("resource_id", sa.String(255)),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("user_agent", sa.String(500)),
        sa.Column("details", sa.Text()),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )
    op.create_index("ix_audit_logs_id", "audit_logs", ["id"])


def downgrade() -> None:
    # Drop in reverse dependency order
    # Auth
    op.drop_table("audit_logs")
    op.drop_table("api_key_records")
    op.drop_table("users")

    # Government data (cross-sector)
    op.drop_table("government_website_scans")
    op.drop_table("it_investments")
    op.drop_table("regulatory_dockets")
    op.drop_table("regulatory_comments")
    op.drop_table("sam_entities")
    op.drop_table("sam_exclusions")

    # Auxiliary
    op.drop_table("tweet_log")
    op.drop_table("stories")
    op.drop_table("digest_subscribers")
    op.drop_table("state_bills")
    op.drop_table("state_legislators")
    op.drop_table("committee_memberships")
    op.drop_table("committees")
    op.drop_table("stock_fundamentals")

    # Defense
    op.drop_table("defense_enforcement_actions")
    op.drop_table("defense_lobbying_records")
    op.drop_table("defense_government_contracts")
    op.drop_table("sec_defense_filings")
    op.drop_table("tracked_defense_companies")

    # Transportation
    op.drop_table("nhtsa_safety_ratings")
    op.drop_table("fuel_economy_vehicles")
    op.drop_table("nhtsa_complaints")
    op.drop_table("nhtsa_recalls")
    op.drop_table("transportation_enforcement_actions")
    op.drop_table("transportation_lobbying_records")
    op.drop_table("transportation_government_contracts")
    op.drop_table("sec_transportation_filings")
    op.drop_table("tracked_transportation_companies")

    # Energy
    op.drop_table("energy_enforcement_actions")
    op.drop_table("energy_lobbying_records")
    op.drop_table("energy_government_contracts")
    op.drop_table("energy_emissions")
    op.drop_table("sec_energy_filings")
    op.drop_table("tracked_energy_companies")

    # Tech
    op.drop_table("ftc_enforcement_actions")
    op.drop_table("lobbying_records")
    op.drop_table("government_contracts")
    op.drop_table("tech_patents")
    op.drop_table("sec_tech_filings")
    op.drop_table("tracked_tech_companies")

    # Health
    op.drop_table("health_enforcement_actions")
    op.drop_table("health_government_contracts")
    op.drop_table("health_lobbying_records")
    op.drop_table("sec_health_filings")
    op.drop_table("cms_payments")
    op.drop_table("clinical_trials")
    op.drop_table("fda_recalls")
    op.drop_table("fda_adverse_events")
    op.drop_table("tracked_companies")

    # Finance
    op.drop_table("fed_press_releases")
    op.drop_table("fred_observations")
    op.drop_table("finance_enforcement_actions")
    op.drop_table("finance_government_contracts")
    op.drop_table("finance_lobbying_records")
    op.drop_table("cfpb_complaints")
    op.drop_table("fdic_financials")
    op.drop_table("sec_insider_trades")
    op.drop_table("sec_filings")
    op.drop_table("tracked_institutions")

    # Cross-sector / Politics
    op.drop_table("anomalies")
    op.drop_table("congressional_trades")
    op.drop_table("company_donations")
    op.drop_table("pipeline_runs")
    op.drop_table("gold_ledger")
    op.drop_table("claim_evaluations")
    op.drop_table("claims")
    op.drop_table("member_bills_groundtruth")
    op.drop_table("person_bills")
    op.drop_table("tracked_members")
    op.drop_table("member_votes")
    op.drop_table("votes")
    op.drop_table("bill_actions")
    op.drop_table("bills")
    op.drop_table("actions")
    op.drop_table("action_tags")
    op.drop_table("source_documents")
    op.drop_table("people")
