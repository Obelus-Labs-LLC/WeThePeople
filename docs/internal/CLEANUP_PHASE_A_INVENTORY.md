# Repository Cleanup - Phase A Inventory
**Date:** 2026-02-05  
**Status:** INVENTORY ONLY - NO FILE SYSTEM CHANGES MADE  
**Goal:** Reduce clutter by safely identifying redundant/temporary files created during development

---

## Safety Rules
- ✅ Phase A: Inventory + Plan ONLY (NO file system changes)
- ✅ Phase B: Quarantine to `/_archive/cleanup_2026-02-05/` (requires user approval)
- ✅ Phase C: Verify with test suite after quarantine
- ✅ Phase D: Deletion (requires explicit user request)
- ❌ NEVER touch: models/, services/, connectors/, jobs/, migrations/, utils/, alembic/
- ❌ NEVER delete: pilot scripts, regression tests, baseline artifacts

---

## A1) MUST-KEEP (Core Runtime + Production + Recent Work)

### Core Runtime
- `main.py` - FastAPI server
- `init_db.py` - Database initialization
- `seed_people.py` - People seeding script
- `run_congress.py` - Congress connector runner
- `manage_members.py` - TrackedMember CRUD interface

### Production Folders (ALL FILES PRESERVED)
- `models/` - database.py, schemas.py
- `services/` - matching.py (enhanced today with URL guardrails), bill_text.py
- `connectors/` - congress.py, congress_votes.py, federal_register.py
- `jobs/` - recompute_evaluations.py (enhanced today with evidence fields), ingest_claims.py, enrich_bills.py, enrich_actions.py, backfill_action_enrichment_from_json.py
- `migrations/` - add_needs_recompute.py, add_evidence_fields.py (NEW today)
- `alembic/` - env.py + 7 version scripts
- `utils/` - normalization.py, invalidation.py, env.py

### Pilot Sequence Scripts (scripts/)
- `scripts/verify_claims.py` - Comprehensive claim verification (updated today)
- `scripts/pilot_baseline.py` - Baseline snapshot generator (NEW today, 169 lines)
- `scripts/sample_meaningful_matches.py` - Meaningful match sampler (updated today)
- `scripts/check_evidence.py` - Evidence field verification (NEW today, 32 lines)

### Regression Tests (Created/Updated Recently)
- `test_url_matching.py` - URL matching regression tests (NEW today, 217 lines, 5 tests PASSING)
- `test_claim_extraction.py` - Claim extraction tests
- `test_claim_hash_dedupe.py` - Hash deduplication tests
- `test_boilerplate_guardrail.py` - Boilerplate detection tests
- `test_category_classification.py` - Category classification tests
- `test_policy_area_filter.py` - Policy area filter tests
- `test_policy_comprehensive.py` - Comprehensive policy tests
- `test_three_layer_defense.py` - Three-layer defense tests
- `test_matching_quality.py` - Matching quality tests
- `test_matching_direct.py` - Direct matching tests
- `test_normalization.py` - Normalization tests
- `test_timeline_logic.py` - Timeline logic tests
- `test_status_rules.py` - Status rules tests
- `test_dirty_flag_system.py` - Dirty flag system tests
- `test_enrichment_normalization.py` - Enrichment normalization tests
- `test_enriched_matching.py` - Enriched matching tests
- `test_enrichment_job.py` - Enrichment job tests
- `test_api_matches.py` - API matches endpoint tests
- `test_api_evaluation.py` - API evaluation endpoint tests
- `test_api_bill_status.py` - API bill status tests
- `test_bill_endpoints.py` - Bill endpoint tests

### Baseline Artifacts
- `pilot_baseline_2026-02-05.txt` - Saved pilot baseline (NEW today, 50% match rate, 0 false positives)
- `URL_MATCHING_VALIDATION.md` - Complete URL matching validation report (NEW today)
- `CLAIM_INGESTION_QUICKSTART.md` - Claim ingestion quickstart guide
- `DIRTY_FLAG_SYSTEM_SUMMARY.txt` - Dirty flag system documentation
- `ENRICHED_API_FINAL_SUMMARY.txt` - Enriched API summary
- `VERIFICATION_ENRICHED_API.txt` - API verification results

