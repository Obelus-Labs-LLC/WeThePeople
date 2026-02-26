# Step 1A Source Quality Diagnosis

**Date:** 2026-02-05  
**Status:** Source quality issues identified, improvements implemented

## Executive Summary

Added Schumer + Wyden to pilot, discovered **press release sources produce 0% matchability** despite working bill_refs extraction infrastructure. Match rate dropped from 16.7% to 8.3% due to adding 18 unmatchable claims.

**Root cause:** Press releases are optimized for constituent communication (funding announcements, town halls), not legislative claims. They rarely include bill numbers even when mentioning legislation.

## Improvements Implemented

### 1. Recompute Performance (COMPLETE)
- ✅ Progress logging: `[idx/total] claim_id=X person=Y elapsed=MM:SS`
- ✅ Dirty-only default: Only recompute `needs_recompute=1`, use `--all` to override
- ✅ Fast feedback loop: Test with `--limit 10`, then scale up

**Example:**
```bash
python jobs/recompute_evaluations.py --limit 10  # Only dirty claims
python jobs/recompute_evaluations.py --all --limit 50  # Force all
```

### 2. Matchability Tracking (COMPLETE)
- ✅ Updated `claim_matchability.py` to check `bill_refs_json`
- ✅ Updated `pilot_baseline.py` to show bill_refs_json percentage
- ✅ Now tracks 4 signals: bill IDs in text, Act titles, URL slugs, **bill_refs_json**

**Current metrics:**
- Bill ID mentions: 0.0%
- Act title mentions: 2.8%
- URL act slugs: 8.3%
- **Bill refs extracted (bill_refs_json): 0.0%**
- Overall matchability: 11.1%

### 3. Bill Reference Infrastructure (COMPLETE)
- ✅ Link extraction fixed (strips URL fragments)
- ✅ Bill reference extraction (display + normalized format)
- ✅ Bill reference matching boost (+50.0 for direct matches)
- ✅ Database column: `bill_refs_json` on claims table

**Status:** Working correctly, but sources don't contain bill numbers

## Source Quality Analysis

### Schumer Press Releases
- **Articles checked:** 8 unique URLs
- **Bill numbers found:** 0/8 (0%)
- **Content type:** Funding announcements, constituent services
- **Example:** "announced they have introduced bipartisan legislation" (no bill number)

### Wyden Press Releases
- **Articles checked:** 7 unique URLs
- **Bill numbers found:** 2/7 (29%)
- **Issue:** False positives - town hall announcements mentioning unrelated bills
- **Example:** Town hall announcement mentions "S. 36" but claim is about event, not bill

### AOC Press Releases (Baseline)
- **Matchability:** 75.0% (3/4 claims)
- **Signal:** URL slugs ("defiance-act" in URL)
- **Success factor:** Dedicated bill announcement pages, not general press

## The Wrong Inference vs. Correct Inference

**WRONG:** "Press releases are a poor source for bill-specific claims"

**CORRECT:** 
1. **Schumer's current sources** (newsroom/funding page) are low-yield → Swap sources
2. **Wyden's claim extraction** pulls sentences without legislative anchors → Fix extraction
3. **bill_refs_json measurement** not integrated → Fixed (now tracked)

## Next Steps: Step 1A v2 - Sources + Extraction

### 1. Source Selection (REQUIRED)
Replace Schumer/Wyden press release index pages with **legislation-first sources:**

**Option A: Dedicated Legislation Pages**
- `schumer.senate.gov/legislation` (if exists)
- `wyden.senate.gov/legislation` (if exists)
- Structured to list bills, not press announcements

**Option B: Congress.gov Member Profiles**
- Authoritative source for bill sponsorship/co-sponsorship
- Has API or scrapable member pages
- Direct bill → member mapping

**Option C: Category-Filtered Press Releases**
- `newsroom/press-releases?category=legislation`
- May still have low yield, but better than all press releases

### 2. Claim Relevance Filter (RECOMMENDED)
**Problem:** Wyden extracts "town hall" sentences from articles mentioning bills

**Solution:** Only attach `bill_refs_json` to claim sentences if:
- The sentence contains the bill reference, OR
- The sentence contains legislative verbs ("introduced", "cosponsored", "passed", "voted") AND article has ≤3 bill mentions

**Implementation:**
- Add `claim_bill_refs_json` column (sentence-level, filtered)
- Keep `bill_refs_json` (article-level, unfiltered)
- Matcher uses claim_bill_refs_json for boost

### 3. Controlled Measurement Loop
After source changes and extraction fixes:

```bash
# Test new sources
python jobs/ingest_claims.py --person-id chuck_schumer --since-days 30 --limit-pages 10 --dry-run

# Ingest if looks good
python jobs/ingest_claims.py --person-id chuck_schumer --since-days 30 --limit-pages 20 --rate-limit 0.5

# Measure
python jobs/recompute_evaluations.py --limit 50
python scripts/sample_meaningful_matches.py --limit 10

# If good, scale up
python jobs/recompute_evaluations.py --all --limit 200
python scripts/claim_matchability.py --person-id chuck_schumer --verbose
python scripts/pilot_baseline.py
.\scripts\run_gate.ps1
```

**Target:** Schumer matchability ≥ 20% on new definition (includes bill_refs_json)

## Current State: Match Rate Math

**36 total claims:**
- alexandria_ocasio_cortez: 4 (3 matched = 75%)
- bernie_sanders: 2 (0 matched = 0%)
- chuck_schumer: 11 (0 matched = 0%)
- elizabeth_warren: 12 (0 matched = 0%)
- ron_wyden: 7 (0 matched = 0%)

**Overall: 3/36 = 8.3% match rate**

Previously had 44 claims with higher match rate because we hadn't added the unmatchable Schumer/Wyden claims yet.

## Lessons Learned

1. **Source selection matters more than extraction quality** - Even perfect bill extraction can't help if sources don't contain bill numbers
2. **Matchability must be measured before ingestion** - Spot-check articles for bill numbers before committing to a source
3. **URL quality varies by member** - AOC uses descriptive slugs ("defiance-act"), Schumer uses generic newsroom index
4. **Press releases ≠ legislative claims** - Funding/service announcements dominate press sections
5. **Fast feedback loops prevent waste** - `--limit 10` saved hours of processing time

## Quality Gate Status

**All tests PASSING:**
- ✅ Person ID integrity (55 canonical IDs across 4 tables)
- ✅ URL matching regression tests (5/5)
- ✅ Claim verification (36 claims, no duplicates)
- ✅ Evaluation recomputation (36 evaluations)
- ✅ Pilot baseline (8.3% match rate, stable)

**System health: GOOD**
**Matchability for new members: POOR (need source changes)**
