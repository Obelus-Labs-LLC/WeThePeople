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

## Deep Audit Fixes (2026-04-11) — 98 bugs from 20-probe audit

Commit `a4ad8e9` — 102 files changed, 1121 insertions, 418 deletions.

### Security (5 fixes)
| # | Bug | Fix |
|---|-----|-----|
| 141 | SoQL injection in FCC complaints connector | Sanitize state param with regex |
| 142 | URL path injection in EPA GHGRP connector | Use `urllib.parse.quote()` |
| 143 | Prompt injection in chat agent (page/entity_id) | Regex sanitize inputs |
| 144 | Congress API sends `X-API-Key: None` string when key missing | Only send header when key exists |
| 145 | Chat cache has no TTL (responses cached forever) | Add 1-hour TTL + timestamp |

### Data Integrity (25 fixes)
| # | Bug | Fix |
|---|-----|-----|
| 146 | `datetime.utcnow()` produces naive timestamps (11 files) | Replace with `datetime.now(timezone.utc)` everywhere |
| 147 | Senate LDA `_safe_float` returns 0.0 for None (masks missing data) | Return None, matching nullable columns |
| 148 | Boolean `server_default="0"` breaks on PostgreSQL | Use `text("false")` |
| 149 | Missing `ondelete="CASCADE"` on action_tags FK | Add cascade to prevent orphans |
| 150 | Finance models missing `onupdate=func.now()` on updated_at | Add onupdate trigger |
| 151 | Stories model missing `updated_at` column | Add column with onupdate |
| 152 | Digest updates `last_sent_at` even without sending email | Only update inside `if args.send:` |
| 153 | Claims router over-counts total with outerjoin (2 endpoints) | Use `func.count(func.distinct(Claim.id))` |
| 154 | Aggregate router counts ignore join filter (3 functions) | Add join to count queries |
| 155 | NHTSA complaints use recall `issueType` | Add separate `issueType="c"` param |
| 156 | PatentsView pagination uses wrong cursor key | Fallback: `cursor \|\| after` |
| 157 | OpenFDA `[:2000]` truncation produces invalid JSON | Store minimal valid JSON with `_truncated` flag |
| 158 | Federal Register KeyError on missing `publication_date` | Use `.get()` with None fallback |
| 159 | Earmarks hardcoded fiscal year start | Dynamic calculation from current month |
| 160 | Regulations.gov 429 errors crash sync | Add 3-attempt retry with 60s backoff |
| 161 | Senate vote last-name-only matching hits wrong senator | Only match when unambiguous (single result) |
| 162 | Defense sync `--seed-only` does nothing (no seed function) | Add 43-company seed list + `seed_companies()` |
| 163 | Twitter bot DB session leak in `_generate_data_tweet` | Extract inner logic, wrap in try/finally |
| 164 | Twitter reply quote-tweet bypasses daily cap | Count both "reply" and "quote" categories |
| 165 | FARA connector temp file leak | Add `os.unlink(tmp_path)` in finally block |
| 166 | Detect stories: empty date strings render as "None" | Default to "unknown" |
| 167 | Detect stories: pattern 12 wrong category (`trade_timing` vs `contract_timing`) | Fix category string |
| 168 | Detect stories: pattern 14 crashes on empty entity_ids | Add `if not firm_entity_ids: continue` |
| 169 | DLQ monitor reads stale flat file instead of database | Query `FailedRecord` table, fallback to file |
| 170 | Stories router `json.loads` crashes on invalid verification_data | Add `_safe_json_loads()` helper |

### Frontend (28 fixes)
| # | Bug | Fix |
|---|-----|-----|
| 171 | 9 compare pages missing stale-closure guards (18 effects) | Add `let stale = false` + cleanup |
| 172 | Defense/Transportation profile pages missing stale guards | Add cancellation flags |
| 173 | InstitutionPage lazy-load + trade filter effects no cleanup | Add stale guards |
| 174 | Memory leaks: setTimeout without cleanup (ZipLookup, ShareButton, GlobalSearch, ChatAgent) | Add timer refs + useEffect cleanup |
| 175 | ClosedLoopPage hardcoded year list [2020-2026] | Dynamic from `new Date().getFullYear()` |
| 176 | InfluenceNetworkPage hardcoded fallback year range | Dynamic current year |
| 177 | GlobalSearch missing 6 sector colors/routes | Add transportation thru education |
| 178 | ChatAgent dead nav targets (`/verify`, `/politics/power`, `/health/drugs`) | Fix to `/civic/verify`, `/politics`, `/health` |
| 179 | StoryDetail evidence formatting: money keys formatted as counts | Add `isMoneyKey` regex to distinguish |
| 180 | StoryDetail `/verify/submit` link broken | Fix to `/civic/verify` |
| 181 | ClaimDetailPage footer renders `href={null}` | Wrap with `{claim.source_url && ...}` |
| 182 | ComparePageNew crashes on null `person.state` | Use `(p.state \|\| '')` |
| 183 | UserMenu both items link `/account` | Watchlist goes to `/account?tab=watchlist` |
| 184 | FinanceComparePage limit too low (50) | Raise to 200 |
| 185 | PersonProfilePage missing error check before `.json()` | Add `if (!r.ok) throw` |
| 186 | Influence API `SectorFilter` missing 6 sector types | Add all 10 sectors |
| 187 | Finance API `limit: 0` treated as falsy (skipped) | Check `!== undefined` |
| 188 | Research tools hardcoded 2024 election cycle | Dynamic even-year calculation |

