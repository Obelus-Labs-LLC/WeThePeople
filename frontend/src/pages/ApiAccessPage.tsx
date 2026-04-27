import LongformDoc, {
  type LongformSection,
} from '../components/LongformDoc';

/**
 * Public-facing API & data-access overview.
 *
 * Surfaces the existing register + create-key flow so journalists,
 * researchers, and developers can self-serve. Documents:
 *   - The three tiers (free / pro / enterprise) and their daily quotas
 *   - The /docs Swagger UI for endpoint reference
 *   - The /export/{table}.csv per-table downloads
 *   - The /bulk/snapshot nightly SQLite dump
 *   - The HuggingFace dataset (once published)
 *
 * No new backend wiring — this page is documentation. The endpoints it
 * describes are live as of this commit (see `routers/bulk.py` and
 * `routers/auth.py`).
 */

const API_BASE = 'https://api.wethepeopleforus.com';

const SECTIONS: LongformSection[] = [
  {
    num: 1,
    id: 'overview',
    title: 'Three ways to get the data',
    body: [
      'Every dataset on WeThePeople is publicly redistributable. There are three ways to access it, listed by increasing weight: a free read-only API for one-off lookups, per-table CSV downloads for spreadsheet work, and a nightly SQLite snapshot for full-corpus analysis.',
      'No registration is required for read-only API calls or for the CSV / SQLite downloads. An API key is needed only when you want a higher rate limit or access to the verification (Veritas) tier.',
    ],
  },
  {
    num: 2,
    id: 'rest-api',
    title: 'REST API',
    body: [
      `Base URL: ${API_BASE}`,
      'Full Swagger UI lives at /docs and the OpenAPI 3 spec at /openapi.json. Both are open without auth — point your favourite codegen tool at the spec.',
      'Every response carries RateLimit-Limit, RateLimit-Remaining, and RateLimit-Reset headers so your client can self-pace without trial-and-erroring its way to 429s.',
    ],
    list: [
      <a href={`${API_BASE}/docs`} target="_blank" rel="noopener noreferrer">Interactive docs (Swagger UI) →</a>,
      <a href={`${API_BASE}/redoc`} target="_blank" rel="noopener noreferrer">Reference docs (ReDoc) →</a>,
      <a href={`${API_BASE}/openapi.json`} target="_blank" rel="noopener noreferrer">OpenAPI 3 specification (JSON) →</a>,
    ],
  },
  {
    num: 3,
    id: 'tiers',
    title: 'Tiers & rate limits',
    body: [
      'Public read endpoints (the politicians, companies, lobbying, contracts, stories, and search routes) are open to anonymous traffic at 60 requests / minute / IP.',
      'The verification (Veritas) endpoints have a separate per-day budget that scales with your tier:',
    ],
    list: [
      <span><strong>Free</strong> — 5 verification requests / day. No signup needed; rate-limited by IP.</span>,
      <span><strong>Pro</strong> — 100 verification requests / day. Create an account at /auth/register and mint a key at /auth/api-keys.</span>,
      <span><strong>Enterprise</strong> — unlimited verification, priority support. Contact wethepeopleforus@gmail.com.</span>,
    ],
    callout: {
      label: 'Get a key',
      text: 'POST your email + password to /auth/register, then POST a name + scopes to /auth/api-keys. The raw key is shown ONCE — store it. Send it on subsequent requests as the X-WTP-API-KEY header.',
    },
  },
  {
    num: 4,
    id: 'csv-exports',
    title: 'CSV exports (per table)',
    body: [
      'Single-table downloads, streamed as CSV. Useful when you want to pull one slice into a spreadsheet without standing up a database. Each export has a row cap so a single request stays bounded; for the full corpus see the bulk snapshot below.',
    ],
    list: [
      <code>GET /export/stories.csv</code>,
      <code>GET /export/lobbying.csv?sector=tech&year=2024</code>,
      <code>GET /export/congressional_trades.csv</code>,
      <code>GET /export/company_donations.csv?year=2024</code>,
      <code>GET /export/tracked_members.csv</code>,
      <span>Full machine-readable index: <a href={`${API_BASE}/export/_index`} target="_blank" rel="noopener noreferrer">/export/_index</a></span>,
    ],
  },
  {
    num: 5,
    id: 'bulk-snapshot',
    title: 'Bulk SQLite snapshot',
    body: [
      'Nightly compressed dump of the entire public dataset. Sensitive tables (users, API keys, audit logs, watchlists) are stripped; story drafts and retractions are filtered out. Everything else — every lobbying filing, every contract, every congressional trade, every donation, every published story — is included.',
      'Schema is the same as the live database. Open it in any SQLite client (DB Browser for SQLite, sqlite3 CLI, DuckDB, etc.) and run SQL directly.',
    ],
    list: [
      <a href={`${API_BASE}/bulk/snapshot`} target="_blank" rel="noopener noreferrer">Latest snapshot (redirects to .db.gz) →</a>,
      <a href={`${API_BASE}/bulk/manifest`} target="_blank" rel="noopener noreferrer">Manifest (filename, size, sha256) →</a>,
    ],
    callout: {
      label: 'Verify your download',
      text: 'The manifest exposes a sha256 of the .db.gz. After downloading, run sha256sum on your file and compare. If it matches, the dump is intact and bit-for-bit what we generated.',
    },
  },
  {
    num: 6,
    id: 'huggingface',
    title: 'HuggingFace dataset',
    body: [
      'For ML / academic use we plan to publish a mirror as a HuggingFace dataset (huggingface.co/datasets/obelus-labs/wethepeople). Updates align with the nightly snapshot. Same content, different distribution channel — pick whichever fits your tooling.',
    ],
  },
  {
    num: 7,
    id: 'license',
    title: 'License & attribution',
    body: [
      'The schema, code, and platform are AGPL-3.0. Underlying data is public-domain US government records (Senate LDA filings, FEC, USAspending.gov, congressional disclosures, FDA, etc.) and is redistributed under the originating agency\'s terms.',
      'Attribution is appreciated but not required: "Data: WeThePeople (wethepeopleforus.com), aggregated from public US government records."',
    ],
  },
  {
    num: 8,
    id: 'contact',
    title: 'Questions, bugs, partnerships',
    body: [
      'Email wethepeopleforus@gmail.com for: API issues, dataset corrections, partnership inquiries, custom data work, security disclosures, or anything else not covered above.',
      'Source code: github.com/Obelus-Labs-LLC/WeThePeople',
    ],
  },
];

export default function ApiAccessPage() {
  return (
    <LongformDoc
      overline="Developers · Researchers · Journalists"
      title="API & data access."
      lastUpdated="Apr 2026"
      sections={SECTIONS}
    />
  );
}
