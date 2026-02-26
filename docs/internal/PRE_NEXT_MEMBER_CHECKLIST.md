# Pre-Next-Member Checklist - COMPLETED ✅

Date: 2026-02-05
Status: **READY FOR NEXT MEMBER** ✅

## What Was Fixed

### 🔧 Bug 1: Public Integrity Act Coverage Gap
**Issue:** Warren claim mentioned "Public Integrity Act" but didn't match

**Investigation:**
```sql
-- Found: hr7004-119, 'Public Integrity in Financial Prediction Markets Act of 2026'
-- Warren mentioned: "Anti-Corruption and Public Integrity Act" (different bill)
```

**Root cause:** Coverage gap - Warren's bill not in Congress.gov data yet

**Conclusion:** ✅ MATCHER WORKING CORRECTLY (can't match bills not in DB)

---

### 🔧 Bug 2: URL Matchability False Positive
**Issue:** "administration to act" incorrectly flagged as Act name

**Fix:** Enhanced `extract_url_act_tokens()` to filter generic patterns:
- Require 2+ words before "act"
- Ban generic connectors: `to`, `must`, `can`, `will`, `should`, `would`, `could`
- Require 2+ substantive tokens (length > 3, not generic words)

**Result:**
- ❌ Rejected: "administration to act", "trump to act", "urges congress to act"
- ✅ Accepted: "defiance act", "corporate transparency act"

**Files modified:**
- `scripts/claim_matchability.py`
- `scripts/pilot_baseline.py` (synchronized logic)

**Impact:**
- Warren matchability: 16.7% → 8.3% (false positive eliminated)
- Overall corpus: 27.8% → 22.2%

---

### 🔧 Migration: Person ID Naming Convention
**Decision:** Option B (first_last everywhere) selected

**Rationale:**
- Scales better for collisions (johnson, smith, lee)
- Canonical keys for DB integrity
- Migrating now (18 claims) easier than later (1800 claims)

**Executed:**
```
aoc → alexandria_ocasio_cortez
  - 4 claims updated
  - 1 tracked_members updated
  - 37 person_bills updated
  - Verification: PASSED ✅
```

**Alias support added:**
```python
# manage_members.py
PERSON_ID_ALIASES = {
    'aoc': 'alexandria_ocasio_cortez'
}

# CLI still accepts short handles:
python manage_members.py show-sources --person-id aoc
# [ALIAS] Resolving 'aoc' → 'alexandria_ocasio_cortez'
```

**Functions with alias support:**
- `deactivate_member()`
- `activate_member()`
- `set_sources()`
- `show_sources()`

---

## Verification Results

### Matchability Metrics (After Fixes)
```
Overall corpus:
  Bill ID mentions: 0.0%
  Act title mentions: 5.6%
  URL act slugs: 16.7% (down from 22.2%)
  Overall matchability: 22.2% (down from 27.8%)

Per-member:
  alexandria_ocasio_cortez: 75.0% ✅
  bernie_sanders: 0.0%
  elizabeth_warren: 8.3% (down from 16.7%)
```

### Matcher Validation Status
- **AOC:** 75% matchable → 75% matched ✅ **MATCHER WORKS**
- **Bernie:** 0% matchable → 0% matched ✅ (no signal to test)
- **Warren:** 8.3% matchable → 0% matched ⚠️ (very limited signal)

**Conclusion:** Need more high-matchability members (50%+) to fully validate matcher beyond AOC.

---

## Files Modified

1. **migrate_person_ids.py** (NEW)
   - Safe migration with transaction rollback
   - Updates claims, tracked_members, person_bills
   - Verification with count checks

2. **manage_members.py** (MODIFIED)
   - Added `PERSON_ID_ALIASES` mapping
   - Added `resolve_person_id()` function
   - Applied to 4 key functions
   - Updated docstrings

3. **scripts/claim_matchability.py** (MODIFIED)
   - Enhanced URL extraction with substantive token filtering
   - Filters generic verb-to-act patterns
   - More conservative (fewer false positives)

4. **scripts/pilot_baseline.py** (MODIFIED)
   - Synchronized matchability calculation logic
   - Same URL extraction rules as diagnostic tool
   - Consistent metrics output

5. **PERSON_ID_NAMING_CONVENTION.md** (UPDATED)
   - Marked migration as COMPLETED
   - Added results and verification

6. **WARREN_ACCEPTANCE_REPORT.md** (UPDATED)
   - Corrected matchability: 16.7% → 8.3%
   - Added false positive fix note
   - Marked naming convention as RESOLVED

7. **MATCHABILITY_FIXES_SUMMARY.md** (NEW)
   - Comprehensive summary of both bugs
   - Before/after metrics
   - Lessons learned

8. **WARREN_EXPANSION_IMPROVEMENTS.md** (CREATED EARLIER)
   - Documents all post-Warren improvements
   - Updated baseline expectations

---

## Quality Gates Passed

✅ **Migration verification:**
- Total claims unchanged: 18
- Old person_id removed: aoc
- All FK references updated
- No data loss

✅ **Matchability diagnostics:**
- False positive eliminated
- Consistent logic across tools
- Conservative filtering (trustworthy)

✅ **Baseline snapshot:**
```bash
python scripts\pilot_baseline.py
# Database: 18 claims, 18 evaluations, 1516 actions, 1895 bills
# Match rate: 16.7% (3/18)
# Matchability: 22.2%
# Hash deduplication: ✓
```

✅ **Alias mechanism:**
```bash
python manage_members.py show-sources --person-id aoc
# [ALIAS] Resolving 'aoc' → 'alexandria_ocasio_cortez'
# Works correctly ✓
```

---

## Next Member Selection Criteria

### Required Characteristics
1. **Bill-mention density:** Target 50%+ matchability
2. **Source type:** Legislation-focused pages (not general press)
3. **Content patterns:** Bill introductions, vote announcements, named packages

### Recommended Candidates (Bill-Language Dense)

**Senate:**
1. **Ron Wyden** (Finance Chair, frequent sponsor)
   - Source: wyden.senate.gov/news/legislation
   - Predict 60%+ matchability (bill intro announcements)

2. **Elizabeth Warren** (retry with better sources)
   - Source: warren.senate.gov/legislation (if exists)
   - Current 8.3% → expected 40-60% with legislation page

3. **Amy Klobuchar** (frequent bipartisan sponsor)
   - Source: klobuchar.senate.gov/public/news-releases?type=legislation
   - Predict 50%+ matchability

**House:**
1. **Katie Porter** (detailed policy, bill citations)
   - Source: porter.house.gov/news + filter by "legislation"
   - Predict 60%+ matchability

2. **Ro Khanna** (tech policy, legislative activity)
   - Source: khanna.house.gov/media + filter by "bills"
   - Predict 50%+ matchability

**Leadership:**
1. **Chuck Schumer** (Minority Leader, bill announcements)
   - Source: schumer.senate.gov/newsroom/press-releases
   - Predict 40%+ matchability (leadership votes/packages)

### Validation Before Ingestion
```bash
# Step 1: Sample 5 recent press releases manually
# Count: How many mention specific bills (H.R./S. #### or Act names)?

# Step 2: If predicted matchability < 30%:
#   - Find alternative sources (legislation pages)
#   - OR defer member until better sources available

# Step 3: Only proceed if confident of 30%+ matchability
```

---

## Checklist for Next Member

### Before Ingestion
- [ ] Review MEMBER_ONBOARDING_CHECKLIST.md Steps 1-8
- [ ] Manually sample 5 press releases for bill-mention density
- [ ] Predict matchability (target 50%+)
- [ ] Identify legislation-focused source pages

### During Ingestion
- [ ] Create source config JSON
- [ ] Run scraper with dry-run first
- [ ] Verify extraction quality (no nav menus, modals)
- [ ] Check claim triggers capture relevant content

### After Ingestion
- [ ] Run matchability diagnostic (Step 5 - MANDATORY)
  ```bash
  python scripts\claim_matchability.py --person-id <member_id>
  ```
- [ ] Record metrics: bill ID %, act title %, URL slug %, overall %
- [ ] Run quality gate (Step 6)
  ```bash
  .\scripts\run_gate.ps1
  ```
- [ ] Run baseline snapshot
  ```bash
  python scripts\pilot_baseline.py
  ```
- [ ] Document results in acceptance report

### Decision Criteria (Step 7)
- **APPROVE:** 0 false positives + 50%+ matchability
- **CONDITIONAL APPROVE:** 0 false positives + 20-50% matchability
- **NEEDS REVIEW:** Any false positives OR <20% matchability without justification

---

## Confidence Assessment

### Trustworthy ✅
- Matchability metric: No false positives, conservative filtering
- Person ID convention: Consistent first_last, aliases for UX
- Migration: Safe execution, verified integrity
- Quality gates: All passing

### Partial Validation ⚠️
- Matcher tested thoroughly on AOC (75% → 75%)
- Matcher NOT YET tested on 50%+ matchability Senate member
- Need more high-signal members to confirm matcher handles:
  - Formal bill titles
  - Senate-style language
  - Named package legislation

### Ready for Next Member ✅
- All bugs fixed
- Naming convention established
- Migration completed
- Documentation updated
- Tools synchronized
- Quality gates passing

**Recommendation:** Add high-matchability member (50%+) next to validate matcher beyond AOC baseline.