### Router / Model (6 fixes)
| # | Bug | Fix |
|---|-----|-----|
| 189 | Compare endpoint missing `by_category`/`by_timing`/`by_progress` | Add group-by queries |
| 190 | Telecom + education lobbying tables missing from research tools | Add to `_LOBBYING_TABLES` + `_TABLE_SECTOR_MAP` |
| 191 | Digest model `default=` doesn't apply during bulk inserts | Change to `server_default=` |
| 192 | Chat empty response returns None body | Add fallback text |
| 193 | Chat prompt injection: unsanitized page/entity_id in LLM prompt | Regex sanitize to alnum |
| 194 | `main.py` description says "8 sectors" | Update to "11 sectors" |

## Jane Street / Google / Goldman / Two Sigma Deep Audit (2026-04-11)

8-dimensional parallel audit covering Security, Data Integrity, Error Handling, Performance,
Concurrency, Type Safety, Architecture, and Frontend. 217 raw findings, ~190 unique after
deduplication across dimensions.

### CRITICAL (2)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 239 | Type Safety | models/database.py:155,362 | `Action.bill_number` is String but `Bill.bill_number` is Integer — cross-table joins silently break on PostgreSQL | Unify to Integer with migration |
| 240 | Type Safety | models/response_schemas.py:48, frontend validators.ts:59 | `display_name` nullable in backend but required in frontend runtime validator — will throw ContractViolationError on null | Guarantee non-null from backend or relax frontend validator |

### SECURITY — HIGH (3)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 241 | Security | routers/stories.py:206 | Any authenticated user can publish stories (no role check) | Add `require_role("admin")` |
| 242 | Security | routers/auth.py:513 | Stripe webhook endpoint has no rate limiting | Add rate limit decorator |
| 243 | Security | routers/digest.py:170 | Subscribe endpoint: no rate limit, enables email bombing | Add `@limiter.limit("5/minute")` |

### SECURITY — MEDIUM (10)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 244 | Security | services/claims/veritas_bridge.py:44-66 | SSRF: DNS rebinding gap in URL validation (resolves then re-fetches) | Pin resolved IP for the HTTP request |
| 245 | Security | routers/chat.py:258, claims.py:74, digest.py:207 | Exception details leaked in HTTP error responses (5+ endpoints) | Log server-side, return generic messages |
| 246 | Security | routers/ops.py:750,803 | Raw exception injected into unescaped HTML responses | Use `html.escape()` |
| 247 | Security | routers/ops.py:761-822 | Story title in HTML response without escaping (stored XSS) | HTML-escape `story.title` |
| 248 | Security | utils/db_compat.py:168-201 | f-string SQL interpolation in public utility functions | Use parameterized queries or allowlist validation |
| 249 | Security | services/story_data_gates.py:167 | Unparameterized table/column names in SQL text() | Validate against allowlist |
| 250 | Security | routers/civic.py (6 endpoints) | No rate limiting on civic write endpoints | Add per-user rate limiting |
| 251 | Security | routers/stories.py:205 | No rate limiting on story publish | Add rate limit |
| 252 | Security | routers/chat.py:226 | Chat IP-only rate limit bypassable with proxy rotation | Consider auth-based limits |
| 253 | Security | middleware/security.py:33 | CSP connect-src hardcoded to port 8006 instead of 443 | Fix to standard HTTPS port or make configurable |

