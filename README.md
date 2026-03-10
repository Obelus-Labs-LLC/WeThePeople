# WeThePeople

**A multi-sector public accountability platform that aggregates data from 24+ federal government sources into one accessible tool for citizens.**

WeThePeople pulls real data from Congress.gov, the SEC, FDA, USPTO/Google Patents, and dozens of other public APIs — then organizes it so regular people can see what their elected officials, financial institutions, pharmaceutical companies, and tech giants are actually doing. No spin. No editorials. Just the public record, structured and searchable.

---

## What It Tracks

### Politics
Tracks all 537 active members of the 119th Congress — their sponsored and cosponsored legislation, voting records, and bill progress through committee and floor votes. Includes CRS bill summaries, full text links, policy area classification, and real legislative activity timelines.

**Data sources:** Congress.gov API, Wikipedia (profiles), FEC campaign finance

### Finance
Monitors major financial institutions through SEC filings, FDIC bank data, CFPB consumer complaints, Federal Reserve economic indicators (FRED), and Fed press releases. Surfaces enforcement actions, complaint patterns, and institutional risk signals.

**Data sources:** SEC EDGAR, FDIC BankFind, CFPB Complaint Database, FRED API, Federal Reserve press releases

### Health
Tracks pharmaceutical and biotech companies through FDA adverse event reports (FAERS), FDA recalls, active clinical trials, and CMS Open Payments (industry payments to physicians). Connects drug safety signals to the companies responsible.

**Data sources:** FDA FAERS (openFDA), FDA Recalls, ClinicalTrials.gov, CMS Open Payments

### Technology
Follows 100 major tech companies through SEC filings, patent activity (via Google BigQuery public patent dataset), federal government contracts (USASpending/FPDS), and lobbying disclosure. Maps the intersection of innovation, public money, and regulatory influence.

**Data sources:** SEC EDGAR, Google BigQuery Patents Public Data, USASpending.gov (FPDS), Alpha Vantage

---

## Current Stats

| Metric | Count |
|--------|-------|
| Tracked Congress members | 537 (all active, 119th Congress) |
| Legislative ground truth entries | 1,136,379 |
| Bills in database | 39,064 |
| Tech companies tracked | 100 |
| Patents indexed | 4,220 (via BigQuery) |
| Government data connectors | 24+ |
| Live sectors | 4 |
| Federal data sources | 16+ unique APIs |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python 3.11, FastAPI, SQLAlchemy |
| Database | SQLite (WAL mode), Alembic migrations |
| Mobile app | React Native, Expo, TypeScript |
| Hosting | Google Cloud Platform (Compute Engine) |
| Data pipeline | Custom Python connectors with rate limiting, retry logic, and audit logging |
| Patent data | Google BigQuery (`patents-public-data.patents.publications`) |

---

## Project Structure

```
WeThePeople-App/
├── main.py              # FastAPI application (all API routes)
├── models/              # SQLAlchemy data models (politics, finance, health, tech)
├── connectors/          # Data source connectors (14 modules)
│   ├── congress.py          # Congress.gov API (bills, members, legislation)
│   ├── congress_votes.py    # Roll call vote ingestion
│   ├── wikipedia.py         # Politician profile enrichment (state-disambiguated)
│   ├── fec.py               # FEC campaign finance
│   ├── patentsview.py       # USPTO PatentsView (legacy, replaced by BigQuery)
│   ├── senate_lda.py        # Senate lobbying disclosure
│   └── ...                  # SEC, FDA, FDIC, FRED, FTC, etc.
├── src/                 # React Native / Expo mobile application (TypeScript)
│   ├── screens/             # 19 screens (Home, People, Person, Bill, Tech, etc.)
│   ├── components/          # Shared UI components
│   ├── services/            # API client, types
│   └── navigation/          # Stack navigator setup
├── jobs/                # Background sync and enrichment jobs
├── services/            # Business logic layer
├── scripts/             # Utility and maintenance scripts
│   ├── manage_members.py    # Bulk-load / manage tracked members
│   ├── backfill_new_members.py  # Batch ingest legislation for new members
│   └── fetch_congress_roster.py # Fetch full 119th Congress roster
├── utils/               # Shared utilities (normalization, hashing, state names)
├── data/                # Seed data and reference files
├── docs/                # Technical documentation (15+ docs)
├── tests/               # Test suite
└── alembic/             # Database migration scripts
```

