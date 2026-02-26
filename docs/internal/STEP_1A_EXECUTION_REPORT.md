# Step 1A Execution Report - BLOCKED

Date: 2026-02-05
Status: **BLOCKED - Matcher Regression Detected** 🚨

## What Was Attempted

Added 3 high-signal Senate members:
1. **Chuck Schumer** - 19 claims extracted
2. **Amy Klobuchar** - 0 claims (site returned 503)  
3. **Ron Wyden** - 7 claims extracted

**Total new claims:** 26  
**Total corpus:** 44 claims (18 original + 26 new)

## Critical Issue Discovered 🚨

**Matcher regression:** After running `recompute_evaluations.py`, ALL evaluations now show `tier='none'`, including the previously working AOC/DEFIANCE Act matches.

### Before Recompute
- AOC claims #2, #3, #4 matched HR3562-119 (DEFIANCE Act)
- Match rate: 16.7% (3/18)
- Tier: moderate

### After Recompute  
- **ALL 44 evaluations: tier='none'**
- Match rate: 0.0% (0/44)
- AOC claims no longer match DEFIANCE Act

### Evidence
- DEFIANCE Act (hr3562-119) still exists in database ✓
- Bill is enriched (needs_enrichment=0) ✓
- Claim #2 URL contains "defiance-act" ✓
- URL matching should work but isn't ❌

## Matchability Results (New Members)

### Chuck Schumer
- Claims: 19
- Matchability: **0.0%** ❌
- Bill ID mentions: 0/19
- Act title mentions: 0/19
- URL act slugs: 0/19

**Analysis:** All funding announcements ("secured $X for project Y"), not legislative claims. Recent 30 days had no bill introductions or votes.

### Ron Wyden
- Claims: 7
- Matchability: **0.0%** ❌
- Bill ID mentions: 0/7
- Act title mentions: 0/7
- URL act slugs: 0/7

**Analysis:** 
- Claim #42 says "introduced a pair of bills" but text cut off before bill numbers/Act names
- Other claims are funding/event announcements
- **Scraper limitation:** 100-word cap truncates bill details

### Updated Corpus Metrics
- Overall matchability: 9.1% (down from 22.2%)
- Per-member:
  - AOC: 75.0% (unchanged)
  - Bernie: 0.0%
  - **Schumer: 0.0%** (NEW)
  - Warren: 8.3%
  - **Wyden: 0.0%** (NEW)

## Root Cause Analysis

### Issue 1: Matcher Regression (CRITICAL)
Something in `recompute_evaluations.py` or the matching logic broke when processing 44 claims instead of 18. Possible causes:
1. Database schema issue (relationships not loading)
2. Matching algorithm change (unintentional)
3. Evidence scoring threshold change
4. Bill filtering logic changed

### Issue 2: Low Matchability (Expected but Validates Step 2 Need)
Even "high-signal" members (Schumer, Wyden) have 0% matchability because:
1. **Timing issue:** Last 30 days may not represent typical behavior
2. **Scraper limitation:** 100-word text cap truncates bill details
3. **Missing bill number extraction:** Claims mention bills but without numbers in extracted snippet
4. **Source selection:** Press releases include funding/events, not just legislation

### Issue 3: Klobuchar Site Unavailable
- 503 Service Unavailable error
- Can retry later

## Immediate Actions Required

### PRIORITY 1: Fix Matcher Regression 🚨
Before proceeding with Step 1, must restore matcher functionality.

**Debug steps:**
1. Check if `recompute_evaluations.py` changed recently
2. Compare matching logic before/after
3. Test matcher on single AOC claim manually
4. Verify bill data loading correctly
5. Check evidence scoring logic

### PRIORITY 2: Validate Scraper Text Extraction
**Problem:** Wyden claim #42 mentions "introduced a pair of bills" but cuts off before bill names.

**Solution options:**
1. Increase word limit from 100 to 150-200 for legislative content
2. Add special handling for "introduced [bill]" patterns to extend snippet
3. Extract full paragraph when bill-related keywords detected

### PRIORITY 3: Re-evaluate Member Selection Strategy
**Findings:**
- "High-signal" prediction based on role (leadership, chair) didn't translate to high matchability
- Last 30 days may be unrepresentative (recess, funding announcements)
- Need to **sample press releases manually** before committing to member

**New strategy:**
1. Sample 5-10 recent press releases manually
2. Count explicit bill mentions (H.R./S. ####, Act names)
3. Only proceed if 40%+ contain bill references
4. Consider expanding date range to 60-90 days for better sample

## Decision Point

**CANNOT PROCEED with Step 1 until matcher regression fixed.**

Options:
1. **Debug matcher first** - restore AOC matches, then continue Step 1
2. **Implement Step 2 first** (bill number extraction) - may solve matchability + provide better debugging
3. **Rollback to pre-Schumer/Wyden state** - remove 26 claims, fix matcher, restart

**Recommendation:** Option 1 (debug matcher) - this is a regression in core functionality that must be fixed regardless of next steps.

## What We Learned

1. ✅ **Matchability diagnostic working** - correctly identified 0% for Schumer/Wyden
2. ✅ **Ingestion scaling** - handled 26 new claims without errors
3. ✅ **Hash deduplication** - no duplicates detected
4. ❌ **Matcher has regression** - broke when recomputing 44 claims
5. ❌ **Source selection needs manual sampling** - can't trust role-based predictions
6. ❌ **Scraper text limit** - 100 words insufficient for bill-heavy content

## Next Steps (After Matcher Fix)

1. Debug and fix matcher regression
2. Verify AOC claims match DEFIANCE Act again
3. Increase scraper word limit to 150-200
4. Manually sample Klobuchar press releases (when site available)
5. Consider implementing Step 2 (bill number extraction) BEFORE adding more members
6. OR: Find members with higher matchability via manual sampling

---

**Status: BLOCKED** - Cannot proceed with Phase 1 Step 1 until matcher regression resolved.
