# MVP Hardening - Phase 4.1 Complete

## Changes Implemented

### 1. Safety Check: --since-days > 180 Requires --force-old Flag

**File:** `ingest_robust_v2.py`

**Problem:** Users could accidentally ingest very old bills (e.g., `--since-days 365`) causing database bloat with stale legislation.

**Solution:** Added safety guard that blocks `--since-days > 180` unless `--force-old` flag is explicitly provided.

**Example:**
```bash
# This will FAIL with warning
python ingest_robust_v2.py --all --since-days 200

# Output:
# [!] WARNING: --since-days > 180 can ingest very old bills
# [!] This may bloat the database with stale legislation.
# [!] If you're sure, add --force-old flag.
# [!] Current value: --since-days 200
# [!] Recommended: --since-days 90 (default) or --since-days 180

# This will WORK
python ingest_robust_v2.py --all --since-days 200 --force-old
```

**Default:** `--since-days 90` (already set via `DEFAULT_FRESHNESS_DAYS = 90`)

---

### 2. Enhanced Ingestion Summary

**File:** `ingest_robust_v2.py`

**Added:** Run-level summary tracking across all members when using `--all`

**Output:**
```
======================================================================
INGESTION RUN COMPLETE
======================================================================
Total members processed: 51
Total new PersonBill links: 1001
Total already existed: 156
Total stale (skipped): 893
======================================================================
```

**Benefits:**
- See total impact of ingestion run
- Track new links vs duplicates vs stale bills
- Useful for monitoring data quality

---

### 3. Verification Enhanced with Actionable Warnings

**File:** `verify_ingestion_v2.py`

**Added:** Highlighted needs_enrichment count with action command

**Before:**
```
📋 BILLS:
   Total bills: 699
   Enriched: 5
   Needs enrichment: 694
   Enrichment coverage: 5/699 (0.7%)
```

**After:**
```
📋 BILLS:
   Total bills: 699
   Enriched: 5
   [!] NEEDS ENRICHMENT: 694
   Enrichment coverage: 5/699 (0.7%)
   [ACTION REQUIRED] Run: python jobs/enrich_bills.py --limit 694
```

**Benefits:**
- Immediate visibility into enrichment backlog
- Copy-paste command to fix the issue
- No need to calculate batch size manually

---

### 4. Enrichment Progress with Remaining Count

**File:** `jobs/enrich_bills.py`

**Added:**
1. Remaining count in progress display
2. Remaining needs_enrichment after batch complete
3. Suggested next command

**Progress Display:**
```
[1/5] HR360-119 (remaining: 4)
[2/5] HRES996-119 (remaining: 3)
[3/5] HR7173-119 (remaining: 2)
[4/5] HCONRES68-119 (remaining: 1)
[5/5] HR7060-119 (remaining: 0)
```

**Summary Display:**
```
======================================================================
ENRICHMENT SUMMARY
======================================================================
Total bills processed: 5
  ✅ Success: 5
  ❌ Failed: 0
  📊 Total actions inserted: 20

Status Distribution:
  - in_committee: 4
  - failed: 1

[!] REMAINING NEEDS ENRICHMENT: 689
[ACTION] Run again with: python jobs/enrich_bills.py --limit 689
======================================================================
```

**Benefits:**
- Know how much work is left in real-time
- Easy to track progress in large batches
- Clear guidance on next steps

---

### 5. Fixed Single Member Ingestion

**File:** `ingest_robust_v2.py`

**Problem:** After removing hardcoded `MEMBERS` dict, single member ingestion (`--person-id`) broke.

**Solution:** Query `TrackedMember` table for single member with proper error handling.

**Features:**
- Checks if member exists in database
- Checks if member is active (is_active=1)
- Provides helpful error messages with suggested commands

**Example:**
```bash
# Unknown member
python ingest_robust_v2.py --person-id unknown_person
# [ERROR] Unknown person_id: unknown_person
# [INFO] Run: python manage_members.py list

# Inactive member
python ingest_robust_v2.py --person-id mitt_romney  # (if deactivated)
# [ERROR] Member is inactive: Mitt Romney
# [INFO] Activate with: python manage_members.py activate --person-id mitt_romney

# Valid active member
python ingest_robust_v2.py --person-id aoc
# ✅ Works
```

---

## Testing Results

### Safety Check
```bash
# Test 1: Block > 180 without --force-old
python ingest_robust_v2.py --all --since-days 200
# ✅ BLOCKED with warning

# Test 2: Allow with --force-old
python ingest_robust_v2.py --person-id aoc --since-days 200 --force-old --max-pages 1
# ✅ ALLOWED

# Test 3: Default 90 days works
python ingest_robust_v2.py --person-id aoc --max-pages 1
# ✅ Uses --since-days 90 (default)
```

