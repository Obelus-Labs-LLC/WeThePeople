import React, { useEffect, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { getApiBaseUrl } from "../api/client";

const NAV_LINKS = [
  { name: "Dashboard", to: "/politics" },
  { name: "People", to: "/politics/people" },
  { name: "Compare", to: "/politics/compare" },
  { name: "Press", to: "/politics/press" },
];

const API_BASE_URL = getApiBaseUrl();

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<"connecting" | "ok" | "error">("connecting");

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/people?limit=1`)
      .then((res) => {
        if (!cancelled) setStatus(res.ok ? "ok" : "error");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Header */}
      <header className="bg-slate-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-blue-500 flex items-center justify-center text-sm font-black">
                  WP
                </div>
                <span className="text-lg font-bold tracking-tight">
                  We The People
                </span>
              </Link>
              <Link
                to="/"
                className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
              >
                &larr; All Sectors
              </Link>
            </div>

            {/* Nav */}
            <nav className="flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === "/politics"}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-slate-700 text-white"
                        : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                    }`
                  }
                >
                  {link.name}
                </NavLink>
              ))}
            </nav>

            {/* Status dot */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span
                className={`h-2 w-2 rounded-full ${
                  status === "ok"
                    ? "bg-emerald-400"
                    : status === "error"
                      ? "bg-red-400"
                      : "bg-amber-400 animate-pulse"
                }`}
              />
              <span className="hidden sm:inline">
                {status === "ok" ? "API Connected" : status === "error" ? "API Offline" : "Connecting..."}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between text-xs text-stone-400">
          <span>WeThePeople — Tracking accountability</span>
          <span>{API_BASE_URL}</span>
        </div>
      </footer>
    </div>
  );
};

export default DashboardLayout;
