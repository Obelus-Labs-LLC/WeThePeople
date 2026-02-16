# Coverage Reporting (Phase L3)

Coverage reporting provides an operational snapshot of data completeness for tracked members and global bill enrichment.

## API

`GET /ops/coverage`

Query params:

- `person_id` (optional; single id or comma-separated list)
- `pilot_only` (optional; `0|1`, default `0`) — filter to the canonical pilot cohort
- `limit` (default 50, max 500)
- `offset` (default 0)
- `active_only` (default true)
- `order` in `{worst, best}` (default `worst`)

Ordering contract (frozen):

- `order=worst` (default): `coverage_score` ascending, tie-breaker `person_id` ascending
- `order=best`: `coverage_score` descending, tie-breaker `person_id` ascending

Response shape:

- `generated_at` (UTC ISO)
- `summary`
  - `tracked_members_total`
  - `active_only`
  - `bills_total`
  - `bills_needs_enrichment`
  - `bills_enriched`
  - `bills_enrichment_rate`
- `limit`, `offset`, `order`
- `members[]`
  - identity fields (`person_id`, `bioguide_id`, `display_name`, ...)
  - counts: `claims_total`, `evaluations_total`, `gold_rows_total`, `groundtruth_rows_total`
  - rates: `eval_coverage`, `gold_coverage`, `score`
  - coverage: `coverage_score_raw` (0–5), `coverage_score` (0–1)
  - recency fields: `last_claim_date`, `last_evaluation_at`, `last_gold_at`, `last_groundtruth_at`

Notes:

- This endpoint is deterministic and does not perform any network calls.
- `coverage_score_raw` and `coverage_score` are the operational sorting metrics.

## Coverage score

Crude but stable definition:

`coverage_score_raw = (claims>0) + (evaluations>0) + (groundtruth>0) + (bills_in_db>0) + (min_viable_enriched_bills_ok)`

`coverage_score = coverage_score_raw / 5` (normalized to 0–1)

`min_viable_enriched_bills_ok` is true if either:

- `bills_min_viable > 0`, OR
- `bills_min_viable_rate >= min_viable_rate_threshold`

Minimum viable bill timeline quality requires:

- bill has `latest_action_date`
- bill has `status_bucket`
- bill has at least `min_viable_actions_min` action(s) in `bill_actions`

Formal invariants (L1 enrichment stability):

- If a bill has any `bill_actions`, then `bills.latest_action_date` must equal `max(bill_actions.action_date)`.
- For enriched bills (`bills.needs_enrichment = 0`) that have any `bill_actions`, `bills.status_bucket` must be non-null.
- Timeline dedupe must ensure uniqueness for actions on the key `(bill_id, action_date, normalized(action_text))` (or an equivalent stable hash key). In this codebase that key is stored as `bill_actions.dedupe_hash`.

## Readiness thresholds

- Pilot-ready: `coverage_score ≥ 0.75` for all pilot members
- Launch-ready: `coverage_score ≥ 0.9` for pilot members, and no “unknown” fields

"Unknown fields" here means the recency fields are all present (`last_claim_date`, `last_evaluation_at`, `last_gold_at`, `last_groundtruth_at`) and no required identity fields are null.

### Pilot cohort

Canonical pilot cohort is defined by (in priority order):

1. `tracked_members.is_active = 1 AND tracked_members.pilot = 1` if the `pilot` column exists in the DB schema.
2. Otherwise, `PILOT_PERSON_IDS` env var (comma-separated), filtered down to active tracked members.

This is implemented in [services/ops/pilot_cohort.py](services/ops/pilot_cohort.py).

### Ground truth exception (no-network contexts)

Ground truth is treated as **optional** for the pilot coverage threshold check when either:

- `NO_NETWORK=1`, OR
- no Congress API key is present (`CONGRESS_API_KEY` / `API_KEY_CONGRESS`)

This keeps the gate deterministic and prevents Congress.gov calls from being required.

## Script

Warn-only gate-friendly report:

- Lowest coverage members:

  `python scripts/coverage_report.py --worst 10`

- Highest coverage members:

  `python scripts/coverage_report.py --best 10`

- JSON output:

  `python scripts/coverage_report.py --worst 10 --json`

- Pilot-only subset:

  `python scripts/coverage_report.py --worst 10 --pilot-only`

### Gate check

Pilot-only threshold checker:

`python scripts/check_pilot_coverage_threshold.py --threshold 0.75`

This is a **hard gate** check.

Pilot cohort selection must be explicitly configured via either:

- a `tracked_members.pilot` column (with `pilot=1` on active pilot members), OR
- `PILOT_PERSON_IDS` env var (comma-separated)

If neither is available, the checker exits with code `2` and prints:

`PILOT_PERSON_IDS not set and tracked_members.pilot not available`

## Pilot Cohort Setup

The pilot coverage threshold is enforced as a **hard gate**, so a pilot cohort selector must be configured.

Option A (env-driven; simplest — chosen for now):

- Add a manually curated pilot list to `.env`:

  `PILOT_PERSON_IDS=alexandria_ocasio_cortez,bernie_sanders,chuck_schumer,elizabeth_warren,ron_wyden`

The quality gate runner (`scripts/run_gate.ps1`) loads `.env` automatically (without overriding already-set session env vars).

Notes:

- Do not auto-derive pilots from “has claims” or “is active” lists; those can include seeded/test artifacts (e.g., `cov-person-*`).
- Use `python scripts/show_active_person_ids.py` for discovery, then manually choose pilots.

Option B (DB-driven; scalable — do later for CI/prod):

- Add `tracked_members.pilot` via a migration
- Set `pilot=1` for the desired active pilot members (e.g., a one-off update script)

## Shared logic

Both the script and API share a single implementation:

- [services/coverage.py](services/coverage.py)