### DATA INTEGRITY — HIGH (7)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 254 | Data Integrity | connectors/congress.py:267-279 | TOCTOU race in SourceDocument upsert (no UniqueConstraint on url) | Add UniqueConstraint + try/except IntegrityError |
| 255 | Data Integrity | connectors/congress.py:343-349 | TOCTOU race in Action dedup (check-then-act without constraint) | Add composite UniqueConstraint on person_id+bill fields |
| 256 | Data Integrity | connectors/congress.py:409,439 | TOCTOU race in Bill + BillAction upsert | Use try/except IntegrityError (constraints exist) |
| 257 | Data Integrity | connectors/congress_votes.py:85+ | TOCTOU race in Vote ingestion | Use try/except IntegrityError |
| 258 | Data Integrity | models/database.py:145 | Action.person_id has no ForeignKey constraint (orphans accumulate) | Add FK to tracked_members |
| 259 | Data Integrity | models/database.py (20+ FKs) | Only 1 of 20+ ForeignKeys has ondelete behavior — parent deletion orphans children | Add CASCADE/SET NULL per FK |
| 260 | Data Integrity | models/database.py (15 columns) | Mixed timezone-aware/naive DateTime columns — joins produce wrong results | Unify all to DateTime(timezone=True) |

### DATA INTEGRITY — MEDIUM (10)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 261 | Data Integrity | 15+ sync jobs | Pervasive check-then-act pattern without UniqueConstraints | Add constraints + IntegrityError handling |
| 262 | Data Integrity | connectors/congress.py:155-196 | Session opened without try/finally (leaks on exception) | Wrap in try/finally |
| 263 | Data Integrity | connectors/congress.py:356-362 | Silent date defaulting to now() when parsing fails | Store None + log warning |
| 264 | Data Integrity | All sync jobs | Batch commit loses ALL records on single failure | Commit per-record or use savepoints |
| 265 | Data Integrity | services/story_validators.py:395 | Story dedupe hash truncated to 64 bits (collision risk) | Use full SHA1 or SHA256 |
| 266 | Data Integrity | connectors/congress.py:343 | Action dedup excludes action_type (Sponsored vs Cosponsored) | Include action_type in dedup |
| 267 | Data Integrity | models/database.py, stories_models.py | updated_at columns have onupdate but no server_default (NULL on insert) | Add server_default=func.now() |
| 268 | Data Integrity | models/token_usage.py:24-27 | Python-side `default=0` skipped by bulk inserts | Change to server_default="0" |
| 269 | Data Integrity | connectors/congress.py:358 | strptime produces naive datetime stored in tz-aware column | Append .replace(tzinfo=timezone.utc) |
| 270 | Data Integrity | jobs/ai_summarize.py + sync jobs | Remaining datetime.now() without timezone | Replace with datetime.now(timezone.utc) |

### ERROR HANDLING — HIGH (5)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 271 | Error Handling | connectors/congress_votes.py:40-42,65-67 | fetch_house_votes/fetch_vote_detail: zero error handling on HTTP calls | Add try/except around .raise_for_status()/.json() |
| 272 | Error Handling | connectors/congress.py:417 | Bare `except:` catches SystemExit/KeyboardInterrupt | Change to `except (ValueError, TypeError):` |
| 273 | Error Handling | connectors/congress.py:155 | Session leak in ingest_member_legislation (no try/finally) | Add try/finally |
| 274 | Error Handling | connectors/congress.py (throughout) | All logging via print() instead of structured logger | Replace with logger.info/warning/error |
| 275 | Error Handling | connectors/epa_ghgrp.py | All logging via print() — errors invisible to monitoring | Import and use get_logger |

### ERROR HANDLING — MEDIUM (12)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 276 | Error Handling | routers/tech.py:120 | `except Exception: pass` swallows patent-policy query errors silently | Log warning at minimum |
| 277 | Error Handling | jobs/detect_stories.py:184 | Silent pass in trade count validation gate | Log when gate is bypassed |
| 278 | Error Handling | services/budget.py:99 | Corrupted budget file silently falls back to hardcoded $10.38 | Log warning on fallback |
| 279 | Error Handling | utils/http_client.py:171 | response.json() with no try/except (non-JSON 200 crashes) | Wrap in try/except |
| 280 | Error Handling | connectors/google_civic.py:50 | GOOGLE_CIVIC_API_KEY not defined in _Config class | Add to config |
| 281 | Error Handling | connectors/congress_votes.py:85-103 | Duplicate db.close() calls — fragile cleanup pattern | Let try/finally handle all cases |
| 282 | Error Handling | services/budget.py:71 | log_token_usage session has no finally block | Add try/finally |
| 283 | Error Handling | services/budget.py:99 | Token usage logging fails silently with no warning | Log at WARNING level |
| 284 | Error Handling | connectors/congress_votes.py:18 vs http_client.py:37 | Two different env var names for Congress API key | Standardize on one |
| 285 | Error Handling | utils/http_client.py:100 | @retry hardcoded 3 attempts ignores self.max_retries | Use self.max_retries |
| 286 | Error Handling | utils/http_client.py:84 | timeout=0 treated as falsy (uses default) | Use `if timeout is not None` |
| 287 | Error Handling | connectors/congress.py:330 | Whitespace-only title not caught by `or` fallback | Add .strip() before length check |

