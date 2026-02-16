# Backend Reconciliation Report

Date: 2026-02-05  
Repo: `wethepeople-backend`

## Why this exists

You asked for a **complete feature reconciliation audit** that is grounded in **actual repo artifacts** (code + tests + docs), not vibes.

This report reconciles:
- What earlier docs/roadmaps promised
- What is **actually implemented**
- What is **partially implemented** (exists but not wired / not safe / not in gate)
- What is **not started**
- What needs cleanup to keep the backend “one canonical path per concern”

Primary sources used:
- Quality gate runner: `scripts/run_gate.ps1`
- Phase reports: `docs/PHASE_0_REPORT.md`, `docs/PHASE_1A_REPORT.md`
- Ledger roadmap: `PHASE_1_LEGISLATIVE_LEDGER_ROADMAP.md`
- Matching/evidence validation docs: `URL_MATCHING_VALIDATION.md`
- Enrichment docs: `docs/ENRICHMENT_JOB.md`

---

## Executive summary (brutally honest)

**What’s solid and verified:**
- Phase 0 (dependency audit), Phase 1A (Bronze layer) are implemented and integrated into the gate.
- The core “legislative ledger” tables (bills + timelines) and a conservative matching engine exist.
- Evidence fields exist (`matched_bill_id`, `evidence_json`) and are schema-validated at the **write choke point**.
- A ground-truth rail exists (member bill lists by bioguide) and is used to constrain matching.

**What’s missing vs roadmap:**
- Silver/Gold layers are not implemented (no Silver table, no claim→bronze/silver lineage).
- Fuzzy matching exists as a module and tests, but is **not integrated** into the matcher.
- Vote verification exists in the matcher and DB schema, but ingestion/mapping is **not production-grade**.
- Logging is canonicalized but not consistently adopted (many `print()` remain).

**Biggest architectural debt risks:**
- Two migration systems are present (`alembic/` and `migrations/*.py`).
- Many “one-off” scripts and older v2 flows remain; some now reference stale imports.

---

# A) Implemented & verified (real, in code, with tests/gate coverage)

## A1) Quality gate (single runner)
- **Runner:** `scripts/run_gate.ps1`
- **Current scope:** 10 checks (dependency audit → invariants), including Bronze, evidence validation, fuzzy module test, canonical invariants.

## A2) Phase 0: Dependency audit system
- **Audit logic:** `scripts/audit_dependencies.py`
- **CLI:** `cli/health_cmd.py` (Typer subcommands) + `cli/__main__.py`
- **Gate integration:** `scripts/run_gate.ps1` Test 0
- **Doc:** `docs/PHASE_0_REPORT.md`

## A3) Phase 1A: Bronze layer (raw storage + dedupe)
- **Model:** `models/database.py` (`BronzeDocument`)
- **Ingest writes Bronze first:** `jobs/ingest_claims.py` (stores raw HTML + hash)
- **CLI status command:** `cli/ingest_cmd.py`
- **Test:** `test_bronze_layer.py`
- **Gate integration:** `scripts/run_gate.ps1` Test 7
- **Doc:** `docs/PHASE_1A_REPORT.md`

## A4) Legislative ledger core (bills + timelines + enrichment)
- **Tables:** `models/database.py` (`Bill`, `BillAction`)
- **Enrichment job:** `jobs/enrich_bills.py` (fetch detail + timeline, dedupe, status bucket)
- **Doc:** `docs/ENRICHMENT_JOB.md`

Notes:
- Enrichment is implemented and documented, but it is **not currently a gate step**.

## A5) Conservative claim matching as a shared service
- **Single source of truth:** `services/matching/core.py`
- **Public import surface:** `services/matching/__init__.py` re-exports legacy API (`from .core import *`)
- **Used by API:** `main.py` imports `compute_matches_for_claim` via `from services.matching import compute_matches_for_claim`
- **Used by batch recomputation:** `jobs/recompute_evaluations.py`

## A6) URL-based matching with guardrails (validated)
- **Validator + rationale:** `URL_MATCHING_VALIDATION.md`
- **Regression suite:** `test_url_matching.py`
- **Gate integration:** `scripts/run_gate.ps1` Test 2
- **Implementation detail:** `services/matching/core.py` includes URL extraction + normalization + conservative boosting.

## A7) Evidence fields + schema validation at the write choke point (Phase 2)
- **Evidence schema + validator:** `services/evidence/schema.json`, `services/evidence/validate.py`
- **Write choke point:** `jobs/recompute_evaluations.py`
  - Calls `validate_evidence_dict(top_match["evidence"])`
  - Calls `validate_evidence(evidence_list)` before writing `ClaimEvaluation.evidence_json`
