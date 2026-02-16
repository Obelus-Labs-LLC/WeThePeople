# Gold Layer

Date: 2026-02-05

## Purpose

Gold is the canonical, API-ready ledger layer.

- **Bronze** stores raw fetched documents for audit + replay.
- **Silver** stores normalized, deduplicated records (claims, bill actions).
- **Gold** materializes the **current evaluation state** into a stable table designed for queries and downstream contracts.

Gold is **additive**: it does not replace `claims` or `claim_evaluations`.

## Table: `gold_ledger`

Defined in `models/database.py` as `GoldLedgerEntry`.

**Key invariant**

- One row per claim: uniqueness on `(claim_id)`.

**Core columns**

- `claim_id` (FK → `claims.id`) — unique
- `evaluation_id` (FK → `claim_evaluations.id`) — source of truth for tier/score/evidence
- `person_id`, `claim_date`, `source_url`, `normalized_text`
- `intent_type`, `policy_area`
- `matched_bill_id`, `best_action_id`, `score`, `tier`, `relevance`, `progress`, `timing`
- `evidence_json`, `why_json`

## Build Job

File: `jobs/build_gold_ledger.py`

This job reads `claim_evaluations` + `claims` and performs an idempotent upsert into `gold_ledger` keyed by `claim_id`.

Examples:

- Build everything (or a limited batch):
  - `python jobs/build_gold_ledger.py --limit 500`
- Build for one member:
  - `python jobs/build_gold_ledger.py --person-id chuck_schumer`
- Dry run (no writes):
  - `python jobs/build_gold_ledger.py --dry-run`

**Important SQLite note (gate compatibility)**

In this repo, tests/jobs may create tables using SQLAlchemy `checkfirst=True` without running Alembic.
SQLite will not retrofit constraints onto an already-existing table.

To keep the dedupe invariant real, the job ensures the backing unique index exists:

- `CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_ledger_claim_id ON gold_ledger (claim_id)`

## Tests

- `test_gold_ledger_build.py`
  - Verifies Gold build is idempotent.
  - Verifies duplicate inserts are rejected by the unique key.

## Invariants

- `scripts/check_gold_invariants.py`
  - Ensures no duplicate `claim_id` rows.
  - Ensures `tier` is present.
  - Ensures Gold rows reference existing `Claim` + `ClaimEvaluation`.

## Migration

Alembic revision creates the table + indexes:

- `alembic/versions/c3a9d2f0a4b1_add_gold_ledger_table.py`

This migration is additive; it does not modify existing tables.