---

## API Endpoints (Selected)

| Endpoint | Description |
|----------|-------------|
| `GET /people?limit=&offset=` | Paginated list of all Congress members |
| `GET /people/{person_id}/activity` | Real legislative activity timeline |
| `GET /people/{person_id}/profile` | Wikipedia profile (state-disambiguated) |
| `GET /bills/{bill_id}` | Bill details with summary, sponsors, status |
| `GET /tech/companies` | Tech company list with patent counts |
| `GET /tech/companies/{id}/patents` | Patent details for a company |
| `GET /dashboard` | Cross-sector summary stats |

---

## Key Architecture Decisions

- **Ground truth over claims:** Legislative activity is sourced directly from Congress.gov API, not scraped or inferred. Each `member_bills_groundtruth` entry links a member to a bill via a verified relationship (sponsor, cosponsor, committee).
- **State-disambiguated profiles:** Wikipedia lookups include state + chamber context to avoid name collisions (e.g., "John Kennedy" resolves to the Louisiana senator, not JFK).
- **BigQuery for patents:** After PatentsView suspended API key registration, patent data comes from Google's public BigQuery patent dataset with name-matching heuristics and manual overrides for edge cases.
- **SQLite in WAL mode:** Single-writer, many-reader concurrency. Sufficient for current scale, easy to back up (`cp wethepeople.db backup.db`).

---

## Roadmap

### Completed
- **Phase 0 — Foundation (Feb 2026):** 24+ government data connectors, 4-sector architecture, FastAPI backend, SQLite + Alembic, GCP deployment
- **Phase 1 — 535 Congress Expansion (Mar 2026):** Full 119th Congress roster (537 members), 1.1M+ ground truth entries, 39K bills, activity timeline API, paginated people endpoint
- **Phase 1.5 — Data Quality (Mar 2026):** Wikipedia profile disambiguation, BigQuery patent pipeline (4,220 patents), React Native mobile app (19 screens)

### In Progress
- **Phase 2 — Mobile App Polish:** EAS build pipeline, activity screen integration, voting records, pull-to-refresh, push notifications

### Planned
- **Phase 3 — Finance & Health Depth:** CFPB complaint trends, SEC filing timelines, FDA adverse event scoring, clinical trial tracking
- **Phase 4 — Public Launch:** API rate limiting, App Store submission, landing page, automated daily data refresh
- **Phase 5 — Veritas Integration:** Claim extraction from hearing transcripts, cross-reference against ground truth data
- **Phase 6 — Community:** User accounts, district filtering, member-vs-member comparisons, embeddable widgets

---

## Companion Project: Veritas

[Veritas](https://github.com/Obelus-Labs-LLC/Veritas) is a separate, deterministic fact-verification engine built alongside WeThePeople. It extracts claims from audio and text sources, then cross-references them against public evidence databases (Crossref, arXiv, PubMed, SEC EDGAR, FRED, and others) — all without relying on large language models.

The two projects are currently independent. The planned integration path is for WeThePeople to use Veritas as its claim verification layer — allowing users to fact-check statements made by public officials against the public record that WeThePeople already aggregates.

---

## Built By

**[Obelus Labs LLC](https://github.com/Obelus-Labs-LLC)**

WeThePeople is a civic technology project built to make public accountability data accessible to everyone. The public record belongs to the public — this platform just makes it easier to read.

---

## License

All rights reserved. Contact Obelus Labs LLC for licensing inquiries.