- **Test:** `test_evidence_validation.py`
- **Gate integration:** `scripts/run_gate.ps1` Test 8

## A8) Ground truth rail (member bills) + bioguide invariant
- **Model:** `models/database.py` (`MemberBillGroundTruth`, `TrackedMember`)
- **Sync job:** `jobs/sync_member_groundtruth.py`
- **Matching constraint:** `services/matching/core.py` constrains candidate actions to ground truth bill_ids when present.
- **Invariant check:** `scripts/check_bioguide_invariant.py`
- **Gate integration:** `scripts/run_gate.ps1` Test 6

## A9) Canonicalization / “single path per concern” invariants
- **Extractor canonical path:** `services/extraction/extract_main_text.py`
- **Structured logging canonical path:** `utils/logging.py`
- **Invariant enforcement:** `scripts/check_canonical_imports.py`
- **Gate integration:** `scripts/run_gate.ps1` Test 10

---

# B) Partial implementations (exist, but not fully reconciled / not fully wired)

## B1) Bill number extraction (Step 2 from ledger roadmap)
Roadmap claim (was listed as missing): `PHASE_1_LEGISLATIVE_LEDGER_ROADMAP.md` Step 2.

What exists now:
- **Extraction exists:** `jobs/ingest_claims.py` defines `extract_bill_references()` and populates `Claim.bill_refs_json`.
- **Matching uses it (“Step 2-lite”):** `services/matching/core.py` boosts score when an action’s (type+number) appears in `claim.bill_refs_json`.

What’s still incomplete:
- `bill_refs_json` stores normalized refs like `hr3562` (no congress suffix), so it can’t disambiguate across congresses.
- Extraction lives inside a job module (`jobs/ingest_claims.py`), not a reusable service module as the roadmap suggested.
- Related tests exist (e.g., `test_bill_extraction.py`) but are **not currently part of the quality gate**.

## B2) Vote verification (Phase 2 in matcher) vs “production vote ingestion”
What exists:
- **Vote + MemberVote tables:** `models/database.py`
- **Vote matching is implemented and intent-gated:** `services/matching/core.py` (`compute_matches_for_claim()` routes vote intents to `match_votes_for_claim()`).
- **API endpoints for ingest + query:** `main.py` has `/votes/ingest`, `/votes`, `/votes/{vote_id}`.

What makes this partial:
- `/votes/ingest` currently uses a **hardcoded** `person_id_map` (example only maps one bioguide).
- There is no gate coverage ensuring vote ingestion is stable, mapped, and actually used in recomputation.
- No scheduled job or CLI path is established as the canonical ingestion pathway.

## B3) Fuzzy matching module (Phase 3) exists but is not integrated
What exists:
- Module: `services/matching/similarity.py` (rapidfuzz) gated by `ENABLE_FUZZY_TITLE_MATCH=1`
- Test: `test_fuzzy_matching.py`
- Gate step: `scripts/run_gate.ps1` Test 9

What’s missing:
- The main matcher in `services/matching/core.py` does not currently call `fuzzy_title_match()`.
- So this is “verified as a library function,” not “verified as production matching behavior.”

## B4) Logging canonicalized, but adoption is incomplete
What exists:
- Canonical logger: `utils/logging.py` (`get_logger()`)
- Ingest job uses it: `jobs/ingest_claims.py`.

What’s incomplete:
- Many runtime paths still use `print()` (e.g., `main.py` startup hook; `jobs/recompute_evaluations.py`; `jobs/sync_member_groundtruth.py`; `models/database.py` prints DB URL).
- This is acceptable for prototypes, but it contradicts the “no raw print logging” intent.

## B5) Dirty-flag recomputation system
What exists:
- Field: `Claim.needs_recompute` in `models/database.py`
- Recompute job respects it by default: `jobs/recompute_evaluations.py` (`dirty_only=True`)
- Utilities exist: `utils/invalidation.py`
- Test/demo exists: `test_dirty_flag_system.py`

What’s missing:
- This is not currently enforced as a gate step.
- Several invalidation and recompute flows are “script-y” and still use `print()`.

---

# C) Promised / implied but not started (or no real evidence found)

## C1) Silver layer (Phase 1B)
Promised in `docs/PHASE_0_REPORT.md` as Phase 1B.

Missing evidence:
- No `SilverDocument` model in `models/database.py`.
- No Alembic migration adding a Silver table.
- No CLI command for Bronze → Silver extraction exists in `cli/`.

## C2) Gold lineage (Phase 1C)
Promised in `docs/PHASE_0_REPORT.md` as Phase 1C.

