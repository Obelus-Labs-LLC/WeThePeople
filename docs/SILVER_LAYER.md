# Silver Layer (L1)

Date: 2026-02-05

## Purpose

The Silver layer provides **canonical, normalized, deduplicated** records that are safe for:
- API consumption
- Gold aggregation
- Graph generation

Silver is **additive**. It does **not** replace the existing Bronze → Claim pipeline.

## Canonical tables

### `silver_claims` (`SilverClaim`)

Defined in `models/database.py`.

Fields:
- `id`: integer primary key
- `bronze_id`: nullable FK → `bronze_documents.id` (best-effort linkage)
- `person_id`: string (indexed)
- `normalized_text`: text (normalized claim string)
- `intent_type`: string (best-effort classification; uses existing claim.intent if set)
- `policy_area`: string (best-effort; derived from existing evaluation/action/bill if available)
- `source_url`: text
- `published_at`: date (indexed)
- `created_at`: timestamp

**Idempotence / dedupe key**
- Unique constraint on `(person_id, source_url, normalized_text)`

This prevents the same normalized sentence from being inserted repeatedly for the same person and article.

### `silver_actions` (`SilverAction`)

Defined in `models/database.py`.

Fields:
- `id`: integer primary key
- `bill_id`: FK → `bills.bill_id` (indexed)
- `action_type`: string (usually `BillAction.action_code`)
- `chamber`: string (best-effort; uses `BillAction.chamber`, conservative fallback via `utils/normalization.extract_chamber_from_action()`)
- `canonical_status`: string (best-effort; current `Bill.status_bucket` snapshot)
- `description`: text (`BillAction.action_text`)
- `action_date`: datetime
- `created_at`: timestamp

**Idempotence / dedupe key**
- Unique constraint on `(bill_id, action_date, description)`

## Normalization jobs

### Claims → Silver

File: `jobs/normalize_claims_to_silver.py`

Reads from:
- `claims`
- best-effort linkage to `bronze_documents` (by `person_id + source_url`)

Normalization rules:
- `normalized_text`: lowercase, remove punctuation, collapse whitespace
- `intent_type`: `Claim.intent` if set else `services.matching.core.detect_intent()`
- `policy_area`: derived only if existing evaluation/action/bill data is present

Properties:
- **Idempotent**: safe to re-run; duplicates skipped
- **No breaking changes**: does not modify `claims` or `bronze_documents`

### BillActions → Silver

File: `jobs/normalize_actions_to_silver.py`

Reads from:
- `bill_actions`
- `bills` (for `canonical_status`)

Properties:
- **Idempotent**: safe to re-run; duplicates skipped
- **Conservative chamber detection**: no inference beyond explicit signals

## Quality gates

### Unit tests
- `test_silver_claims_dedupe.py`
- `test_silver_action_timeline_integrity.py`

### Invariant script
- `scripts/check_silver_invariants.py`

Checks:
- no duplicate keys in `silver_claims`
- no duplicate keys in `silver_actions`
- `silver_actions.action_date` is present

### Gate integration
- Wired into `scripts/run_gate.ps1` as steps 11–13.

## Migration

Alembic revision:
- `alembic/versions/b8c1a5f1d2a3_add_silver_layer_tables.py`

Note: tests/scripts defensively create Silver tables with `checkfirst=True` to keep the gate usable even when Alembic has not been run on a local DB yet.
