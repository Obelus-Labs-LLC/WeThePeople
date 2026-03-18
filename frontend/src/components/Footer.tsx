import { Link } from 'react-router-dom';

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
