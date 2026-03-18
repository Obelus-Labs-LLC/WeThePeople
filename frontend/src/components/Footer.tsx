import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#0f1115]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Top row */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-6">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-xs font-black text-white">
              WP
            </div>
            <span className="text-sm font-semibold text-white">WeThePeople</span>
          </div>

          {/* Nav links */}
          <div className="flex flex-wrap gap-6 text-xs text-slate-400">
            <Link to="/about" className="hover:text-white transition-colors">About</Link>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms of Use</Link>
            <Link to="/disclaimer" className="hover:text-white transition-colors">Disclaimer</Link>
            <Link to="/methodology" className="hover:text-white transition-colors">Methodology</Link>
          </div>
        </div>

        {/* Support banner */}
        <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl bg-white/[0.03] border border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <Heart className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-white">Support this open-source project</p>
              <p className="text-xs text-slate-400">WeThePeople is free and open source. Help us keep it running.</p>
            </div>
          </div>
          <a
            href="https://github.com/sponsors/Obelus-Labs-LLC"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
          >
            <Heart className="w-4 h-4" />
            Sponsor on GitHub
          </a>
        </div>

        {/* Disclaimer text */}
        <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
          Data sourced from public records including Congress.gov, Senate LDA, USASpending.gov, Federal Register, SEC EDGAR, OpenFDA, USPTO, EPA ECHO, and other government APIs. This platform is for informational purposes only and does not constitute financial, legal, or investment advice.
        </p>

        {/* Bottom row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-4 border-t border-white/5">
          <span className="text-[11px] text-slate-600">
            &copy; {new Date().getFullYear()} Obelus Labs LLC. All rights reserved.
          </span>
          <a
            href="https://github.com/Obelus-Labs-LLC/WeThePeople"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            Open Source on GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
