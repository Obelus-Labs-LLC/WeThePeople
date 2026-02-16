# Member Onboarding Checklist
**Purpose:** Controlled expansion of claim ingestion - one member at a time, validating matcher quality before scaling.

**Target Profile:** Members likely to say "introduced/reintroduced/passed" with explicit bill numbers (e.g., "H.R. 1234", "S. 567").

---

## Step 1: Member Selection & Research

**Candidate Research:**
- [ ] Identify member with strong legislative communication style
- [ ] Check recent press releases for bill citation patterns
- [ ] Verify active in current Congress (119th)
- [ ] Confirm 1-2 official source URLs available

**Selection Criteria:**
- ✅ Frequently mentions legislation by name/number
- ✅ Has recent legislative activity (last 90 days)
- ✅ Clear RSS feed or press release page
- ✅ Not already in pilot (aoc, bernie_sanders currently active)

**Recommended Candidates (in priority order):**
1. **Elizabeth Warren** (elizabeth_warren) - Detailed policy work, frequent bill citations
2. **Katie Porter** (katie_porter) - Data-driven, explicit bill references
3. **Ro Khanna** (ro_khanna) - Tech policy focus, detailed legislation mentions
4. **Adam Schiff** (adam_schiff) - Legal background, precise bill citations
5. **Pramila Jayapal** (pramila_jayapal) - Progressive Caucus Chair, legislative detail

**Decision:** _______________________ (member_id: ___________________)

---

## Step 2: Set Sources (TrackedMember)

**Add to database:**
```bash
python manage_members.py add <member_id> \
  --display-name "<Full Name>" \
  --chamber <house|senate> \
  --party <D|R|I> \
  --state <XX> \
  --active true
```

**Add source URLs (1-2 official pages):**
```bash
python manage_members.py set-sources <member_id> \
  --sources "https://..." "https://..."
```

**Verify:**
```bash
python manage_members.py list --active
```

**Checklist:**
- [ ] Member added to TrackedMember table
- [ ] 1-2 source URLs configured
- [ ] Status = active
- [ ] Display name, chamber, party, state correct

---

## Step 3: Dry-Run (Twice for Safety)

**First Dry-Run (1 page only):**
```bash
python jobs/ingest_claims.py --member-id <member_id> --max-pages 1 --dry-run
```

**Review output:**
- [ ] Claims extracted look reasonable (not garbage/boilerplate)
- [ ] No extraction errors
- [ ] 5-20 claims expected per page (adjust if needed)

**Second Dry-Run (2 pages for variety):**
```bash
python jobs/ingest_claims.py --member-id <member_id> --max-pages 2 --dry-run
```

**Review output:**
- [ ] Consistent quality across pages
- [ ] No duplicate-looking claims (hash deduplication working)
- [ ] claim_text looks clean (sentences, not HTML fragments)

---

## Step 4: Live Ingestion

**Ingest claims:**
```bash
python jobs/ingest_claims.py --member-id <member_id> --max-pages 5
```

**Verify ingestion:**
```bash
python scripts/verify_claims.py --all
```

**Expected output:**
- [ ] New member shows in per-member breakdown
- [ ] Claim count reasonable (10-50 claims from 5 pages typical)
- [ ] No duplicate hashes
- [ ] Newest/oldest dates make sense

**Troubleshooting:**
- If 0 claims: Check source URL accessibility, scraper patterns
- If too many claims: Adjust extraction logic (may be catching navigation text)
- If duplicates: Verify claim_hash computation

---

## Step 5: Run Quality Gate + Matchability Check

**Execute gate:**
```bash
.\scripts\run_gate.ps1
```

**Verify all tests pass:**
- [ ] test_url_matching.py: PASS
- [ ] verify_claims.py: PASS
- [ ] recompute_evaluations.py: PASS
- [ ] pilot_baseline.py: PASS

**Run matchability diagnostic (NEW - critical for pilot validation):**
```bash
python scripts\claim_matchability.py --person-id <member_id>
```

**Matchability assessment:**
- **50%+**: HIGH - good pilot candidate, expect strong match rate
- **20-50%**: MODERATE - acceptable, expect moderate matches  
- **<20%**: LOW - warning, may not validate matcher effectively
- **0%**: VERY LOW - reconsider sources or document expected 0% matches

