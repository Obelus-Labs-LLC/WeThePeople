import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Database, Code, Search } from 'lucide-react';

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

export default function VerifyDataPage() {
  return (
    <main className="flex-1 px-4 py-10 sm:py-16">
      <article className="max-w-[720px] mx-auto">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          Back to Journal
        </Link>

        <p className="text-xs uppercase tracking-[0.2em] text-amber-400 font-medium mb-3">
          Transparency
        </p>
        <h1
          className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-6"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          Verify Our Data
        </h1>

        <div className="space-y-4 mb-12">
          <p className="text-zinc-300 leading-[1.85] text-base">
            Every story published by The Influence Journal is built from public
            government records. We believe transparency requires verifiability.
            Below is a complete list of every data source we use, what we pull
            from it, and how you can look it up yourself.
          </p>
          <p className="text-zinc-300 leading-[1.85] text-base">
            You don't have to take our word for it. Check the data.
          </p>
        </div>

        {/* Data sources list */}
        <h2
          className="text-xl font-bold text-white mb-6"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          Our Data Sources
        </h2>

        <div className="space-y-4 mb-12">
          {DATA_SOURCES.map((source, i) => (
            <div
              key={source.name}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-400/15 shrink-0">
                    <span className="text-xs font-bold text-amber-400">{i + 1}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white">{source.name}</h3>
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors shrink-0"
                >
                  {source.domain}
                  <ExternalLink size={11} />
                </a>
              </div>

              <div className="space-y-2 pl-11">
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1.5">
                    <Database size={10} />
                    What We Pull
                  </p>
                  <p className="text-sm text-zinc-400 leading-relaxed">{source.what}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1.5">
                    <Search size={10} />
                    How to Verify
                  </p>
                  <p className="text-sm text-zinc-400 leading-relaxed">{source.howToVerify}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Open source callout */}
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-6 mb-8">
          <div className="flex items-start gap-3">
            <Code size={20} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Open Source</h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                Our code is open source. You can audit every query, every
                algorithm, and every data pipeline yourself.
              </p>
              <a
                href="https://github.com/Obelus-Labs-LLC/WeThePeople"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors font-medium"
              >
                github.com/Obelus-Labs-LLC/WeThePeople
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>

        {/* Additional links */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/coverage"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg transition-colors text-sm font-medium"
          >
            View Coverage Balance
          </Link>
          <Link
            to="/about"
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm font-medium"
          >
            About The Journal
          </Link>
        </div>
      </article>
    </main>
  );
}
