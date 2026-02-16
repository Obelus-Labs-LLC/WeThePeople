# Daily Orchestrator (L2): `jobs/run_daily.py`

This repository includes a minimal “daily orchestrator” entrypoint that runs the pipeline in a fixed order and writes a manifest row into the `pipeline_runs` table.

## Usage

## Policy 1 (weekly floor + needs_ingest)

Canonical operator commands:

No-network/local sanity (should always work):

```bash
NO_NETWORK=1 python jobs/run_daily.py --policy1 --max-people 25 --skip-groundtruth
```

Real run (when you’re ready):

```bash
python jobs/run_daily.py --policy1 --max-people 25
```

### Real mode (executes stages)

```bash
python jobs/run_daily.py --congress 119
```

- Runs the stages in order.
- Writes a `pipeline_runs` row with `status=running` at start, and `status=success` (or `failed`) at the end.

### Dry-run mode (deterministic + safe)

```bash
python jobs/run_daily.py --dry-run --no-network
```

Dry-run is designed for the quality gate and contract tests:
- Deterministic.
- Does **not** perform any HTTP calls.
- Does **not** mutate the domain tables (it only writes/updates the manifest row).
- Produces `counts_json` entries for every stage with `skipped=true`.

## Stage flags (skip controls)

You can skip individual stages:

```bash
python jobs/run_daily.py --skip-ingest --skip-groundtruth --skip-enrich --skip-recompute
```

Flags:
- `--skip-ingest`: skips `ingest_claims`
- `--skip-groundtruth`: skips `sync_groundtruth`
- `--skip-enrich`: skips `enrich_bills`
- `--skip-recompute`: skips `recompute_evaluations`

Auto-skip rules:
- `sync_groundtruth` auto-skips with reason `missing_CONGRESS_API_KEY` if `CONGRESS_API_KEY` (or `API_KEY_CONGRESS`) is not set.
- Any network-backed stage auto-skips with reason `no_network` when `NO_NETWORK=1`.

## No-network mode

`--no-network` enforces `NO_NETWORK=1` immediately **in-process** (belt + suspenders) and also sets `NO_NETWORK=1` in the environment so subprocesses inherit it.

Notes:
- In-process enforcement uses [services/ops/no_network.py](services/ops/no_network.py).
- Subprocess enforcement is additionally supported via repo-local [sitecustomize.py](sitecustomize.py) when `NO_NETWORK=1` is set.

## Manifest fields (`pipeline_runs`)

The manifest row is stored in the `pipeline_runs` table (SQLAlchemy model: `PipelineRun`).

Expected fields:
- `run_id`: unique id for the run
- `started_at`, `finished_at`: UTC timestamps
- `git_sha`: best-effort repo SHA (or `unknown`)
- `args_json`: JSON string of orchestrator args
- `counts_json`: JSON string with stage summaries
- `status`: `running` → `success` | `failed`
- `error`: error string on failure

### `counts_json` shape

`counts_json` is a JSON object with:
- `dry_run`: boolean
- `no_network`: boolean
- `congress`: int
- `skip_flags`: which explicit `--skip-*` flags were passed
- `stages`: per-stage dict, e.g.
  - `started_at`: ISO timestamp (UTC)
  - `ended_at`: ISO timestamp (UTC)
  - `duration_ms`: integer
  - `skipped`: boolean
  - `reason`: string when skipped
  - `counts`: dict (stage-specific; includes exit code/stdout/stderr tails for subprocess stages)

## Test

Contract test (no network, temp DB):
- [test_run_daily_contract.py](test_run_daily_contract.py)

## Pilot Cohort Setup

The quality gate includes a **hard** pilot coverage threshold check.

Option A (env-driven; simplest — chosen for now):

- Add a manually curated pilot list to `.env`:

  `PILOT_PERSON_IDS=alexandria_ocasio_cortez,bernie_sanders,chuck_schumer,elizabeth_warren,ron_wyden`

The quality gate runner (`scripts/run_gate.ps1`) loads `.env` automatically.

Notes:

- Avoid auto-deriving pilots from “has claims” lists; those can include seeded/test artifacts (e.g., `cov-person-*`).
- Use `python scripts/show_active_person_ids.py` for discovery, then manually choose pilots.

Option B (DB-driven; scalable — do later for CI/prod):

- Add `tracked_members.pilot` via a migration
- Set `pilot=1` for the desired active pilot members (e.g., a one-off update script)
