import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { globalSearch, type SearchResults, type PoliticianResult, type CompanyResult } from "../api/search";
import { openChatAgent } from "./ChatAgent";

const SECTOR_COLORS: Record<string, string> = {
  finance: "bg-blue-500/20 text-blue-300",
  health: "bg-emerald-500/20 text-emerald-300",
  technology: "bg-violet-500/20 text-violet-300",
  energy: "bg-amber-500/20 text-amber-300",
  transportation: "bg-sky-500/20 text-sky-300",
  defense: "bg-indigo-500/20 text-indigo-300",
  chemicals: "bg-amber-500/20 text-amber-300",
  agriculture: "bg-green-500/20 text-green-300",
  telecom: "bg-cyan-500/20 text-cyan-300",
  education: "bg-purple-500/20 text-purple-300",
};

const SECTOR_ROUTES: Record<string, string> = {
  finance: "/finance",
  health: "/health",
  technology: "/technology",
  energy: "/energy",
  transportation: "/transportation",
  defense: "/defense",
  chemicals: "/chemicals",
  agriculture: "/agriculture",
  telecom: "/telecom",
  education: "/education",
};

function getCompanyRoute(c: CompanyResult): string {
  const base = SECTOR_ROUTES[c.sector] || "/finance";
  return `${base}/${c.entity_id}`;
}

function getPoliticianRoute(p: PoliticianResult): string {
  return `/politics/people/${p.person_id}`;
}

function partyColor(party: string | null): string {
  if (party === "D") return "text-blue-400";
  if (party === "R") return "text-red-400";
  if (party === "I") return "text-yellow-400";
  return "text-white/60";
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flatten results for keyboard nav
  const flatItems = React.useMemo(() => {
    if (!results) return [];
    const arr: ({ type: "politician"; data: PoliticianResult } | { type: "company"; data: CompanyResult })[] = [];
    for (const p of results.politicians) arr.push({ type: "politician", data: p });
    for (const c of results.companies) arr.push({ type: "company", data: c });
    return arr;
  }, [results]);

  // Ctrl+K is handled by ChatAgent — no duplicate listener here

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setActiveIndex(-1);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Debounced search
  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await globalSearch(q.trim());
        setResults(data);
        setActiveIndex(-1);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    doSearch(val);
  }

  function navigateTo(path: string) {
    setOpen(false);
    navigate(path);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    }
    if (e.key === "Enter" && activeIndex >= 0 && activeIndex < flatItems.length) {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item.type === "politician") {
        navigateTo(getPoliticianRoute(item.data as PoliticianResult));
      } else {
        navigateTo(getCompanyRoute(item.data as CompanyResult));
      }
    }
  }

  const hasResults = results && (results.politicians.length > 0 || results.companies.length > 0);
  const noResults = results && results.politicians.length === 0 && results.companies.length === 0 && query.trim().length > 0;

  let itemIdx = -1; // running index for keyboard nav highlighting

  return (
    <>
      {/* Search trigger button — opens ChatAgent */}
      <button
        onClick={() => openChatAgent()}
        className="fixed top-4 right-4 z-[9998] flex items-center gap-2 px-3 py-2 rounded-xl
                   bg-white/[0.07] border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.12]
                   backdrop-blur-sm transition-all text-sm cursor-pointer"
        aria-label="Open chat assistant"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
        <span className="hidden sm:inline font-mono text-xs text-white/40">
          {navigator.platform?.includes("Mac") ? "\u2318K" : "Ctrl+K"}
        </span>
      </button>

      {/* Modal overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            {/* Search panel */}
            <motion.div
              className="relative w-full max-w-xl mx-4 bg-slate-900 border border-white/20 rounded-2xl shadow-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              onKeyDown={handleKeyDown}
            >
              {/* Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40 shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={handleInputChange}
                  placeholder="Search politicians, companies..."
                  className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-base"
                />
                {loading && (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                )}
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white/[0.07] border border-white/10 text-[10px] font-mono text-white/30">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-[50vh] overflow-y-auto">
                {/* Politicians */}
                {results && results.politicians.length > 0 && (
                  <div className="px-2 pt-3 pb-1">
                    <div className="px-2 pb-1.5 font-mono text-[10px] text-white/40 uppercase tracking-widest">
                      Politicians
                    </div>
                    {results.politicians.map((p) => {
                      itemIdx++;
                      const idx = itemIdx;
                      return (
                        <button
                          key={p.person_id}
                          onClick={() => navigateTo(getPoliticianRoute(p))}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                            idx === activeIndex ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
                          }`}
                        >
                          {p.photo_url ? (
                            <img src={p.photo_url} alt={p.display_name} className="w-8 h-8 rounded-full object-cover bg-white/10" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/40 text-xs font-bold">
                              {p.name.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{p.name}</div>
                            <div className="text-xs text-white/40">
                              <span className={partyColor(p.party)}>
                                {p.party === "D" ? "Democrat" : p.party === "R" ? "Republican" : p.party === "I" ? "Independent" : p.party}
                              </span>
                              {p.state && <span> &middot; {p.state}</span>}
                              <span> &middot; {p.chamber === "senate" ? "Senate" : "House"}</span>
                            </div>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/20 shrink-0">
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Companies */}
                {results && results.companies.length > 0 && (
                  <div className="px-2 pt-3 pb-2">
                    <div className="px-2 pb-1.5 font-mono text-[10px] text-white/40 uppercase tracking-widest">
                      Companies
                    </div>
                    {results.companies.map((c) => {
                      itemIdx++;
                      const idx = itemIdx;
                      return (
                        <button
                          key={`${c.sector}-${c.entity_id}`}
                          onClick={() => navigateTo(getCompanyRoute(c))}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                            idx === activeIndex ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/40 text-xs font-bold">
                            {c.ticker ? c.ticker.substring(0, 2) : c.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{c.name}</div>
                            <div className="flex items-center gap-2 text-xs text-white/40">
                              {c.ticker && <span className="font-mono">{c.ticker}</span>}
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SECTOR_COLORS[c.sector] || "bg-white/10 text-white/50"}`}>
                                {c.sector}
                              </span>
                            </div>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/20 shrink-0">
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* No results */}
                {noResults && !loading && (
                  <div className="px-4 py-8 text-center text-white/30 text-sm">
                    No results for "{query}"
                  </div>
                )}

                {/* Empty state */}
                {!results && !loading && (
                  <div className="px-4 py-8 text-center text-white/20 text-sm">
                    Search across all politicians and companies
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
