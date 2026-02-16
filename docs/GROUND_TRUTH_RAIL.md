# Ground Truth Rail - Architecture Documentation

## Overview

The **Ground Truth Rail** provides authoritative member-bill relationships from Congress.gov API v3, solving the fundamental problem that press releases don't reliably contain bill numbers.

## Two-Rail Architecture

### 1. Claims Rail (Press Releases)
- **Purpose**: Extract what politicians SAY
- **Source**: Press releases, social media, speeches
- **Output**: Claim text, dates, general policy positions
- **Quality**: Good for sentiment, narrative, messaging
- **Limitation**: Constituent-facing copy rarely includes bill numbers

### 2. Ground Truth Rail (Congress.gov API v3)
- **Purpose**: Track what politicians actually DID
- **Source**: Congress.gov API v3 (authoritative government data)
- **Output**: Canonical list of sponsored/cosponsored bills
- **Quality**: 100% accurate, complete, immutable
- **Benefit**: Constrains matching to actual legislative activity

## Why bioguide_id as Canonical Identity?

**Problem**: `person_id` is a convenience slug (e.g., "alexandria_ocasio_cortez"), subject to change
- Human-readable but mutable
- Not used by external APIs
- Database implementation detail

**Solution**: `bioguide_id` is the immutable government standard (e.g., "O000172")
- Permanent Congressional identifier
- Used by Congress.gov, ProPublica, GovTrack
- Never changes even if member changes name
- Canonical across all legislative tracking systems

**Invariant**: All inter-table joins must use `bioguide_id`, never `person_id`
- `person_id` is for display/URLs only
- `bioguide_id` is for data relationships
- Enforced by `scripts/check_bioguide_invariant.py` gate check

## Database Schema

```sql
CREATE TABLE member_bills_groundtruth (
    id INTEGER PRIMARY KEY,
    bioguide_id VARCHAR NOT NULL,           -- "O000172" for AOC
    bill_id VARCHAR NOT NULL,               -- "hr3562-119"
    role VARCHAR NOT NULL,                  -- "sponsor" or "cosponsor"
    source VARCHAR NOT NULL,                -- "congress.gov.api.v3"
    fetched_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX(bioguide_id),
    INDEX(bill_id)
);
```

## API Setup

### 1. Get API Key (Free)
```bash
# Sign up at https://api.congress.gov/sign-up/
# Receive API key via email immediately
```

### 2. Set Environment Variable
```powershell
# Windows PowerShell
$env:CONGRESS_API_KEY = "your_api_key_here"

# Or add to .env file
CONGRESS_API_KEY=your_api_key_here
```

### 3. Sync Ground Truth for a Member
```bash
python jobs/sync_member_groundtruth.py \
  --bioguide O000172 \
  --congress 119 \
  --api-key YOUR_API_KEY
```

### 4. Sync All Tracked Members
```bash
python jobs/sync_member_groundtruth.py \
  --bioguide O000172 \  # AOC
  --congress 119 \
  --api-key YOUR_API_KEY

python jobs/sync_member_groundtruth.py \
  --bioguide S000033 \  # Bernie Sanders
  --congress 119 \
  --api-key YOUR_API_KEY

# Repeat for: S000148 (Schumer), W000817 (Warren), W000779 (Wyden)
```

## Matching Logic

### Before Ground Truth Rail
```python
# Old: Search ALL 1516 actions, prone to false positives
candidate_actions = db.query(Action).filter(
    Action.date.between(date_min, date_max)
).limit(2000).all()
```

### After Ground Truth Rail
```python
# New: Only search member's actual sponsored/cosponsored bills
# 1. Get member's bioguide_id
member = db.query(TrackedMember).filter(
    TrackedMember.person_id == claim.person_id
).first()
bioguide_id = member.bioguide_id if member else None

# 2. Get ground truth bill_ids
ground_truth_bill_ids = None
if bioguide_id:
    gt_records = db.query(MemberBillGroundTruth.bill_id).filter(
        MemberBillGroundTruth.bioguide_id == bioguide_id
    ).all()
    if gt_records:
        ground_truth_bill_ids = {r[0] for r in gt_records}

# 3. Apply ground truth constraint
if ground_truth_bill_ids:
    for action in all_candidate_actions:
        action_bill_id = f"{action.bill_type}{action.bill_number}-{action.bill_congress}"
        if action_bill_id in ground_truth_bill_ids:
            matched_actions.append(action)
else:
    # Fallback: Use all actions if no ground truth available
    matched_actions = all_candidate_actions
```

## Benefits

### 1. Precision
- **Before**: Match against 1516 actions → many false positives
- **After**: Match against ~50-200 actions per member → only actual bills

### 2. Speed
- **Before**: 10:43 to recompute 36 claims (average ~18s/claim)
- **After**: Expected 2-5x faster due to smaller candidate sets

### 3. Authority
- **Before**: Heuristic extraction from press releases (unreliable)
- **After**: Canonical government data (100% accurate)