Missing evidence:
- `Claim` does not have `bronze_id`/`silver_id` linkage columns.
- No backfill script exists to link historical claims to Bronze/Silver.

## C3) UI validation / operator UX for ledger verification
The ledger roadmap calls this out explicitly as missing (`PHASE_1_LEGISLATIVE_LEDGER_ROADMAP.md`).

What exists is API endpoints in `main.py`, plus CLI commands for health/ingest/groundtruth. There is no dedicated “review UI” layer in this repo.

---

# D) Redundancies, conflicts, and architectural debt (things that will bite later)

## D1) Two migration systems (Alembic vs ad-hoc scripts)
Evidence:
- Alembic is present: `alembic/`, `alembic.ini`, `alembic/versions/*.py`
- A second system exists: `migrations/*.py` (e.g., evidence fields, bill refs)

Risk:
- Schema drift and “works on my DB” failures.

Recommendation:
- Choose Alembic as the single truth and either port `migrations/*.py` into Alembic or clearly mark them as legacy/one-time.

## D2) Stale imports after canonicalization (not in gate)
Evidence:
- `jobs/ingest_claims.py` no longer defines `extract_main_text`; it imports canonical `services/extraction/extract_main_text.py`.
- Some scripts/tests still import `extract_main_text` from `jobs.ingest_claims` (e.g., `comprehensive_debug.py`, `test_schumer_article.py`).

Risk:
- These scripts will fail when run, and the gate won’t catch it.

## D3) Fuzzy module verified but unused
Risk:
- Easy to assume “we have fuzzy matching” when the production matcher never calls it.

## D4) Hardcoded identity mapping in vote ingestion
Evidence:
- `main.py` `/votes/ingest` has a TODO and a hardcoded `person_id_map`.

Risk:
- Vote verification appears “done” on paper but is unusable at scale without a real mapping source (likely `TrackedMember`).

## D5) Logging inconsistency
Evidence:
- Canonical logger exists, but many core jobs/scripts still print.

Risk:
- Hard to run long jobs safely and diagnose failures.

---

# E) Corrected “get-to-live” roadmap (what to do next, in safe, verifiable steps)

This is a corrected roadmap ordered from highest leverage + lowest risk to bigger architectural moves.

## E1) Make the roadmap match reality (docs + gate)
1. Update `PHASE_1_LEGISLATIVE_LEDGER_ROADMAP.md` Step 2 to reflect that bill-ref extraction exists, but is “Step 2-lite” (no congress suffix).
2. Add gate coverage for bill-ref extraction:
   - Add `test_bill_extraction.py` to `scripts/run_gate.ps1`.

## E2) Vote verification: make it real or clearly mark it experimental
1. Replace hardcoded `person_id_map` in `main.py` with a DB-backed mapping using `TrackedMember`.
2. Add a minimal vote ingestion smoke test (or a dry-run mode) so it can be added to the gate without requiring network calls.

## E3) Finish Phase 1B/1C (Silver + Gold) or explicitly defer
If Bronze/Silver/Gold lineage is still the target architecture:
1. Add Silver table + migration (Alembic).
2. Implement Bronze → Silver extraction as a service under `services/extraction/`.
3. Add claim lineage columns (Gold linkage) and backfill.
4. Add a CLI to run extraction/backfill in controlled steps.

If it’s not the target anymore:
- Declare that in docs and stop referencing Phase 1B/1C as “next.”

## E4) Integrate fuzzy matching (only if you still want it)
1. Wire `services/matching/similarity.py` into `services/matching/core.py` behind the existing feature flag.
2. Require evidence emission (`fuzzy_title_match:*`) and schema validation continues to pass.
3. Add at least one regression test demonstrating it changes matching outcomes only when enabled.

## E5) Unify migrations
1. Decide: Alembic is canonical.
2. Port remaining `migrations/*.py` to Alembic revisions or mark them as legacy.
3. Add a gate invariant that flags new files under `migrations/` (optional, if you want to enforce Alembic-only).

## E6) Logging cleanup (incremental)
1. Replace high-value `print()` paths in long-running jobs (`jobs/recompute_evaluations.py`, `jobs/enrich_bills.py`, `jobs/sync_member_groundtruth.py`) with `utils/logging.get_logger()`.
2. Avoid touching one-off debug scripts unless they’re actively used.

---

## Appendix: Canonical paths (current)

- Extractor: `services/extraction/extract_main_text.py`
- Matching (shared): `services/matching/core.py` via `services/matching/__init__.py`
- Evidence validation: `services/evidence/validate.py`
- Structured logging: `utils/logging.py`
- Quality gate: `scripts/run_gate.ps1`