### PERFORMANCE — HIGH (5)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 288 | Performance | routers/politics.py:104-113 | N+1 query: /actions/recent fires individual Bill query per action (up to 200) | Batch-query all bills in one WHERE IN |
| 289 | Performance | routers/research_tools.py:599-700 | 5 async def endpoints call synchronous requests.get() — blocks event loop | Change to plain `def` or use asyncio.to_thread() |
| 290 | Performance | routers/influence.py:154-200 | /influence/stats fires 30+ sequential aggregate queries | Cache result for 60s |
| 291 | Performance | models/database.py:149 | Action.date has no index — every sort-by-date does full table scan | Add index=True |
| 292 | Performance | routers/politics.py:358-362 | /claims/{id}/matches_multi loads 2000 Actions with full metadata_json into memory | Select only needed columns or reduce limit |

### PERFORMANCE — MEDIUM (12)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 293 | Performance | routers/tech,energy,defense,health.py | N+1: stock fundamentals lookup fires one query per company in /compare | Single window-function query |
| 294 | Performance | routers/tech.py:262 | Patent-policy loads ALL patents into memory just to count categories | Use GROUP BY query |
| 295 | Performance | routers/aggregate.py | All 30 endpoints allow limit=2000 with full object materialization | Reduce max, add pagination |
| 296 | Performance | routers/politics_bills,votes,trades,people.py | Manual SessionLocal() instead of Depends(get_db) — fragile cleanup | Migrate to Depends(get_db) |
| 297 | Performance | routers/health,finance,tech,energy,defense.py | Dashboard stats: 8-14 separate COUNT queries per page load | Combine into single query or cache |
| 298 | Performance | routers/influence.py:56-151 | data-freshness fires 60+ queries (mitigated by 60s cache) | Increase TTL to 300s |
| 299 | Performance | routers/search.py:30-214 | Global search fires 11 sequential ILIKE queries (full table scans) | Add indexes on display_name or use FTS5 |
| 300 | Performance | models/stories_models.py | Story.status and Story.published_at missing indexes | Add index=True |
| 301 | Performance | models/database.py | CompanyDonation missing composite index on (entity_type, entity_id) | Add composite index |
| 302 | Performance | jobs/generate_digest.py:148 | Redundant per-subscriber rep queries (same state = same reps) | Group subscribers by state, compute once |
| 303 | Performance | frontend (all profile pages) | 7-10 parallel API calls per profile page load | Consolidate into composite API endpoint |
| 304 | Performance | frontend/src/pages/BalanceOfPowerPage.tsx:164 | Fetches 600 people records on mount | Use summary endpoint |

### CONCURRENCY — HIGH (3)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 305 | Concurrency | routers/chat.py:98-130 | Chat response cache dict modified by concurrent requests — corruption during eviction | Add threading.Lock() or use cachetools.TTLCache |
| 306 | Concurrency | routers/og.py:149-254 | OG image cache dict reassignment races with concurrent reads | Add threading.Lock() |
| 307 | Concurrency | services/budget.py:118-169 | Budget check-then-spend not atomic — concurrent callers overdraw | Atomic reserve_budget() under file lock |

### CONCURRENCY — MEDIUM (9)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 308 | Concurrency | routers/auth.py:140-151 | User registration TOCTOU (no unique constraint on email) | Add UniqueConstraint + IntegrityError handling |
| 309 | Concurrency | routers/digest.py:181-207 | Digest subscribe TOCTOU (duplicate subscribers) | Add unique constraint on email |
| 310 | Concurrency | routers/auth.py:381-398 | Watchlist add TOCTOU (duplicate entries) | Add composite unique constraint |
| 311 | Concurrency | routers/influence.py:51-150 | Influence freshness cache not thread-safe | Add threading.Lock() |
| 312 | Concurrency | routers/lookup.py:38-66 | District lookup cache not thread-safe | Add threading.Lock() |
| 313 | Concurrency | routers/politics_people.py:101-113 | Profile cache not thread-safe + no eviction (memory leak) | Add lock + TTL eviction |
| 314 | Concurrency | main.py:68-78 | Startup fetch_presidential_documents can conflict with incoming requests | Gate requests until startup complete |
| 315 | Concurrency | services/rate_limit_store.py:76-125 | Rate limit check-then-record not atomic — concurrent requests exceed limit | Use atomic INSERT WHERE COUNT < max |
| 316 | Concurrency | routers/civic.py:118-152 | Civic vote score update non-atomic — concurrent votes lose updates | Use COUNT subquery in UPDATE |

