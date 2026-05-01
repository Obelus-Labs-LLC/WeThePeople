# WeThePeople — Main Site & Research Site Audit

> Status: CANONICAL audit prompt for the live ecosystem (wethepeopleforus.com,
> research.wethepeopleforus.com, verify.wethepeopleforus.com).
> Installed 2026-05-01. Companion to research/EDITORIAL_STANDARDS.md.
> The journal stays offline behind the editorial-review placeholder until
> Part 4 of the editorial standards rebuild is complete; this audit governs
> what Lauren Gibbons will actually see when she follows up.

## SCOPE

This prompt extends the Editorial Standards & Journal Rebuild Master Prompt previously installed in this chat. That prompt governs The Influence Journal. This one governs the two sites that are currently live and that Lauren Gibbons will see when she follows up: the main platform (wethepeopleforus.com) and the research tools site (research.wethepeopleforus.com).

The same standard applies: would a working political reporter on deadline trust this platform enough to cite it, or walk away? Audit through that lens.

## PART 1 — PERFORMANCE AND RELIABILITY AUDIT

Run a full performance and reliability audit across both sites. Test from cold cache, incognito browser, on desktop and mobile.

For each site and each major route/tool, measure and report:

- Time to first meaningful paint
- Time to interactive
- Time until primary data is fully rendered
- Whether the page renders an empty shell first and populates later (a "broken-looking" pattern even when working correctly)

Flag any page or tool that takes longer than 3 seconds to render meaningful content on first visit. For the research site specifically, identify which of the 15 research tools lag and categorize the cause for each:

- CAUSE A: Live upstream call to a slow government API on every request (no caching layer)
- CAUSE B: Database query against an unindexed column or with an inefficient join
- CAUSE C: Client-side rendering of a large dataset before pagination
- CAUSE D: Network waterfall (sequential dependent requests that should be parallel)
- CAUSE E: Other (specify)

For each lagging tool, output the cause category, the measured latency, and a recommended fix priority (HIGH / MEDIUM / LOW) based on how journalist-relevant the tool is. Tools relevant to a Michigan capitol reporter (campaign finance, FARA, revolving door tracker, earmarks tracker, congressional trades, bill text analysis) are HIGH priority. Tools less central to her beat are lower.

Test API rate limit behavior. The documented limit is 60 req/min per IP. Verify:

- What HTTP status code is returned when limit is exceeded
- Whether the response body explains the limit and recovery time
- Whether the frontend handles a rate-limit response gracefully (user-facing message vs. silent failure or 500)

Test error handling across a representative sample of routes:

- Search returning zero results: graceful empty state vs. blank page
- Malformed input (bad ZIP code, invalid politician ID, special characters): graceful error vs. crash
- Pages for entities with incomplete data: graceful "no data available for this section" vs. broken layout
- 404 pages: branded and helpful vs. default

Test mobile responsiveness on both sites at common phone viewport sizes (iPhone SE width 375px, iPhone Pro Max width 430px, mid-range Android 360px). Flag any layout breakage, unreadable text, overflowing charts, or non-functional navigation.

## PART 2 — DATA ACCURACY AND FRESHNESS AUDIT

Audit data accuracy and freshness across both sites.

**Timestamps and freshness signals.** Every data-heavy page must display a "last updated" or "last synced" timestamp visible to the user. Audit every major page type (politician profiles, company profiles, sector pages, research tools) and report which have timestamps and which don't. Add timestamps to any page that lacks them.

For each tracked data source, output:

- Source name
- Last successful sync timestamp
- Sync cadence (real-time, hourly, daily, weekly)
- Whether stale syncs trigger any alerting

Flag any data source whose last successful sync is older than its expected cadence by more than 50%.

**Source link verification.** Every data point claiming origin from a government source (Congress.gov, FEC, SEC EDGAR, Senate LDA, USASpending.gov, etc.) must link to the corresponding record at the original source, not back to a WeThePeople page. Audit by sampling 50 random data points across:

- Politician trades
- Politician donor records
- Lobbying filings
- Government contracts
- Enforcement actions
- Bill records
- Vote records

For each sampled data point, verify the source link resolves and supports the specific claim. Report the percentage of valid source links and list every broken or misdirected link found.

**Michigan-specific data integrity.** Lauren's beat is Michigan-focused. Pull up every member of Michigan's federal congressional delegation on the platform and verify:

