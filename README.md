# WeThePeople

**A civic transparency platform that aggregates data from 24+ federal sources into one app so anyone can see what politicians, banks, pharma companies, and tech giants are actually doing.**

No spin. No editorials. Just the public record — structured, searchable, and linked back to its source.

---

## What It Tracks

### Politics
All 537 active members of the 119th Congress — sponsored and cosponsored legislation, voting records, bill progress, CRS summaries, full text links, and policy area classification.

**Sources:** Congress.gov API, Wikipedia, FEC

### Finance
Major financial institutions — SEC filings, FDIC bank data, CFPB consumer complaints, Federal Reserve economic indicators (FRED), and Fed press releases. Surfaces enforcement actions, complaint patterns, and institutional risk signals.

**Sources:** SEC EDGAR, FDIC BankFind, CFPB, FRED API, Federal Reserve

### Health
Pharmaceutical and biotech companies — FDA adverse event reports (FAERS), recalls, active clinical trials, and CMS Open Payments (industry payments to physicians).

**Sources:** openFDA, ClinicalTrials.gov, CMS Open Payments

### Technology
100 major tech companies — patent activity, federal government contracts, lobbying disclosure, and SEC filings. Maps the intersection of innovation, public money, and regulatory influence.

**Sources:** Google BigQuery Patents, USASpending.gov, Senate LDA, SEC EDGAR

### Coming Soon
Defense, Energy, Education, and Infrastructure sectors are in development.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, SQLAlchemy, SQLite (WAL mode) |
| Database migrations | Alembic |
| Mobile app | React Native, Expo SDK 54, TypeScript |
| Web frontend | React, Vite, TypeScript |
| Hosting | Google Cloud Platform (Compute Engine) |
| Data pipeline | 14 Python connectors with rate limiting, retry logic, and audit logging |
| Patent data | Google BigQuery (`patents-public-data.patents.publications`) |

---

## Project Structure

```
WeThePeople/
├── main.py                 # FastAPI entry point
├── routers/                # API route handlers (one per sector)
│   ├── politics.py
│   ├── finance.py
│   ├── health.py
│   ├── tech.py
│   ├── defense.py, energy.py, education.py, infrastructure.py
│   └── common.py           # Shared router utilities
├── models/                 # SQLAlchemy data models
├── services/               # Business logic
│   ├── matching/            # Claim-to-evidence matching
│   ├── enrichment/          # Bill timeline enrichment
│   ├── evidence/            # Evidence validation
│   ├── extraction/          # Text extraction
│   ├── llm/                 # LLM client and prompts
│   ├── ops/                 # Operational utilities
│   └── power_map/           # Power mapping
├── connectors/             # 14 data source connectors
│   ├── congress.py          # Congress.gov API
│   ├── congress_votes.py    # Roll call votes
│   ├── fec.py               # FEC campaign finance
│   ├── patentsview.py       # USPTO PatentsView
│   ├── senate_lda.py        # Lobbying disclosure
│   └── ...                  # SEC, FDA, FDIC, FRED, FTC, etc.
├── jobs/                   # Background sync and enrichment jobs
├── scripts/                # Utility and maintenance scripts
├── tests/                  # 62 test files
├── utils/                  # Shared utilities
├── alembic/                # Database migrations
├── mobile/                 # React Native / Expo mobile app
│   └── src/
│       ├── screens/         # 19 screens
│       ├── components/
│       ├── api/
│       └── navigation/
├── src/                    # Shared RN source (components, screens)
│   ├── screens/             # 19 screens
│   ├── components/          # FilterPillGroup, PersonScreen tabs, UI
│   └── navigation/          # Stack navigators, type definitions
├── frontend/               # React web frontend (Vite)
│   └── src/
│       ├── pages/
│       ├── components/
│       └── api/
├── cli/                    # CLI tools for ingestion and health checks
├── assets/                 # App icons and splash images
└── deploy/                 # systemd service file
```

---

## API Endpoints (Selected)

| Endpoint | Description |
|----------|-------------|
| `GET /people` | Paginated list of Congress members |
| `GET /people/{id}/activity` | Legislative activity timeline |
| `GET /people/{id}/profile` | Member profile |
| `GET /bills/{id}` | Bill details with summary, sponsors, status |
| `GET /finance/institutions` | Financial institutions list |
| `GET /finance/institutions/{id}` | Institution detail (FDIC, complaints, enforcement) |
| `GET /health/companies` | Health/pharma company list |
| `GET /health/companies/{id}` | Company detail (FDA events, trials, recalls) |
| `GET /tech/companies` | Tech company list |
| `GET /tech/companies/{id}/patents` | Patent details |
| `GET /tech/companies/{id}/contracts` | Federal contracts |
| `GET /tech/companies/{id}/lobbying` | Lobbying filings |
| `GET /dashboard` | Cross-sector summary stats |

---

## Architecture

- **Ground truth over claims:** Legislative activity is sourced directly from Congress.gov, not scraped or inferred.
- **Modular routers:** One FastAPI router per sector, mounted in `main.py`. New sectors plug in by adding a router file.
- **State-disambiguated profiles:** Wikipedia lookups include state + chamber context to avoid name collisions.
- **BigQuery for patents:** Patent data comes from Google's public BigQuery dataset after PatentsView suspended API key registration.
- **SQLite in WAL mode:** Single-writer, many-reader concurrency. Easy to back up, sufficient for current scale.
- **Source-linked data:** Every data point links back to its authoritative public source (Congress.gov, FDA, SEC, etc.).

---

## Getting Started

### Backend
```bash
pip install -r requirements.txt
cp .env.example .env   # Fill in API keys
uvicorn main:app --host 0.0.0.0 --port 8006
```

### Mobile App (Expo)
```bash
cd mobile
npm install
npx expo start
```

### Web Frontend
```bash
cd frontend
npm install
npm run dev
```

### Running Tests
```bash
pytest tests/
```

---

## Companion Project: Veritas

[Veritas](https://github.com/Obelus-Labs-LLC/Veritas) is a deterministic fact-verification engine built alongside WeThePeople. It extracts claims from audio and text, then cross-references them against public evidence databases — without relying on LLMs. The planned integration path is for WeThePeople to use Veritas as its claim verification layer.

---

## Built By

**[Obelus Labs LLC](https://github.com/Obelus-Labs-LLC)**

WeThePeople is a civic technology project built to make public accountability data accessible to everyone. The public record belongs to the public — this platform just makes it easier to read.

---

## License

All rights reserved. Contact Obelus Labs LLC for licensing inquiries.
