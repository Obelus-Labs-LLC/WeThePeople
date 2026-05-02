<p align="center">
  <img src="https://wethepeopleforus.com/favicon.svg" alt="WeThePeople" width="80" />
</p>

<h1 align="center">WeThePeople</h1>

<p align="center">
  <strong>Follow the money from industry to politics.</strong>
</p>

<p align="center">
  <a href="https://wethepeopleforus.com">wethepeopleforus.com</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://twitter.com/WTPForUs">@WTPForUs</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://github.com/sponsors/Obelus-Labs-LLC">Sponsor</a>
</p>

<p align="center">
  <img alt="Vercel" src="https://img.shields.io/badge/frontend-Vercel-black?logo=vercel" />
  <img alt="FastAPI" src="https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white" />
  <img alt="Sectors" src="https://img.shields.io/badge/sectors-11-blue" />
  <img alt="Research Tools" src="https://img.shields.io/badge/research%20tools-21-green" />
  <img alt="Data Sources" src="https://img.shields.io/badge/data%20sources-49%20APIs-orange" />
</p>

---

## What is this?

WeThePeople is an open-source civic transparency platform that tracks how corporations lobby Congress, win government contracts, face enforcement actions, trade stocks alongside legislators, and donate to politicians. It pulls from 40+ government APIs and covers 11 sectors: Politics, Finance, Health, Technology, Energy, Transportation, Defense, Chemicals, Agriculture, Education, and Telecom — plus all 50 states. 537 politicians and 1,000+ companies tracked. Every data point links back to its authoritative public source.

---

## The Ecosystem

