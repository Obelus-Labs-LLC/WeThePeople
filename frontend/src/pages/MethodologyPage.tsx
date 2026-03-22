import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

const DATA_SOURCES = [
  { source: 'Senate LDA', dataType: 'Lobbying filings', sectors: 'All', frequency: 'Quarterly', notes: 'Filing-level data from the Senate Lobbying Disclosure Act database' },
  { source: 'USASpending.gov', dataType: 'Government contracts', sectors: 'All', frequency: 'Monthly', notes: 'Federal contracts only; award-level detail' },
  { source: 'Federal Register', dataType: 'Enforcement actions', sectors: 'All', frequency: 'Weekly', notes: 'Rules, notices, and enforcement actions' },
  { source: 'Congress.gov', dataType: 'Votes, bills', sectors: 'Politics', frequency: 'Daily', notes: 'House and Senate roll call votes, bill text and status' },
  { source: 'OpenFDA', dataType: 'Adverse events, recalls', sectors: 'Health', frequency: 'Monthly', notes: 'FAERS database for drug adverse event reports' },
  { source: 'ClinicalTrials.gov', dataType: 'Clinical trials', sectors: 'Health', frequency: 'Monthly', notes: 'Active and completed clinical trial registrations' },
  { source: 'SEC EDGAR', dataType: 'Insider trades, filings', sectors: 'Finance', frequency: 'Daily', notes: 'Form 4 insider transaction data' },
  { source: 'USPTO', dataType: 'Patents', sectors: 'Technology', frequency: 'Monthly', notes: 'Published patent grants via PatentsView API' },
  { source: 'EPA GHGRP', dataType: 'Emissions data', sectors: 'Energy', frequency: 'Annual', notes: 'Facility-level greenhouse gas reporting' },
];

const LIMITATIONS = [
  'Congressional trade data is sourced from STOCK Act financial disclosure filings. Some House financial disclosure PDFs are scanned images and could not be parsed (~6 filings).',
  'OpenSanctions entity checks (sanctions, PEP, watchlist) require an API key that may not be configured in all environments.',
  'Enforcement records may not be exhaustive. Some agencies publish enforcement data on inconsistent schedules.',
  'AI-generated summaries are available for votes and enforcement actions. Lobbying and contract summaries are pending due to cost constraints.',
  'Stock fundamental data (Alpha Vantage) is limited to 25 requests per day on the free tier, so coverage may be incomplete.',
];

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-6 py-16 lg:px-8 lg:py-20">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1 font-body text-sm text-white/40 hover:text-white/70 transition-colors no-underline mb-10"
        >
          &larr; Back to Home
        </Link>

        {/* Title */}
        <h1 className="font-heading text-4xl font-bold tracking-tight text-white lg:text-5xl mb-4">
          Methodology
        </h1>
        <p className="font-body text-lg text-white/50 leading-relaxed max-w-2xl mb-12">
          How WeThePeople collects, processes, and presents public accountability data across five sectors.
        </p>

        {/* Overview */}
        <section className="mb-14">
          <h2 className="font-heading text-xl font-bold tracking-tight text-white mb-4">
            Overview
          </h2>
          <div className="space-y-3 font-body text-sm text-white/60 leading-relaxed">
            <p>
              WeThePeople aggregates publicly available government data to illuminate the connections between industry and politics. The platform tracks lobbying expenditures, government contracts, enforcement actions, insider trading, and other data across five sectors: Politics, Finance, Health, Technology, and Energy.
            </p>
            <p>
              Every sector is recontextualized through a political influence lens. Rather than duplicating financial data portals, the platform focuses on answering: who is spending money to influence government, who is receiving government money, and who is being held accountable.
            </p>
            <p>
              All data is sourced from official government APIs and public records. No data is behind paywalls, and no proprietary analysis or scoring is applied. The raw records are linked to their original sources so users can verify every data point.
            </p>
          </div>
        </section>

        {/* Data Sources Table */}
        <section className="mb-14">
          <h2 className="font-heading text-xl font-bold tracking-tight text-white mb-4">
            Data Sources
          </h2>
          <p className="font-body text-sm text-white/40 mb-6">
            All data is sourced from official U.S. government APIs and public databases.
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="px-4 py-3 font-heading text-[11px] font-bold tracking-wider uppercase text-white/50">Source</th>
                  <th className="px-4 py-3 font-heading text-[11px] font-bold tracking-wider uppercase text-white/50">Data Type</th>
                  <th className="px-4 py-3 font-heading text-[11px] font-bold tracking-wider uppercase text-white/50">Sectors</th>
                  <th className="px-4 py-3 font-heading text-[11px] font-bold tracking-wider uppercase text-white/50">Frequency</th>
                  <th className="px-4 py-3 font-heading text-[11px] font-bold tracking-wider uppercase text-white/50">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {DATA_SOURCES.map((row) => (
                  <tr key={row.source} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-white/80 whitespace-nowrap">{row.source}</td>
                    <td className="px-4 py-3 font-body text-xs text-white/60">{row.dataType}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/50">
                        {row.sectors}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/40">{row.frequency}</td>
                    <td className="px-4 py-3 font-body text-xs text-white/40 max-w-[250px]">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Known Limitations */}
        <section className="mb-14">
          <h2 className="font-heading text-xl font-bold tracking-tight text-white mb-4">
            Known Limitations
          </h2>
          <ul className="space-y-3">
            {LIMITATIONS.map((item, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-white/20 shrink-0" />
                <span className="font-body text-sm text-white/50 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Disclaimer */}
        <section className="mb-14">
          <h2 className="font-heading text-xl font-bold tracking-tight text-white mb-4">
            Disclaimer
          </h2>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
            <p className="font-body text-sm text-white/50 leading-relaxed">
              This platform aggregates publicly available data from U.S. government sources. We do not create or verify the underlying records. Data accuracy depends on the originating agencies. This platform is for informational purposes only and does not constitute financial, legal, or investment advice. Use of this site does not create any professional relationship.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className="mb-16">
          <h2 className="font-heading text-xl font-bold tracking-tight text-white mb-4">
            Questions or Corrections
          </h2>
          <p className="font-body text-sm text-white/50 leading-relaxed">
            If you find data discrepancies or have questions about our methodology, please open an issue on our{' '}
            <a
              href="https://github.com/Obelus-Labs-LLC/WeThePeople"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              GitHub repository
            </a>
            . WeThePeople is open source and we welcome community contributions.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
