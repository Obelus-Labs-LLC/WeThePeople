# Phase 4: Backfill Coverage Plan

## Current State (Conservative + Explainable + Source-Backed)

**What's Working:**
- ✅ Three-layer defense prevents false matches
  - Gate terms (domain vocabulary required)
  - Boilerplate guardrail (blocks generic civic overlap)
  - Policy area mismatch filter (blocks wrong domains)
- ✅ Category auto-classification (finance_ethics, environment, healthcare, etc.)
- ✅ Bill lifecycle endpoints with on-demand receipts
- ✅ Deterministic, explainable matching (no ML/semantic similarity)

**Current Coverage:**
- 88/1384 bills enriched (6.4%)
- 1,516 actions reference bills
- Most evaluations return `tier=none` (no matching bill data yet)

**Note:** System is **conservative + explainable + source-backed**, not production-ready yet.

---

## Goal: Make "none" Become "Matched When Real"

Right now we proved the system won't lie. Next: make it able to find truth when it exists.

### Coverage Targets

1. **All bills referenced in Actions** (1,384 bills)
   - Currently: 88 enriched
   - Target: 1,384 enriched
   - Impact: Politicians' actual legislative work becomes matchable

2. **Complete BillAction timelines**
   - Ensure all enriched bills have full action history
   - Enables accurate progress classification (enacted/passed/failed)

3. **Policy area coverage**
   - 95.5% of enriched bills have policy_area
   - Target: 100%

---

## Backfill Strategy

### Step 1: Batch Enrichment (Respecting Rate Limits)

```bash
# Option A: Run 3 batches of 100 (conservative)
python backfill_coverage.py --batch-size 100 --max-batches 3

# Option B: Run 10 batches of 50 (slower, safer)
python backfill_coverage.py --batch-size 50 --max-batches 10

# Option C: Complete backfill (run until done)
python backfill_coverage.py --batch-size 100
```

**Rate Limiting:**
- 0.3s delay between bills
- 2s pause every 10 bills
- ~300 bills/hour max throughput
- Estimated time for 1,296 remaining: ~4-5 hours

### Step 2: Verify Coverage After Each Batch

```bash
python -c "from jobs.enrich_bills import verify_enrichment_coverage; verify_enrichment_coverage()"
```

### Step 3: Recompute Evaluations

After enrichment, invalidate affected claims:

```bash
# Recompute all dirty claims (auto-marked during enrichment)
python jobs/recompute_evaluations.py --dirty-only

# Or recompute all claims for a person
python jobs/recompute_evaluations.py --person-id aoc
```

---

## Expected Outcomes

### Before Backfill (Current)
```
Claim: "I introduced legislation to ban stock trading"
Category: finance_ethics
Result: tier=none (no matching bills found)
```

### After Backfill (If Real Bill Exists)
```
Claim: "I introduced legislation to ban stock trading"
Category: finance_ethics
Result: 
  tier=moderate (if bill passed committee)
  tier=weak (if bill introduced but stalled)
  tier=none (if no stock trading bill exists - still correct!)
```

**Key Point:** Backfill increases recall (finding real matches) without sacrificing precision (three-layer defense still blocks false matches).

---

## Next Steps After Coverage

Once coverage is sufficient (>80%), focus on:

1. **Multi-politician testing**
   - Test claims for Sanders, Schumer, Thune, etc.
   - Verify cross-category matching (healthcare, environment, etc.)

2. **Edge case testing**
   - Multiple bills on same topic
   - Amended/reintroduced bills
   - Bipartisan co-sponsorship

3. **Monitoring & reliability** (for production-readiness)
   - Rate limiting / abuse protection
   - Structured logging + request IDs
   - Background job retries/backoff
   - DB constraints + migrations tested
   - Monitoring/alerting

---

## Conservative Principles (Maintained)

Throughout backfill, the system remains:

- **Conservative:** Better to miss a match than false-positive
- **Explainable:** All matches based on vocabulary overlap + policy domain + lifecycle status
- **Source-backed:** All data from Congress.gov API (no ML inference)
- **Deterministic:** Same input always produces same output

---

## Commands Quick Reference

```bash
# Check current coverage
python -c "from jobs.enrich_bills import verify_enrichment_coverage; verify_enrichment_coverage()"

# Enrich 100 bills
python jobs/enrich_bills.py 100

# Backfill with limit
python backfill_coverage.py --batch-size 100 --max-batches 5

# Recompute evaluations
python jobs/recompute_evaluations.py --dirty-only

# Test specific claim
curl http://127.0.0.1:8000/claims/1/evaluation | python -m json.tool
```