### 4. Completeness
- **Before**: Only find bills mentioned in press releases (~10% of activity)
- **After**: All sponsored/cosponsored bills available for matching

## Workflow

### Initial Setup (One-time)
1. Sign up for Congress.gov API key
2. Populate `bioguide_id` in `tracked_members` table
3. Run `update_bioguide_ids.py` to map existing members
4. Add `check_bioguide_invariant.py` to quality gate

### Regular Operations
1. Add new tracked member to `tracked_members` with `bioguide_id`
2. Run `sync_member_groundtruth.py` to fetch their bills
3. Run `recompute_evaluations.py --all` to match claims
4. Ground truth auto-constrains matching to their actual bills

### Maintenance
- Re-sync ground truth weekly (bills update frequently)
- Use `--dry-run` flag to preview changes before committing
- Check `fetched_at` timestamp to see when data was last updated

## Testing

### Test Single Member
```bash
python test_aoc_groundtruth.py
```

Expected output:
```
================================================================================
TEST GROUND TRUTH RAIL - AOC
================================================================================

1. Syncing ground truth for AOC (O000172) in Congress 119...
   ✓ Synced 147 bills
   
2. Querying database...
   Total bills: 147
   Sponsored: 23
   Cosponsored: 124
   
3. Sample bills:
   - hr3562-119 (sponsor)
   - hr1-119 (cosponsor)
   ...

================================================================================
✓ GROUND TRUTH RAIL TEST PASSED
================================================================================
```

### Verify Ground Truth Constraint
```bash
# Before: Should match bills member didn't touch
python scripts/pilot_baseline.py

# After: Should only match member's actual bills
python jobs/sync_member_groundtruth.py --bioguide O000172 --congress 119 --api-key KEY
python jobs/recompute_evaluations.py --all --limit 100
python scripts/pilot_baseline.py
```

## Common Issues

### Issue: 403 Forbidden
```
❌ 403 Forbidden - API key required
```
**Solution**: Sign up at https://api.congress.gov/sign-up/ and provide `--api-key` flag

### Issue: No ground truth found for member
```
⚠️ No ground truth available for bioguide_id X, using all actions
```
**Solution**: Run `sync_member_groundtruth.py` for that member first

### Issue: person_id join violation
```
❌ FAILED: Found person_id join violations
  services/matching.py:42
    JOIN ... ON person_id = person_id
```
**Solution**: Change to join on `bioguide_id` instead

### Issue: Outdated ground truth
```
⚠️ Ground truth last synced 30 days ago
```
**Solution**: Re-run sync job to fetch latest bills

## API Rate Limits

Congress.gov API v3 limits:
- **Default**: 5,000 requests/hour
- **With key**: Same limit, but tracked per key
- **Best practice**: Use `--rate-limit 0.5` to add 0.5s delay between requests

## Migration Guide

### Phase 1: Add Ground Truth (CURRENT)
✅ Create `member_bills_groundtruth` table
✅ Add sync job `sync_member_groundtruth.py`
✅ Update matching to use ground truth constraint
✅ Add bioguide invariant gate check
❌ Keep existing person_id-based queries (backward compatible)

### Phase 2: Migrate to bioguide_id (FUTURE)
1. Add `bioguide_id` to `Claim` table (nullable, indexed)
2. Populate from `TrackedMember` lookup
3. Update all queries to filter/join on `bioguide_id`
4. Keep `person_id` for display/URLs only
5. Add foreign key: `Claim.bioguide_id → TrackedMember.bioguide_id`

### Phase 3: Deprecate person_id joins (FUTURE)
1. Update gate check to fail on ANY `person_id` usage outside display layer
2. Migrate all foreign keys to use `bioguide_id`
3. Make `person_id` display-only (no database constraints)

## Bioguide ID Reference

Current tracked members:
```python
BIOGUIDE_MAP = {
    "alexandria_ocasio_cortez": "O000172",
    "bernie_sanders": "S000033",
    "chuck_schumer": "S000148",
    "elizabeth_warren": "W000817",
    "ron_wyden": "W000779",
}
```

Lookup tool:
- https://bioguide.congress.gov/search
- Search by name → get permanent bioguide ID
- Example: "Ocasio-Cortez, Alexandria" → O000172

## Related Documentation

- [ENRICHMENT_JOB.md](./ENRICHMENT_JOB.md) - Action enrichment process
- [NORMALIZATION_RULES.md](./NORMALIZATION_RULES.md) - Text normalization rules
- Congress.gov API v3 docs: https://api.congress.gov/

## Summary

The Ground Truth Rail solves the fundamental problem that **press releases optimize for constituents, not data extraction**. By using authoritative Congress.gov API data:

1. We know EXACTLY which bills each member touched (100% accurate)
2. We dramatically reduce false positives (only match actual activity)
3. We eliminate dependency on unreliable text extraction
4. We use the canonical government identifier (`bioguide_id`)

**Two separate rails, two separate purposes:**
- Claims rail: What they SAY (press releases)
- Ground truth rail: What they DID (Congress.gov API)

Both rails use `bioguide_id` as the immutable join key.