### TYPE SAFETY — HIGH (6)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 317 | Type Safety | 10 sector profile pages | `(detail as any).ai_profile_summary` — 22+ unsafe casts for missing TS field | Add ai_profile_summary to all interfaces |
| 318 | Type Safety | models/response_schemas.py:202-213 | StoryItem Pydantic model missing verification_score/tier — fields silently stripped | Add fields to model |
| 319 | Type Safety | frontend types.ts:323, politics_votes.py:195 | PersonVoteEntry missing ai_summary that backend returns | Add to TS interface |
| 320 | Type Safety | frontend types.ts:261, database.py:286 | Vote.session nullable in backend but required in frontend | Change TS to `number \| null` |
| 321 | Type Safety | frontend types.ts:375, politics_votes.py:110 | VoteDetailResponse missing ai_summary from backend | Add to TS interface |
| 322 | Type Safety | PersonProfilePage.tsx:1255 | Operator precedence bug: `finance.totals \|\| {} as any` — `as any` binds to `{}` only | Use `(finance.totals ?? {}) as ...` |

### TYPE SAFETY — MEDIUM (8)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 323 | Type Safety | routers/claims.py:381 vs stories.py:27 | _safe_json returns raw string vs None on parse failure — inconsistent | Unify to return None |
| 324 | Type Safety | frontend client.ts:268 | getPersonCommittees returns Promise<any> — only untyped method | Define response type |
| 325 | Type Safety | SectorEnforcementPage.tsx:534 | 4 `as any` casts for missing ai_summary on enforcement actions | Add to interface |
| 326 | Type Safety | SectorContractsPage.tsx:364 | `as any` for missing ai_summary on contracts | Add to interface |
| 327 | Type Safety | SectorLobbyingPage.tsx:244 | `as any` for missing ai_summary on lobbying filings | Add to interface |
| 328 | Type Safety | frontend types.ts:19-22 | bioguide_id/chamber/state/party required in TS but nullable in backend | Align nullability |
| 329 | Type Safety | ~86 endpoints | No response_model Pydantic validation — return raw dicts | Incrementally add response models |
| 330 | Type Safety | models/response_schemas.py:68-78 | PersonDetailResponse missing fields endpoint actually returns | Add all returned fields |

