import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Footer from '../components/Footer';
import { LEGAL_LAST_UPDATED } from '../config';

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#181c21] text-white">
      <div className="flex-1 max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold mb-2">Disclaimer</h1>
        <p className="text-sm text-slate-400 mb-8">Last updated: {LEGAL_LAST_UPDATED}</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white">General Disclaimer</h2>
            <p>WeThePeople is a civic transparency platform that aggregates publicly available data from government sources. The information presented on this site is for general informational purposes only and should not be construed as professional advice of any kind.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Financial Data</h2>
            <p>Information about congressional stock trades, insider trading, stock fundamentals, and financial disclosures is sourced from public filings and third-party data providers. This data may be delayed, incomplete, or contain errors. <strong>Nothing on this platform constitutes a recommendation to buy, sell, or hold any security.</strong></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Political Data</h2>
            <p>Voting records, legislative actions, lobbying disclosures, and campaign finance data are sourced from Congress.gov, the Senate Lobbying Disclosure Act database, the Federal Election Commission, and other official sources. We present this data as reported by these agencies without editorial judgment.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Enforcement Data</h2>
            <p>Enforcement actions displayed on this platform are sourced from the Federal Register, SEC, FDA, EPA, FTC, and other regulatory agencies. The presence of an enforcement action does not imply guilt or wrongdoing — many enforcement proceedings result in settlements without admission of liability.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Data Sources</h2>
            <p>We source data from the following public APIs and databases:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Congress.gov API (votes, bills, legislative actions)</li>
              <li>Senate Lobbying Disclosure Act API (lobbying filings)</li>
              <li>USASpending.gov (government contracts)</li>
              <li>Federal Register API (enforcement actions, regulations)</li>
              <li>SEC EDGAR (financial filings, insider trades)</li>
              <li>OpenFDA (adverse events, recalls, clinical trials)</li>
              <li>USPTO (patent data)</li>
              <li>EPA ECHO (environmental enforcement, emissions)</li>
              <li>Quiver Quantitative (congressional stock trades)</li>
              <li>AInvest (congressional trade filing delays)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">No Warranty</h2>
            <p>This platform is provided "as is" without warranty of any kind. Obelus Labs LLC makes no representations about the accuracy, reliability, completeness, or timeliness of the content. Use at your own risk.</p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