### Active Documentation
- `TRACKED_MEMBER_SYSTEM_SUMMARY.md` - TrackedMember system documentation (references ingest_robust_v2.py, verify_ingestion_v2.py)
- `MVP_HARDENING_SUMMARY.md` - MVP hardening documentation (references ingest_robust_v2.py, verify_ingestion_v2.py)
- `QUICK_REFERENCE.txt` - Quick reference guide (references ingest_robust_v2.py, verify_ingestion_v2.py)
- `MIGRATION_PERSONBILL.txt` - PersonBill migration guide (references ingest_robust_v2.py, cleanup_sponsorship_actions.py)
- `IMPLEMENTATION_REPORT_PERSONBILL.txt` - PersonBill implementation report
- `QUICKSTART_PERSONBILL.txt` - PersonBill quickstart guide
- `ENRICHMENT_UPDATE_COMPLETE.txt` - Enrichment update documentation
- `BACKFILL_PLAN.md` - Backfill plan (references backfill_coverage.py)
- `docs/ENRICHMENT_JOB.md` - Enrichment job documentation
- `docs/NORMALIZATION_RULES.md` - Normalization rules

---

## A2) KEEP-FOR-NOW (Potentially Useful / Referenced in Docs)

### Active Integration Scripts (Referenced in Documentation)
- `ingest_robust_v2.py` - PersonBill-based ingestion (REFERENCED in 12+ .md/.txt files)
- `verify_ingestion_v2.py` - PersonBill verification (REFERENCED in 12+ .md/.txt files)
- `cleanup_sponsorship_actions.py` - Sponsorship action cleanup (REFERENCED in docs)
- `backfill_coverage.py` - Enrichment backfill (REFERENCED in BACKFILL_PLAN.md)
- `backfill_status_reasons.py` - Status reason backfill
- `validate_members.py` - Member validation script

### Integration Tests (Imported by test_personbill_links.py)
- `test_personbill_links.py` - PersonBill link tests (imports ingest_robust_v2)
- `test_freshness_filter.py` - Freshness filter tests (imports ingest_robust_v2)
- `test_enrich_once.py` - Single enrichment test
- `test_enrich_resilience.py` - Enrichment resilience tests
- `test_bulk_member_load.py` - Bulk member loading tests
- `test_import.py` - Import tests
- `test_hr7322.py` - HR7322 specific test

### Helper Scripts (May be used in future debugging)
- `show_why_structure.py` - "Why" structure inspector
- `ADMIN_ENDPOINTS.py` - Admin endpoints helper

---

## A3) CLEANUP CANDIDATES (Temporary/Redundant Development Artifacts)

### Ad-Hoc Debug Scripts (Not Referenced, Created for One-Time Debugging)
**Justification:** These were temporary diagnostic tools created during URL matching investigation. Not imported by any production code or tests. Can be safely archived.

- `debug_matching_scores.py` - One-time matching score debugger (modified today for DEFIANCE Act debugging, not referenced elsewhere)
  - Lines: 82 (small utility)
  - Usage: Created to debug DEFIANCE Act URL matching scores
  - Imported by: NONE
  - Safe to archive: ✅ Yes (debugging complete, URL_MATCHING_VALIDATION.md captures findings)

- `diagnose_matching.py` - SQLite-based matching diagnostics (modified today, not referenced)
  - Lines: 35 (small utility)
  - Usage: Raw SQL queries for matching investigation
  - Imported by: NONE
  - Safe to archive: ✅ Yes (findings incorporated into matching.py guardrails)

- `diagnose_linkage.py` - Linkage diagnostics (modified today, not referenced)
  - Lines: 35 (small utility)
  - Usage: Raw SQL queries for claim-action-bill linkage
  - Imported by: NONE
  - Safe to archive: ✅ Yes (findings documented, system working correctly)

- `check_defiance_action.py` - DEFIANCE Act specific checker (modified today, not referenced)
  - Lines: 48 (small utility)
  - Usage: One-time check for DEFIANCE Act BillAction existence
  - Imported by: NONE
  - Safe to archive: ✅ Yes (confirmed BillAction exists, test_url_matching.py now covers this)

