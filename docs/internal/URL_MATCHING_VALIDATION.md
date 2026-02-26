# URL-Based Matching System Validation

**Date:** 2026-02-05  
**Status:** ✅ ALL TESTS PASSING

## Summary

Successfully implemented and validated URL-based bill matching with comprehensive guardrails to prevent false positives. The system now correctly matches claims that lack explicit bill mentions in text by extracting bill names from source URLs.

## Test Results

### Regression Tests (`test_url_matching.py`)
✅ **ALL 5 TESTS PASSED**

1. **URL Title Match Promotes Tier**
   - Claim text with no overlap + URL containing "defiance-act" → Score 50.0, moderate tier
   - DEFIANCE Act correctly matched despite zero keyword overlap

2. **URL Boost Does Not Create False Positives**
   - Generic URL ("member-statement") + generic bill → Score 0.0, no boost
   - System correctly ignores URLs without distinctive tokens

3. **Weak Match Detection**
   - Unrelated claim + unrelated bill → Score < 2.0
   - Low scores properly rejected by weak match filter

4. **URL Bill Name Extraction**
   - ✅ Extracts "defiance act" from ".../pass-defiance-act"
   - ✅ Rejects "safe act" (only 4 chars, below 5-char threshold)
   - ✅ Rejects generic URLs ("member-statement", no "act")
   - ✅ Rejects stopword-only URLs ("calling-pass-act")
   - ✅ Extracts multi-word names ("infrastructure investment jobs act")

5. **Title Normalization**
   - ✅ Removes years ("of 2025" → "")
   - ✅ Removes punctuation
   - ✅ Normalizes whitespace

### Pilot Validation Results

**Database State:**
- Claims: 6 (4 AOC, 2 Sanders)
- Evaluations: 6
- Actions: 1516
- Bills: 1895

**Match Quality:**
- Match rate: **50.0% (3/6 claims)**
- All 3 matches: **CORRECT** (HR3562-119 "DEFIANCE Act of 2025")
- False positives: **0**

**Evidence Breakdown:**
- Claims using URL evidence: 3 (50.0%)
- All URL matches have distinctive tokens (≥5 chars)
- Deduplication: ✅ 0 duplicate hashes

## Guardrails Implemented

### 1. Distinctive Token Requirement
Only URLs with at least one token ≥5 characters (not in stoplist) are accepted:
- ✅ "defiance" (8 chars) → ACCEPTED
- ❌ "safe" (4 chars) → REJECTED
- ❌ "act", "bill", "press", "release" → REJECTED (stoplist)

### 2. Near-Exact Title Match Required
URL boost (+50 points) only applied if normalized URL hint matches normalized bill title:
- Exact match: +50 points
- Partial match (≥2 word overlap): +25 points
- No match: +0 points

### 3. Multiple Bill Disambiguation
If multiple bills match same URL phrase (e.g., "DEFIANCE Act of 2024" vs "2025"):
- **Strategy:** Keep ONLY the most recent bill by action date
- **Result:** DEFIANCE Act 2025 (hr3562-119) kept, 2024 version (hr7569-118) downgraded to tier=none

### 4. Boilerplate Bypass Exception
URL exact matches bypass general claim filtering:
- Prevents "thanking advocate" from being rejected as too generic
- Only applies when URL hint exactly matches bill title

## Evidence Fields Added

**Database Migration:** `migrations/add_evidence_fields.py`

New columns in `claim_evaluations`:
- `matched_bill_id` (TEXT, indexed): "hr3562-119" for efficient queries
- `evidence_json` (TEXT): JSON array of evidence signals

**Evidence Signal Format:**
```json
[
  "url_match:defiance act act",
  "timing:retroactive_credit",
  "progress:passed_committee"
]
```

## Example: DEFIANCE Act Case Study

**Claim #2:**
- Text: "I also want to shoutout Omny Miranda Martone..."
- URL: `.../calling-pass-defiance-act`
- Bill text mentions: **NONE** (zero keyword overlap)

**Matching Process:**
1. Extract URL hint: "defiance act act" (distinctive: "defiance" ≥5 chars)
2. Normalize bill title: "DEFIANCE Act of 2025" → "defiance act"
3. Normalize URL hint: "defiance act act" → "defiance act"
4. Exact match detected → +50 points boost
5. Multiple bills match (2024 vs 2025) → Keep most recent (2025)
6. Final: Score 50.0, tier=moderate, matched HR3562-119 ✅

**Before URL Evidence:**
- Score: 0.00 (rank #103 out of 158)
- Matched: None

**After URL Evidence:**
- Score: 50.00 (rank #1)
- Matched: HR3562-119 (CORRECT)

## Files Modified/Created

### Core Matching Logic
- `services/matching.py`:
  - Added `extract_bill_name_from_url()` (lines 238-297)
  - Added `normalize_title_for_matching()` (lines 300-320)
  - Enhanced `score_action_against_claim()` with URL boost (lines 390-450)
  - Added multi-bill disambiguation guardrail (lines 1088-1118)

### Tests
- `test_url_matching.py`: 5 regression tests (NEW)

### Database
- `migrations/add_evidence_fields.py`: Adds matched_bill_id + evidence_json (NEW)
- `models/database.py`: Updated ClaimEvaluation schema (lines 107-120)
- `jobs/recompute_evaluations.py`: Populates evidence fields (lines 55-97)

### Validation Scripts
- `scripts/pilot_baseline.py`: Comprehensive baseline snapshot (NEW)
- `scripts/check_evidence.py`: Evidence field verification (NEW)

## Known Limitations

1. **Short Act Names (<5 chars):**
   - "SAFE Act" rejected (only 4 chars)
   - Workaround: Claims should mention bill in text for short names

2. **URL Slug Ambiguity:**
   - Multiple bills with same name (2024 vs 2025 versions)
   - Current strategy: Pick most recent by date
   - Future: Consider congress number, bill status

3. **Extraction Quality:**
   - Standalone sentences lose context
   - Future: Extract ±2 sentences around claim for bill name context

## Next Steps

✅ **Completed:**
- Regression tests lock in URL matching behavior
- Evidence fields enable web app justification
- Guardrails prevent URL slug exploitation
- Pilot baseline captured for reference

🔄 **Recommended:**
1. Add DEFIANCE Act scenario to integration test suite
2. Improve claim extraction to capture ±2 sentences for context
3. Expand to 1 additional member (committee chair or frequent bill introducer)
4. Monitor false positive rate with manual spot-checks

⏸️ **Deferred:**
- Scale to all 51 members (wait for validation on 3rd member)
- Implement secondary evidence requirement for ambiguous URL matches
- Add bill status (current vs previous congress) to disambiguation logic
