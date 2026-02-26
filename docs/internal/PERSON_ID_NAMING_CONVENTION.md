# Person ID Naming Convention

## Current State (Inconsistent)
- `aoc` - short handle
- `bernie_sanders` - first_last  
- `elizabeth_warren` - first_last

## Decision Required

### Option A: Short Handles (Recommended)
**Pattern:** Recognizable short form, typically surname or common nickname

**Advantages:**
- Concise CLI commands: `--person-id warren`
- Easier to type and remember
- Matches common political discourse (people say "Warren", not "Elizabeth Warren")
- Database keys are shorter

**Examples:**
```
aoc → aoc (already established nickname)
bernie_sanders → sanders
elizabeth_warren → warren
katie_porter → porter
adam_schiff → schiff
```

**Migration needed:** Rename `bernie_sanders` → `sanders`, `elizabeth_warren` → `warren`

### Option B: first_last Everywhere
**Pattern:** firstname_lastname consistently

**Advantages:**
- Unambiguous (no conflicts like "johnson" for Mike vs Ron)
- Matches database convention (display_name field)
- No special cases for people with established nicknames

**Examples:**
```
aoc → alexandria_ocasio_cortez (breaks existing nickname)
bernie_sanders → bernie_sanders (keep)
elizabeth_warren → elizabeth_warren (keep)
katie_porter → katie_porter
adam_schiff → adam_schiff
```

**Migration needed:** Rename `aoc` → `alexandria_ocasio_cortez`

## Recommendation: **Option A (Short Handles)**

**Rationale:**
1. Political context: People refer to politicians by surname in casual discourse
2. CLI ergonomics: `--person-id warren` is better UX than `--person-id elizabeth_warren`
3. AOC precedent: We already have a short handle that works perfectly
4. Collision handling: Add middle initial if needed (e.g., `mike_johnson_la` vs `ron_johnson_wi`)

**Disambiguation strategy for collisions:**
- Primary: Use surname alone (`warren`, `sanders`, `schiff`)
- Collision: Add state code (`mike_johnson_la`, `ron_johnson_wi`)
- Special cases: Keep established nicknames (`aoc`, not `ocasio_cortez`)

## Migration Plan

**Phase 1: Database migration**
```sql
UPDATE claims SET person_id = 'sanders' WHERE person_id = 'bernie_sanders';
UPDATE claims SET person_id = 'warren' WHERE person_id = 'elizabeth_warren';
UPDATE claim_evaluations SET claim_id = (SELECT id FROM claims WHERE person_id = 'sanders' ...);
-- Similar for tracked_members, etc.
```

**Phase 2: Update references**
- manage_members.py examples
- Documentation
- Acceptance reports
- Checklists

**Phase 3: Validation**
- Run quality gate
- Verify claim counts unchanged
- Test member management commands

## Implementation Status
- [x] Decision approved - **Option B (first_last) selected**
- [x] Database migration script created - `migrate_person_ids.py`
- [x] Migration executed - **2026-02-05**
- [x] Documentation updated
- [x] Quality gate verified - `python scripts\pilot_baseline.py` passed

## Migration Results (2026-02-05)

**Executed migration:**
```
aoc → alexandria_ocasio_cortez
  - 4 claims updated
  - 1 tracked_members updated
  - 37 person_bills updated
```

**Verification:**
- ✅ Total claims unchanged: 18
- ✅ Old person_id 'aoc' removed
- ✅ All FK references updated
- ✅ Baseline snapshot successful

**Alias support added:**
- CLI accepts short handles: `--person-id aoc` resolves to `alexandria_ocasio_cortez`
- Implemented in `manage_members.py` via `PERSON_ID_ALIASES` and `resolve_person_id()`

**Files modified:**
1. `migrate_person_ids.py` (NEW) - Migration script with verification
2. `manage_members.py` - Alias resolution added
3. Database tables: claims, tracked_members, person_bills

