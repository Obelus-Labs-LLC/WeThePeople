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
  <img alt="Data Sources" src="https://img.shields.io/badge/data%20sources-35%2B%20APIs-orange" />
</p>

---

## What is this?

WeThePeople is an open-source civic transparency platform that tracks how corporations lobby Congress, win government contracts, face enforcement actions, trade stocks alongside legislators, and donate to politicians. It pulls from 35+ government APIs and covers 8 sectors: Politics, Finance, Health, Technology, Energy, Transportation, Defense, and all 50 states. Every data point links back to its authoritative public source.

---

## The Ecosystem

| Platform | Status | Description |
|----------|--------|-------------|
| **[WeThePeople](https://wethepeopleforus.com)** | Live | The core lobbying and influence tracker. Congressional trades, money flows, enforcement actions, lobbying filings, government contracts. 1,000+ tracked entities across 8 sectors. |
| **WTP Research** | Coming soon | Deep-dive research tools. Patent explorer, drug lookup, clinical trial pipelines, insider trade analysis, company financials, and SEC filing search. |
| **The Influence Journal** | Coming soon | Data-driven stories and investigations. Weekly newsletter. Anomaly-detected leads. Every claim cited against the public record. |
| **Mobile App** | Coming soon | iOS and Android via Expo. Full parity with the web platform — 74 screens across all 8 sectors, influence tools, claim verification, and AI chat. Available via Expo Go during preview. |

---

## Key Features

- **8 Sectors** — Politics, Finance, Health, Technology, Energy, Transportation, Defense, and State-level data across all 50 states
- **Influence Network Graph** — Interactive force-directed visualization mapping connections between politicians, companies, donations, lobbying, and legislation
- **Congressional Trade Tracker** — 4,600+ stock trades parsed from official House disclosure PDFs and the Quiver API, with filing delay indicators and virtual scrolling
- **Spending Choropleth Map** — Interactive US map showing lobbying spend, donations, and political activity by state
- **Money Flow Sankey Diagrams** — Trace how money flows from companies through lobbying and PAC donations to specific politicians
- **Claim Verification Pipeline** — Submit any political claim; the system extracts assertions and matches them against 9 data sources (votes, trades, lobbying, contracts, enforcement, donations, committees, SEC filings, legislative actions). Enterprise-gated.
- **AI Chat Agent** — 3-tier resolution: client-side FAQ, response cache, then Claude Haiku for complex questions
- **Anomaly Detection** — Flags unusual patterns: trades near committee votes, lobbying spend spikes before contract awards, enforcement timing gaps, donation surges
- **Closed-Loop Influence Detection** — Identifies complete influence cycles: company lobbies on bill, bill goes to committee, company donates to committee members
- **Weekly Digest** — Subscribe by ZIP code. Get a preview of your representatives' trades, votes, and flagged anomalies.
- **Twitter Bot** — [@WTPForUs](https://twitter.com/WTPForUs) posts 4x/day with data-driven insights on congressional trades, lobbying patterns, and enforcement actions
- **CSV Export** — Export any data table (lobbying, contracts, enforcement, trades) for your own analysis
- **AI Summaries** — Claude-powered plain-English summaries of votes, enforcement actions, and politician profiles

---

## Architecture

```
Backend:    FastAPI + SQLite (WAL mode)
            22 routers, 34 connectors, 43 jobs
            Versioned API (/v1/), rate limiting, structured logging
            JWT auth, RBAC, request tracing, security headers

Frontend:   React 19 + Vite + TypeScript + Tailwind CSS 4
            78 pages (all code-split via React.lazy)
            Framer Motion animations, mobile-responsive

Mobile:     Expo SDK 54 + React Native
            Full parity with web

Infra:      Docker + Terraform (GCP + Oracle Cloud)
            GitHub Actions CI, Vercel auto-deploy
            Prometheus metrics endpoint
```

### Monorepo Layout

```
WeThePeople/
├── main.py                  # FastAPI app + middleware + router mounting
├── routers/                 # 22 API routers (one per sector + cross-cutting)
├── connectors/              # 34 API wrappers (Congress.gov, SEC, FDA, EPA, ...)
├── jobs/                    # 43 sync scripts, migrations, scheduler, Twitter bot
├── models/                  # SQLAlchemy models (12 files, per-sector pattern)
├── services/                # Business logic (claims pipeline, influence graph, auth)
├── middleware/               # Request tracing, security headers
├── frontend/                # React 19 + Vite web app
│   └── src/
│       ├── pages/           # 78 page components
│       ├── components/      # Shared UI (InfluenceGraph, ChoroplethMap, ChatAgent, ...)
│       ├── api/             # TypeScript API clients per sector
│       └── layouts/         # Per-sector layout wrappers
├── mobile/                  # React Native / Expo (full web parity)
├── deploy/                  # Docker, Terraform, deploy scripts, TLS docs
│   └── terraform/           # GCP + Oracle Cloud infrastructure
└── tests/                   # Backend test suite
```

---

## Data Sources (35+)

All data is sourced from official government APIs and open-source datasets. No scraped or paywalled data.

| Source | Data | Link |
|--------|------|------|
| Congress.gov API | Bills, votes, sponsors, legislative actions | [api.congress.gov](https://api.congress.gov) |
| Senate LDA | Lobbying disclosures (2020-present) | [lda.senate.gov](https://lda.senate.gov/api/) |
| USASpending.gov | Federal government contracts | [usaspending.gov](https://www.usaspending.gov) |
| Federal Register | Enforcement actions, rules, presidential documents | [federalregister.gov](https://www.federalregister.gov/developers) |
| FEC | Campaign donations, PAC disbursements | [fec.gov](https://api.open.fec.gov) |
| SEC EDGAR | Corporate filings (10-K, 10-Q, 8-K, Form 4) | [sec.gov/edgar](https://www.sec.gov/edgar) |
| Quiver Quantitative | Congressional stock trades | [quiverquant.com](https://www.quiverquant.com) |
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
| House Clerk | Congressional financial disclosure PDFs | [disclosures-clerk.house.gov](https://disclosures-clerk.house.gov) |
| AInvest | Congressional trade enrichment (filing delays) | [openapi.ainvest.com](https://openapi.ainvest.com) |
| FTC | Enforcement case data | [ftc.gov](https://www.ftc.gov) |
| Data.gov | Government open data | [data.gov](https://data.gov) |
| GovInfo | Government publications | [govinfo.gov](https://www.govinfo.gov) |

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

All rights reserved. Contact [Obelus Labs LLC](https://github.com/Obelus-Labs-LLC) for licensing inquiries.

---

<p align="center">
  <strong><a href="https://wethepeopleforus.com">wethepeopleforus.com</a></strong>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://twitter.com/WTPForUs">Twitter</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://github.com/sponsors/Obelus-Labs-LLC">GitHub Sponsors</a>
</p>

<p align="center">
  <em>The public record belongs to the public. This platform just makes it easier to read.</em>
</p>
