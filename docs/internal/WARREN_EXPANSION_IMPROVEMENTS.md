# Warren Expansion - Post-Feedback Improvements

Date: 2026-02-05 (Updated after matchability feedback)

## What Changed

### 1. ✅ Matchability Diagnostic (NEW)
**File:** `scripts/claim_matchability.py`

**Purpose:** Quantify bill-mention density to distinguish "matcher broken" from "claims don't mention bills"

**Metrics measured:**
- Bill ID mentions (H.R./S. ####): Pattern `\b(?:H\.?R\.?|S\.?)\s?\d{1,4}\b`
- Act title mentions: Multi-word phrases ending in "Act"
- URL act slugs: Bill names in source URL paths
- Overall matchability: % of claims with ANY bill signal

**Assessment thresholds:**
- 50%+: HIGH - good pilot validation opportunity
- 20-50%: MODERATE - acceptable validation
- <20%: LOW - limited validation, document reason
- 0%: VERY LOW - reconsider sources

**Warren results (measured):**
```
Bill ID mentions: 0.0% (0/12)
Act title mentions: 8.3% (1/12) - "Public Integrity Act"
URL act slugs: 8.3% (1/12) - false positive
Overall matchability: 16.7% (2/12)
Assessment: ⚠️ LOW - expect <20% match rate
```

**Comparison with baseline:**
- AOC: 75% matchable (3/4 from URL slugs) → 75% actual match rate ✅
- Bernie: 0% matchable → 0% actual match rate ✅
- Warren: 16.7% matchable → 0% actual match rate ⚠️

**Key insight:** Warren's 0% match rate is expected given low matchability (16.7%), but not optimal for matcher validation.

---

### 2. ✅ Updated Acceptance Report
**File:** `WARREN_ACCEPTANCE_REPORT.md`

**Changes:**
- Added matchability diagnostic section with measured percentages
- Downgraded from "APPROVED" to "CONDITIONALLY APPROVED"
- Noted that low matchability limits matcher validation
- Added source improvement recommendations:
  - Target Warren's "Legislation" page if available
  - Filter press releases to "legislation" category only
  - Exclude investigation/oversight content

**New acceptance criteria:**
- False positives = 0 (still PASSED ✅)
- Matchability documented (now included ✅)
- Evidence explainability (maintained ✅)

---

### 3. ✅ Enhanced Onboarding Checklist
**File:** `MEMBER_ONBOARDING_CHECKLIST.md`

**Step 5 additions:**
- Added matchability check to quality gate
- Record metrics: bill-id %, act-title %, URL-act %, overall %
- Guideline: If <20%, evaluate sources; doesn't fail member but limits validation

**Step 7 additions:**
- Updated decision criteria to require matchability documentation
- Added CONDITIONAL APPROVE status for 0 FP + low matchability
- Note: Low matchability doesn't fail member but should influence source selection

---

### 4. ✅ Enhanced Baseline Snapshot
**File:** `scripts/pilot_baseline.py`

**Added metrics:**
- Overall matchability (27.8% across all 18 claims)
- Per-member matchability breakdown:
  - aoc: 75.0%
  - bernie_sanders: 0.0%
  - elizabeth_warren: 16.7%

**Impact:** Match rate now has context. 16.7% overall match rate makes sense given 27.8% matchability.

---

### 5. ✅ Person ID Naming Inconsistency Documented
**File:** `PERSON_ID_NAMING_CONVENTION.md`

**Issue identified:**
- `aoc` (short handle)
- `bernie_sanders` (first_last)
- `elizabeth_warren` (first_last)
- Inconsistency will cause join issues, CLI confusion, dashboard problems

**Recommended solution:** Option A (Short Handles)
- `aoc` → keep
- `bernie_sanders` → `sanders`
- `elizabeth_warren` → `warren`

**Rationale:**
- CLI ergonomics: `--person-id warren` better than `--person-id elizabeth_warren`
- Political discourse: People say "Warren" not "Elizabeth Warren"
- AOC precedent: Already have successful short handle

**Migration plan documented** (awaiting approval before execution)

---

## Updated Baseline Expectations

**Previous (naive):**
- Match rate: 16.7%
- Assessment: "Low but acceptable"

**Now (measured):**
- Match rate: 16.7% (3/18)
- Matchability: 27.8% overall
  - AOC: 75% matchable → 75% matched ✅
  - Bernie: 0% matchable → 0% matched ✅
  - Warren: 16.7% matchable → 0% matched (within expected range given low signal)
- **Assessment:** System working correctly, but Warren sources suboptimal for pilot validation

---

## Next Member Selection Criteria

**OLD (fame-based):** "Warren is high-visibility progressive"

**NEW (bill-language-density):** Target members with:
1. Frequent bill introductions ("introduced S. ####")
2. Named legislative packages ("reintroduced the ___ Act")
3. Vote announcements ("voted for H.R. ####")
4. Committee leadership (push named bills through process)

**Good targets:**
- Senate/House leadership
- Committee chairs (especially Ways & Means, Appropriations)
- Members with "Legislation" pages listing introduced bills

**Next recommended (data-driven):**
1. Check their website for "Bills I've Introduced" page
2. Sample 3-5 recent press releases for bill-mention density
3. Predict matchability BEFORE ingestion
4. Only proceed if predicted matchability >30%

---

## Operational Improvements Delivered

1. **Matchability as first-class metric** - Now tracked alongside match rate
2. **Source selection guidance** - Pick bill-focused pages, not investigations
3. **Acceptance criteria refined** - 0 FP + matchability documented
4. **Baseline expectations** - Low match rate OK if matchability is low
5. **Naming convention** - Decision framework for person_id consistency

---

## Warren Status Summary

**Acceptance:** CONDITIONALLY APPROVED ⚠️
- False positives: 0 ✅
- Matchability: 16.7% (LOW) ⚠️
- System validation: Limited (did not prove matcher beyond AOC baseline)

**Recommendation before full-scale Warren ingestion:**
1. Research warren.senate.gov/legislation page
2. Add as source if bill-focused
3. Re-run ingestion (10 pages)
4. Expect matchability to increase to 40-60%
5. This will provide better matcher validation

**Current status:** Warren approved for pilot with noted limitations. Proceed to next member with better predicted matchability.
