# WeThePeople Bug Log

Retroactive bug log compiled from git commit history (Feb 2026 -- Apr 2026).
Organized by category, newest first within each section.

---

## Critical / Crash Bugs

| # | Date | Bug | Fix | Commit |
|---|------|-----|-----|--------|
| 1 | 2026-04-10 | Build failure: `detail` undefined in HealthCompanyProfilePage breadcrumbs | Use `company.display_name` (correct variable name for this page) | `45a2741` |
| 2 | 2026-04-05 | Duplicate slug crash: story generation crashes when two stories produce same slug in one batch | Flush per story, skip in-batch duplicates | `1f200c3` |
| 3 | 2026-04-05 | Veritas `build_search_query` TypeError on None input | Add type guard and fallback | `17ae22d` |
| 4 | 2026-04-04 | Webhook 500 on malformed/fake Stripe payloads | Safely access event data, handle missing signature | `cd6b17b` |
| 5 | 2026-04-03 | Mobile Influence Network crash: API returns `{leaders:[]}` object, frontend expected raw array | Unwrap `.leaders` before rendering | `e8d2cfc` |
| 6 | 2026-04-03 | Quote-tweet dry_run crash: `entity` undefined for topic-based matches | Guard entity access for topic matches | `f2b6187` |
| 7 | 2026-04-03 | Rep lookup crash: `TrackedMember` has no `district` field | Switch to name matching only | `8e0f17e` |
| 8 | 2026-03-23 | Twitter bot crash on startup (missing field mappings) | Correct `member_name`, `amount_range` field names | `3a83419` |
| 9 | 2026-03-23 | Claims pipeline crash: 5 missing matcher function imports in `pipeline.py` | Add all imports | `a4dedbd` |
| 10 | 2026-03-23 | `evaluate_claim` signature rejected 8 match types (only accepted 3) | Expand function signature | `a4dedbd` |
| 11 | 2026-03-22 | API crash on startup: missing model imports | Remove stale import references | `a7a995d` |
| 12 | 2026-03-19 | `format_text_receipt` called with wrong args in politics router | Fix argument order | `9827408` |
| 13 | 2026-03-19 | Missing `news_feed` connector causes unhandled 500 | Add 501 fallback for missing connectors | `9827408` |
| 14 | 2026-03-12 | Vote sync silently failing: nullable constraint + missing function | Fix constraint, add missing function | `e60b98d` |

## Data Integrity Bugs

