import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Home, ArrowRight } from "lucide-react";

const SECTOR_LINKS = [
  { name: "Politics", route: "/politics", icon: "\u{1F3DB}\uFE0F", color: "text-blue-400" },
  { name: "Finance", route: "/finance", icon: "\u{1F4B0}", color: "text-emerald-400" },
  { name: "Health", route: "/health", icon: "\u{1F3E5}", color: "text-rose-400" },
  { name: "Technology", route: "/technology", icon: "\u{1F4BB}", color: "text-violet-400" },
  { name: "Oil, Gas & Energy", route: "/energy", icon: "\u{1F6E2}\uFE0F", color: "text-orange-400" },
];

const NotFoundPage: React.FC = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        {/* 404 badge */}
        <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
          <Search className="w-4 h-4 text-blue-400" />
          <span className="font-mono text-sm text-white/60">404 — PAGE NOT FOUND</span>
        </div>

        <h1 className="font-heading text-4xl font-bold mb-3">
          Nothing here
        </h1>
        <p className="font-body text-white/50 mb-2">
          <span className="font-mono text-white/30 text-sm">{location.pathname}</span>
        </p>
        <p className="font-body text-white/50 mb-8">
          This page doesn't exist or may have been moved. Try one of the sectors below.
        </p>

        {/* Sector links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {SECTOR_LINKS.map((s) => (
            <Link
              key={s.route}
              to={s.route}
              className="flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 hover:bg-white/[0.08] hover:border-white/20 transition-all group"
            >
              <span className="text-xl">{s.icon}</span>
              <span className={`font-body font-medium text-white group-hover:${s.color} transition-colors`}>
                {s.name}
              </span>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 ml-auto transition-colors" />
            </Link>
          ))}
        </div>

        {/* Home link */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-body text-sm transition-colors"
        >
          <Home className="w-4 h-4" />
          Back to home
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;