- `debug_bill_endpoint.py` - Bill endpoint debugger (not modified recently, not referenced)
  - Usage: Ad-hoc API endpoint debugging
  - Imported by: NONE
  - Safe to archive: ✅ Yes (test_bill_endpoints.py covers this systematically)

- `debug_walkinshaw.py` - Walkinshaw-specific debugger (modified 2026-02-04, not referenced)
  - Usage: One-time debugging for Walkinshaw claims
  - Imported by: NONE
  - Safe to archive: ✅ Yes (specific issue resolved)

### One-Off Check Scripts (Temporary Verification, Not Part of Active Workflow)
**Justification:** These were created for one-time data validation tasks. Not part of pilot sequence or regression tests. Safe to archive after findings incorporated.

- `check_data.py` - Generic data checker (not modified recently, not referenced)
  - Usage: One-time data validation
  - Imported by: NONE
  - Safe to archive: ✅ Yes (findings incorporated into normal validation)

- `check_bill_status.py` - Bill status checker (not modified recently, not referenced)
  - Usage: One-time bill status validation
  - Imported by: NONE
  - Safe to archive: ✅ Yes (test_status_rules.py covers this systematically)

- `check_eval_link.py` - Evaluation linkage checker (not modified recently, not referenced)
  - Usage: One-time evaluation linkage validation
  - Imported by: NONE
  - Safe to archive: ✅ Yes (pilot_baseline.py now provides comprehensive validation)

- `check_status_reasons.py` - Status reason checker (not modified recently, not referenced)
  - Usage: One-time status reason validation
  - Imported by: NONE
  - Safe to archive: ✅ Yes (backfill_status_reasons.py handles this systematically)

- `check_tables.py` - Table structure checker (not modified recently, not referenced)
  - Usage: One-time database schema validation
  - Imported by: NONE
  - Safe to archive: ✅ Yes (alembic handles schema validation)

- `check_claim_1.py` - Single claim checker (not modified recently, not referenced)
  - Usage: One-time claim validation
  - Imported by: NONE
  - Safe to archive: ✅ Yes (verify_claims.py handles comprehensive claim validation)

### One-Off Migration Scripts (Superseded by Idempotent Migrations)
**Justification:** These manual migration scripts were one-time fixes. Functionality now incorporated into proper migrations/ folder with idempotent checks. Safe to archive.

- `add_ingestion_columns.py` - Manually added claim_hash column (modified today, not referenced)
  - Usage: One-time migration to add claim_hash column
  - Imported by: NONE
  - Superseded by: migrations/add_evidence_fields.py (idempotent with PRAGMA checks)
  - Safe to archive: ✅ Yes (functionality now in migrations/ folder)

- `recompute_claim_1.py` - Single claim recomputation (not modified recently, REFERENCED in VERIFICATION_ENRICHED_API.txt)
  - Usage: Quick script to recompute single claim
  - Imported by: NONE
  - Superseded by: jobs/recompute_evaluations.py (production job with --limit flag)
  - Safe to archive: ⚠️ KEEP-FOR-NOW (still mentioned in verification docs as quick utility)

### Deprecated Files (Explicitly Marked DO_NOT_USE)
**Justification:** Files with `__DEPRECATED_DO_NOT_USE` suffix are explicitly marked as obsolete. Safe to archive.

- `ingest_robust__DEPRECATED_DO_NOT_USE.py` - OLD ingestion (superseded by ingest_robust_v2.py)
  - Usage: Legacy Action-based ingestion
  - Imported by: NONE
  - Superseded by: ingest_robust_v2.py (PersonBill-based)
  - Safe to archive: ✅ Yes (explicitly deprecated, v2 is active)

- `verify_ingestion__DEPRECATED_DO_NOT_USE.py` - OLD verification (superseded by verify_ingestion_v2.py)
  - Usage: Legacy Action-based verification
  - Imported by: NONE
  - Superseded by: verify_ingestion_v2.py (PersonBill-based)
  - Safe to archive: ✅ Yes (explicitly deprecated, v2 is active)

---

## Summary Statistics

### Files by Category
- **A1 (Must-Keep):** 70+ files (core runtime, production folders, pilot scripts, regression tests, baseline artifacts, active docs)
- **A2 (Keep-For-Now):** 15+ files (active integration scripts, referenced in docs, imported by tests)
- **A3 (Cleanup Candidates):** 16 files (ad-hoc debug scripts, one-off checks, superseded migrations, deprecated files)