| # | Date | Bug | Fix | Commit |
|---|------|-----|-----|--------|
| 15 | 2026-04-08 | `government_entities` comma split breaks canonical names like "Treasury, Dept of" | Re-merge known multi-word entity names after split | `8f7eb09` |
| 16 | 2026-04-08 | Gate-3 story rejections: Opus model outputs em-dashes that fail validation | Post-process dashes, inject disclaimer in `make_story` | `ddc7cfe` |
| 17 | 2026-04-06 | Story dedup too loose: 14 duplicate Lockheed stories created | Match by category+entity instead of slug prefix | `feefc88` |
| 18 | 2026-04-05 | College Scorecard API key loaded at import time (before env vars set) | Load key at call time | `a03fbc4` |
| 19 | 2026-04-04 | All broken connectors: wrong column names, response parsing, API keys, URLs across multiple connectors | Comprehensive connector fix | `d50c162` |
| 20 | 2026-04-04 | Tweet bot repeats same company/person on consecutive days | Add 3-day entity dedup window | `150dc1c` |
| 21 | 2026-04-03 | Politician count shows 428 instead of 537 (only counted those with donations) | Count all tracked members | `8b89ee8` |
| 22 | 2026-04-03 | Senate votes: `bioguide_id` always None in `member_votes` table | Populate bioguide_id during vote sync | `1ab3b91` |
| 23 | 2026-04-03 | StoryCard shows `citations` count (always null) instead of `data_sources` | Switch to `data_sources` field | `a104742` |
| 24 | 2026-04-03 | Earmarks using wrong award type codes (07-08 instead of 02-05 for grants) | Correct codes | `3341285` |
| 25 | 2026-04-03 | FARA story dedup: all stories sharing same entity_id | Use country/firm as entity_id | `9421b2a` |
| 26 | 2026-04-03 | Keyword matching false positives: "impact" matching PAC-related rules | Add word boundary regex | `729301e` |
| 27 | 2026-04-01 | FARA detector querying wrong table (`registrants` instead of `foreign_principals`) | Switch to `foreign_principals` which has country data | `16318c9` |
| 28 | 2026-03-31 | FARA CSV column names don't match parser expectations | Correct column name mapping, infer status from termination date | `173674f` |
| 29 | 2026-03-31 | Food recall search returns 0 results: multi-field AND query unsupported by OpenFDA | Use single-field query | `91da404` |
| 30 | 2026-03-31 | Agriculture typos: "agricultures" in router and sync jobs | Fix to "agriculture" | `ad91006` |
| 31 | 2026-03-30 | Influence network SQL errors | Fix SQL queries | `7b91d75` |
| 32 | 2026-03-27 | Oracle GROUP BY missing `display_name` in top-lobbying/contracts queries | Add to GROUP BY | `aec34ba` |
| 33 | 2026-03-27 | Oracle VARCHAR2 4000-char limit: strings >4000 chars cause insert failures | Truncate at 4000 chars | `2545fce` |
| 34 | 2026-03-27 | Oracle migration: wrong column case, wrong bind parameter names | Use exact catalog column case | `ddf8359` |
| 35 | 2026-03-27 | Oracle migration: ISO datetime strings not parsed to Python datetime | Add datetime parsing | `a095dea` |
| 36 | 2026-03-27 | Oracle reserved words (`session`, `comment`, `order`) cause SQL errors | Auto-quote column names | `120ee3b` |
| 37 | 2026-03-27 | Oracle VARCHAR2 columns missing length specification | Patch to VARCHAR2(4000) | `68ac6ce` |
| 38 | 2026-03-27 | Oracle 19c doesn't support JSON column type | Patch JSON columns to CLOB | `f97f390` |
| 39 | 2026-03-24 | `cache_path` type error: string passed where Path expected | Convert string to Path | `b90b95b` |
| 40 | 2026-03-24 | `utils.config` import error after dead code cleanup | Restore needed import | `fe08fb6` |
| 41 | 2026-03-21 | Committee join uses wrong ID column (`committee_thomas_id` vs `thomas_id`) | Fix column name in ai_summarize | `53a84f3` |
| 42 | 2026-03-21 | `person_bills` column: `role` should be `relationship_type` | Fix column name | `4bee456` |
| 43 | 2026-03-21 | Money-flow endpoint: `company_name` field should be `committee_name` on CompanyDonation | Fix field name | `f91db92` |
| 44 | 2026-03-20 | Vote ID column named `id` not `vote_id` in ai_summarize | Fix column reference | `90a5f29` |
| 45 | 2026-03-20 | JSON parsing fails: Claude responses contain markdown code fences | Strip fences before parsing | `69e1680` |
| 46 | 2026-03-19 | SEC filing dedup checking wrong field (`dedupe_hash` vs `accession_number`) | Check accession_number | `d67f887` |
| 47 | 2026-03-19 | FDIC sync crashes on null `report_date` records | Skip null records | `e65da7d` |
| 48 | 2026-03-19 | Per-company sync failure crashes entire run | Wrap in try/except per entity | `68e34d2` |
| 49 | 2026-03-19 | Senate LDA URL wrong: `lda.gov` should be `lda.senate.gov` | Fix URL | `9827408` |
| 50 | 2026-03-19 | Congress API key env var: `API_KEY_CONGRESS` should be `CONGRESS_API_KEY` | Fix env var name | `9827408` |
| 51 | 2026-03-17 | SEC filing dates not parsed in energy sync (string instead of date object) | Add date parsing | `28c20ba` |
| 52 | 2026-03-17 | Lobbying data quality: wrong API param, unsafe float parsing | Use `client_name` param, add `_safe_float` | `a0a34e5` |
| 53 | 2026-03-12 | Vote sync uses wrong Congress.gov API v3 endpoints | Rewrite to correct endpoints | `09b179b` |
| 54 | 2026-03-09 | Wikipedia profile disambiguation failures | Fix disambiguation logic | `96c1f99` |

## Frontend / UI Bugs