- Names spelled correctly
- Current committee assignments match the actual seated 119th Congress committee rosters (verify against committee.gov or the relevant chamber's official source)
- District numbers match current post-2022-redistricting Michigan maps
- Party affiliations correct
- Most recent disclosed trade dates are within expected lag windows for the source (House STOCK Act disclosures typically within 30-45 days)

Output a Michigan delegation accuracy report listing each member and any discrepancy found.

**ZIP code lookup precision.** The ZIP-to-district lookup must return the correct US House representative for the ZIP entered. Test against at least 25 Michigan ZIP codes spanning all 13 congressional districts, including ZIPs that span multiple districts (which should return appropriate disambiguation, not a single guessed answer). Report any ZIP that returns the wrong representative.

**Tracked company accuracy.** For 20 randomly sampled tracked companies across the 9 sectors, verify:

- Company name matches the entity name on file at SEC EDGAR (or appropriate authority for non-public companies)
- Industry/sector classification is correct
- Lobbying filings attributed to the company are actually filed by that company per Senate LDA
- Federal contracts attributed to the company match USASpending.gov records by exact entity name or documented alias

## PART 3 — CITABILITY AUDIT

A journalist who cannot cite the platform cannot use the platform. Audit citability:

- Does every page have a stable, shareable URL that does not change based on session state?
- Does every data point on a page have either a direct link to its source or a clear methodology explanation?
- Is there a methodology page that explains how data is aggregated, normalized, and verified, written in plain language a non-technical journalist can understand?
- Is there a clear way to cite the platform itself (recommended citation format, "as reported by WeThePeople using data from [source]")?
- Does the platform expose CSV/JSON export for any data table a journalist would want to take into their own analysis?

If any of these are missing, prioritize adding them.

## PART 4 — TRUST SIGNALS AUDIT

Working journalists evaluate tools on visible trust signals before they evaluate features. Audit the presence and clarity of the following on both sites:

- An "About" or "Methodology" page explaining what the platform is, what data it aggregates, and how that data is verified
- A clear statement of what the platform is *not* (not a news outlet, not a political organization, not making editorial claims about the entities tracked)
- Disclosure of who runs the platform, where it's funded, and any conflicts of interest
- A visible "Report an error" mechanism on every data-heavy page
- A clear AGPL-3.0 license disclosure (for the codebase) separate from any terms of use (for the platform)
- Contact information for press inquiries, separate from general contact

Report which of these are present, which are missing, and which need clarification.

## PART 5 — MICHIGAN-FRIENDLY DEMO PATH

Identify and verify a curated demo path that surfaces the strongest Michigan-relevant capabilities of the platform. The path should let a Michigan reporter find a story-worthy data view in under 5 minutes. Verify each step works flawlessly before recommending it.

Candidate elements for the demo path (audit each and confirm working):

- ZIP code lookup for a Detroit-area ZIP returning the correct rep + their trades + their donors + their committee assignments in one view
- Michigan US senator profile page with full data: trades, donors, committee assignments, votes, disclosure history
- DTE Energy and Consumers Energy company profiles with federal lobbying spend, federal PAC donations, executive donations, contract awards if any
- Michigan-headquartered company profiles (Ford, GM, Stellantis, Whirlpool, Dow, Kellogg's, Stryker) with lobbying-to-vote correlations
- Earmarks tracker filtered to Michigan, showing federal spending directed by Michigan reps
- FARA filings filtered to Michigan-relevant industries (auto, agriculture)
- Influence network graph centered on a Michigan senator showing donor → vote → committee connections

For each candidate element, output the URL or query path, whether it currently works correctly, and any defect found.

## PART 6 — REGRESSION CHECK ACROSS BOTH SITES

Apply the same regression-audit principle from the master prompt to the main site and research site. Known failure patterns to actively hunt for:

- Numerical conflation across time windows in any tool that aggregates dollar figures
- Mismatched data periods between a tool's headline number and its underlying records
- Tracked entities with stale or incorrect base data (wrong sector, wrong CEO, wrong ticker)
- Pages that load successfully but display data from a wrong query (e.g., showing one politician's trades on another politician's page due to ID collision)
- Search results that return entities matching by partial string and produce false matches
- Charts and visualizations that render but plot data from the wrong time window or wrong entity

For each defect found, output severity (HIGH / MEDIUM / LOW), affected pages or tools, and recommended fix priority.

## OUTPUT FORMAT

Output the audit results in the following sections:

1. PERFORMANCE & RELIABILITY REPORT
2. DATA ACCURACY & FRESHNESS REPORT
3. CITABILITY REPORT
4. TRUST SIGNALS REPORT
5. MICHIGAN DEMO PATH REPORT
6. REGRESSION DEFECTS REPORT
7. PRIORITIZED FIX LIST: every defect ranked by severity and journalist-relevance, with recommended fix order assuming limited time before Lauren's follow-up email arrives

For each defect, include: the affected page or tool, the specific issue, the severity, the recommended fix, and an estimated effort level (QUICK / MEDIUM / LONG).

End of audit prompt.