### Recommended Action
**Quarantine A3 candidates to `/_archive/cleanup_2026-02-05/`** preserving relative paths:

```
/_archive/cleanup_2026-02-05/
  debug_matching_scores.py
  diagnose_matching.py
  diagnose_linkage.py
  check_defiance_action.py
  debug_bill_endpoint.py
  debug_walkinshaw.py
  check_data.py
  check_bill_status.py
  check_eval_link.py
  check_status_reasons.py
  check_tables.py
  check_claim_1.py
  add_ingestion_columns.py
  recompute_claim_1.py (WAIT - still referenced in docs)
  ingest_robust__DEPRECATED_DO_NOT_USE.py
  verify_ingestion__DEPRECATED_DO_NOT_USE.py
```

**Actual quarantine count:** 15 files (excluding recompute_claim_1.py for now)

---

## Phase B Plan (Requires User Approval)

### Step 1: Create Archive Directory
```powershell
New-Item -ItemType Directory -Path "/_archive/cleanup_2026-02-05" -Force
```

### Step 2: Move Files (Quarantine, NOT Delete)
```powershell
# Move each file preserving relative path
Move-Item -Path "debug_matching_scores.py" -Destination "/_archive/cleanup_2026-02-05/"
Move-Item -Path "diagnose_matching.py" -Destination "/_archive/cleanup_2026-02-05/"
# ... (repeat for all 15 files)
```

### Step 3: Log Moves
Create `/_archive/cleanup_2026-02-05/MANIFEST.txt` with:
- Original file paths
- File sizes
- Last modified dates
- Reason for quarantine

---

## Phase C Verification (After Phase B)

### Test Suite Validation
```bash
# Run all regression tests
python test_url_matching.py  # 5 tests should PASS
python scripts/verify_claims.py --all  # Should show 6 claims
python jobs/recompute_evaluations.py --limit 200  # Should complete without errors
python scripts/pilot_baseline.py  # Should generate baseline snapshot
```

### Expected Results
- ✅ All regression tests PASS
- ✅ Pilot scripts run without import errors
- ✅ No broken references to archived files
- ✅ Baseline metrics unchanged (50% match rate, 0 false positives)

### Revert Procedure (If Tests Fail)
```powershell
# Move all files back from archive
Get-ChildItem "/_archive/cleanup_2026-02-05/" | ForEach-Object {
    Move-Item -Path $_.FullName -Destination "./"
}
Remove-Item -Path "/_archive/cleanup_2026-02-05" -Recurse -Force
```

---

## Phase D Deletion (Requires Explicit User Request)

**STOP:** Do NOT proceed to deletion without:
1. ✅ User explicit approval ("delete archive")
2. ✅ Phase C all tests PASSED
3. ✅ At least 7 days elapsed since Phase B quarantine
4. ✅ No production issues reported

**Command (DESTRUCTIVE, NO UNDO):**
```powershell
Remove-Item -Path "/_archive/cleanup_2026-02-05" -Recurse -Force
```

---

## Risk Assessment

### Low Risk (14 files)
All ad-hoc debug scripts and one-off check scripts. Not imported, not referenced in active docs, functionality superseded by systematic tests/jobs.

### Medium Risk (1 file)
- `recompute_claim_1.py` - Mentioned in VERIFICATION_ENRICHED_API.txt as quick utility. Recommend KEEP-FOR-NOW until doc updated to reference `jobs/recompute_evaluations.py --limit 1` instead.

### Zero Risk (2 files)
Explicitly deprecated files with `__DO_NOT_USE` suffix. Safe to archive immediately.

---

## Next Steps

**AWAITING USER APPROVAL** to proceed with Phase B quarantine.

**User Decision Required:**
1. ✅ **APPROVE Phase B** - Quarantine 15 files to /_archive/cleanup_2026-02-05/
2. ❌ **REJECT** - Keep all files at root, close cleanup task
3. 🔄 **MODIFY** - Adjust A3 list before quarantine

**After Approval:**
- Execute Phase B quarantine
- Run Phase C verification
- Report results
- Await Phase D approval (if desired)
