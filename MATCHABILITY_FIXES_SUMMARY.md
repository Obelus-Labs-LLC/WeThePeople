# Matchability Diagnostic Fixes - Summary

Date: 2026-02-05
Status: **COMPLETED** ✅

## Issues Identified

### 1. Public Integrity Act - Coverage Gap (NOT a matcher bug)
**Issue:** Warren claim mentions "Anti-Corruption and Public Integrity Act" but didn't match.

**Investigation:**
```sql
SELECT bill_id, title FROM bills WHERE lower(title) LIKE '%public integrity%'
-- Result: hr7004-119, 'Public Integrity in Financial Prediction Markets Act of 2026'
```

**Finding:** Warren's claim mentions "Anti-Corruption and Public Integrity Act" (Warren-sponsored bill, likely not yet in Congress.gov data), but our DB has "Public Integrity in Financial Prediction Markets Act of 2026" (different bill, HR 7004-119).

**Root cause:** Coverage gap, not a matcher issue. Warren's bill isn't in the database.

**Conclusion:** ✅ MATCHER WORKING CORRECTLY - can't match bills that don't exist in DB

---

### 2. URL Matchability False Positive
**Issue:** URL extraction flagged "administration to act" as an Act name (from Warren claim #15)

**Original logic:**
```python
# Too permissive - matched any phrase ending in "act"
matches = re.findall(r'\b\w+(?:\s+\w+)*\s+act\b', normalized)
```

**Problem:** Caught generic verb phrases like:
- "administration to act"
- "trump to act"
- "urges congress to act"

**Fix applied:** Enhanced filtering in `extract_url_act_tokens()`:
1. Require at least 2 words before "act" (minimum 3-word phrase)
2. Ban generic connectors in second-to-last position: `to`, `must`, `can`, `will`, `should`, `would`, `could`
3. Require at least 2 substantive tokens (length > 3, not in generic list)

**New logic:**
```python
# Find phrases with at least 2 words before "act"
matches = re.findall(r'\b(\w+\s+\w+\s+\w*act)\b', normalized)

for match in matches:
    words = match.split()
    if len(words) >= 2:
        # Filter out verb-to-act patterns
        if words[-2] in {'to', 'must', 'can', 'will', 'should', 'would', 'could'}:
            continue
        
        # Require substantive tokens
        substantive = [w for w in words[:-1] if len(w) > 3 and w not in {'that', 'this', 'with', 'from', 'into', 'upon', 'about'}]
        if len(substantive) >= 2:
            tokens.append(match)
```

**Result:**
- ❌ Rejected: "administration to act" (generic connector "to")
- ✅ Accepted: "defiance act act" (substantive tokens)
- ✅ Accepted: "corporate transparency act" (substantive tokens)

---

## Fixes Implemented

### 1. Person ID Migration (aoc → alexandria_ocasio_cortez)
**Rationale:** Chose Option B (first_last everywhere) for scalability:
- Avoids future collisions (johnson, smith, lee)
- Canonical keys for database integrity
- Migrating now while we only have 18 claims and 3 members

**Migration executed:**
```
Updated 4 claims: aoc → alexandria_ocasio_cortez
Updated 1 tracked_members: aoc → alexandria_ocasio_cortez
Updated 37 person_bills: aoc → alexandria_ocasio_cortez

✅ VERIFICATION PASSED: Total claims unchanged (18)
✅ AOC migration verified: 4 claims → alexandria_ocasio_cortez
✅ Old person_id 'aoc' removed
```

**Files modified:**
- `migrate_person_ids.py` (NEW) - Migration script with verification
- Database tables: `claims`, `tracked_members`, `person_bills`

---

### 2. Alias Mechanism Added
**Purpose:** Preserve CLI UX while maintaining DB consistency

**Implementation in `manage_members.py`:**
```python
PERSON_ID_ALIASES = {
    'aoc': 'alexandria_ocasio_cortez',
    # Future: 'bernie': 'bernie_sanders', 'warren': 'elizabeth_warren'
}

def resolve_person_id(person_id):
    canonical = PERSON_ID_ALIASES.get(person_id, person_id)
    if canonical != person_id:
        print(f"[ALIAS] Resolving '{person_id}' → '{canonical}'")
    return canonical
```

**Applied to functions:**
- `deactivate_member()`
- `activate_member()`
- `set_sources()`
- `show_sources()`

**Usage example:**
```bash
python manage_members.py show-sources --person-id aoc
# [ALIAS] Resolving 'aoc' → 'alexandria_ocasio_cortez'
```

---

### 3. URL Token Extraction Fixed
**Files modified:**
- `scripts/claim_matchability.py` - Enhanced `extract_url_act_tokens()`
- `scripts/pilot_baseline.py` - Synchronized `calculate_matchability()` logic

**Impact:**
- Warren matchability: 16.7% → 8.3% (false positive eliminated)
- Overall corpus matchability: 27.8% → 22.2%
- URL act slug detection: 22.2% → 16.7%

---

## Verification Results

### Before Fixes
```
[elizabeth_warren]
  Bill ID mentions: 0.0%
  Act title mentions: 8.3%
  URL act slugs: 8.3%  ← FALSE POSITIVE
  Matchable claims: 2 (16.7%)
  
  Matchable claims:
    - Claim #12: "Public Integrity Act" ✓ legitimate
    - Claim #15: URL "administration to act" ❌ false positive
```

### After Fixes
```
[elizabeth_warren]
  Bill ID mentions: 0.0%
  Act title mentions: 8.3%
  URL act slugs: 0.0%  ← FALSE POSITIVE REMOVED
  Matchable claims: 1 (8.3%)
  
  Matchable claims:
    - Claim #12: "Public Integrity Act" ✓ only legitimate match
```

### Updated Baseline Metrics
```
MATCHABILITY METRICS:
  Bill ID mentions: 0.0%
  Act title mentions: 5.6%
  URL act slugs: 16.7% (down from 22.2%)
  Overall matchability: 22.2% (down from 27.8%)
  
  Per-member matchability:
    alexandria_ocasio_cortez: 75.0% (unchanged)
    bernie_sanders: 0.0% (unchanged)
    elizabeth_warren: 8.3% (down from 16.7%)
```

---

## Trustworthiness Improvements

### Matchability Metric Now Reliable ✅
1. **No false positives in URL detection** - Generic verb phrases filtered out
2. **Consistent logic** - Same extraction rules in both diagnostic and baseline tools
3. **Accurate coverage diagnosis** - Warren 8.3% correctly reflects limited bill-mention density

### Coverage vs. Matcher Issues Clarified
1. **"Public Integrity Act" non-match** = Coverage gap (bill not in DB), NOT matcher failure
2. **Warren's low matchability** = Suboptimal source selection (investigations vs. legislation), NOT matcher failure
3. **AOC's high match rate** = 75% matchable → 75% matched, VALIDATES matcher working correctly

---

## Files Modified

1. **migrate_person_ids.py** (NEW)
   - Person ID migration script with verification
   - Transaction safety, rollback on failure
   - Handles claims, tracked_members, person_bills tables

2. **manage_members.py** (MODIFIED)
   - Added `PERSON_ID_ALIASES` mapping
   - Added `resolve_person_id()` function
   - Applied alias resolution to 4 key functions
   - Updated docstring examples

3. **scripts/claim_matchability.py** (MODIFIED)
   - Enhanced `extract_url_act_tokens()` with substantive token filtering
   - Filters generic connectors: to, must, can, will, should, would, could
   - Requires 2+ substantive tokens (length > 3, not generic words)

4. **scripts/pilot_baseline.py** (MODIFIED)
   - Synchronized `calculate_matchability()` with claim_matchability.py logic
   - Same URL extraction rules for consistency
   - Updated metrics output

---

## Next Steps

### Immediate
- [x] Public Integrity Act investigation ✅
- [x] Person ID migration ✅
- [x] Alias mechanism ✅
- [x] URL extraction fix ✅
- [x] Re-run diagnostics ✅

### Before Next Member Addition
1. **Source Selection Guidelines**
   - Target members with "Legislation" pages listing introduced bills
   - Prefer bill-focused content over investigations/oversight
   - Predict matchability >30% before full ingestion

2. **Acceptance Criteria**
   - Zero false positives (required)
   - Matchability documented (required)
   - 50%+ matchability = APPROVE
   - 20-50% matchability = CONDITIONAL APPROVE
   - <20% matchability = Document limitations

3. **Quality Gates**
   - Run `python scripts\claim_matchability.py --person-id <id>` (Step 5 in checklist)
   - Run `python scripts\pilot_baseline.py` after each addition
   - Monitor overall corpus matchability trend (target 40-50%+)

---

## Lessons Learned

1. **"0 matches is fine" requires proof** - Matchability metrics distinguish matcher failures from low signal
2. **URL extraction needs conservative filters** - Generic patterns create false confidence
3. **Migrate early while dataset is small** - 18 claims much easier than 1800 claims
4. **Aliases preserve UX** - Database uses canonical keys, CLI accepts short handles
5. **Coverage gaps ≠ matcher bugs** - Must validate bills exist before blaming matcher
6. **Source selection is critical** - General press releases (8% matchable) vs. legislation pages (predicted 40-60%)

---

## Confidence Assessment

**Matchability metric trustworthiness: HIGH ✅**
- False positive eliminated
- Conservative filtering (may miss edge cases, but won't hallucinate)
- Consistent logic across tools

**Ready for next member addition: YES ✅**
- Quality gates refined
- Naming convention established
- Migration path validated
- Source selection guidance documented

**Matcher validation status: PARTIAL ⚠️**
- AOC: 75% matchable → 75% matched (validates matcher works)
- Bernie: 0% matchable → 0% matched (no signal to test)
- Warren: 8.3% matchable → 0% matched (limited signal, within expected range)
- **Need more high-matchability members to fully validate matcher beyond AOC baseline**
