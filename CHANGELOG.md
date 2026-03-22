# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (Major Features)
- **Claim Verification pipeline** — top-level `/verify` section. Submit text or URLs, Claude extracts claims, matches against 9 data sources (bills, votes, trades, lobbying, contracts, enforcement, donations, committees, SEC filings), scores as Strong/Moderate/Weak/Unverified. Free tier: 5/day. Enterprise: unlimited.
- **Transportation sector** — 6th sector with 80 seed companies (airlines, logistics, auto, rail, aerospace, maritime). Full stack: models, router, sync jobs, 4 web pages, 4 mobile screens, blue (#3B82F6) accent.
- Verify web pages: Dashboard, Submit, Result, Entity, Methodology
- Verify components: TierBadge, VerificationCard, ClaimSubmitForm, EvidenceList
- Verify mobile screens: Dashboard, Submit, Result, Entity
- Transportation web pages: Dashboard, Companies, Profile, Compare
- Transportation mobile screens: Dashboard, Companies, Profile, Compare
- Enterprise auth tier in `services/auth.py` with rate limiting
- Homepage "Verify Claims" CTA card with emerald accent
- Transportation tab in mobile bottom navigation

### Removed (V1 Cleanup)
- ~150 V1 dead files deleted (~20,000 lines): scripts/ (68), tests/ (62), cli/ (5), 13 V1 jobs, 3 V1 utils
- Deprecated models: BronzeDocument, SilverClaim, SilverAction, IngestCheckpoint
- V1 services: matching/, power_map/, ops/, coverage.py, change_detection.py
- V1 endpoints: /ops/coverage, /powermap/person/{id}

### Changed
- Matching engine ported from `services/matching/core.py` to `services/claims/match.py` with 8 new V2 matchers
- `routers/politics.py` imports updated to use `services.claims.match`

### Fixed (Services)
- `bill_timeline.py` crash on null `action_date` in strftime and date comparisons
- `matching/core.py` loading 5000 rows into memory (now uses SQL-level bill filter)
- `matching/core.py` inner join dropping actions without source documents
- `matching/core.py` crash on malformed `phrase_hits` score parsing
- `evidence/validate.py` crash at import if `schema.json` missing
- `llm/client.py` truncation cutting prompt template instead of document text
- `rate_limit.py` memory leak from unbounded IP tracking dict (now prunes hourly, caps at 10K)
- Deprecated `datetime.utcnow()` calls in change_detection.py
- Missing `os.makedirs` for snapshot directories

### Fixed (CLI/Utils)
- Missing `cli/__init__.py` — entire CLI package was non-importable
- Missing `utils/__init__.py` — fragile package imports
- `http_client.py` retry logic never firing (Timeout/ConnectionError converted to HTTPError before retry)
- `env.py` default port 8000 (production is 8006)
- `config.py` FEC key reading from wrong env var (`API_KEY_DATA_GOV` instead of `FEC_API_KEY`)

### Changed
- V1 dead code modules marked with deprecation notices (power_map, matching, coverage, change_detection, pilot_cohort, invalidation, models)
- LLM client model now configurable via `LLM_MODEL` env var
- LLM client logs cost estimates after each API call
- `load_dotenv` moved to module level in env.py (was called twice per function)

### Removed
- Dead `_should_retry` function from http_client.py
- Dead `GlobalSearchPlaceholder` from TabNavigator (already noted)

### Added
- Error state with retry button on Activity Feed page
- Selection limit hint ("Select up to 4 members") on politics compare page
- Favicon link tag in index.html
- Deployment instructions with `sed` substitution in SETUP.md and service file headers

### Changed
- Methodology page updated: removed 3 stale limitations (Senate votes, FEC donations, state data now available), added 4 current limitations
- Drug Lookup page reduced from 90 to 30 parallel API calls per search
- Politics compare metrics relabeled to match actual backend response fields
- Enforcement page stat cards responsive on mobile (`grid-cols-2 lg:grid-cols-4`)
- Bill Detail page scrolls naturally on mobile (split-panel preserved on desktop)
- Pipeline stage and status filters now mutually exclusive on Legislation Tracker
- Compare page dropdowns now keyboard accessible (Enter/Space/Escape/arrows) with ARIA attributes
- Commented out `psycopg2-binary` and `docling` from requirements.txt (optional, cause install failures)
- Removed 3 unused npm packages: `vizzu`, `@knight-lab/timelinejs`, `lightweight-charts`
- Commented out broken OG image meta tags (image file doesn't exist)
- V1-era scripts guarded with exit warnings redirecting to current equivalents

### Fixed
- Company profile AI summaries querying wrong column name (`entity_id` instead of `institution_id`/`company_id`)
- 3 pairs of tracked companies sharing incorrect SEC CIK numbers (Citizens Financial, Huntington Bancshares, Enterprise Products)
- Duplicate ticker `HBAN` assigned to two different institutions
- FDA adverse event `outcome` field mapped to patient age instead of medical outcome (affects 582K records)
- Congressional trades sync missing WAL mode/busy_timeout on its own DB engine
- Last-name collision in trade matching (two members named "Smith" overwrite each other)
- Budget ledger file race condition when multiple projects run AI summarization concurrently
- Session leak in `get_tracked_members()` when database query raises
- Senate votes sync crashes with IndexError when `--start`/`--end` filtering produces empty list
- Recall dedupe hash collision when `recall_number` is empty
- Transaction type regex false positives on standalone P/S/E characters in PDF headers
- Broken vote source URLs when `vote_date` is None
- Bare `except` in congress connector catching KeyboardInterrupt
- Legacy EDGAR `cgi-bin` URL pattern (still works via redirect)
- `--skip-emissions` flag accepted but emissions sync not implemented
- PAC search name only stripping first matching suffix
- 5 mobile API methods calling nonexistent backend endpoints (MarketMovers, FDAApprovals, PatentSearch, PressTools, BalanceOfPower)
- Mobile BalanceOfPower screen reading wrong data shape from dashboard stats
- Mobile fetch requests hanging indefinitely (no timeout)
- Mobile InstitutionScreen crash when navigated to without params
- Mobile CongressionalTrades searching only loaded page instead of full dataset
- Mobile VoteDetail rendering 435 member votes without virtualization
- Mobile DataExplorer treating freshness response as array instead of key-value map
- 15 new mobile screens missing from navigation type definitions
- Mobile infinite re-fetch loop for companies with zero records in a tab
- Mobile CommitteesScreen rendering 230 items without virtualization
- Mobile SearchBar timer not cleared on unmount
- Activity Feed silently swallowing API errors (now shows error with retry)
- Enforcement page stat cards crushed on mobile (4 columns, now responsive)
- Invalid Tailwind class `text-white/40/30` on Finance compare page
- Pipeline stage and status filter conflict on Legislation Tracker
- Bill Detail page scroll locked on mobile due to `h-screen overflow-hidden`
- Backup script falsely reporting failure (`member_bills_groundtruth` threshold 1M, actual ~4K)
- Two scripts with wrong `sys.path` (pointing to `scripts/` instead of project root)
- DB check script defaulting to wrong database name (`wtp.db` instead of `wethepeople.db`)
- `.nexus/` directory not in `.gitignore`
- Unused `color`/`activeColor` props in SectorHeader component
- Dead `STATE_FLAGS` constant in StateExplorerPage

## [2.1.0] - 2026-03-22

### Added
- CHANGELOG.md following Keep a Changelog conventions
- Complaints tab on Institution profile page (104K CFPB records)
- Load More pagination on Health adverse events, recalls, and trials tabs
- Partial results banner on Closed Loop detection page
- Click-outside and Escape key to close influence network search dropdown
- Shared `fmtMoney` utility for consistent currency formatting
- 47 database indexes on frequently queried columns across all major tables
- In-memory caching (5 min TTL) on closed-loop detection endpoint
- 60-second TTL cache on data freshness endpoint
- 1-hour TTL cache on Wikipedia and FEC profile lookups (replacing permanent cache)
- `cancelled` flag pattern on profile page API fetches to prevent stale data
- 15 new mobile screens (MoneyFlow, DataExplorer, DataStory, InfluenceTimeline, ClosedLoop, BalanceOfPower, VoteDetail, PressTools, PatentSearch, FDAApprovals, MarketMovers, Privacy, Terms, Disclaimer)
- Mobile SanctionsBadge component on all 5 profile screens
- Sortable column chips on mobile Congressional Trades screen
- 4 new tool CTAs on mobile Influence Explorer (Money Flow, Data Story, Timeline, Closed Loops)
- 9 new API methods in mobile client
- Shared `utils/helpers.ts` for frontend

### Changed
- Closed-loop detection rewritten with raw SQL (15s down to 5s, cached at 23ms)
- Tech sector lobbying/contracts/enforcement routes now use generic sector pages (consistency with other sectors)
- Congress number calculated dynamically instead of hardcoded "119th"
- Tech/Health/Energy compare endpoints batched to eliminate N+1 queries
- Tech contracts trends endpoint uses SQL aggregation instead of loading all rows
- Lobbying spend on spending map proportionally distributed across states
- Trade amount parser handles "Over $50M" and open-ended ranges
- Influence network depth-2 dedup normalized to catch bidirectional duplicates
- Sankey money-flow diagram aggregates PAC-to-channel links (fixes inflated totals)
- Search results return "tech" consistently (was "technology")
- Actions endpoints use outerjoin on SourceDocument (was inner join, silently dropping actions)
- `fmtDate` validates date before formatting (was showing "Invalid Date")
- Global search loading indicator only shows after debounce fires
- ZIP code input truncated to 5 digits
- Virtual scroll spacers include proper colSpan
- Congress.gov URLs use correct ordinal suffixes (121st, not 121th)
- Scheduler `--run-now` exits with message if daemon holds lock (was blocking forever)
- Frontend data sources corrected (was listing ProPublica/OpenSecrets/GovTrack)

### Fixed
- `format_text_receipt` called with wrong arguments, crashing `/actions/{id}` endpoint
- Missing `news_feed` connector crashing `/news/{query}` endpoint (now returns 501)
- Health compare stock lookup using wrong `entity_type` (never finding stock data)
- Senate LDA base URL pointing to wrong domain (`lda.gov` instead of `lda.senate.gov`)
- Congress API key environment variable name mismatch (`API_KEY_CONGRESS` vs `CONGRESS_API_KEY`)
- Homepage leaderboard links routing to wrong paths
- SanctionsBadge bypassing TypeScript with `as any` casts (added proper types)
- VoteDetail page using non-standard `3xl:` Tailwind breakpoint (content never visible)
- RepresentativeLookup showing "Coming Soon" on all API errors
- Plotly dynamic import using fragile `as string` cast
- MoneyFlow Plotly memory leak from async cleanup
- Duplicate claim submission returning raw 500 with SQLAlchemy traceback (now 409)
- Empty `aggregateEndpoint` breaking politics lobbying/contracts pages
- Dead `npl_ratio` field showing misleading dash on institution profiles
- SQLite-incompatible `nullslast()` calls in politics router
- `range` parameter shadowing Python built-in
- Deprecated `declarative_base` import path
- `ComplaintsDashboardPage` orphaned with no route

### Removed
- 8 debug scripts from public repository
- 52 unused imports across backend, frontend, and mobile
- `npl_ratio` from finance TypeScript types and UI
- Dead `GlobalSearchPlaceholder` component
- `Co-Authored-By` attribution from all 103 commits in git history
- Stale sector accent entries for unbuilt sectors (chemicals, defense, agriculture)

### Security
- Stripped all `Co-Authored-By` lines from git history
- Removed debug scripts containing internal database references
- Verified no API keys, tokens, or credentials in repo or git history
- `.env` properly gitignored, never committed

### Documentation
- README updated with 7 missing cross-sector features
- README data sources table expanded from 30 to 35+
- README project tree updated with all 13 routers, 9 models, expanded services
- README counts corrected (62 pages, 26 connectors, 39 jobs, 52+ mobile screens)
- CLAUDE.md updated with accurate counts, documented 5 missing routers, expanded services
- CLAUDE.md Next Steps cleaned up (removed completed items)
- `.env.example` updated with all required API keys, removed dead entries

## [2.0.0] - 2026-03-20

### Added
- Full mobile app parity with web (37 new screens, 20 updated)
- Closed-loop influence detection (lobbying to bill to committee to donations)
- Aggregate endpoints eliminating N+1 queries on sector pages
- Scheduler deployed as systemd service with 13 automated sync jobs
- Committee data import (230 committees, 3,915 memberships)
- All 50 states bulk imported (7,347 state legislators)
- Senate votes synced (717 votes from senate.gov XML)
- House financial disclosure PDF parser (4,616 congressional trades)

### Fixed
- 60+ findings from full-stack security and performance audit
- Mobile onboarding missing Energy sector
- Sync job hardening: WAL mode, per-entity error recovery, nullable `_safe_float`
- FDIC null date skip, SEC dedup fix
- ClosedLoopPage frontend types aligned with backend response

## [1.2.0] - 2026-03-19

### Added
- Influence network graph (force-directed, 1-2 hop depth)
- Spending choropleth map (lobbying/donations/members by state)
- State-level data (OpenStates connector, State Explorer + Dashboard pages)
- Trade timeline on Congressional Trades page and person profiles
- Bill pipeline (6-stage visual funnel with sponsor filtering)
- FEC donation sync job
- GitHub Sponsors support
- ActBlue/WinRed campaign contribution links on politician profiles

### Changed
- All 38 artificial data limits removed across all connectors and sync jobs

## [1.1.0] - 2026-03-19

### Added
- Code splitting with React.lazy on all pages
- Global search (Cmd+K overlay)
- Mobile responsive CSS on all pages
- Data freshness timestamps on all dashboards
- Methodology page
- OG meta tags for social sharing
- Rate limiting (slowapi, 5 req/s per IP)
- 10 new API connectors (SEC EDGAR, FDIC, Alpha Vantage, CFPB, FRED, OpenFDA, ClinicalTrials, CMS, USASpending, Fed Press)

### Fixed
- 23 post-deploy issues from user testing
- Dashboard stat cards linking to wrong sector pages
- Politics compare crash on null data
- Insider trades dropdown styling
- Committees placeholder
- Page scroll behavior

### Changed
- All 5 dashboards standardized against Politics template
- Energy and Tech dashboards gained Recent Activity sections
- Compare pages redesigned with dropdown selectors
- 3 generic sector-aware pages created (SectorLobbyingPage, SectorContractsPage, SectorEnforcementPage)

## [1.0.0] - 2026-03-18

### Added
- Politics-first redesign across all 4 sector dashboards
- Lobbying, contracts, enforcement, and donations models for Finance and Health
- Cross-sector influence router
- Health profile redesign with Lobbying, Contracts, Enforcement tabs
- Domain setup (api.wethepeopleforus.com)

### Fixed
- `filing_client_name` changed to `client_name` for Senate LDA API
- Added `_safe_float` for lobbying income parsing
- Added `parse_date` for USASpending date strings
- Personal Expo account removed from app config
- Plasma WebGL removed from Health layout (performance)

### Changed
- All sectors recontextualized through political influence lens

## [0.9.0] - 2026-03-12

### Added
- 4-sector expansion (Finance, Health, Technology, Energy)
- Mobile app (React Native / Expo)
- Per-sector FastAPI routers
- GCP VM deployment with git-based deploys
- Vote sync from Congress.gov API
- Source URLs across all sector detail screens

[Unreleased]: https://github.com/Obelus-Labs-LLC/WeThePeople/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/Obelus-Labs-LLC/WeThePeople/compare/v2.0...v2.1.0
[2.0.0]: https://github.com/Obelus-Labs-LLC/WeThePeople/compare/v1.2-uncapped...v2.0
[1.2.0]: https://github.com/Obelus-Labs-LLC/WeThePeople/compare/v1.1-production...v1.2-uncapped
[1.1.0]: https://github.com/Obelus-Labs-LLC/WeThePeople/compare/v1.0-pre-redesign...v1.1-production
[1.0.0]: https://github.com/Obelus-Labs-LLC/WeThePeople/compare/v0.9.0...v1.0-pre-redesign
[0.9.0]: https://github.com/Obelus-Labs-LLC/WeThePeople/releases/tag/v0.9.0
