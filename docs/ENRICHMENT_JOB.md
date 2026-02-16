# Enrichment Job Implementation

## ✅ Completed Implementation

### 1. Input Set (What Bills to Enrich)

**Implementation**: `get_bills_to_enrich()` in [jobs/enrich_bills.py](jobs/enrich_bills.py)

Pragmatic scope (in priority order):
1. ✅ Bills in `actions` table (evidence for claims)
2. ✅ Bills not yet in `Bill` table
3. ✅ Bills with no `BillAction` timeline
4. 🔄 Optional: Staleness check (commented out, easy to enable)

```python
# Get all bills from Action table (evidence)
action_bills = db.query(
    Action.bill_congress,
    Action.bill_type,
    Action.bill_number
).filter(...).distinct().all()

# Filter to bills needing enrichment
if not existing_bill:
    should_enrich = True
elif action_count == 0:
    should_enrich = True
```

### 2. Execution Steps Per Bill

**Implementation**: `enrich_bill()` in [jobs/enrich_bills.py](jobs/enrich_bills.py)

Per-bill workflow:
1. ✅ Fetch bill detail from Congress.gov API
2. ✅ Upsert `Bill` summary (title, policy_area, etc.)
3. ✅ Upsert `BillAction` rows (complete timeline)
4. ✅ Compute derived fields:
   - Latest action date/text (max by date)
   - Status bucket (rule-based)
5. ✅ Mark `bill.updated_at = datetime.utcnow()`

```python
# 1. Fetch
bill_data = fetch_bill_details(congress, bill_type, bill_number)

# 2. Upsert Bill summary
bill = upsert_bill(congress, bill_type, bill_number, bill_data, db)

# 3. Ingest BillAction timeline
actions_inserted = ingest_bill_actions(bill.bill_id, congress, bill_type, bill_number, db)

# 4. Compute status bucket
bill_actions = db.query(BillAction).filter(BillAction.bill_id == bill.bill_id).all()
bill.status_bucket = compute_status_bucket(bill_actions)

# 5. Mark updated
bill.updated_at = datetime.utcnow()
```

### 3. Batch Strategy

**Implementation**: `run_enrichment_batch()` in [jobs/enrich_bills.py](jobs/enrich_bills.py)

Batch processing features:
- ✅ Chunk bills (configurable: 50-200 per run)
- ✅ Sleep/backoff for rate limits (0.3s between bills, 2s every 10)
- ✅ Detailed logging per bill
- ✅ Track success/failure counts
- ✅ Status bucket distribution

```bash
# Usage
python jobs/enrich_bills.py 100  # Enrich 100 bills
python jobs/enrich_bills.py 50   # Enrich 50 bills
python jobs/enrich_bills.py      # Default: 100 bills
```

**Logging Output**:
```
[1/20] HR5967-119
  └─ Fetching from Congress.gov...
  └─ ✅ Success
     ├─ Actions inserted: 2
     └─ Status: in_committee

[10/20] HR3243-119
  └─ Fetching from Congress.gov...
  └─ ✅ Success
     ├─ Actions inserted: 2
     └─ Status: in_committee

  ⏸️  Pausing 2s after 10 bills...
```

**Summary Stats**:
```
======================================================================
ENRICHMENT SUMMARY
======================================================================
Total bills processed: 20
  ✅ Success: 20
  ❌ Failed: 0
  📊 Total actions inserted: 54

Status Distribution:
  - in_committee: 18
  - passed_senate: 2
```

---

## Status Bucket Rules

**Implementation**: `compute_status_bucket()` in [jobs/enrich_bills.py](jobs/enrich_bills.py)

Rule-based classification from action timeline:

| Status | Trigger Pattern |
|--------|----------------|
| `enacted` | "became public law" or "became law" |
| `to_president` | "presented to president" |
| `failed` | "vetoed" |
| `passed_both` | Passed House AND Passed Senate |
| `passed_senate` | "passed senate" or "agreed to in senate" |
| `passed_house` | "passed house" or "agreed to in house" |
| `in_committee` | "referred to" or "committee" |
| `introduced` | "introduced in" |
| `unknown` | No clear pattern |

