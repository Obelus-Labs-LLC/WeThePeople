import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, Users, Building2, Scale } from 'lucide-react';
import { apiFetch } from '../api/client';
import { CATEGORY_META, SECTOR_LABELS } from '../types';
import type { Story, StoriesResponse } from '../types';

export default function CoverageBalancePage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<StoriesResponse | Story[]>('/stories/latest', {
      params: { limit: 50 },
      signal: controller.signal,
    })
      .then((data) => {
        const items = Array.isArray(data) ? data : data.stories ?? [];
        setStories(items);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load stories');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  // Parse party affiliations from entity_ids and evidence
  const partyStats = useMemo(() => {
    let dem = 0;
    let rep = 0;
    let ind = 0;
    let noParty = 0;

    for (const story of stories) {
      const evidence = story.evidence as Record<string, unknown> | undefined;
      const entityIds = story.entity_ids ?? [];

      // Try to extract party info from evidence
      let storyParties = new Set<string>();

      if (evidence) {
        // Check for party data in evidence fields
        const evidenceStr = JSON.stringify(evidence).toLowerCase();
        if (evidenceStr.includes('"party":"d"') || evidenceStr.includes('"party": "d"') || evidenceStr.includes('democrat')) {
          storyParties.add('D');
        }
        if (evidenceStr.includes('"party":"r"') || evidenceStr.includes('"party": "r"') || evidenceStr.includes('republican')) {
          storyParties.add('R');
        }
        if (evidenceStr.includes('"party":"i"') || evidenceStr.includes('"party": "i"') || evidenceStr.includes('independent')) {
          storyParties.add('I');
        }
      }

      // Also check entity_ids for party-coded IDs (e.g., "person:D:..." or "pol:R:...")
      for (const eid of entityIds) {
        const upper = eid.toUpperCase();
        if (upper.includes(':D:') || upper.includes(':D-') || upper.endsWith(':D')) storyParties.add('D');
        if (upper.includes(':R:') || upper.includes(':R-') || upper.endsWith(':R')) storyParties.add('R');
        if (upper.includes(':I:') || upper.includes(':I-') || upper.endsWith(':I')) storyParties.add('I');
      }

      if (storyParties.has('D')) dem++;
      if (storyParties.has('R')) rep++;
      if (storyParties.has('I')) ind++;
      if (storyParties.size === 0) noParty++;
    }

    return { dem, rep, ind, noParty };
  }, [stories]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const story of stories) {
      const cat = story.category || 'unknown';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]);
  }, [stories]);

  // Sector breakdown
  const sectorBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const story of stories) {
      const sec = story.sector || 'unknown';
      counts[sec] = (counts[sec] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]);
  }, [stories]);

  const maxParty = Math.max(partyStats.dem, partyStats.rep, 1);

  return (
    <main className="flex-1 px-4 py-10 sm:py-16">
      <article className="max-w-[720px] mx-auto">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          Back to Journal
        </Link>

        <p className="text-xs uppercase tracking-[0.2em] text-amber-400 font-medium mb-3">
          Coverage Balance
        </p>
        <h1
          className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-6"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          Non-Partisan Coverage Report
        </h1>

        <div className="space-y-4 mb-12">
          <p className="text-zinc-300 leading-[1.85] text-base">
            WeThePeople covers all politicians and corporations regardless of party
            affiliation. Our story detection algorithms are pattern-based and
            party-blind. When lobbying money flows to a politician, when a
            corporation wins a suspicious contract, or when a lawmaker trades
            stock in a company they regulate, our system flags it regardless of
            party, state, or seniority.
          </p>
          <p className="text-zinc-300 leading-[1.85] text-base">
            This page provides a live breakdown of our published stories so you
            can see for yourself that our coverage is balanced.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-6 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : (
          <>
            {/* Total stories */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 mb-8 text-center">
              <BarChart3 size={28} className="text-amber-400 mx-auto mb-3" />
              <p className="text-4xl font-bold text-white mb-1" style={{ fontFamily: 'Oswald, sans-serif' }}>
                {stories.length}
              </p>
              <p className="text-sm text-zinc-400">Total Stories Published</p>
            </div>

            {/* Party coverage */}
            <h2
              className="text-xl font-bold text-white mb-4"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              Stories by Party Involvement
            </h2>
            <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
              A story may involve politicians from multiple parties and is counted
              once for each party mentioned. Stories about corporations with no
              identified politician are counted separately.
            </p>

            <div className="space-y-4 mb-12">
              {/* Democrat bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-blue-400 flex items-center gap-2">
                    <Users size={14} /> Democrat
                  </span>
                  <span className="text-sm text-zinc-400">{partyStats.dem} stories</span>
                </div>
                <div className="h-6 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-700"
                    style={{ width: `${(partyStats.dem / maxParty) * 100}%` }}
                  />
                </div>
              </div>

              {/* Republican bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-red-400 flex items-center gap-2">
                    <Users size={14} /> Republican
                  </span>
                  <span className="text-sm text-zinc-400">{partyStats.rep} stories</span>
                </div>
                <div className="h-6 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all duration-700"
                    style={{ width: `${(partyStats.rep / maxParty) * 100}%` }}
                  />
                </div>
              </div>

              {/* Independent bar */}
              {partyStats.ind > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-purple-400 flex items-center gap-2">
                      <Users size={14} /> Independent
                    </span>
                    <span className="text-sm text-zinc-400">{partyStats.ind} stories</span>
                  </div>
                  <div className="h-6 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all duration-700"
                      style={{ width: `${(partyStats.ind / maxParty) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Corporate-only stories */}
              {partyStats.noParty > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                      <Building2 size={14} /> Corporate Only (no party identified)
                    </span>
                    <span className="text-sm text-zinc-400">{partyStats.noParty} stories</span>
                  </div>
                  <div className="h-6 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-zinc-600 rounded-full transition-all duration-700"
                      style={{ width: `${(partyStats.noParty / maxParty) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Category breakdown */}
            <h2
              className="text-xl font-bold text-white mb-4"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              Stories by Category
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-12">
              {categoryBreakdown.map(([cat, count]) => {
                const meta = CATEGORY_META[cat];
                return (
                  <div
                    key={cat}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                  >
                    <span className={`text-sm font-medium ${meta?.color ?? 'text-zinc-300'}`}>
                      {meta?.label ?? cat}
                    </span>
                    <span className="text-sm text-zinc-500 font-mono">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* Sector breakdown */}
            <h2
              className="text-xl font-bold text-white mb-4"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              Stories by Sector
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-12">
              {sectorBreakdown.map(([sec, count]) => (
                <div
                  key={sec}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                >
                  <span className="text-sm font-medium text-zinc-300">
                    {SECTOR_LABELS[sec] ?? sec}
                  </span>
                  <span className="text-sm text-zinc-500 font-mono">{count}</span>
                </div>
              ))}
            </div>

            {/* Methodology note */}
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-6">
              <div className="flex items-start gap-3">
                <Scale size={20} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Our Commitment</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    WeThePeople covers all politicians and corporations regardless
                    of party affiliation. Our story detection algorithms are
                    pattern-based and party-blind. When the data shows influence, we
                    report it &mdash; no matter who is involved.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </article>
    </main>
  );
}
