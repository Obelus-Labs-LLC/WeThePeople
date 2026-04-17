# Finance Sector Exhaustive Audit — 2026-04-17

Scope: every Finance institution, every Finance data source, every Finance endpoint, every Finance frontend page.

**TL;DR**: Finance sector has real data (113K CFPB complaints, 78K SEC filings, 5K lobbying filings, 3.4K insider trades), but **four systemic data-integrity bugs** corrupt most of what's shown on profile pages and the dashboard. Endpoints all return 200; bugs live in the data layer, not the API layer.

---

## 1. Institution inventory

- **144 active Finance institutions** across 9 sub-sectors (44 bank, 39 investment, 27 insurance, 25 fintech, 3 mortgage, 2 GSE, 2 payments, 1 central bank, 1 exchange).
- All 144 show `is_active=1`. No dead rows flagged.

## 2. Critical bug #1 — **Duplicate institution pairs share one SEC CIK, data splits across both**

15 pairs of institutions share the same SEC CIK. Every pair is actually one company entered twice with different slugs. Result: one slug collects SEC filings, the other collects lobbying/complaints/enforcement, and each profile page shows a half-truth.

| CIK | Good slug (has filings) | Orphan slug (same CIK, 0 filings) |
|---|---|---|
| 0001601712 | synchrony-financial (882 filings, 0 complaints) | synchrony (0 filings, **10,770 complaints**) |
| 0001411494 | apollo-global (815 filings) | apollo (0 filings, 11 lobbying) |
| 0001512673 | block (738 filings, 281 lobbying) | block-inc (0 filings, 41 lobbying) |
| 0000831001 | citigroup (142 filings, 11,033 complaints) | citizens-financial (0 filings, 20 FDIC) |
| 0000070858 | bank-of-america (165 filings, 11,135 complaints) | **markel** (0 filings — Markel's real CIK is 0001096343, this is a total misassignment) |
| 0000720005 | raymond-james | stifel-financial |
| 0000910073 | nycb | new-york-community |
| 0000874766 | hartford-financial | hartford |
| 0001126328 | principal-financial | principal |
| 0001331875 | fidelity-national-financial | fidelity-national |
| 0001527166 | carlyle-group | carlyle |
| 0001571949 | ice | intercontinental-exchange |
| 0000109380 | zions-bancorporation | zions-bancorp |
| 0000036270 | mt-bank | mandt |
| 0000005513 | unum-group | unum |

**Fix plan**: for each pair, decide canonical slug, run UPDATE to merge the child rows, DELETE the orphan tracked_institutions row, correct Markel's CIK back to 0001096343 and re-sync SEC filings, then add a `UNIQUE(sec_cik)` constraint on tracked_institutions to prevent recurrence.

## 3. Critical bug #2 — **finance_enforcement_actions table is ~95% garbage (Federal Register rulemakings misparsed as penalties)**

Only 216 of 5,304 enforcement rows are actual enforcement (Enforcement Action + Settlement + Consent Order + Civil Penalty). The other **5,080 rows ("Regulatory Action")** are Federal Register *rulemakings* scraped and mis-labeled. The syncer extracts dollar thresholds from the rulemaking text and stores them as `penalty_amount`.

Examples (all fake):
- goldman-sachs 2014-05-01 **$700,000,000,000** — "Regulatory Capital Rules: Enhanced Supplementary Leverage Ratio Standards" (the $700B is an asset-size threshold for which banks the rule applies to)
- citigroup 2013-11-29 **$250,000,000,000** — "Liquidity Coverage Ratio: Liquidity Risk Measurement, Standards, and Monitoring" (rule, not penalty; $250B = applicability threshold)
- visa 1998-01-12 **$368,400,000** — "Adjustment of Certain Fees of the Immigration Examinations Fee Account" (immigration visa fee rule matched to Visa the credit-card company)
- svb-financial 2011-07-06 **$150,000,000** — "Exemptions for Advisers to Venture Capital Funds" (fund-size threshold, not a penalty)
- federal-reserve 2025-12-01 **$700,000,000,000** — "Regulatory Capital Rule: Modifications to the ESLR Standards" (a proposed rule)

Dashboard `total_penalties = $14,052,022,346,644` → dominated entirely by these rulemaking rows. Real Finance enforcement penalties total ~$1.5B; everything above that figure is fake.

This also means **every "zero penalties" story already retracted was fighting the wrong battle** — the penalties shown were fake, not missing. And every "penalty_contract_ratio" story built on this table is built on noise.

**Fix plan**: Either (a) drop all rows where `enforcement_type = 'Regulatory Action'` and rebuild from CFPB Enforcement Actions + DOJ/SEC Litigation Releases + OCC Enforcement Actions feeds (not Federal Register), or (b) add a parser guard so only rows whose source URL is from an enforcement-specific endpoint get written. Same fix needs to be applied to every `*_enforcement_actions` table — this is sector-wide, not Finance-only.

## 4. Critical bug #3 — **Lobbying records duplicated across dupe pairs double-count sector totals**

339 `filing_uuid`s are stored under more than one institution_id. Every synchrony pair lobbying filing is counted twice, every apollo pair, etc. Finance dashboard `total_lobbying_spend = $165,968,000` is inflated — real figure is roughly half of the duplicated portion less.

**Fix plan**: Merges in bug #1 resolve this automatically. After merging, add a `UNIQUE(filing_uuid)` or `UNIQUE(filing_uuid, institution_id)` constraint on `finance_lobbying_records`.

## 5. Critical bug #4 — **Insider trades hard-capped at 40 per institution**

94 institutions have insider trade data. **28 of them have exactly 40 trades** (nothing with more than 40). Goldman, JPM, and every other major bank file hundreds of Form 4s per quarter, so this is a pagination/limit bug in the ingestion. All 40-capped institutions have under-reported trade counts — can't trust "Goldman insider selling volume" type stats. I could not locate the insider-trades sync job file in `jobs/` — it may be inline somewhere or using an undocumented path.

**Fix plan**: Find and remove the `size=40` or `limit=40` in the ingestion path.

## 6. CFPB complaints coverage is severely under-filled (10%)

Only 15 of 144 Finance institutions have any CFPB complaints, but at least 50 others have `cfpb_company_name` set (Ally, Fifth Third, Citizens Bank, Coinbase, Affirm, Allstate, Ameriprise, Assurant, Block/Square, BNY Mellon, Comerica, HSBC, Huntington, etc.). Spot-checked CFPB search for "ALLY BANK" and "ALLY FINANCIAL" — both return 0 matches from CFPB's API. Our stored `cfpb_company_name` values don't match CFPB's actual company strings.

**Fix plan**: Fetch CFPB's full distinct `company` aggregation once (they publish this via `aggs=company`), re-align `tracked_institutions.cfpb_company_name` to their exact strings, then re-run `sync_cfpb_complaints` for the 50 gap institutions.

## 7. Missing or bad CIKs

Institutions with no CIK get zero SEC filings automatically:
- federal-reserve (correct — not a public filer)
- vanguard (correct — private)
- nuvei (real CIK is 0001835522, needs backfill)
- home-bancfin (typo — should be "Home BancShares", CIK 0001331520)

## 8. Endpoint audit — all 25 Finance endpoints return 200

Tested on production against `goldman-sachs` (and a non-existent institution which correctly 404s at the profile endpoint). All respond:

| Endpoint | Status |
|---|---|
| `/finance/dashboard/stats` | 200, but `total_penalties` inflated per bug #3 |
| `/finance/companies`, `/finance/institutions` | 200 |
| `/finance/institutions/{id}` | 200 (profile page) |
| `/finance/institutions/{id}/filings` | 200 |
| `/finance/institutions/{id}/financials` | 200 |
| `/finance/institutions/{id}/complaints` | 200 |
| `/finance/institutions/{id}/complaints/summary` | 200 |
| `/finance/institutions/{id}/fred` | 200 |
| `/finance/institutions/{id}/press-releases` | 200 |
| `/finance/institutions/{id}/stock` | 200 |
| `/finance/institutions/{id}/insider-trades` | 200, but hard-capped at 40 per bug #5 |
| `/finance/institutions/{id}/lobbying` | 200, dup-counted per bug #3 |
| `/finance/institutions/{id}/lobbying/summary` | 200 |
| `/finance/institutions/{id}/contracts` | 200 |
| `/finance/institutions/{id}/contracts/summary` | 200 |
| `/finance/institutions/{id}/enforcement` | 200, mostly garbage rows per bug #2 |
| `/finance/institutions/{id}/donations` | 200 |
| `/finance/institutions/{id}/trends` | 200 |
| `/finance/complaints`, `/finance/complaints/summary` | 200 |
| `/finance/macro-indicators` | 200, FRED data looks clean |
| `/finance/sector-news` | 200 |
| `/finance/insider-trades` | 200 (sector-wide) |
| `/finance/compare?ids=...` | 200 |

Non-existent institution id returns 404 correctly. No endpoint crashes; no 500s observed.

## 9. Frontend page audit

All 11 Finance frontend routes return HTTP 200 (expected — Vercel serves the SPA shell):
- `/finance` — dashboard
- `/finance/institutions` — directory
- `/finance/lobbying` — sector lobbying page
- `/finance/contracts` — sector contracts page
- `/finance/enforcement` — **built on the 95%-garbage enforcement table**
- `/finance/compare` — compare tool
- `/finance/:institution_id` — profile pages (144 of these; dupe pairs render as separate pages, orphan pages render mostly-empty)
- `/finance/news`, `/finance/insider-trades`, `/finance/market-movers`, `/finance/complaints` — all 302-ish to research.wethepeopleforus.com

## 10. Non-issues confirmed

- SEC filings: 124 institutions have real filings, 78,281 rows, dates clean (2025-03 to 2026-04). No dupes at accession_number level.
- FRED macro indicators: 8 indicators, values current, dates sensible.
- Contracts: 44 institutions, 14,730 rows, no dedupe_hash collisions across institutions.
- FDIC financials: 28 institutions (banks only — correct scope), 556 rows.
- Fed press releases: 42 rows (low but scoped to Federal Reserve only, which is correct).
- Stock fundamentals: healthy, per-institution snapshots.

---

## Priority fix order (recommended)

1. **Bug #2 (enforcement garbage)** — highest impact. Affects stories, profile "enforcement" tab, and sector dashboard penalty totals. Fix protects all 11 sectors at once.
2. **Bug #1 (CIK duplicates)** — merges 15 pairs, restores coherent profile pages, fixes Markel-as-BofA.
3. **Bug #3 (lobbying dupes)** — resolved by bug #1 merges.
4. **Bug #5 (insider-trades 40 cap)** — quick find + fix once the sync code location is identified.
5. **CFPB coverage gap** — align `cfpb_company_name` to CFPB's actual strings, re-sync 50 gap institutions.
6. **Bad/missing CIKs** — small list, easy backfill.

These are diagnosed, not yet fixed. Waiting for your "OK run it" before making DB changes.