### Verification Display
```bash
python verify_ingestion_v2.py --all
# ✅ Shows [!] NEEDS ENRICHMENT: 694
# ✅ Shows [ACTION REQUIRED] Run: python jobs/enrich_bills.py --limit 694
```

### Enrichment Progress
```bash
python jobs/enrich_bills.py --limit 5
# ✅ Shows (remaining: 4), (remaining: 3), etc.
# ✅ Shows [!] REMAINING NEEDS ENRICHMENT: 689
# ✅ Shows [ACTION] Run again with: python jobs/enrich_bills.py --limit 689
```

---

## Files Modified

1. **ingest_robust_v2.py** (3 changes)
   - Added `--force-old` flag and safety check for `--since-days > 180`
   - Added run-level summary tracking (total new links, already exists, stale skipped)
   - Fixed single member ingestion to query TrackedMember table

2. **verify_ingestion_v2.py** (1 change)
   - Enhanced BILLS section with highlighted needs_enrichment and action command

3. **jobs/enrich_bills.py** (2 changes)
   - Added remaining count to progress display (`remaining: N`)
   - Added remaining needs_enrichment count to batch summary

---

## Commands Reference

### Ingestion (with safety)
```bash
# Default (90 days, safe)
python ingest_robust_v2.py --all

# Custom window (safe)
python ingest_robust_v2.py --all --since-days 120

# Extended window (requires --force-old)
python ingest_robust_v2.py --all --since-days 200 --force-old

# Single member
python ingest_robust_v2.py --person-id aoc

# Disable freshness (CAUTION: ingests ALL bills)
python ingest_robust_v2.py --all --no-freshness
```

### Verification (with actionable output)
```bash
# Full coverage report
python verify_ingestion_v2.py --all
# Shows: [!] NEEDS ENRICHMENT count
#        [ACTION REQUIRED] command to run

# Single member
python verify_ingestion_v2.py --person-id aoc
```

### Enrichment (with progress tracking)
```bash
# Small batch (default 50)
python jobs/enrich_bills.py

# Custom batch size
python jobs/enrich_bills.py --limit 100

# Process all needs_enrichment
python jobs/enrich_bills.py --limit 694  # (copy from verification output)

# Shows:
# - Progress: [1/100] bill_id (remaining: 99)
# - Summary: [!] REMAINING NEEDS ENRICHMENT: N
# - Action: [ACTION] Run again with: python jobs/enrich_bills.py --limit N
```

---

## Production Workflow

### Day 1: Initial Setup
```bash
# 1. Load members
python manage_members.py bulk-load --preset high_impact_50

# 2. Ingest bills (90-day window)
python ingest_robust_v2.py --all

# 3. Verify coverage
python verify_ingestion_v2.py --all
# Note the [ACTION REQUIRED] command

# 4. Enrich bills
python jobs/enrich_bills.py --limit 694  # (from verification output)

# 5. Verify enrichment complete
python verify_ingestion_v2.py --all
# Should show: [!] NEEDS ENRICHMENT: 0 or low number
```

### Ongoing Maintenance (Weekly)
```bash
# 1. Refresh recent bills (30-day window for speed)
python ingest_robust_v2.py --all --since-days 30

# 2. Check what needs enrichment
python verify_ingestion_v2.py --all

# 3. Enrich new bills
python jobs/enrich_bills.py --limit N  # (from verification output)
```

### One-Time Historical Load (Use with Caution)
```bash
# Load 6 months of data (requires --force-old)
python ingest_robust_v2.py --all --since-days 180 --force-old

# This will take longer and create more bills
# Only do this if you need historical analysis
```

---

## Safety Guardrails Summary

1. ✅ **Default 90 days** - Safe default for ongoing monitoring
2. ✅ **Block > 180 days** - Prevents accidental database bloat
3. ✅ **--force-old required** - Explicit confirmation for old data
4. ✅ **Freshness stats** - Track bill age distribution
5. ✅ **Needs enrichment tracking** - Never lose track of unenriched bills
6. ✅ **Progress visibility** - Know how much work remains
7. ✅ **Actionable commands** - Copy-paste suggested next steps

---

## Status: MVP Hardening Complete ✅

All requested changes implemented and tested:
- [x] --since-days defaults to 90 everywhere
- [x] Safety check for --since-days > 180 (requires --force-old)
- [x] Verification shows total needs_enrichment with action command
- [x] Enrichment shows remaining count after each batch
- [x] Single member ingestion fixed
- [x] Run-level summaries for batch operations

**No schema changes. No matching logic changes. Pure operational hardening.**