| # | Date | Bug | Fix | Commit |
|---|------|-----|-----|--------|
| 55 | 2026-04-10 | FloatingLines animated background distracting users | Remove entirely | `e2a2e57` |
| 56 | 2026-04-10 | Login button invisible: `border-zinc-800` on dark background | Add `bg-white/10` background + visible border | `e2a2e57` |
| 57 | 2026-04-10 | Low text contrast site-wide (`text-white/60`, `text-white/80`) | Switch to `text-zinc-300`/`text-zinc-400` | `e2a2e57` |
| 58 | 2026-04-10 | Heading hierarchy violations: h3 used as top-level headings across 26 pages | Fix to h2 | `e2a2e57` |
| 59 | 2026-04-10 | Sector page cube animation distracting | Stop animation, keep static pattern | `e2a2e57` |
| 60 | 2026-04-05 | Verify site double `/api` prefix in API paths | Fix path construction | `53346c1` |
| 61 | 2026-04-05 | Vault page crashes on Veritas response keys (`results`/`count` vs `items`/`total`) | Handle both response shapes | `97b834d` |
| 62 | 2026-04-04 | Journal story rendering: no markdown bold, italic, or bullet support | Add markdown rendering | `fae346e` |
| 63 | 2026-04-04 | Journal story URLs missing: no `/stories/:slug` route | Add route + OG meta tags | `a9a79e0` |
| 64 | 2026-04-04 | AccountPage missing back-to-home link, shows fake "priority story detection" text | Add link, remove fake text | `4a04841` |
| 65 | 2026-04-04 | UserMenu overlapping search icon | Move position left | `0515876` |
| 66 | 2026-04-03 | TrendChart squished: 100px viewBox too narrow, tiny labels | Widen to 300px, larger labels, more padding | `8d5cb10` |
| 67 | 2026-04-03 | Stories/latest API max limit of 20 breaks journal category counts | Increase to 200 | `a9129ef` |
| 68 | 2026-04-03 | Journal shows 0 for all category counts | Use actual story categories from API | `0b6dba2` |
| 69 | 2026-04-03 | Donors path in /full endpoint has wrong prefix | Remove `/politics` prefix | `721fdcb` |
| 70 | 2026-04-03 | SC zip codes 297-299 mapped to Georgia instead of South Carolina | Fix mapping | `70c9f24` |
| 71 | 2026-04-03 | 42 missing ZIP code prefixes (FL, AL, WI, IA, etc.) | Add all missing prefixes | `f4421da` |
| 72 | 2026-04-03 | Earmarks using state name filter instead of keyword filter | Switch to keyword approach | `94dbfa0` |
| 73 | 2026-03-31 | Journal story rendering doesn't match API response shape | Match response shape, support all 9 categories | `251e831` |
| 74 | 2026-03-30 | Research tools page freezes with animation | Remove animation | `e5796fd` |
| 75 | 2026-03-30 | Health company search limited to subset | Search all 134 companies | `e5796fd` |
| 76 | 2026-03-30 | Broken endpoints: stories, influence network, chat rate limit | Add graceful degradation, extend to all 7 sectors, add fallback | `a238a11` |
| 77 | 2026-03-24 | Vercel build failures: terser dependency, TierBadge export, lockfile sync | Switch to esbuild, fix exports, sync lockfile | `35cb3e9` |
| 78 | 2026-03-24 | ShareButton missing `url` prop in StoryDetailPage | Add prop | `071e397` |
| 79 | 2026-03-24 | 35 missing company logo domain mappings | Add mappings + auto-detect local files | `0c5d2db` |
| 80 | 2026-03-23 | Vercel build: frontend data files in .gitignore | Unignore, remove stale tab reference | `cf9822d` |
| 81 | 2026-03-22 | TS2322 type errors across multiple components | Fix type annotations, icon props, destructure types | `6200272`, `22f1772`, `fb04fb9` |
| 82 | 2026-03-21 | Homepage SECTOR_ROUTES has broken leaderboard links | Fix link paths | `9827408` |
| 83 | 2026-03-20 | Chart overflow on sector contracts pages | Add overflow-hidden | `6e1dedd` |
| 84 | 2026-03-20 | Closed Loop page wrong query params (`sector` vs `entity_type`, `year_start` vs `year_from`) | Fix param names | `6e1dedd` |
| 85 | 2026-03-20 | Health Compare entity_type mismatch (`health_company` vs `company`) | Fix type | `9827408` |
| 86 | 2026-03-19 | Clearbit logo API dead, all company logos broken | Switch to DuckDuckGo, then Google Favicons 128px | `5946b7b`, `c7dae28` |
| 87 | 2026-03-19 | SPA 404 on page reload (missing Vercel rewrite rules) | Add SPA rewrite config | `5946b7b` |
| 88 | 2026-03-19 | ClosedLoopPage frontend types don't match backend response shape | Align types | `f3bd960` |
| 89 | 2026-03-18 | LightRays effect race condition with IntersectionObserver | Simplify init, remove observer | `8066ddc` |
| 90 | 2026-03-18 | Sector cube pattern white lines too prominent (70% opacity) | Reduce to 15% | `8b2aef1` |
| 91 | 2026-03-18 | Politicians Connected stat shows 0 on homepage | Add fallback to TrackedMember count | `8b2aef1` |
| 92 | 2026-03-18 | Politics compare crash on null `by_category`/`by_tier` | Add null guards | `8b2aef1` |
| 93 | 2026-03-18 | Insider trading dropdown invisible (dark text on dark bg) | Fix dropdown background | `8b2aef1` |
| 94 | 2026-02-27 | NaN in finance section from null `cash_on_hand`/`receipts`/`disbursements` | Add null guards | `7414fe8` |
| 95 | 2026-02-27 | Quick Facts showing junk (image URLs, captions, null values) | Filter out non-text entries | `7414fe8` |

