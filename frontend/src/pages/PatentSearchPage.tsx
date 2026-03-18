import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, FileText, Calendar, ExternalLink, SearchX } from 'lucide-react';
import { TechSectorHeader } from '../components/SectorHeader';
import {
  getTechCompanies,
  getTechCompanyPatents,
  type TechCompanyListItem,
  type TechPatentItem,
} from '../api/tech';
import { fmtDate, fmtNum } from '../utils/format';

// ── Types ──

interface PatentWithCompany extends TechPatentItem {
  company_id: string;
  company_name: string;
}

// ── Animation variants ──

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 120, damping: 22 },
  },
};

// ── Page ──

export default function PatentSearchPage() {
  const [query, setQuery] = useState('');
  const [allPatents, setAllPatents] = useState<PatentWithCompany[]>([]);
  const [companies, setCompanies] = useState<TechCompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Load all companies + their patents on mount
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const compRes = await getTechCompanies({ limit: 200 });
        const comps = compRes.companies || [];
        if (cancelled) return;
        setCompanies(comps);

        // Fetch patents for each company in parallel (limit: 50 per company to keep it fast)
        const patentResults = await Promise.allSettled(
          comps.map((c) =>
            getTechCompanyPatents(c.company_id, { limit: 50 }).then((r) =>
              (r.patents || []).map((p) => ({
                ...p,
                company_id: c.company_id,
                company_name: c.display_name,
              })),
            ),
          ),
        );

        if (cancelled) return;

        const combined: PatentWithCompany[] = [];
        for (const result of patentResults) {
          if (result.status === 'fulfilled') {
            combined.push(...result.value);
          }
        }

        // Sort by date descending
        combined.sort((a, b) => {
          if (!a.patent_date && !b.patent_date) return 0;
          if (!a.patent_date) return 1;
          if (!b.patent_date) return -1;
          return new Date(b.patent_date).getTime() - new Date(a.patent_date).getTime();
        });

        setAllPatents(combined);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load patents');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  // Client-side search filtering
  const filtered = useMemo(() => {
    if (!query.trim()) return allPatents.slice(0, 100); // Show most recent 100 by default
    const q = query.toLowerCase();
    return allPatents.filter(
      (p) =>
        (p.patent_title && p.patent_title.toLowerCase().includes(q)) ||
        (p.patent_number && p.patent_number.toLowerCase().includes(q)) ||
        (p.patent_abstract && p.patent_abstract.toLowerCase().includes(q)) ||
        p.company_name.toLowerCase().includes(q),
    );
  }, [allPatents, query]);

  // Stats
  const totalPatents = allPatents.length;
  const uniqueCompanies = new Set(allPatents.map((p) => p.company_id)).size;

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-400 mb-2">Failed to load patents</p>
          <p className="text-sm text-white/50">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-[#8B5CF6] px-4 py-2 text-sm text-white hover:bg-[#7C3AED]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Background decor */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute w-full h-full"
          style={{ background: 'radial-gradient(ellipse at 50% -20%, #8B5CF6 0%, transparent 60%)', opacity: 0.08 }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(#F8FAFC 1px, transparent 1px), linear-gradient(90deg, #F8FAFC 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            opacity: 0.025,
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-8 py-8 md:px-12">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-8"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="flex flex-col gap-3">
            <TechSectorHeader />

            <div className="flex items-center gap-3 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
              </span>
              <span className="font-heading text-sm font-bold tracking-[0.2em] text-amber-400 uppercase">
                Patent Search
              </span>
            </div>

            <h1 className="font-heading text-4xl font-bold tracking-tight text-zinc-50 leading-tight xl:text-5xl">
              Patent Explorer
            </h1>
            <p className="font-body text-base text-zinc-400 leading-relaxed max-w-2xl">
              Search across {loading ? '...' : fmtNum(totalPatents)} patents from {loading ? '...' : uniqueCompanies} technology companies.
            </p>
          </motion.div>

          {/* Search bar */}
          <motion.div variants={itemVariants} className="relative max-w-2xl w-full">
            <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Search patents by title, number, abstract, or company..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3.5 pl-12 pr-4 font-body text-base text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#8B5CF6]/50 backdrop-blur-md"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-white/40 hover:text-white/70"
              >
                Clear
              </button>
            )}
          </motion.div>

          {/* Stats row */}
          {!loading && (
            <motion.div variants={itemVariants} className="flex items-center gap-6">
              <span className="font-mono text-sm text-zinc-500">
                {query ? `${fmtNum(filtered.length)} results` : `Showing ${Math.min(100, totalPatents)} of ${fmtNum(totalPatents)}`}
              </span>
            </motion.div>
          )}

          {/* Results */}
          {loading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <motion.div
              variants={itemVariants}
              className="flex flex-col items-center justify-center gap-4 py-20"
            >
              <SearchX size={48} className="text-white/20" />
              <p className="font-body text-xl text-white/40">
                {query ? 'No patents match your search' : 'No patents available'}
              </p>
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="font-body text-sm text-[#8B5CF6] hover:text-[#A78BFA]"
                >
                  Clear search
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div variants={containerVariants} className="flex flex-col gap-3">
              {filtered.map((p) => (
                <motion.div
                  key={`${p.company_id}-${p.id}`}
                  variants={itemVariants}
                  className="group rounded-xl border border-transparent bg-white/[0.03] p-5 transition-all hover:bg-white/[0.06] hover:border-white/10 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-base font-medium text-white mb-1">
                        {p.patent_title || 'Untitled Patent'}
                      </p>
                      <div className="flex items-center gap-4 flex-wrap">
                        {p.patent_number && (
                          <span className="font-mono text-xs text-[#F59E0B]">US{p.patent_number}</span>
                        )}
                        <Link
                          to={`/technology/${p.company_id}`}
                          className="font-mono text-xs text-[#8B5CF6] hover:text-[#A78BFA] no-underline"
                        >
                          {p.company_name}
                        </Link>
                        {p.patent_date && (
                          <span className="flex items-center gap-1 font-mono text-xs text-white/40">
                            <Calendar size={12} />{fmtDate(p.patent_date)}
                          </span>
                        )}
                        {p.num_claims != null && (
                          <span className="font-mono text-xs text-white/40">{p.num_claims} claims</span>
                        )}
                      </div>
                      {p.patent_abstract && (
                        <p className={`mt-2 font-body text-sm text-white/50 ${expandedId === p.id ? '' : 'line-clamp-2'}`}>{p.patent_abstract}</p>
                      )}
                    </div>
                    {p.patent_number && (
                      <a
                        href={`https://patents.google.com/patent/US${p.patent_number.replace(/[^0-9A-Za-z]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                      >
                        <ExternalLink size={14} className="text-white" />
                      </a>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