| Platform | Status | Description |
|----------|--------|-------------|
| **[WeThePeople](https://wethepeopleforus.com)** | Live | The core lobbying and influence tracker. Congressional trades, money flows, enforcement actions, lobbying filings, government contracts. 1,000+ tracked entities across 11 sectors. |
| **[WTP Research](https://research.wethepeopleforus.com)** | Live | 21 deep-dive research tools: patent explorer, drug lookup, clinical trials, insider trades, FDA recalls, toxic releases, foreign lobbying (FARA), revolving door tracker, campaign finance, government salaries, bill text analysis, market movers, regulatory news, earmarks tracker, college scorecard, FCC complaints, federal grants, food safety, spectrum search, student loans, treasury data. |
| **[The Influence Journal](https://journal.wethepeopleforus.com)** | In editorial review | AI-generated data investigations from 20 detection patterns. The journal subdomain serves an "in editorial review" placeholder while every published story is audited against [`research/EDITORIAL_STANDARDS.md`](research/EDITORIAL_STANDARDS.md) (the canonical 5-part editorial standard installed May 2026). The data pipeline, detectors, and Veritas verification continue to run; story regeneration under the new standards is in progress. Stories will return only after passing the regression audit and human review. |
| **[Veritas Verify](https://verify.wethepeopleforus.com)** | Live | Public claim-verification interface. Submit any URL, transcript, or text — Veritas extracts every verifiable claim, scores each against 70+ authoritative evidence sources via BM25, and produces a structured verdict with linked evidence. Backed by automated daily ingestion of government RSS feeds (Federal Register, Congress, SEC, Treasury, GAO, etc.) and institutional sources. Zero AI hallucination — deterministic by design. |
| **Mobile App** | Preview | iOS and Android via Expo SDK 54. 45+ screens covering all 11 sectors, congressional trades, ZIP lookup, stories, anomalies, state explorer, influence network, chat agent, account/auth, watchlists, and company comparison. Available via Expo Go preview channel. |

---

## Key Features

- **11 Sectors** — Politics, Finance, Health, Technology, Energy, Transportation, Defense, Chemicals, Agriculture, Education, and Telecom — plus State-level data across all 50 states
- **21 Research Tools** — Patent Explorer, Drug Lookup, Clinical Trials, Insider Trades, FDA Recall Search (food/drug/device), Toxic Release Inventory, Foreign Lobbying (FARA), Revolving Door Tracker, Campaign Finance, Government Salaries, Bill Text Analysis, Market Movers, Regulatory News, Earmarks Tracker, College Scorecard, FCC Complaints, Federal Grants, Food Safety, Spectrum Search, Student Loans, Treasury Data
- **Influence Network Graph** — Interactive force-directed visualization mapping connections between politicians, companies, donations, lobbying, and legislation
- **Congressional Trade Tracker** — 4,600+ stock trades parsed from official House financial disclosure PDFs, with filing delay indicators and virtual scrolling
- **Spending Choropleth Map** — Interactive US map showing lobbying spend, donations, and political activity by state
- **Money Flow Sankey Diagrams** — Trace how money flows from companies through lobbying and PAC donations to specific politicians
- **Claim Verification Pipeline** — Submit any political claim; the system extracts assertions and matches them against 9 data sources (votes, trades, lobbying, contracts, enforcement, donations, committees, SEC filings, legislative actions). Enterprise-gated.
- **AI Chat Agent** — 3-tier resolution: client-side FAQ, response cache, then Claude Haiku for complex questions
- **20 Story Detection Patterns** — STOCK Act violations, committee-stock conflicts, lobbying spikes, contract windfalls, enforcement gaps, bipartisan buying, penalty-to-contract ratios, prolific traders, enforcement immunity, revolving door, regulatory arbitrage, trade clusters, trade timing, full influence loops, FARA foreign lobbying spikes, chemical enforcement ratios, agriculture subsidy-to-lobbying, cross-sector donors, enforcement decline, regulatory capture
- **Story Verification Pipeline** — Auto-verifies AI-generated stories against 9 data sources before publishing. Green/yellow/gray verification badges.
- **Anomaly Detection** — Flags unusual patterns: trades near committee votes, lobbying spend spikes before contract awards, enforcement timing gaps, donation surges
- **Closed-Loop Influence Detection** — Identifies complete influence cycles: company lobbies on bill, bill goes to committee, company donates to committee members
- **FARA Foreign Lobbying** — 7,000+ registrants, 17,000+ foreign principals, 44,000+ agents from DOJ FARA database. Search by country, registrant, or agent.
- **Zip Code Lookup** — Enter your ZIP, see your district-specific representative (not all state reps): trades, donors, committee conflicts. Uses house.gov district mapping.
- **Earmarks Tracker** — Search congressionally directed spending from USASpending.gov by state, keyword, or member name
- **Weekly Digest** — Subscribe by ZIP code. Get a preview of your representatives' trades, votes, and flagged anomalies.
- **Twitter Bot** — [@WTPForUs](https://twitter.com/WTPForUs) posts 4x/day with data-driven story excerpts, linking to full journal investigations. Auto-quote-tweets political news from monitored accounts with relevant WTP data.
- **CSV Export** — Export any data table (lobbying, contracts, enforcement, trades) for your own analysis
- **AI Summaries** — Claude-powered plain-English summaries of votes, enforcement actions, and politician profiles

---

## Architecture

```
Backend:    FastAPI + SQLite (WAL mode, 4.1 GB)
            36 routers, 49 connectors, 61 jobs
            Versioned API (/v1/), rate limiting, structured logging
            JWT auth, RBAC, request tracing, security headers

Frontend:   React 19 + Vite + TypeScript + Tailwind CSS 4
            99 pages (all code-split via React.lazy)
            3 sites: main, research, journal

Mobile:     Expo SDK 54 + React Native
            45+ screens, all 11 sectors + tools

Infra:      Hetzner Cloud (ARM, $3.99/mo) + Vercel
            Let's Encrypt TLS, GitHub Actions CI
            Prometheus metrics endpoint
```

### Monorepo Layout

```
WeThePeople/
├── main.py                  # FastAPI app + middleware + router mounting
├── routers/                 # 36 API routers (one per sector + cross-cutting)
├── connectors/              # 49 API wrappers (Congress.gov, SEC, FDA, EPA, FARA, Finnhub, ...)
├── jobs/                    # 61 sync scripts, migrations, scheduler, Twitter bot
├── models/                  # 24 model files (per-sector pattern + auth, FARA, stories)
├── services/                # Business logic (claims pipeline, influence graph, auth)
├── middleware/               # Request tracing, security headers
├── frontend/                # React 19 + Vite web app
│   └── src/
│       ├── pages/           # 99 page components
│       ├── components/      # Shared UI (InfluenceGraph, ChoroplethMap, ChatAgent, ...)
│       ├── api/             # TypeScript API clients per sector
│       └── layouts/         # Per-sector layout wrappers
├── sites/
│   ├── research/            # WTP Research site (21 tools)
│   ├── journal/             # The Influence Journal (data stories)
│   └── shared/              # Shared components across sites
├── mobile/                  # React Native / Expo (45+ screens, all 11 sectors)
├── deploy/                  # Docker, deploy scripts, TLS docs
└── tests/                   # Backend test suite
```

---

## Data Sources (49)

All data is sourced from official government APIs and open-source datasets. No scraped or paywalled data.

| Source | Data | Link |
|--------|------|------|
| Congress.gov API | Bills, votes, sponsors, legislative actions | [api.congress.gov](https://api.congress.gov) |
| Senate LDA | Lobbying disclosures (2020-present) | [lda.senate.gov](https://lda.senate.gov/api/) |
| USASpending.gov | Federal government contracts | [usaspending.gov](https://www.usaspending.gov) |
| Federal Register | Enforcement actions, rules, presidential documents | [federalregister.gov](https://www.federalregister.gov/developers) |
| FEC | Campaign donations, PAC disbursements | [fec.gov](https://api.open.fec.gov) |
| SEC EDGAR | Corporate filings (10-K, 10-Q, 8-K, Form 4) | [sec.gov/edgar](https://www.sec.gov/edgar) |
| House Clerk Disclosures | Congressional financial disclosure PDFs (primary trade source) | [disclosures-clerk.house.gov](https://disclosures-clerk.house.gov) |
| Finnhub | Congressional trades (backup source) | [finnhub.io](https://finnhub.io) |
| OpenFDA | Product recalls, drug data | [open.fda.gov](https://open.fda.gov) |
| ClinicalTrials.gov | Clinical trial pipelines | [clinicaltrials.gov](https://clinicaltrials.gov) |
| CMS Open Payments | Industry payments to physicians | [openpaymentsdata.cms.gov](https://openpaymentsdata.cms.gov) |
| USPTO PatentsView | Patent filings and claims | [patentsview.org](https://patentsview.org) |
| EPA GHGRP | Greenhouse gas emissions by facility | [epa.gov/ghgreporting](https://www.epa.gov/ghgreporting) |
| NHTSA | Vehicle recalls, complaints, safety ratings | [nhtsa.gov](https://www.nhtsa.gov) |
| FuelEconomy.gov | MPG and emissions data | [fueleconomy.gov](https://www.fueleconomy.gov) |
| FDIC BankFind | Bank quarterly financials | [banks.data.fdic.gov](https://banks.data.fdic.gov) |
| FRED | Federal Reserve economic indicators | [fred.stlouisfed.org](https://fred.stlouisfed.org) |
| Alpha Vantage | Stock fundamentals and quotes | [alphavantage.co](https://www.alphavantage.co) |
| OpenStates | State legislators and bills | [openstates.org](https://openstates.org) |
| OpenSanctions | Sanctions, PEP, watchlist checks (OFAC/EU/UN) | [opensanctions.org](https://www.opensanctions.org) |
| SAM.gov | Federal contract registrations, exclusions | [sam.gov](https://sam.gov) |
| Regulations.gov | Public comments on federal rules | [regulations.gov](https://www.regulations.gov) |
| IT Dashboard | Federal IT spending | [itdashboard.gov](https://itdashboard.gov) |
| GSA Site Scanning | Government website analytics | [digital.gov](https://digital.gov/guides/site-scanning/) |
| Google Civic | Representative lookup by address | [developers.google.com](https://developers.google.com/civic-information) |
| Senate.gov XML | Senate roll call votes | [senate.gov](https://www.senate.gov/legislative/votes.htm) |
| AInvest | Congressional trade enrichment (filing delays) | [openapi.ainvest.com](https://openapi.ainvest.com) |
| FTC | Enforcement case data | [ftc.gov](https://www.ftc.gov) |
| DOJ FARA | Foreign Agents Registration Act (foreign lobbying) | [fara.gov](https://efile.fara.gov) |
| EPA EnviroFacts | Toxic Release Inventory (TRI) data | [epa.gov/enviro](https://www.epa.gov/enviro) |
| USAJobs | Federal job listings with salary data | [usajobs.gov](https://developer.usajobs.gov) |
| Google News RSS | News search by topic | [news.google.com](https://news.google.com) |
| OpenCorporates | Corporate registration and officer data | [opencorporates.com](https://opencorporates.com) |
| FollowTheMoney | State-level campaign finance | [followthemoney.org](https://followthemoney.org) |
| EveryPolitician | Legislators from 233 countries | [everypolitician.org](https://everypolitician.org) |
| WhoIsMyRepresentative | ZIP-to-district representative lookup | [whoismyrepresentative.com](https://whoismyrepresentative.com) |
| Data.gov | Government open data | [data.gov](https://data.gov) |
| GovInfo | Government publications | [govinfo.gov](https://www.govinfo.gov) |
| CFPB | Consumer financial complaints | [consumerfinance.gov](https://www.consumerfinance.gov/data-research/consumer-complaints/) |
| College Scorecard | Higher education institution data | [collegescorecard.ed.gov](https://collegescorecard.ed.gov) |
| Data USA | Census and economic data | [datausa.io](https://datausa.io) |
| FCC | Consumer complaints, ECFS comments, license search | [fcc.gov](https://www.fcc.gov/developers) |
| Federal Reserve Press | Fed press releases and statements | [federalreserve.gov](https://www.federalreserve.gov) |
| Grants.gov | Federal grant opportunities | [grants.gov](https://www.grants.gov) |
| Healthcare.gov | Health insurance marketplace data | [healthcare.gov](https://www.healthcare.gov) |
| Treasury Fiscal Data | Federal revenue, debt, spending | [fiscaldata.treasury.gov](https://fiscaldata.treasury.gov) |
| Urban Institute | Education and economic research data | [urban.org](https://www.urban.org) |

**Open-source datasets (CC0):**
- [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) — Committee and membership data
- [unitedstates/congress](https://github.com/unitedstates/congress) — Senate vote scraping approach
- [openstates/people](https://github.com/openstates/people) — State legislator data for all 50 states

---

## Quick Start

### Backend

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # Add your API keys
uvicorn main:app --port 8006  # API at http://localhost:8006/docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

### Seed Data

```bash
python jobs/seed_tracked_companies.py    # 1,000+ entities across all sectors
python jobs/sync_votes.py                # House roll call votes
python jobs/sync_senate_votes.py         # Senate roll call votes
python jobs/sync_congressional_trades.py # Congressional stock trades
```

### Mobile (Expo)

```bash
cd mobile && npm install && npx expo start
```

---

## API

Interactive docs at [`/docs`](https://api.wethepeopleforus.com/docs) (Swagger) and [`/redoc`](https://api.wethepeopleforus.com/redoc) (ReDoc).

The API is versioned under `/v1/` with backward-compatible unprefixed routes. Rate limited at 60 req/min per IP.

**Selected endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /people` | Congress members with search, filter by state/party/chamber |
| `GET /people/{id}` | Full member profile with votes, trades, donors |
| `GET /influence/network` | Relationship graph for any entity |
| `GET /influence/spending-by-state` | Lobbying and donations aggregated by state |
| `GET /influence/money-flow` | Sankey diagram data: company to politician flows |
| `GET /influence/closed-loops` | Detected influence cycles |
| `GET /congressional-trades` | All 4,600+ congressional stock trades |
| `GET /{sector}/companies` | Tracked companies for any sector |
| `GET /{sector}/companies/{id}` | Company detail with lobbying, contracts, enforcement |
| `GET /search?q=` | Global search across all entities |
| `GET /claims/submit` | Submit text for claim verification |
| `GET /representatives?zip=` | Find your reps by ZIP code |
| `GET /people/{id}/full` | Combined profile: votes, trades, donors, committees, finance in one call |
| `GET /lookup/{zip}` | District-specific representative lookup |
| `GET /fara/search?q=` | Search FARA foreign lobbying registrations |
| `GET /research/earmarks` | Search congressionally directed spending |
| `GET /research/world-politicians` | Legislators from 233 countries |
| `GET /stories/latest` | AI-generated data investigations |
| `GET /anomalies` | Detected suspicious patterns |

---

## Contributing

Contributions are welcome. Here are some areas where help would be especially valuable:

- **New data source integrations** — More government APIs, FOIA databases, state-level data
- **State legislative data enrichment** — Bill tracking, committee votes, campaign finance at the state level
- **District-level data** — Census overlays, district-specific lobbying and spending analysis
- **Visualization improvements** — New ways to surface patterns in influence data
- **Testing** — Backend and frontend test coverage

Check the [issues page](https://github.com/Obelus-Labs-LLC/WeThePeople/issues) for open tasks, or open a new issue to discuss your idea.

---

## Support

WeThePeople is free and open source. If you find it useful:

- [Sponsor on GitHub](https://github.com/sponsors/Obelus-Labs-LLC)
- Star this repo
- Share it with someone who cares about government accountability

---

## Acknowledgments

| Project | License | What We Use |
|---------|---------|-------------|
| [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) | CC0 (public domain) | Congressional committee and membership data |
| [unitedstates/congress](https://github.com/unitedstates/congress) | CC0 (public domain) | Senate roll call vote scraping approach |
| [openstates/people](https://github.com/openstates/people) | CC0 (public domain) | State legislator data for all 50 states |
| [FastScheduler](https://github.com/itsthejoker/fastscheduler) | MIT | Automated sync job scheduling |

All integration code is original.

---

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

You are free to use, modify, and distribute this software. If you run a modified version as a network service, you must make your source code available under the same license. This ensures that improvements to the platform benefit everyone.

Some proprietary components (detection engine, claim verification pipeline / Veritas) are maintained in a separate private repository and are not covered by this license. See the enterprise tier for access.

---

## About

WeThePeople is built and maintained by **[Obelus Labs LLC](https://github.com/Obelus-Labs-LLC)**, a US-registered LLC focused on civic transparency and accountability tooling. Solo-founded and currently self-funded.

For commercial licensing, enterprise verification API access, custom data engagements, or partnership inquiries: **wethepeopleforus@gmail.com**.
Press inquiries: **press@wethepeopleforus.com**.

## Citing the platform

Journalists and researchers should cite the underlying primary source first (Senate LDA, FEC, USASpending.gov, Congress.gov, etc.). When attribution to the platform is appropriate, see the [Citation Guide](https://wethepeopleforus.com/cite) for recommended formats and per-dataset attribution lines.

## Editorial standards

The Influence Journal's editorial standard is published at [`research/EDITORIAL_STANDARDS.md`](research/EDITORIAL_STANDARDS.md) and applies to every story. Story-generation rules, regression-audit machinery, and the human-review process are documented there.

---

<p align="center">
  <strong><a href="https://wethepeopleforus.com">wethepeopleforus.com</a></strong>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://twitter.com/WTPForUs">Twitter</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://github.com/sponsors/Obelus-Labs-LLC">GitHub Sponsors</a>
</p>

<p align="center">
  <em>The public record belongs to the public. This platform just makes it easier to read.</em>
</p>

---

<p align="center">
  If this project helped you understand money in politics, consider giving it a star — it helps others find it.
</p>