## Security Bugs

| # | Date | Bug | Fix | Commit |
|---|------|-----|-----|--------|
| 96 | 2026-04-04 | XSS vulnerability in search input | Sanitize search input | `0b2df36` |
| 97 | 2026-04-04 | Email validation missing on registration | Add format validation | `0b2df36` |
| 98 | 2026-04-04 | Webhook 500 on fake Stripe signatures | Validate signatures before processing | `0b2df36` |
| 99 | 2026-03-24 | OCI IDs hardcoded in source code | Move to env vars | `d291f31` |
| 100 | 2026-03-24 | Profanity in codebase | Remove | `d291f31` |
| 101 | 2026-03-19 | Write endpoints missing auth guards | Add auth middleware | `2d68a40` |
| 102 | 2026-03-19 | No rate limiting on API | Add SlowAPIMiddleware | `2d68a40` |
| 103 | 2026-03-19 | `?api=` param allows arbitrary URL injection | Add API URL allowlist | `2d68a40` |
| 104 | 2026-03-17 | Security audit findings (energy lobbying + general) | Multiple fixes | `9708d6d` |
| 105 | 2026-03-12 | Hardcoded production IP in mobile API client | Remove, use env var | `8c9dedc` |

## Twitter Bot Bugs

| # | Date | Bug | Fix | Commit |
|---|------|-----|-----|--------|
| 106 | 2026-04-06 | Lobbying stats tweet uses wrong field name from API | Fix field name | `fcf56cb` |
| 107 | 2026-04-03 | Quote-tweet uses wrong API paths (`/politics/people` vs `/people`) | Fix paths, fix Capitol Trades handle | `856ee47` |
| 108 | 2026-04-03 | DB lock errors during tweet posting | Add retry logic | `6c916d4` |
| 109 | 2026-04-03 | Anomaly tweet URL wrong (`/influence/anomalies` vs `/anomalies`) | Fix URL | `a2eefb7` |
| 110 | 2026-04-01 | Tweet char limit set to 280 (was truncating story tweets) | Use 25K for X verified accounts | `73fb33f` |
| 111 | 2026-04-01 | Tweets full of engagement/product fluff instead of data content | Remove fluff, prioritize stories and data | `f26e993` |
| 112 | 2026-03-31 | Tweet excerpt includes markdown headings and duplicate summary | Skip headings and summary lines | `126de89` |
| 113 | 2026-03-23 | Congressional trades endpoint at root, not under `/politics/` | Fix endpoint path | `9f62917` |
| 114 | 2026-03-22 | Twitter connector uses `CLIENT_ID` env var instead of `CONSUMER_KEY` | Fix env var name | `2689891` |
| 115 | 2026-03-22 | Trade field names wrong: `member_name`, `amount_range` | Correct field names | `fc7aeed` |
| 116 | 2026-03-22 | API health check missing: tweets sent when API is down | Add health check, skip when down | `680f271` |

