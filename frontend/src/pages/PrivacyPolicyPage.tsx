import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Footer from '../components/Footer';
import { LEGAL_LAST_UPDATED } from '../config';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#181c21] text-white">
      <div className="flex-1 max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-400 mb-8">Last updated: {LEGAL_LAST_UPDATED}</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white">1. Information We Collect</h2>
            <p>WeThePeople is a civic transparency platform. We do not require user accounts or collect personal information to use the site. We may collect:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Usage data:</strong> Anonymous page views, navigation patterns, and feature usage through standard web analytics.</li>
              <li><strong>Technical data:</strong> Browser type, device type, and IP address for security and performance monitoring.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">2. How We Use Information</h2>
            <p>Any data collected is used solely to improve site performance, fix bugs, and understand which features are most valuable to users. We do not sell, rent, or share any data with third parties for marketing purposes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">3. Cookies</h2>
            <p>We may use essential cookies for site functionality. We do not use tracking cookies for advertising. Third-party services (such as our hosting provider) may set their own cookies subject to their privacy policies.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">4. Third-Party Data Sources</h2>
            <p>All data displayed on WeThePeople is sourced from publicly available government databases and APIs including Congress.gov, Senate LDA, USASpending.gov, SEC EDGAR, OpenFDA, USPTO, and others. We do not collect or store personal data about the public officials displayed — all information is a matter of public record.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">5. Data Retention</h2>
            <p>Analytics data is retained for up to 12 months and then deleted. We do not maintain user profiles or persistent identifiers.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">6. Your Rights</h2>
            <p>Since we do not collect personal information requiring accounts, there is no personal data to request, modify, or delete. If you have questions about your data, contact us at the address below.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">7. Contact</h2>
            <p>For privacy-related inquiries, contact Obelus Labs LLC at <span className="text-blue-400">privacy@obeluslabs.com</span>.</p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