### ARCHITECTURE — HIGH (4)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 331 | Architecture | 6 sector routers | ~2,500 lines of copy-pasted identical router logic | Create GenericSectorRouter factory |
| 332 | Architecture | routers/digest.py:211 | Hardcoded production URL in verification email | Use env var WTP_API_BASE_URL |
| 333 | Architecture | mobile/src/screens/*.tsx (20+ files) | Hardcoded API_BASE in every mobile screen instead of centralized import | Import from client module |
| 334 | Architecture | 9 sector model files | 45+ nearly identical DB table definitions (5 tables x 9 sectors) | Use SQLAlchemy mixins or factory |

### ARCHITECTURE — MEDIUM (11)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 335 | Architecture | 9 enforcement sync jobs | Federal Register base URL hardcoded 9 times | Import from connectors.federal_register |
| 336 | Architecture | 9 sync jobs | USASpending URL hardcoded 9 times | Use connectors.usaspending |
| 337 | Architecture | 9 sync jobs | Senate LDA URL hardcoded 9 times | Import LDA_BASE from connector |
| 338 | Architecture | 7 sync jobs | SEC EDGAR URL hardcoded 7 times | Use connectors.sec_edgar |
| 339 | Architecture | models/database.py:72 | Model layer imports from router layer (metrics) — inverted dependency | Move record_db_query to utils/ |
| 340 | Architecture | models/database.py:651 | Model layer imports from services (table registration) | Move ORM tables to models/ |
| 341 | Architecture | main.py:155-186 | v1 API router missing ops, metrics, lookup, civic routers | Include all or document exclusions |
| 342 | Architecture | routers/research_tools.py | 7 endpoints make raw httpx calls bypassing connector layer | Use existing connectors |
| 343 | Architecture | All sector routers | Business logic (multi-table joins, aggregation) inline in route handlers | Extract to services/ layer |
| 344 | Architecture | 4 files | Resend email URL hardcoded in 4 locations | Create services/email.py |
| 345 | Architecture | routers/ops.py:93 vs scheduler.py | _EXPECTED_INTERVALS duplicated between ops and scheduler | Extract to shared config |

### FRONTEND — HIGH (1)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 346 | Frontend | AnomaliesPage.tsx + ~15 pages | No HTTP status check before .json() — silently swallows server errors | Check r.ok before .json() |

### FRONTEND — MEDIUM (7)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 347 | Frontend | ~15 pages | fetch in useEffect without cleanup (no cancelled flag or AbortController) | Add cancellation guards |
| 348 | Frontend | App.tsx | Single ErrorBoundary at app root — WebGL/canvas errors crash entire app | Add granular boundaries |
| 349 | Frontend | GlobalSearch.tsx + 3 files | Empty alt="" on identifiable politician/company images | Use alt={name} |
| 350 | Frontend | Multiple pages | Filter buttons missing aria-pressed for screen readers | Add aria-pressed attribute |
| 351 | Frontend | AccountPage.tsx:37-40 | Optimistic delete without rollback or error handling | Add try/catch, only update on success |
| 352 | Frontend | frontend client.ts:88 | WTPClient.fetchJSON has no request timeout | Add AbortController timeout |
| 353 | Frontend | MagicRings.tsx:2 | `import * as THREE` prevents tree-shaking (~600KB) | Use named imports |

### FRONTEND — LOW (8)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 354 | Frontend | InfluenceGraph.tsx:77 | Module-level image cache grows unbounded | Use bounded LRU cache |
| 355 | Frontend | ChatAgent.tsx:12-16 | FAQ says "8 sectors" but app has 11 | Update FAQ |
| 356 | Frontend | 3 legal pages | Hardcoded "Last updated: March 18, 2026" | Use constant or build var |
| 357 | Frontend | AccountPage.tsx:129 | Hardcoded pricing "$29/mo" | Move to config |
| 358 | Frontend | Aurora.tsx:203 | Stale closure for colorStops/blend in WebGL useEffect | Read all props from propsRef |
| 359 | Frontend | 10 company profile pages | Lazy tab-load useEffects missing cancellation guard | Add cancelled flag + cleanup |
| 360 | Frontend | PersonProfilePage.tsx:160-199 | 20+ individual useState calls — excessive re-renders | Consolidate to useReducer |
| 361 | Frontend | InfluenceGraph canvas | No accessibility fallback — invisible to screen readers | Add role="img" + aria-label |

### REMAINING FINDINGS — MEDIUM (21)

Previously omitted medium-severity findings from the same audit run.

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 362 | Error Handling | services/llm/client.py:95,178 | Budget warnings and parse errors via print() not structured logger | Use logger.warning() |
| 363 | Error Handling | connectors/fara.py:86-93 | Double os.unlink + dead code block after finally | Remove dead code, import os at module level |
| 364 | Error Handling | models/database.py:74,85 | `except (ImportError, Exception): pass` — redundant catch, invisible failures | Narrow to specific exceptions or log at DEBUG |
| 365 | Error Handling | jobs/detect_stories.py:334, ai_summarize.py:240 | Token usage logging wrapped in `except Exception: pass` — lost cost visibility | Log at WARNING |
| 366 | Error Handling | services/auth.py:152 | Rate limiter uses "unknown" IP behind reverse proxy — all proxied users share bucket | Fall back to X-Forwarded-For header |
| 367 | Data Integrity | Multiple sector models | No dedup_hash column or UniqueConstraint on SAMEntity, SAMExclusion, RegulatoryComment etc. | Add dedupe_hash + UniqueConstraint |
| 368 | Data Integrity | models/government_data_models.py, civic_models.py | FK-less polymorphic IDs (company_id, target_id) — no referential integrity | Add ForeignKey where possible |
| 369 | Data Integrity | services/pipeline_reliability.py:75,235 | send_to_dlq/mark_processed commit internally — partial commits in larger transactions | Accept auto_commit param or let caller control |
| 370 | Data Integrity | routers/stories.py:221 | publish_story db.commit() has no try/except | Wrap in try/except with rollback |
| 371 | Concurrency | All sync jobs | Long transactions hold SQLite write lock during HTTP calls with rate-limit delays | Commit in smaller batches (every 50-100 records) |
| 372 | Concurrency | routers/auth.py:536-571 | Stripe webhook creates session outside request context | Use Depends(get_db) |
| 373 | Type Safety | routers/politics.py:218, services/bill_text.py:114 | format_text_receipt expects int bill_number, gets String from Action | Cast at call site or accept Union[int, str] |
| 374 | Type Safety | models/database.py:286 vs frontend types.ts:261 | vote_session DB column vs "session" API field — manual rename in every endpoint | Add serialization helper or hybrid_property |
| 375 | Type Safety | All sector routers | No Pydantic response_model on dashboard stats endpoints | Create sector dashboard Pydantic models |
| 376 | Type Safety | routers/claims.py:45,77 | POST /verify and /verify-url have no response_model (VerificationResponse exists unused) | Apply response_model=VerificationResponse |
| 377 | Type Safety | routers/auth.py (watchlist) | Watchlist POST/GET/DELETE return raw dicts without Pydantic schemas | Create WatchlistResponse model |
| 378 | Type Safety | MoneyFlowPage.tsx:57 | Dynamic Plotly import typed as `any` — loses all type info | Use `typeof import('plotly.js')` |
| 379 | Architecture | routers/ops.py:33-34, scheduler.py:48 | DLQ + scheduler state stored as flat JSON files on disk (not crash-safe) | Move DLQ to database |
| 380 | Architecture | routers/finance.py | Finance uses "institutions" while all other sectors use "companies" | Document or alias |
| 381 | Architecture | models/database.py + scheduler.py | SQLite WAL + file lock architecture assumes single server — can't scale | Document; migrate to PostgreSQL + distributed queue before scaling |
| 382 | Architecture | models/database.py:72 | Model layer imports from router layer (record_db_query) | Move to utils/metrics.py |

### REMAINING FINDINGS — LOW (45)

| # | Dimension | File | Bug | Fix |
|---|-----------|------|-----|-----|
| 383 | Error Handling | connectors/congress.py:56-58 | get_tracked_members uses print() not logger | Use logger.warning() |
| 384 | Error Handling | connectors/finnhub.py:57 | API key in query param could appear in error log URLs | Mask token in error logging |
| 385 | Error Handling | connectors/opensanctions.py:62 | Auth header could leak if headers dict logged | Noted for security docs |
| 386 | Error Handling | connectors/openstates.py:66-88 | 30-second retry waits too aggressive for production | Use circuit breaker from _base.py |
| 387 | Error Handling | connectors/congress.py:64-91 | robust_get backoff maxes at 8s (too short for real 429), catches Exception broadly | Increase backoff for 429, narrow catch |
| 388 | Error Handling | connectors/regulationsgov.py:62-82 | Returns None for both "not found" and "failed" — callers can't distinguish | Consider raising exception or typed result |
| 389 | Error Handling | connectors/google_civic.py:71 | Returns None on 429 — indistinguishable from "no data found" | Raise specific exception |
| 390 | Data Integrity | connectors/congress.py:330 | Silent title truncation at 250 chars | Log warning when truncated or increase limit |
| 391 | Data Integrity | connectors/congress.py:311-312 | write_raw_log catches all exceptions — audit trail silently lost | Use proper logger |
| 392 | Data Integrity | routers/stories.py:81-82 | getattr for verification columns masks potential schema issues | Switch to direct attribute access after migration |
| 393 | Data Integrity | models/stories_models.py:45-47 | JSON columns (entity_ids, data_sources, evidence) default to NULL not empty | Add server_default="[]" or handle None |
| 394 | Data Integrity | connectors/congress.py:379-389 | Bill.policy_area nullable — downstream consumers may not check | Ensure all consumers handle None |
| 395 | Data Integrity | models/twitter_models.py:20 | TweetLog.posted_at Python-side lambda default | Change to server_default=func.now() |
| 396 | Data Integrity | models/state_models.py:37 | StateLegislator.is_active Python-side default=True | Change to server_default="1" |
| 397 | Data Integrity | jobs/sync_donations.py:70-71 | MD5 used for donation dedup (weaker than SHA256) | Switch to SHA256 for consistency |
| 398 | Data Integrity | models/stories_models.py:45 | Story.entity_ids JSON array has no FK to entity tables | Consider junction table or app-level cleanup |
| 399 | Performance | routers/anomalies.py:79-103 | Entity anomalies endpoint has no limit/offset params | Add pagination |
| 400 | Performance | routers/defense.py:530-583 | Exclusions + SAM entity endpoints no limit — unbounded | Add limit/offset |
| 401 | Performance | routers/auth.py:536 | Stripe webhook manual SessionLocal() instead of Depends | Use Depends(get_db) |
| 402 | Performance | models/database.py:27-28 | SQLite engine has no pool_size configured | Add explicit pool config |
| 403 | Performance | routers/lookup.py:55-58 | Blocking sync HTTP in sync endpoint (mitigated by cache + timeout) | Consider async or keep as-is |
| 404 | Concurrency | services/rate_limit.py:40-86 | Disabled custom rate limiter has thread-unsafe shared state | If ever enabled, add asyncio.Lock() |
| 405 | Concurrency | routers/digest.py:140-151 | _ZIP_STATE lazy init race (benign under GIL) | Use Lock() or init at import time |
| 406 | Concurrency | connectors/congress.py:409-459 | Bill upsert race (protected by PK constraint) | Already safe; add IntegrityError handler |
| 407 | Concurrency | connectors/congress_votes.py:89-98 | Vote ingestion race (protected by UniqueConstraint) | Already safe; add IntegrityError handler |
| 408 | Concurrency | All 20+ sync jobs | Systemic check-then-act (protected by scheduler sequential lock) | Safe unless parallelism introduced |
| 409 | Concurrency | jobs/scheduler.py:528-529 | Lock acquired after "Starting job" log — confusing under overlap | Log after acquiring lock |
| 410 | Concurrency | jobs/scheduler.py:688-695 | Manual --run-now TOCTOU (acknowledged in code comment) | Acceptable; documented |
| 411 | Concurrency | services/budget.py:69-86 | log_token_usage orphan sessions on commit failure | Add try/finally |
| 412 | Type Safety | routers/politics_people.py:72 | _safe_json_loads returns None/dict/list/string — frontend expects string[] | Normalize to always return list |
| 413 | Type Safety | components/BillPipeline.tsx:11 | `[key: string]: any` index signature defeats type checking | Remove and enumerate fields |
| 414 | Type Safety | pages/PeoplePage.tsx:189 | Zip code lookup response untyped `(r: any)` | Type the civic API response |
| 415 | Type Safety | pages/LoginPage.tsx:21, SignupPage.tsx:23 | `catch (err: any)` instead of `unknown` | Use `catch (err: unknown)` + narrow |
| 416 | Type Safety | DomeGallery/Plasma/ChatAgent | Framework interop requires `as any` for Three.js/OGL/DOM | Use proper type extensions (low priority) |
| 417 | Type Safety | DefenseComparePage.tsx:211 | Dynamic `(co as any)[metric.key]` property access | Use typed record/union |
| 418 | Type Safety | CongressionalTradesPage.tsx:344,387 | Tanstack table meta typed as any | Extend ColumnMeta via module augmentation |
| 419 | Type Safety | routers/auth.py:273 | `if body.expires_in_days:` — 0 treated as falsy (safe due to ge=1 constraint) | Use `is not None` for clarity |
| 420 | Type Safety | models/stories_models.py:50 | Story status values not enumerated (just string column with comment) | Add Python enum or CheckConstraint |
| 421 | Type Safety | models/response_schemas.py:68-78 | PersonDetailResponse missing fields backend actually returns | Add all returned fields |
| 422 | Architecture | routers/infrastructure.py | Complete placeholder router mounted in app — bloats OpenAPI spec | Remove until implemented |
| 423 | Architecture | All sector routers | Unused imports: `or_`, `Dict`, `Any`, `List` | Remove |
| 424 | Architecture | connectors/datagov.py + regulationsgov.py | Regulations.gov URL defined in both connectors | Pick one canonical source |
| 425 | Architecture | All sector routers | Inconsistent pagination defaults (limit=25/50, max=100/200) | Define standard pagination constants |
| 426 | Architecture | All sector routers (x2 each) | Stock fundamentals serialization repeated ~18 times | Add to_dict() or serialize helper |
| 427 | Architecture | main.py:68 | Deprecated @app.on_event("startup") API | Migrate to lifespan context manager |
| 428 | Architecture | jobs/scheduler.py:22-24 | fcntl import is Unix-only (Windows fallback exists) | Document scheduler is Linux-only |
| 429 | Architecture | models/database.py:9, db_compat.py:17 | DATABASE_URL read independently in 2 files | Import from one canonical source |
| 430 | Frontend | components/ChatAgent.tsx:296 | Global `window.__wtpChatDragged` property — shared mutable state | Use a ref instead |
| 431 | Frontend | pages/StoryDetailPage.tsx:212 | Markdown table parser fragile on malformed pipe patterns | Add bounds checking |
| 432 | Frontend | components/DomeGallery.tsx:757 | dangerouslySetInnerHTML for CSS (safe — static content) | No action needed (documented) |
| 433 | Frontend | App.tsx routes | Sector `:companyId` routes could theoretically conflict with static sub-paths | Consider prefix like /company/:id |
| 434 | Frontend | frontend/src/api/client.ts:5 | Hardcoded localhost in JSDoc comment | Update comment |
| 435 | Frontend | ChoroplethMap + InfluenceGraph | Heavy libraries not further code-split | Low priority — pages already lazy-loaded |
| 436 | Frontend | Multiple pages | Color-only party indicators (blue D / red R) — accessibility | Add text labels alongside |

---

**Total: 436 bugs tracked (Feb--Apr 2026)**

- Original bug log (Feb-Apr fixes): 140
- Deep Audit Session fixes (Apr 11): 98
- Jane Street/Google/Goldman/Two Sigma Audit findings (Apr 11): 198 (2 CRITICAL, 29 HIGH, 100 MEDIUM, 67 LOW)