## Build / Deploy Bugs

| # | Date | Bug | Fix | Commit |
|---|------|-----|-----|--------|
| 117 | 2026-04-05 | Verify site tsconfig missing shared dir for EcosystemNav | Add to tsconfig include | `b5358e3` |
| 118 | 2026-04-04 | Vercel build: missing install and build commands | Add explicit commands | `08a0422` |
| 119 | 2026-03-30 | Journal build: shared dir in tsconfig include (should use local copy) | Remove from include | `042f868` |
| 120 | 2026-03-30 | Journal site: missing Vite client types for `import.meta.env` | Add type reference | `71b3942` |
| 121 | 2026-03-24 | Research site build: 4 consecutive build failures from icon props, color prop, tsconfig, ts-nocheck | Multiple iterative fixes | `72dfddf`--`a82cbee` |
| 122 | 2026-03-24 | CI checks blocking deploys | Make non-blocking, sync lockfile | `44cdc31`, `d87484c` |
| 123 | 2026-03-18 | `vercel.json` points to raw IP instead of `api.wethepeopleforus.com` | Fix domain | `0ccc21c` |

## Performance Bugs

| # | Date | Bug | Fix | Commit |
|---|------|-----|-----|--------|
| 124 | 2026-03-21 | N+1 query patterns across compare pages | Batch queries | `1e12f0d` |
| 125 | 2026-03-21 | Missing DB indexes (47 added) | Add indexes | `1e12f0d` |
| 126 | 2026-03-21 | Closed-loop detection too slow (Python loops) | Rewrite with SQL-first approach | `b1e94fb` |
| 127 | 2026-03-19 | N+1 queries across all 4 sectors | Eliminate with batch fetching | `2d68a40` |
| 128 | 2026-03-19 | Lobbying-by-state cartesian product (returns duplicate rows) | Fix SQL join | `2d68a40` |
| 129 | 2026-03-19 | State dashboard double-loads data on mount | Fix useEffect dependencies | `2d68a40` |
| 130 | 2026-03-18 | SQLite locking under concurrent sync jobs | Set WAL mode + 60s busy_timeout | `352c1e0` |
| 131 | 2026-03-12 | Vote sync pagination loop (fetches all pages when only 1 needed) | Remove pagination loop | `832560f` |

## Connector / API Bugs

| # | Date | Bug | Fix | Commit |
|---|------|-----|-----|--------|
| 132 | 2026-04-05 | Veritas bridge: wrong search function names | Correct function references | `0f4b43a` |
| 133 | 2026-04-05 | College Scorecard router: wrong function for `for_profit` filter | Use correct function | `212bed8` |
| 134 | 2026-04-04 | Lobbying breakdown uses wrong ID column per sector | Fix per-sector ID mapping | `72d5d3d` |
| 135 | 2026-03-31 | Research proxies missing `follow_redirects` for EPA TRI | Add parameter | `a645923` |
| 136 | 2026-03-22 | Transportation enforcement: wrong agency mapping (trucks mapped to rail) | Smart agency mapping, strip legal suffixes | `2b66a07` |
| 137 | 2026-03-22 | NHTSA connector missing required `model` parameter | Add model param | `f972571` |
| 138 | 2026-03-19 | OpenStates `per_page` max is 50, not 100 | Fix limit | `b6eb267` |
| 139 | 2026-03-19 | OpenStates party field sometimes string, sometimes list | Handle both types | `08bbc6b` |
| 140 | 2026-03-19 | OpenStates rate limiting causes sync failures | Add retry logic + longer delays | `6f0b0b4` |

---

**Total: 140 bugs tracked across 180 fix commits (Feb--Apr 2026)**

Categories:
- Critical/Crash: 14
- Data Integrity: 40
- Frontend/UI: 41
- Security: 10
- Twitter Bot: 11
- Build/Deploy: 7
- Performance: 8
- Connector/API: 9