**Record metrics:**
- [ ] Bill ID mentions (H.R./S. ####): ___%
- [ ] Act title mentions: ___%
- [ ] URL act slugs: ___%
- [ ] Overall matchability: ___%

**Pilot phase guideline:** If matchability <20%, evaluate whether sources provide bill-specific content. Low matchability doesn't fail the member, but limits matcher validation.

---

## Step 6: Sample Meaningful Matches

**Generate sample:**
```bash
python scripts/sample_meaningful_matches.py --member-id <member_id> --limit 10
```

**Manual Review (10 samples):**
For each match, verify:
- [ ] 1. Claim text mentions the matched bill (explicit or implicit via URL)
- [ ] 2. Score reflects match quality (50+ for URL match, 70+ for text overlap)
- [ ] 3. Tier assignment correct (strong/moderate/weak)
- [ ] 4. Evidence array explains the match (url_match, phrase_hits, policy_area, etc.)
- [ ] 5. No false positives (unrelated bill matched)

**Quality Threshold:**
- ✅ **PASS:** 0 false positives in 10 samples
- ⚠️ **REVIEW:** 1 false positive → investigate matcher guardrails
- ❌ **FAIL:** 2+ false positives → pause expansion, debug matcher

---

## Step 7: Decision Gate

**Review matchability + false positives:**
- [ ] Matchability documented (from Step 5)
- [ ] False positive count: ___
- [ ] Evidence quality verified

**Acceptance Criteria (ALL required):**

1. **False Positives = 0** (non-negotiable)
2. **Matchability documented** with context:
   - If 50%+: Excellent validation opportunity
   - If 20-50%: Moderate validation, acceptable
   - If <20%: Limited validation, note in report
   - If 0%: Document reason (investigation-focused sources, etc.)
3. **Evidence explainability** maintained

**Decision:**
- ✅ **APPROVE** if: 0 false positives + matchability documented
- ⚠️ **CONDITIONAL APPROVE** if: 0 false positives + matchability <20% (note limitations)
- ❌ **NEEDS REVIEW** if: 1+ false positives OR matcher errors

**If CONDITIONAL APPROVE:** Note in acceptance report that low matchability limits matcher validation. Consider source improvements for future ingestion cycles.

**If quality check FAILED:**
- [ ] Document false positive examples
- [ ] Debug matcher guardrails
- [ ] Re-run gate after fixes
- [ ] Do NOT add more members until fixed

---

## Step 8: Documentation

**Update pilot documentation:**
```markdown
## Pilot Members (Updated: YYYY-MM-DD)
- aoc (Alexandria Ocasio-Cortez) - Baseline
- bernie_sanders (Bernie Sanders) - Baseline
- <new_member_id> (<Display Name>) - Added YYYY-MM-DD, 0 false positives in 10 samples
```

**Log results:**
- Member ID: _______________
- Claims ingested: _______________
- Match rate: _______________%
- False positives in 10 samples: _______________
- Issues found: _______________
- Status: ✅ APPROVED / ❌ NEEDS REVIEW

---

## Rollback Procedure (If Needed)

**Remove member claims:**
```sql
-- In SQLite or via Python
DELETE FROM claims WHERE member_id = '<member_id>';
DELETE FROM claim_evaluations WHERE claim_id IN (
  SELECT id FROM claims WHERE member_id = '<member_id>'
);
```

**Deactivate member:**
```bash
python manage_members.py deactivate <member_id>
```

**Re-run gate to verify rollback:**
```bash
.\scripts\run_gate.ps1
```

---

## Expansion Strategy

**Phase 1 (Current):** 2 baseline members (aoc, bernie_sanders)  
**Phase 2:** +1 member every 2-3 days (validate each)  
**Phase 3:** When 5-10 members stable with 0 false positives → batch add remaining  
**Phase 4:** Full 51-member production deployment

**Risk Mitigation:**
- One member at a time until pattern validated
- Always run quality gate before next addition
- Sample 10 meaningful matches per member
- Zero false positive tolerance in pilot phase
- Document every member addition for audit trail

---

## Quick Reference Commands

```bash
# Add member
python manage_members.py add <member_id> --display-name "Name" --chamber house --party D --state CA --active true

# Set sources
python manage_members.py set-sources <member_id> --sources "https://..." "https://..."

# Dry-run
python jobs/ingest_claims.py --member-id <member_id> --max-pages 1 --dry-run

# Ingest
python jobs/ingest_claims.py --member-id <member_id> --max-pages 5

# Quality gate
.\scripts\run_gate.ps1

# Sample matches
python scripts/sample_meaningful_matches.py --member-id <member_id> --limit 10

# Verify
python scripts/verify_claims.py --all
```
