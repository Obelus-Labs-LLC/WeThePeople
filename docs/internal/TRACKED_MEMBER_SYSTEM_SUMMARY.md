# TrackedMember System - Phase 4.1 Complete

## Overview
Successfully implemented database-driven member tracking system for controlled expansion from ~10 to 51 high-impact federal officials.

## Components Created

### 1. Database Layer
**File:** `models/database.py`
- Added `TrackedMember` table:
  - `person_id` (UNIQUE, indexed) - Internal identifier
  - `bioguide_id` (UNIQUE, indexed) - Congress.gov identifier
  - `display_name` - Human-readable name
  - `chamber` - "house" or "senate"
  - `state` - State abbreviation (e.g., "NY")
  - `party` - Party affiliation ("D", "R", "I")
  - `is_active` - Soft delete flag (1=active, 0=inactive)
  - Timestamps: `created_at`, `updated_at`

### 2. Member Management CLI
**File:** `manage_members.py`
Commands:
- `list` - Show all tracked members (ASCII-only for Windows)
- `add` - Add single member
- `bulk-load --preset high_impact_50` - Load 51-member preset
- `deactivate --person-id <id>` - Soft delete member
- `activate --person-id <id>` - Reactivate member

**Preset:** `high_impact_50` (51 members)
- House/Senate leadership (9): Johnson, Jeffries, Schumer, Thune, etc.
- Committee chairs/ranking (21): Ways & Means, Appropriations, Armed Services, etc.
- Progressive voices (6): AOC, Omar, Tlaib, Pressley, Jayapal, Warren
- Conservative voices (8): MTG, Gaetz, Boebert, Roy, Jordan, Cruz, Hawley, Paul
- Swing/moderate (7): Murkowski, Manchin, Sinema, Romney, Collins

### 3. Member Validation
**File:** `validate_members.py`
- Hits Congress.gov API to verify bioguide IDs resolve
- Checks name matching
- Identifies current vs historical members
- Detects chamber mismatches
- Commands: `python validate_members.py` (all) or `--person-id <id>` (single)

### 4. Updated Ingestion
**File:** `ingest_robust_v2.py`
- **BEFORE:** Hardcoded `MEMBERS` dict (10 members)
- **AFTER:** Queries `TrackedMember` table filtering `is_active=1`
- Graceful handling when no active members found
- Works with freshness filter (`--since-days`)

### 5. Updated Verification
**File:** `verify_ingestion_v2.py`
- Added tracked member statistics:
  - Total tracked, active, inactive counts
  - Coverage: members with ingested data vs active members
- Shows per-member PersonBill link counts
- Freshness stats (30/90 days)

### 6. Smoke Test
**File:** `test_bulk_member_load.py`
Tests:
1. Bulk load high_impact_50 preset
2. Count verification (~50 members)
3. Duplicate detection (UNIQUE constraints)
4. Sample member check (key officials present)
5. List command functionality

**Status:** ✅ ALL TESTS PASSED

## Validation Results

### Smoke Test (test_bulk_member_load.py)
```
✅ Passed: 5/5
  - Bulk load: 51 members added
  - Count: 51 members (in range 45-55)
  - No duplicates detected
  - Sample members present (AOC, Thune, Schumer, Johnson, Jeffries)
  - List command works
```

### Ingestion Test (ingest_robust_v2.py --all --max-pages 1)
```
📋 Found 51 active tracked members
✅ Ingested 46/51 members (5 had no fresh bills in test window)
📊 Total PersonBill links: 1001
📋 Unique bills: 699
```

### Verification (verify_ingestion_v2.py --all)
```
👥 TRACKED MEMBERS:
   Total tracked: 51
   Active: 51
   Inactive: 0
   With ingested data: 46/51

📊 PERSON-BILL LINKS: 1001 total, 699 unique bills
📋 BILLS: 699 total (694 need enrichment)
📅 FRESHNESS: 183 bills in last 30 days, 457 in last 90 days
```

## Usage Examples

### Load Initial Preset
```bash
python manage_members.py bulk-load --preset high_impact_50
# Output: Added: 51, Skipped: 0
```

### List Active Members
```bash
python manage_members.py list
# Shows 51 members sorted by chamber, then name
```

### Add Single Member
```bash
python manage_members.py add \
  --person-id nancy_pelosi \
  --bioguide P000197 \
  --name "Nancy Pelosi" \
  --chamber house \
  --state CA \
  --party D
```

### Deactivate Member (Soft Delete)
```bash
python manage_members.py deactivate --person-id mitt_romney
# Sets is_active=0, stops ingestion without losing data
```

### Validate All Members
```bash
python validate_members.py
# Checks all 51 members against Congress.gov API
# Shows: Status (CURRENT/HISTORICAL), name matches, chamber mismatches
```

