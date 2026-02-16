# Normalization Rules Implementation

## Summary

Added normalization utilities and updated Bill/BillAction ingestion to prevent chaos from inconsistent Congress.gov API formatting.

## 1. Stable Bill Identifier

**Rule**: `bill_id = "{bill_type}{bill_number}-{congress}"`

**Implementation**: `utils/normalization.py::normalize_bill_id()`

```python
def normalize_bill_id(congress: int, bill_type: str, bill_number: int) -> str:
    """
    Create stable, deterministic bill identifier.
    
    Format: {bill_type}{bill_number}-{congress}
    Examples: hr12-118, s42-117, hjres5-119
    """
    normalized_type = str(bill_type).lower().strip()
    return f"{normalized_type}{bill_number}-{congress}"
```

**Examples**:
- HR 2670 (118th) → `hr2670-118`
- S 42 (117th) → `s42-117`
- HJRES 5 (119th) → `hjres5-119`
- Mixed case "Hr 123" → `hr123-118`

**Usage**:
- `jobs/enrich_actions.py`: Creates Bill records with normalized bill_id
- `connectors/congress.py`: Creates Bill records during ingestion
- All bill_id references use lowercase, consistent format

---

## 2. Action Deduplication

**Rule**: `hash = sha1(bill_id + action_date + normalized(action_text))`

**Implementation**: `utils/normalization.py::compute_action_dedupe_hash()`

```python
def compute_action_dedupe_hash(bill_id: str, action_date: str, action_text: str) -> str:
    """
    Compute SHA1 hash for action deduplication.
    
    Combines: bill_id | action_date | normalized_text
    Returns: 40-character SHA1 hex digest
    """
    normalized_text = normalize_action_text(action_text)
    key = f"{bill_id}|{action_date}|{normalized_text}"
    return hashlib.sha1(key.encode('utf-8')).hexdigest()
```

**Text Normalization**:
```python
def normalize_action_text(text: str) -> str:
    """
    - Lowercase
    - Strip extra whitespace (collapse to single space)
    - Remove trailing periods
    """
    normalized = text.lower()
    normalized = re.sub(r'\s+', ' ', normalized)
    normalized = normalized.strip().rstrip('.')
    return normalized
```

**Deduplication Behavior**:
- ✅ Same action with different punctuation → Same hash
- ✅ Same action with different case → Same hash
- ❌ Different date → Different hash
- Database enforces `UNIQUE` constraint on `dedupe_hash`

**Tested Examples**:
| Input | Hash Match |
|-------|------------|
| "Introduced in House" vs "Introduced in House." | ✅ Same |
| "Introduced in House" vs "INTRODUCED IN HOUSE" | ✅ Same |
| "Introduced in House" (2024-01-15) vs (2024-01-16) | ❌ Different |

**Usage**:
- `jobs/enrich_actions.py::ingest_bill_actions()`: Batch dedupe with `seen_hashes` set
- `connectors/congress.py::process_bill_item()`: Single action dedupe
- INSERT OR IGNORE behavior via try/catch + unique constraint

---

## 3. Chamber/Committee Extraction (Conservative)

**Rule**: Only extract when explicitly provided, never hallucinate from text

### Chamber Extraction

**Implementation**: `utils/normalization.py::extract_chamber_from_action()`

**Conservative Rules**:
1. Check `action_code` first (most reliable):
   - `Intro-H`, `H11100`, `H12410` → "House"
   - `Intro-S`, `S11100` → "Senate"
2. Check action_text for explicit phrases ONLY:
   - "Introduced in House" → "House"
   - "Passed Senate" → "Senate"
3. If unclear → `None` (don't guess)

**Examples**:
| action_code | action_text | Result |
|-------------|-------------|--------|
| `Intro-H` | "Introduced in House" | "House" |
| `None` | "Introduced in House" | "House" |
| `None` | "Some generic action" | `None` |
| `H11100` | "Referred to Committee" | "House" |

### Committee Extraction

**Implementation**: `utils/normalization.py::extract_committee_from_action()`

**Conservative Rules**:
1. Check `raw_json["committee"]["name"]` first (most reliable)
2. Check `raw_json["committees"][0]["name"]` if array
3. Parse action_text ONLY for explicit pattern:
   - `"referred to the Committee on X"` → Extract X
   - Must be > 3 characters (avoid generic terms)
4. If unclear → `None` (don't hallucinate)

**Examples**:
| Input | Result |
|-------|--------|
| "Referred to the Committee on Ways and Means" | "Ways and Means" |
| "Referred to the Committee on Energy and Commerce" | "Energy and Commerce" |
| "Some generic action" | `None` |
| "Referred to Ways and Means" (no "Committee on") | `None` |

---

## Validation Results

### Normalization Tests
```
✅ Bill ID: hr2670-118, s42-117, hjres5-119 (all lowercase)
✅ Dedupe: Same hash for "Introduced in House" vs "INTRODUCED IN HOUSE."
✅ Chamber: Extracted "House" from Intro-H code and explicit text
✅ Committee: Extracted "Ways and Means" from "Referred to Committee on" pattern
```

### Enrichment Test
```
Bill: hr7322-119
  ✅ 2 unique actions ingested
  ✅ Batch dedupe prevented duplicates within same fetch
  ✅ Chamber: Both actions = "House"
  ✅ Committee: "Armed Services Committee" extracted from action 1
```

### Database State
```
Bills: 1 (bill_id = hr7322-119)
BillActions: 2 (unique dedupe_hash, no duplicates)
API: ✅ /people/walkinshaw/performance still works
```

---

## Files Modified

1. **utils/normalization.py** (NEW)
   - `normalize_bill_id()`: Deterministic bill identifier
   - `normalize_action_text()`: Text cleanup for deduplication
   - `compute_action_dedupe_hash()`: SHA1 hash for uniqueness
   - `extract_chamber_from_action()`: Conservative chamber detection
   - `extract_committee_from_action()`: Conservative committee detection

2. **jobs/enrich_actions.py**
   - `upsert_bill()`: Creates/updates Bill with normalized bill_id
   - `ingest_bill_actions()`: Fetches timeline, dedupes with `seen_hashes` set
   - `enrich_action()`: Populates Bill + BillAction tables

3. **connectors/congress.py**
   - `process_bill_item()`: Uses `normalize_bill_id()`, creates Bill + BillAction during ingestion
   - Stores normalized bill_id in Bill table
   - Deduplicates actions before insert

4. **models/database.py**
   - Added `Bill` table (bill_id PK, normalized format)
   - Added `BillAction` table (dedupe_hash unique constraint)

---

## Design Principles

1. **Deterministic**: Same bill always gets same bill_id
2. **Conservative**: Don't hallucinate committee/chamber data
3. **Explicit**: Only extract when data is clearly provided
4. **Idempotent**: Re-running enrichment doesn't create duplicates
5. **Defensible**: Every extraction has a clear rule we can justify
