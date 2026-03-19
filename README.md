# WeThePeople

**Follow the money from industry to politics.**

A civic transparency platform that tracks how corporations lobby Congress, win government contracts, face enforcement actions, and donate to politicians — across Finance, Health, Technology, and Energy. Every data point links back to its public source.

**Live at [wethepeopleforus.com](https://wethepeopleforus.com)**

---

## What Makes This Different

Most political data tools show you one thing — campaign donations, or votes, or lobbying. WeThePeople connects all of them across industries. Pick a politician and see which companies fund them, what those companies lobby for, what government contracts they receive, and how that politician votes on related legislation. Pick a company and see every politician they donate to, every lobbying filing, every enforcement action against them.

No spin. No editorials. Just the public record — structured, searchable, and linked back to its source.

---

## Five Sectors, One Platform

### Politics
537 members of the 119th Congress. Voting records, sponsored legislation, bill progress tracking, co-sponsorship networks, committee assignments, and congressional stock trades. Find your representative by ZIP code.

### Finance
144 financial institutions — banks, insurers, asset managers, fintech. SEC filings, FDIC financials, CFPB consumer complaints, insider trades, lobbying disclosures, government contracts, and enforcement actions.

### Health
134 pharmaceutical, biotech, medical device, and healthcare companies. FDA adverse events, product recalls, clinical trial pipelines, CMS Open Payments, lobbying, government contracts, and enforcement actions.

### Technology
139 tech companies — platforms, enterprise SaaS, semiconductors, cybersecurity. Patent portfolios, federal government contracts, lobbying by issue, FTC enforcement actions, and SEC filings.

### Oil, Gas & Energy
89 energy companies — oil & gas producers, utilities, renewables, pipelines, oilfield services. EPA emissions data, lobbying disclosures, government contracts, and enforcement actions.

---

## Cross-Sector Features

| Feature | Description |
|---------|-------------|
| **Influence Network Graph** | Interactive force-directed graph showing connections between politicians, companies, donations, lobbying, and legislation. Search any entity, explore 1-2 hops of relationships. |
| **Spending Map** | Choropleth map of the US showing lobbying spend, donations, and political activity by state. Click a state to drill into detail. |
| **Global Search** | Cmd+K overlay searching across all politicians, companies, and bills in one place. |
| **Compare Pages** | Side-by-side comparison of politicians or companies within any sector — lobbying spend, contracts, enforcement, financial metrics. |
| **Congressional Trades** | Track what stocks members of Congress buy and sell, with filing delay indicators and trade timelines. Links to Capitol Trades for deep dives. |
| **Campaign Contributions** | Direct links to ActBlue (D) or WinRed (R) for any politician — contribute to your representative's campaign directly from their profile. |
| **State-Level Data** | State legislators and bills via OpenStates API. Explore by state from the spending map or Find Rep page. |
| **Bill Pipeline** | Visual 6-stage funnel showing legislation progress from introduction through enactment, with sponsor filtering. |
| **Data Freshness** | Every dashboard shows when data was last synced and record counts, so you know how current the information is. |
| **Methodology Page** | Full documentation of every data source, update frequency, and known limitations. |

---

## Data Sources (24+)

| Source | Data | Sectors |
|--------|------|---------|
| Congress.gov API | Votes, bills, sponsors, actions | Politics |
| Senate LDA | Lobbying filings (2020-present) | All sectors |
| USASpending.gov | Federal government contracts | All sectors |
| Federal Register | Enforcement actions, rules, notices | All sectors |
| FEC | Campaign donations, PAC disbursements | All sectors |
| Quiver Quantitative | Congressional stock trades | Politics |
| SEC EDGAR | Corporate filings (10-K, 10-Q, 8-K, Form 4) | Finance, Health, Tech, Energy |
| FDIC BankFind | Bank quarterly financials | Finance |
| CFPB | Consumer complaints | Finance |
| FRED | Federal Reserve economic indicators | Finance |
| OpenFDA | Adverse events, product recalls | Health |
| ClinicalTrials.gov | Clinical trial pipelines | Health |
| CMS Open Payments | Industry payments to physicians | Health |
| USPTO PatentsView | Patent filings and claims | Tech |
| FTC | Enforcement actions | Tech |
| EPA GHGRP | Greenhouse gas emissions | Energy |
| OpenStates | State legislators and bills | Politics (state-level) |
| Alpha Vantage | Stock fundamentals and quotes | All sectors |
| Wikipedia | Politician profiles and photos | Politics |
| Google News | Sector news feeds | All sectors |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web frontend | React 19, Vite, TypeScript, Tailwind CSS 4, Framer Motion |
| Visualizations | react-force-graph-2d, React-Leaflet, TradingView Lightweight Charts |
| Backend | Python 3.11, FastAPI, SQLAlchemy, SQLite (WAL mode) |
| Mobile app | React Native, Expo SDK 54 (not yet updated for redesign) |
| Hosting | GCP Compute Engine (API), Vercel (frontend) |
| Data pipeline | 24 Python connectors with rate limiting, pagination, and deduplication |
| Search | Cross-sector entity search via `/search` endpoint |
| Performance | React.lazy() code splitting, 75% bundle reduction |

---

## Project Structure

```
WeThePeople/
├── main.py                     # FastAPI entry point + middleware
├── routers/                    # API route handlers
│   ├── politics.py              # 30+ endpoints: members, votes, bills, claims
│   ├── finance.py               # Institutions, filings, complaints, insider trades
│   ├── health.py                # Companies, adverse events, recalls, trials
│   ├── tech.py                  # Companies, patents, contracts, enforcement
│   ├── energy.py                # Companies, emissions, contracts, lobbying
│   ├── influence.py             # Cross-sector: network graph, spending map, trade timeline
│   ├── search.py                # Global search across all entities
│   ├── state.py                 # State-level legislators and bills
│   └── common.py                # Health check, news proxy
├── models/                     # SQLAlchemy models
│   ├── database.py              # Core models (members, bills, votes, donations, trades)
│   ├── finance_models.py        # Finance-specific models
│   ├── health_models.py         # Health-specific models
│   ├── tech_models.py           # Tech-specific models
│   ├── energy_models.py         # Energy-specific models
│   └── state_models.py          # State legislator and bill models
├── services/                   # Business logic
│   ├── influence_network.py     # Cross-sector relationship graph builder
│   └── power_map/               # Claim-to-legislation power mapping
├── connectors/                 # 24 data source API wrappers
│   ├── congress.py, congress_votes.py  # Congress.gov
│   ├── senate_lda.py            # Lobbying disclosures
│   ├── sec_edgar.py             # SEC filings
│   ├── fdic_bankfind.py         # FDIC bank data
│   ├── openfda.py               # FDA adverse events + recalls
│   ├── clinicaltrials.py        # ClinicalTrials.gov
│   ├── patentsview.py           # USPTO patents
│   ├── usaspending.py           # Government contracts
│   ├── federal_register.py      # Enforcement actions
│   ├── openstates.py            # State-level political data
│   ├── fec.py                   # Campaign finance
│   ├── alpha_vantage.py         # Stock data
│   └── ...                      # CFPB, FRED, CMS, FTC, etc.
├── jobs/                       # Data sync scripts
│   ├── seed_tracked_companies.py # Seed 500+ entities across all sectors
│   ├── sync_votes.py            # House roll call votes
│   ├── sync_congressional_trades.py  # Quiver API trades
│   ├── sync_donations.py        # FEC donation data
│   ├── sync_state_data.py       # OpenStates legislators + bills
│   ├── sync_{sector}_data.py    # Per-sector data syncs
│   ├── sync_{sector}_enforcement.py  # Per-sector enforcement
│   └── sync_{sector}_political_data.py  # Lobbying + contracts
├── frontend/                   # React web app (Vite)
│   └── src/
│       ├── pages/               # 40+ page components
│       ├── components/          # Shared UI (InfluenceGraph, ChoroplethMap, etc.)
│       ├── api/                 # TypeScript API clients per sector
│       ├── layouts/             # Per-sector layout wrappers
│       └── utils/               # Logo utility, formatters
├── mobile/                     # React Native / Expo (not yet updated)
└── deploy/                     # systemd service template
```

---

## API Endpoints (Selected)

### Politics
| Endpoint | Description |
|----------|-------------|
| `GET /people` | All Congress members with search, filter by state/party/chamber |
| `GET /people/{id}` | Member profile with stats, activity, votes |
| `GET /people/{id}/votes` | Roll call vote history with position breakdown |
| `GET /people/{id}/industry-donors` | Cross-sector corporate donations |
| `GET /people/{id}/trades` | Congressional stock trades |
| `GET /bills/{id}` | Bill detail with sponsors, timeline, full text links |
| `GET /votes` | All House roll call votes |
| `GET /congressional-trades` | All congressional stock trades |
| `GET /representatives?zip=` | Find reps by ZIP code |
| `GET /compare?ids=` | Side-by-side member comparison |

### Per-Sector (Finance, Health, Tech, Energy)
| Endpoint | Description |
|----------|-------------|
| `GET /{sector}/dashboard/stats` | Dashboard aggregate stats |
| `GET /{sector}/companies` | All tracked companies/institutions |
| `GET /{sector}/companies/{id}` | Company detail with all data |
| `GET /{sector}/companies/{id}/lobbying` | Lobbying filings |
| `GET /{sector}/companies/{id}/contracts` | Government contracts |
| `GET /{sector}/companies/{id}/enforcement` | Enforcement actions |
| `GET /{sector}/companies/{id}/donations` | PAC donations to politicians |
| `GET /{sector}/compare` | Side-by-side company comparison |

### Cross-Sector
| Endpoint | Description |
|----------|-------------|
| `GET /influence/stats` | Aggregate lobbying, contracts, enforcement across all sectors |
| `GET /influence/network` | Relationship graph (nodes + edges) for any entity |
| `GET /influence/spending-by-state` | Lobbying/donations aggregated by state |
| `GET /influence/trade-timeline` | Stock price + congressional trade markers |
| `GET /influence/data-freshness` | Sync timestamps and record counts |
| `GET /search?q=` | Global search across all entities |
| `GET /states` | States with data counts |
| `GET /states/{code}` | State dashboard (legislators, bills) |

---

## Getting Started

### Backend
```bash
pip install -r requirements.txt
cp .env.example .env   # Add API keys (Quiver, Alpha Vantage, OpenStates, etc.)
uvicorn main:app --host 0.0.0.0 --port 8006
```

### Web Frontend
```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

### Seed Data
```bash
python jobs/seed_tracked_companies.py          # 500+ entities across all sectors
python jobs/sync_votes.py                       # All House votes
python jobs/sync_congressional_trades.py        # Congressional stock trades
python jobs/sync_state_data.py --state mi       # State legislators + bills
```

### Mobile App (Expo)
```bash
cd mobile
npm install
npx expo start
```

---

## Architecture

- **Politics-first:** Every sector is recontextualized through political influence — lobbying, contracts, enforcement, and donations are the primary lens.
- **Source-linked data:** Every data point links back to its authoritative public source (Congress.gov, SEC EDGAR, FDA, EPA, etc.).
- **Cross-sector influence mapping:** CompanyDonation and CongressionalTrade models link companies to politicians across all sectors.
- **Modular routers:** One FastAPI router per sector + cross-sector influence router. New sectors plug in by adding a router file.
- **Full pagination:** All connectors paginate through complete API results — no artificial caps.
- **Deduplication:** Every sync job uses `dedupe_hash` with unique constraints to prevent duplicate records.
- **SQLite WAL mode:** Single-writer, many-reader concurrency. Run sync jobs sequentially to avoid lock contention.
- **Code-split frontend:** React.lazy() on all 40+ pages — users only load the sector they visit.

---

## Companion Project: Veritas

[Veritas](https://github.com/Obelus-Labs-LLC/Veritas) is a deterministic fact-verification engine built alongside WeThePeople. It extracts claims from audio and text, then cross-references them against public evidence databases without relying on LLMs.

---

## Support

WeThePeople is free and open source. If you find it useful:

- [Sponsor on GitHub](https://github.com/sponsors/Obelus-Labs-LLC)
- Star this repo
- Share it with someone who cares about government accountability

---

## Built By

**[Obelus Labs LLC](https://github.com/Obelus-Labs-LLC)**

The public record belongs to the public. This platform just makes it easier to read.

---

## License

All rights reserved. Contact Obelus Labs LLC for licensing inquiries.
