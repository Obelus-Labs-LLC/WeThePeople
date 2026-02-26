# WeThePeople

**A multi-sector public accountability platform that aggregates data from 24+ federal government sources into one accessible tool for citizens.**

WeThePeople pulls real data from Congress.gov, the SEC, FDA, USPTO, and dozens of other public APIs — then organizes it so regular people can see what their elected officials, financial institutions, pharmaceutical companies, and tech giants are actually doing. No spin. No editorials. Just the public record, structured and searchable.

---

## What It Tracks

### Politics
Tracks Congress members, their sponsored and cosponsored legislation, voting records, and bill progress through committee and floor votes. Includes CRS bill summaries, full text links, policy area classification, and accountability scoring.

**Data sources:** Congress.gov API, FEC campaign finance, ProPublica Congress API

### Finance
Monitors major financial institutions through SEC filings, FDIC bank data, CFPB consumer complaints, Federal Reserve economic indicators (FRED), and Fed press releases. Surfaces enforcement actions, complaint patterns, and institutional risk signals.

**Data sources:** SEC EDGAR, FDIC BankFind, CFPB Complaint Database, FRED API, Federal Reserve press releases

### Health
Tracks pharmaceutical and biotech companies through FDA adverse event reports (FAERS), FDA recalls, active clinical trials, and CMS Open Payments (industry payments to physicians). Connects drug safety signals to the companies responsible.

**Data sources:** FDA FAERS (openFDA), FDA Recalls, ClinicalTrials.gov, CMS Open Payments

### Technology
Follows Big Tech companies through SEC filings, patent activity, federal government contracts, and lobbying disclosure. Maps the intersection of innovation, public money, and regulatory influence.

**Data sources:** SEC EDGAR, USPTO PatentsView, USASpending.gov, Alpha Vantage

---

## Current Stats

| Metric | Count |
|--------|-------|
| Tracked Congress members | 77 (expanding to 535) |
| Bills in database | 12,202 (76% enriched with summaries + full text) |
| Government data connectors | 24+ |
| Live sectors | 4 |
| Federal data sources | 16 unique APIs |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python, FastAPI, SQLAlchemy |
| Database | SQLite (production), with migration support via Alembic |
| Mobile app | React Native, Expo, TypeScript |
| Hosting | Google Cloud Platform (Compute Engine) |
| Data pipeline | Custom Python connectors with rate limiting, retry logic, and audit logging |

---

## Project Structure

```
├── main.py              # FastAPI application (all API routes)
├── models/              # SQLAlchemy data models (politics, finance, health, tech)
├── connectors/          # Data source connectors (Congress.gov, SEC, FDA, USPTO, etc.)
├── jobs/                # Background sync and enrichment jobs
├── services/            # Business logic layer
├── mobile/              # React Native / Expo mobile application
├── frontend/            # Web frontend
├── scripts/             # Utility and maintenance scripts
├── tests/               # Test suite
├── docs/                # Technical documentation
├── data/                # Seed data and reference files
└── utils/               # Shared utilities (normalization, hashing, etc.)
```

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
