import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Footer from '../components/Footer';

export default function TermsOfUsePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#181c21] text-white">
      <div className="flex-1 max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold mb-2">Terms of Use</h1>
        <p className="text-sm text-slate-400 mb-8">Last updated: March 18, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white">1. Acceptance of Terms</h2>
            <p>By accessing or using WeThePeople ("the Service"), operated by Obelus Labs LLC, you agree to be bound by these Terms of Use. If you do not agree to these terms, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">2. Nature of the Service</h2>
            <p>WeThePeople is a civic transparency tool that aggregates publicly available data about government officials, lobbying activity, government contracts, enforcement actions, and related financial disclosures. The Service is provided for informational and educational purposes only.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">3. No Financial or Legal Advice</h2>
            <p>Nothing on this platform constitutes financial, investment, legal, or tax advice. Information about stock trades, lobbying expenditures, and government contracts is presented as-is from public sources. You should consult qualified professionals before making any financial or legal decisions.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">4. Data Accuracy</h2>
            <p>We make reasonable efforts to ensure data accuracy by sourcing from official government APIs and databases. However, we do not guarantee the completeness, accuracy, or timeliness of any data. Source data may contain errors, delays, or omissions from the originating agencies.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">5. Intellectual Property</h2>
            <p>The WeThePeople platform, including its design, code, and original content, is owned by Obelus Labs LLC. The underlying data is sourced from public records and is not owned by us. The platform source code is available under an open-source license on GitHub.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">6. Prohibited Use</h2>
            <p>You may not use the Service to: scrape data at scale without permission, misrepresent data or its sources, harass or defame any individual, or engage in any activity that violates applicable law.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">7. Limitation of Liability</h2>
            <p>Obelus Labs LLC shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of or inability to use the Service, or from any data inaccuracies or omissions.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">8. Changes to Terms</h2>
            <p>We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the updated terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">9. Contact</h2>
            <p>For questions about these terms, contact Obelus Labs LLC at <span className="text-blue-400">legal@obeluslabs.com</span>.</p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