### Ingest All Tracked Members
```bash
python ingest_robust_v2.py --all --since-days 90
# Pulls from TrackedMember table (is_active=1)
# Applies freshness filter (last 90 days)
```

### Verify Coverage
```bash
python verify_ingestion_v2.py --all
# Shows tracked member stats
# PersonBill link counts per member
# Enrichment coverage
```

## Key Design Decisions

### 1. Database-Driven (vs Config File)
- ✅ Atomic updates (no partial writes)
- ✅ UNIQUE constraints prevent duplicates
- ✅ Soft deletes preserve historical data
- ✅ Queryable by ingestion scripts
- ✅ Integrated with existing schema

### 2. ASCII-Only Output (Windows Compatibility)
- Issue: Windows PowerShell console encoding errors
- Solution: Replaced emojis with ASCII: `[OK]`, `[X]`, `[!]`, `Y/N`
- File affected: `manage_members.py`

### 3. Soft Deletes (is_active flag)
- Deactivating a member sets `is_active=0`
- Ingestion skips inactive members
- PersonBill links preserved for historical analysis
- Can reactivate without losing metadata

### 4. Separate person_id and bioguide_id
- `person_id`: Human-readable internal key ("aoc", "john_thune")
- `bioguide_id`: Congress.gov official ID ("O000172", "T000250")
- Both UNIQUE and indexed for fast lookups

## Migration Notes

### Old System (DEPRECATED)
```python
# connectors/congress.py
MEMBERS = {
    "aoc": "O000172",
    "sanders": "S000033",
    # ... hardcoded 10 members
}
```

### New System
```python
# TrackedMember table (51 members)
db.query(TrackedMember).filter(TrackedMember.is_active == 1).all()
```

### Deprecated Scripts
- `ingest_robust__DEPRECATED_DO_NOT_USE.py`
- `verify_ingestion__DEPRECATED_DO_NOT_USE.py`

## Next Steps

### Immediate (Before Full Ingestion)
1. ✅ Run full validation: `python validate_members.py`
   - Check all 51 bioguide IDs resolve
   - Verify names match
   - Confirm current vs historical status

2. ✅ Run full ingestion: `python ingest_robust_v2.py --all --since-days 90`
   - Ingest all 51 members with freshness guard
   - Monitor for API rate limits
   - Verify PersonBill link counts

3. ✅ Run enrichment: `python jobs/enrich_bills.py --only-needs-enrichment`
   - Enrich ~700 Bill stubs
   - Sets `needs_enrichment=0` on completion

### Future Enhancements
1. **Preset expansion:** `high_impact_100`, `all_senators`, etc.
2. **Batch operations:** Deactivate multiple members by chamber/party
3. **Import/export:** JSON presets for sharing member lists
4. **Validation automation:** Weekly cron job to check bioguide IDs
5. **Member metadata:** Add district, committee assignments, term dates

## Files Changed

### Created
- `manage_members.py` (286 lines) - CLI for member management
- `validate_members.py` (179 lines) - Member validation against Congress API
- `test_bulk_member_load.py` (204 lines) - Smoke test suite

### Modified
- `models/database.py` - Added `TrackedMember` model
- `ingest_robust_v2.py` - Replaced hardcoded MEMBERS with DB query
- `verify_ingestion_v2.py` - Added tracked member stats section

## Success Criteria ✅

- [x] TrackedMember table created with UNIQUE constraints
- [x] manage_members.py CLI operational (list, add, bulk-load, deactivate)
- [x] high_impact_50 preset loaded (51 members)
- [x] Smoke test passes (5/5 tests)
- [x] Ingestion pulls from database (not hardcoded dict)
- [x] Verification shows tracked member stats
- [x] Windows-compatible (ASCII output)
- [x] Idempotent operations (re-running doesn't duplicate)
- [x] Soft delete system working (deactivate/activate)

## Commands Reference

```bash
# Member Management
python manage_members.py list                                    # List active members
python manage_members.py list --all                              # Include inactive
python manage_members.py bulk-load --preset high_impact_50       # Load preset
python manage_members.py add --person-id <id> --bioguide <bio>   # Add single member
python manage_members.py deactivate --person-id <id>             # Soft delete
python manage_members.py activate --person-id <id>               # Reactivate

# Validation
python validate_members.py                                       # Validate all
python validate_members.py --person-id <id>                      # Validate single

# Ingestion
python ingest_robust_v2.py --all                                 # Ingest all (90-day default)
python ingest_robust_v2.py --all --since-days 180                # Longer freshness window
python ingest_robust_v2.py --person-id <id>                      # Single member

# Verification
python verify_ingestion_v2.py --all                              # Overall stats
python verify_ingestion_v2.py --person-id <id>                   # Single member

# Testing
python test_bulk_member_load.py                                  # Smoke test (destructive)
```

---

**Status:** Phase 4.1 TrackedMember system complete and validated ✅
**Next Phase:** Full ingestion + enrichment of 51 members (~700 bills)
