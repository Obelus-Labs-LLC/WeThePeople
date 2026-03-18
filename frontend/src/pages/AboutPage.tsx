import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Footer from '../components/Footer';

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#181c21] text-white">
      <div className="flex-1 max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center text-xl font-black text-white shadow-lg shadow-blue-600/30">
            WP
          </div>
          <div>
            <h1 className="text-3xl font-bold">WeThePeople</h1>
            <p className="text-sm text-slate-400">by Obelus Labs LLC</p>
          </div>
        </div>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white">Our Mission</h2>
            <p>WeThePeople is a civic transparency platform that follows the money from industry to politics. We aggregate public data across five sectors — politics, finance, health, technology, and energy — and connect the dots between lobbying spend, government contracts, enforcement actions, and political activity.</p>
            <p>Every data point on this platform is sourced from official government databases and public records. Every claim is verifiable. Every number links back to its source.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Why This Exists</h2>
            <p>The data we present is already public. It's filed with the Senate, published by the SEC, reported to the FDA, and tracked by the EPA. But it's scattered across dozens of government websites, formatted inconsistently, and nearly impossible to cross-reference.</p>
            <p>WeThePeople brings it all together in one place. When a pharmaceutical company spends millions lobbying Congress while receiving billions in government contracts, you should be able to see that. When a politician trades stocks in companies affected by legislation they're voting on, that should be visible too.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Open Source</h2>
            <p>WeThePeople is fully open source. The entire codebase — frontend, backend, data sync jobs, and deployment configuration — is available on GitHub.</p>
            <a
              href="https://github.com/Obelus-Labs-LLC/WeThePeople"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors"
            >
              View on GitHub <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Contact</h2>
            <p>WeThePeople is built by <strong className="text-white">Obelus Labs LLC</strong>.</p>
            <p>Website: <a href="https://wethepeopleforus.com" className="text-blue-400 hover:text-blue-300">wethepeopleforus.com</a></p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
