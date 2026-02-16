# Daily Pipeline (Orchestrator)

This repo includes a simple daily orchestrator that runs the backend "live loop" in a strict order and writes an audit manifest even on failure.

## Goals

- One command to run the daily ingest/enrich/recompute path
- A manifest JSON written to `audit/daily_runs/` on every run (including failures)
- Deterministic `--dry-run` mode for gate/tests (no network)

## Command

- Dry-run (safe for tests / CI):

  `python jobs/daily_run.py --dry-run`

- Real run (example bounds):

  `python jobs/daily_run.py --since-days 90 --limit-pages 25 --congress 119`

## Step Order

1. `jobs/ingest_claims.py` (bounded by `--since-days` and `--limit-pages`)
2. `jobs/enrich_bills.py` (resume-safe)
3. `jobs/sync_member_groundtruth.py` (ground truth sync)
4. `jobs/recompute_evaluations.py` (dirty-only by default)
5. `jobs/build_gold_ledger.py` (materialize gold ledger)

## Manifest

Default directory: `audit/daily_runs/`

Override directory (useful for tests): set env var `DAILY_RUN_MANIFEST_DIR`.

The manifest contains:

- `run_id`, `started_at`, `finished_at`
- `config` (CLI config values)
- `steps[]` with `cmd`, `returncode`, `stdout`/`stderr` (capped), per-step timestamps
- `status` in `{running, success, failed}`

Dry-run sets all steps to `skipped` and returns `success`.
