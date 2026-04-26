import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Database, Code, Search } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';

interface DataSource {
  name: string;
  url: string;
  domain: string;
  what: string;
  howToVerify: string;
}

const DATA_SOURCES: DataSource[] = [
  {
    name: 'Senate Lobbying Disclosures (LDA)',
    url: 'https://lda.senate.gov',
    domain: 'lda.senate.gov',
    what: 'All lobbying filings since 2020, including registrant, client, specific issues lobbied, and dollar amounts reported quarterly.',
    howToVerify: 'Search by registrant or client name. Each filing includes the lobbying firm, the client paying for lobbying, the issues discussed, and the amount spent.',
  },
  {
    name: 'USASpending.gov',
    url: 'https://usaspending.gov',
    domain: 'usaspending.gov',
    what: 'Federal government contracts, including awarding agency, recipient, award amount, and contract description.',
    howToVerify: 'Use Advanced Search to filter by recipient name, awarding agency, or keyword. Every contract includes a unique PIID and full award details.',
  },
  {
    name: 'SEC EDGAR',
    url: 'https://www.sec.gov/edgar',
    domain: 'sec.gov/edgar',
    what: 'Corporate filings including 10-K annual reports, 10-Q quarterly reports, and 8-K event disclosures.',
    howToVerify: 'Search by company name or CIK number. Look at 10-K filings for annual financials, 8-K filings for material events, and DEF 14A for executive compensation.',
  },
  {
    name: 'Federal Register',
    url: 'https://www.federalregister.gov',
    domain: 'federalregister.gov',
    what: 'Enforcement actions, proposed rules, final rules, and notices from all federal agencies.',
    howToVerify: 'Search by agency name, company name, or regulation keyword. Filter by document type (rule, proposed rule, notice) and date range.',
  },
  {
    name: 'House Financial Disclosures',
    url: 'https://disclosures-clerk.house.gov',
    domain: 'disclosures-clerk.house.gov',
    what: 'Congressional stock trades and financial disclosures filed under the STOCK Act.',
    howToVerify: 'Search by member name and year. Each Periodic Transaction Report lists the asset traded, transaction type (buy/sell), date, and estimated value range.',
  },
  {
    name: 'FEC Campaign Finance',
    url: 'https://www.fec.gov/data',
    domain: 'fec.gov/data',
    what: 'PAC donations, campaign contributions, independent expenditures, and committee filings.',
    howToVerify: 'Search by candidate, committee, or donor name. Every contribution is itemized with donor employer, amount, and date.',
  },
  {
    name: 'OpenFDA',
    url: 'https://open.fda.gov',
    domain: 'open.fda.gov',
    what: 'Drug recalls, adverse event reports, device safety data, and food enforcement reports.',
    howToVerify: 'Use the API explorer or search tools. Drug adverse events include the drug name, reaction, outcome, and reporter type.',
  },
  {
    name: 'ClinicalTrials.gov',
    url: 'https://clinicaltrials.gov',
    domain: 'clinicaltrials.gov',
    what: 'Clinical trial registrations, study results, sponsors, and status updates.',
    howToVerify: 'Search by sponsor/company name or condition. Each trial lists the sponsor, study design, enrollment, status, and any posted results.',
  },
  {
    name: 'EPA EnviroFacts',
    url: 'https://enviro.epa.gov',
    domain: 'enviro.epa.gov',
    what: 'Toxic Release Inventory (TRI), greenhouse gas emissions, facility compliance, and enforcement actions.',
    howToVerify: 'Search by facility name, ZIP code, or company. The TRI data shows exact chemicals released, quantities, and disposal methods by facility.',
  },
  {
    name: 'Congress.gov',
    url: 'https://www.congress.gov',
    domain: 'congress.gov',
    what: 'Bills, resolutions, roll-call votes, committee activity, and member information.',
    howToVerify: 'Search by bill number, keyword, or member name. Each bill page shows sponsors, cosponsors, committee referrals, actions, and vote records.',
  },
  {
    name: 'OpenStates',
    url: 'https://openstates.org',
    domain: 'openstates.org',
    what: 'State legislator data, state-level bill tracking, votes, and committee memberships.',
    howToVerify: 'Search by state and legislator name. Provides bill history, vote records, and committee assignments for all 50 state legislatures.',
  },
  {
    name: 'congress-legislators (GitHub)',
    url: 'https://github.com/unitedstates/congress-legislators',
    domain: 'github.com/unitedstates/congress-legislators',
    what: 'Comprehensive dataset of current and historical members of Congress, committee assignments, and leadership positions. CC0 public domain license.',
    howToVerify: 'Browse the YAML/CSV files directly on GitHub. Contains bioguide IDs, party affiliation, terms served, and committee membership history.',
  },
];

const backLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  textDecoration: 'none',
  transition: 'color 0.2s',
};
const linkLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-accent-text)',
  textDecoration: 'none',
  transition: 'color 0.2s',
};
const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: 'var(--color-accent-text)',
};
const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: 'clamp(36px, 5.5vw, 56px)',
  letterSpacing: '-0.025em',
  lineHeight: 1.05,
  color: 'var(--color-text-1)',
};
const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: '28px',
  letterSpacing: '-0.015em',
  color: 'var(--color-text-1)',
};
const subLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
};
const pillButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  padding: '11px 18px',
  borderRadius: '10px',
  border: '1px solid rgba(235,229,213,0.12)',
  background: 'rgba(235,229,213,0.02)',
  color: 'var(--color-text-1)',
  textDecoration: 'none',
  transition: 'all 0.2s',
};

export default function VerifyDataPage() {
  usePageMeta({
    title: 'Verify Our Data — The Influence Journal',
    description:
      'Every story cites primary government sources. Here is how to inspect, replicate, and audit the data behind every claim.',
    canonical: 'https://journal.wethepeopleforus.com/verify-our-data',
  });
  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-10 sm:py-16"
      style={{ color: 'var(--color-text-1)' }}
    >
      <article className="max-w-[720px] mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 mb-8"
          style={backLinkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
        >
          <ArrowLeft size={12} />
          Back to Journal
        </Link>

        <p className="mb-3" style={eyebrowStyle}>Transparency</p>
        <h1 className="mb-8" style={h1Style}>Verify Our Data</h1>

        <div className="space-y-5 mb-14">
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '17px',
              lineHeight: 1.75,
              color: 'var(--color-text-1)',
            }}
          >
            Every story published by The Influence Journal is built from public government records. We
            believe transparency requires verifiability. Below is a complete list of every data source we
            use, what we pull from it, and how you can look it up yourself.
          </p>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: '22px',
              letterSpacing: '-0.01em',
              color: 'var(--color-text-1)',
              borderLeft: '3px solid var(--color-accent)',
              paddingLeft: 18,
            }}
          >
            You don't have to take our word for it. Check the data.
          </p>
        </div>

        <h2 className="mb-6" style={h2Style}>Our Data Sources</h2>

        <div className="space-y-4 mb-12">
          {DATA_SOURCES.map((source, i) => (
            <div
              key={source.name}
              style={{
                borderRadius: '14px',
                border: '1px solid rgba(235,229,213,0.08)',
                background: 'var(--color-surface)',
                padding: '20px 22px',
              }}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '8px',
                      background: 'rgba(197,160,40,0.12)',
                      border: '1px solid rgba(197,160,40,0.28)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--color-accent-text)',
                      }}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 900,
                      fontSize: '18px',
                      letterSpacing: '-0.005em',
                      color: 'var(--color-text-1)',
                    }}
                  >
                    {source.name}
                  </h3>
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 shrink-0"
                  style={linkLabelStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-accent-text)')}
                >
                  {source.domain}
                  <ExternalLink size={11} />
                </a>
              </div>

              <div className="space-y-3" style={{ paddingLeft: 44 }}>
                <div>
                  <p className="mb-1 flex items-center gap-1.5" style={subLabelStyle}>
                    <Database size={10} />
                    What We Pull
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px',
                      lineHeight: 1.65,
                      color: 'var(--color-text-2)',
                    }}
                  >
                    {source.what}
                  </p>
                </div>
                <div>
                  <p className="mb-1 flex items-center gap-1.5" style={subLabelStyle}>
                    <Search size={10} />
                    How to Verify
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px',
                      lineHeight: 1.65,
                      color: 'var(--color-text-2)',
                    }}
                  >
                    {source.howToVerify}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Open source callout */}
        <div
          className="mb-10 relative overflow-hidden"
          style={{
            borderRadius: '14px',
            border: '1px solid rgba(197,160,40,0.25)',
            background: 'linear-gradient(135deg, rgba(197,160,40,0.06) 0%, var(--color-surface) 60%)',
            padding: '22px',
          }}
        >
          <div className="flex items-start gap-3 relative" style={{ zIndex: 1 }}>
            <Code size={20} style={{ color: 'var(--color-accent-text)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <h3
                className="mb-2"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-1)',
                }}
              >
                Open Source
              </h3>
              <p
                className="mb-3"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  lineHeight: 1.65,
                  color: 'var(--color-text-2)',
                }}
              >
                Our code is open source. You can audit every query, every algorithm, and every data
                pipeline yourself.
              </p>
              <a
                href="https://github.com/Obelus-Labs-LLC/WeThePeople"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
                style={linkLabelStyle}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-accent-text)')}
              >
                github.com/Obelus-Labs-LLC/WeThePeople
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>

        {/* Additional links */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/coverage"
            style={pillButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(197,160,40,0.35)';
              e.currentTarget.style.color = 'var(--color-accent-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(235,229,213,0.12)';
              e.currentTarget.style.color = 'var(--color-text-1)';
            }}
          >
            View Coverage Balance
          </Link>
          <Link
            to="/about"
            style={pillButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(197,160,40,0.35)';
              e.currentTarget.style.color = 'var(--color-accent-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(235,229,213,0.12)';
              e.currentTarget.style.color = 'var(--color-text-1)';
            }}
          >
            About The Journal
          </Link>
        </div>
      </article>
    </main>
  );
}