**Validated Examples**:
- ✅ S 723 (119th): "Passed Senate without amendment" → `passed_senate`
- ✅ HR 7322 (119th): "Referred to Committee" → `in_committee`

---

## Deduplication Results

**Test Results**:
```
Total BillActions: 66
Unique dedupe_hashes: 66
Duplicates prevented: 0
```

**How It Works**:
1. Compute hash: `sha1(bill_id + date + normalized_text)`
2. Check database before insert: `existing = db.query(BillAction).filter(BillAction.dedupe_hash == hash).first()`
3. Track within batch: `seen_hashes` set prevents same-batch duplicates
4. Database constraint: `UNIQUE` on `dedupe_hash` column

---

## Coverage Report

**Current State** (after enriching 26 bills):

```
📋 Bill Table:
  Total bills: 26
  With status_bucket: 25 (96.2%)
  With policy_area: 23 (88.5%)

📅 BillAction Table:
  Total actions: 66
  Bills with actions: 26
  Avg actions/bill: 2.5

🎯 Action Table (Evidence):
  Total actions with bills: 1516

📊 Status Distribution:
  - in_committee: 23
  - passed_senate: 2
  - NULL: 1
```

**Remaining Work**:
- 1490 bills still need enrichment (1516 - 26)
- Can be processed in batches: `python jobs/enrich_bills.py 100`

---

## Rate Limiting Strategy

**Configuration**:
- Base delay: 0.3s between bills
- Batch pause: 2s after every 10 bills
- Exponential backoff: Built into `fetch_bill_details()` (retries with 0.5s, 1s, 2s, 4s, 8s)

**Estimates**:
- 100 bills: ~30s (0.3s × 100) + ~20s (10 × 2s) = **~50s**
- 500 bills: ~150s + ~100s = **~4min**
- 1000 bills: ~300s + ~200s = **~8min**

---

## Files Created/Modified

1. **jobs/enrich_bills.py** (NEW)
   - Complete enrichment pipeline
   - Batch processing with rate limiting
   - Status bucket computation
   - Coverage reporting

2. **utils/normalization.py** (NEW)
   - `normalize_bill_id()`: Deterministic format
   - `compute_action_dedupe_hash()`: SHA1 deduplication
   - `extract_chamber_from_action()`: Conservative extraction
   - `extract_committee_from_action()`: Conservative extraction

3. **jobs/enrich_actions.py** (UPDATED)
   - `upsert_bill()`: Creates/updates Bill records
   - `ingest_bill_actions()`: Fetches timeline with dedupe
   - Imports normalization utilities

4. **connectors/congress.py** (UPDATED)
   - Uses normalization during ingestion
   - Creates Bill + BillAction during initial ingest

5. **models/database.py** (UPDATED)
   - Added `Bill` table
   - Added `BillAction` table

---

## Usage Examples

### Basic Enrichment
```bash
# Enrich 50 bills
python jobs/enrich_bills.py 50

# Enrich 200 bills
python jobs/enrich_bills.py 200

# Show coverage only (no enrichment)
python -c "from jobs.enrich_bills import verify_enrichment_coverage; verify_enrichment_coverage()"
```

### Check Specific Bill
```python
from models.database import SessionLocal, Bill, BillAction

db = SessionLocal()
bill = db.query(Bill).filter(Bill.bill_id == 's723-119').first()
print(f"Status: {bill.status_bucket}")
print(f"Policy: {bill.policy_area}")

actions = db.query(BillAction).filter(BillAction.bill_id == 's723-119').all()
print(f"Actions: {len(actions)}")
```

### Incremental Enrichment
```bash
# Run daily cron job to catch new bills
0 2 * * * cd /app && python jobs/enrich_bills.py 100
```

---

## Design Principles

1. **Pragmatic Scope**: Start with bills in evidence table
2. **Idempotent**: Re-running doesn't create duplicates
3. **Rate Limited**: Respects API limits with sleep/backoff
4. **Transparent**: Detailed per-bill logging
5. **Defensive**: Computes status from actions (not metadata)
6. **Incremental**: Batch size configurable for incremental runs
