import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, Calendar } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  category: 'lobbying' | 'contract' | 'enforcement' | 'trade' | 'donation' | 'vote' | 'bill';
  source_url?: string;
  amount?: number;
  entity_name?: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  lobbying: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Lobbying' },
  contract: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Contract' },
  enforcement: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Enforcement' },
  trade: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Trade' },
  donation: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'Donation' },
  vote: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', label: 'Vote' },
  bill: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', label: 'Bill' },
};

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function InfluenceTimelinePage() {
  const [searchParams] = useSearchParams();
  const entityType = searchParams.get('type') || 'person';
  const entityId = searchParams.get('id') || '';
  const entityName = searchParams.get('name') || entityId;

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    if (!entityId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Build a timeline from the influence network data
    const params = new URLSearchParams({
      entity_type: entityType,
      entity_id: entityId,
      depth: '1',
      limit: '100',
    });

    fetch(`${API_BASE}/influence/network?${params}`)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        const timelineEvents: TimelineEvent[] = [];

        // Extract events from edges
        for (const edge of data.edges || []) {
          if (edge.type === 'donation' && edge.year) {
            timelineEvents.push({
              date: `${edge.year}-01-01`,
              title: `PAC Donation: ${edge.label || ''}`,
              description: `${edge.source_name} donated to ${edge.target_name}`,
              category: 'donation',
              amount: edge.amount,
              entity_name: edge.source_name || edge.target_name,
            });
          } else if (edge.type === 'lobbying' && edge.year) {
            timelineEvents.push({
              date: `${edge.year}-06-01`,
              title: `Lobbying: ${edge.label || 'Filing'}`,
              description: `${edge.source_name} lobbied on behalf of ${edge.target_name}`,
              category: 'lobbying',
              amount: edge.amount,
              entity_name: edge.source_name,
            });
          } else if (edge.type === 'trade' && edge.year) {
            timelineEvents.push({
              date: `${edge.year}-03-01`,
              title: `Stock Trade: ${edge.label || ''}`,
              description: `${edge.source_name} traded stocks`,
              category: 'trade',
              amount: edge.amount,
              entity_name: edge.source_name,
            });
          } else if (edge.type === 'legislation' && edge.year) {
            timelineEvents.push({
              date: `${edge.year}-01-01`,
              title: `Bill: ${edge.label || ''}`,
              description: `${edge.source_name} sponsored legislation`,
              category: 'bill',
              entity_name: edge.source_name,
            });
          } else if (edge.type === 'contract' && edge.year) {
            timelineEvents.push({
              date: `${edge.year}-01-01`,
              title: `Contract: ${edge.label || ''}`,
              description: `${edge.source_name} awarded contract to ${edge.target_name}`,
              category: 'contract',
              amount: edge.amount,
              entity_name: edge.target_name,
            });
          }
        }

        // Sort by date descending
        timelineEvents.sort((a, b) => b.date.localeCompare(a.date));
        setEvents(timelineEvents);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  const filteredEvents = filterCategory === 'all'
    ? events
    : events.filter((e) => e.category === filterCategory);

  // Group by year
  const byYear: Record<string, TimelineEvent[]> = {};
  for (const e of filteredEvents) {
    const year = e.date.substring(0, 4);
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(e);
  }
  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-[900px] px-4 py-6 lg:px-16 lg:py-14">
        <Link to="/influence" className="inline-flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-6 no-underline">
          <ArrowLeft className="w-4 h-4" /> Influence Explorer
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            <Clock className="w-8 h-8 inline-block mr-3 text-blue-400" />
            Influence Timeline
          </h1>
          {entityId ? (
            <p className="text-white/50">
              Chronological history of lobbying, donations, trades, and legislation for <span className="text-white font-medium">{entityName}</span>.
            </p>
          ) : (
            <div className="mt-6 text-center py-16">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-white/20" />
              <p className="text-white/40 text-lg mb-4">Select an entity to view their influence timeline</p>
              <div className="flex flex-wrap justify-center gap-3">
                {[
                  { type: 'person', id: 'pelosi', name: 'Nancy Pelosi' },
                  { type: 'person', id: 'cruz', name: 'Ted Cruz' },
                  { type: 'finance', id: 'jpmorgan', name: 'JPMorgan Chase' },
                  { type: 'tech', id: 'alphabet', name: 'Alphabet' },
                  { type: 'energy', id: 'exxon-mobil', name: 'ExxonMobil' },
                  { type: 'health', id: 'pfizer', name: 'Pfizer' },
                ].map((e) => (
                  <Link
                    key={e.id}
                    to={`/influence/timeline?type=${e.type}&id=${e.id}&name=${encodeURIComponent(e.name)}`}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors no-underline"
                  >
                    {e.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {entityId && (
          <>
            {/* Category filters */}
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                onClick={() => setFilterCategory('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                  filterCategory === 'all' ? 'bg-blue-500/20 text-blue-400' : 'text-white/30 bg-white/5 hover:text-white/50'
                }`}
              >
                All ({events.length})
              </button>
              {Object.entries(CATEGORY_COLORS).map(([cat, cfg]) => {
                const count = events.filter((e) => e.category === cat).length;
                if (count === 0) return null;
                return (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                      filterCategory === cat ? `${cfg.bg} ${cfg.text}` : 'text-white/30 bg-white/5 hover:text-white/50'
                    }`}
                  >
                    {cfg.label} ({count})
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-20 text-white/30">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>No timeline events found for this entity.</p>
              </div>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[19px] top-0 bottom-0 w-px bg-white/10" />

                {years.map((year) => (
                  <div key={year} className="mb-8">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 border-2 border-blue-500/40 flex items-center justify-center z-10">
                        <span className="text-xs font-mono font-bold text-blue-400">{year}</span>
                      </div>
                    </div>

                    {byYear[year].map((event, i) => {
                      const cfg = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.lobbying;
                      return (
                        <div key={i} className="ml-12 mb-3">
                          <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4 hover:bg-white/[0.05] transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${cfg.bg} ${cfg.text}`}>
                                    {cfg.label}
                                  </span>
                                  <span className="text-xs text-white/30 font-mono">{formatDate(event.date)}</span>
                                </div>
                                <p className="text-sm text-white font-medium">{event.title}</p>
                                <p className="text-xs text-white/40 mt-1">{event.description}</p>
                              </div>
                              {event.amount != null && event.amount > 0 && (
                                <span className="text-sm font-mono font-bold text-white/70 shrink-0">
                                  {formatMoney(event.amount)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
