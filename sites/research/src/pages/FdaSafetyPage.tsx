import { useState, useEffect, useMemo } from 'react';
import { Search, AlertTriangle, Activity, ArrowLeft, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch, mainSiteUrl } from '../api/client';

// ── Types ──

interface HealthCompany {
  company_id: string;
  display_name: string;
}

interface RecallItem {
  id: number;
  recall_number: string | null;
  product_description: string | null;
  reason_for_recall: string | null;
  classification: string | null;
  status: string | null;
  recall_initiation_date: string | null;
}

interface AdverseEventItem {
  id: number;
  report_id: string | null;
  receive_date: string | null;
  serious: number | null;
  drug_name: string | null;
  reaction: string | null;
  outcome: string | null;
}

interface RecallWithCompany extends RecallItem {
  companyId: string;
  companyName: string;
}

interface AdverseEventWithCompany extends AdverseEventItem {
  companyId: string;
  companyName: string;
}

// ── Helpers ──

function classColor(c: string | null): string {
  if (c === 'Class I') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (c === 'Class II') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  if (c === 'Class III') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
}

function classBarColor(c: string | null): string {
  if (c === 'Class I') return 'border-l-red-500';
  if (c === 'Class II') return 'border-l-amber-500';
  if (c === 'Class III') return 'border-l-blue-500';
  return 'border-l-zinc-500';
}

// ── Page ──

export default function FdaSafetyPage() {
  const [companies, setCompanies] = useState<HealthCompany[]>([]);
  const [recalls, setRecalls] = useState<RecallWithCompany[]>([]);
  const [adverseEvents, setAdverseEvents] = useState<AdverseEventWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'recalls' | 'adverse'>('recalls');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [seriousOnly, setSeriousOnly] = useState(false);

  // Load companies, then fan out for recalls + adverse events
  useEffect(() => {
    apiFetch<{ companies: HealthCompany[] }>('/health/companies', { params: { limit: 200 } })
      .then((res) => {
        const comps = res.companies || [];
        setCompanies(comps);
        const subset = comps.slice(0, 20);

        const recallPromises = subset.map((c) =>
          apiFetch<{ recalls: RecallItem[] }>(`/health/companies/${c.company_id}/recalls`, { params: { limit: 50 } })
            .then((r) => (r.recalls || []).map((item) => ({ ...item, companyId: c.company_id, companyName: c.display_name })))
            .catch(() => [] as RecallWithCompany[])
        );

        const aePromises = subset.map((c) =>
          apiFetch<{ adverse_events: AdverseEventItem[] }>(`/health/companies/${c.company_id}/adverse-events`, { params: { limit: 50 } })
            .then((r) => (r.adverse_events || []).map((item) => ({ ...item, companyId: c.company_id, companyName: c.display_name })))
            .catch(() => [] as AdverseEventWithCompany[])
        );

        return Promise.all([Promise.all(recallPromises), Promise.all(aePromises)]);
      })
      .then(([recallArrays, aeArrays]) => {
        setRecalls(recallArrays.flat().sort((a, b) => (b.recall_initiation_date || '').localeCompare(a.recall_initiation_date || '')));
        setAdverseEvents(aeArrays.flat().sort((a, b) => (b.receive_date || '').localeCompare(a.receive_date || '')));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredRecalls = useMemo(() => {
    let list = recalls;
    if (classFilter) list = list.filter((r) => r.classification === classFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.product_description?.toLowerCase().includes(q) ||
        r.reason_for_recall?.toLowerCase().includes(q) ||
        r.companyName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [recalls, classFilter, search]);

  const filteredAE = useMemo(() => {
    let list = adverseEvents;
    if (seriousOnly) list = list.filter((e) => e.serious === 1);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.drug_name?.toLowerCase().includes(q) ||
        e.reaction?.toLowerCase().includes(q) ||
        e.companyName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [adverseEvents, seriousOnly, search]);

  const classICt = recalls.filter((r) => r.classification === 'Class I').length;
  const seriousCt = adverseEvents.filter((e) => e.serious === 1).length;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8">
        <ArrowLeft size={14} />
        Back to Research Tools
      </Link>

      {/* Header */}
      <div className="mb-8">
        <span className="text-xs font-bold tracking-[0.2em] text-amber-400 uppercase">FDA Safety</span>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50 mt-1" style={{ fontFamily: 'Oswald, sans-serif' }}>
          FDA Safety Monitor
        </h1>
        <p className="text-base text-zinc-400 mt-2 max-w-2xl">
          FDA recalls and adverse event reports across tracked health companies. Filter by severity, classification, and drug name.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-500 font-mono mb-1">TOTAL RECALLS</p>
          <p className="text-2xl font-bold text-white">{recalls.length.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-4">
          <p className="text-xs text-red-400 font-mono mb-1">CLASS I (DANGEROUS)</p>
          <p className="text-2xl font-bold text-red-400">{classICt.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4">
          <p className="text-xs text-amber-400 font-mono mb-1">SERIOUS ADVERSE EVENTS</p>
          <p className="text-2xl font-bold text-amber-400">{seriousCt.toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setTab('recalls')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'recalls' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <AlertTriangle size={14} /> Recalls ({recalls.length})
        </button>
        <button
          onClick={() => setTab('adverse')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'adverse' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Activity size={14} /> Adverse Events ({adverseEvents.length})
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder={tab === 'recalls' ? 'Search product, reason, or company...' : 'Search drug, reaction, or company...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-amber-500/50"
          />
        </div>
        {tab === 'recalls' && (
          <div className="flex items-center gap-2">
            {[null, 'Class I', 'Class II', 'Class III'].map((c) => (
              <button
                key={c || 'all'}
                onClick={() => setClassFilter(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  classFilter === c
                    ? c === 'Class I' ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                      : c === 'Class II' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      : c === 'Class III' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                      : 'bg-zinc-700/50 text-white border border-zinc-600'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {c || 'All'}
              </button>
            ))}
          </div>
        )}
        {tab === 'adverse' && (
          <button
            onClick={() => setSeriousOnly(!seriousOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              seriousOnly ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Serious Only
          </button>
        )}
      </div>

      <p className="text-sm text-zinc-500 mb-4">
        {tab === 'recalls' ? `${filteredRecalls.length} recalls` : `${filteredAE.length} adverse events`}
        {search.trim() ? ` matching "${search}"` : ''}
      </p>

      {/* Recalls tab */}
      {tab === 'recalls' && (
        <div className="space-y-3">
          {filteredRecalls.slice(0, 100).map((r) => (
            <div key={r.id} className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 border-l-4 ${classBarColor(r.classification)}`}>
              <div className="flex items-start justify-between gap-4 mb-2">
                <p className="text-sm font-bold text-white leading-snug line-clamp-2">{r.product_description || 'No description'}</p>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold border ${classColor(r.classification)}`}>
                  {r.classification || 'Unknown'}
                </span>
              </div>
              {r.reason_for_recall && (
                <p className="text-xs text-zinc-400 leading-relaxed mb-3 line-clamp-2">{r.reason_for_recall}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <span className="font-mono">{r.recall_initiation_date || 'No date'}</span>
                {r.status && <span className="text-zinc-600">{r.status}</span>}
                <a href={mainSiteUrl(`/health/${r.companyId}`)} className="text-amber-400/60 hover:text-amber-400 transition-colors">
                  {r.companyName}
                </a>
              </div>
            </div>
          ))}
          {filteredRecalls.length === 0 && (
            <p className="text-center text-sm text-zinc-500 py-12">No recalls match your filters.</p>
          )}
        </div>
      )}

      {/* Adverse Events tab */}
      {tab === 'adverse' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">DATE</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">DRUG</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">REACTION</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">OUTCOME</th>
                  <th className="px-4 py-3 text-center text-xs text-zinc-500 font-mono">SERIOUS</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">COMPANY</th>
                </tr>
              </thead>
              <tbody>
                {filteredAE.slice(0, 100).map((e) => (
                  <tr key={e.id} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-xs text-zinc-500 font-mono">{e.receive_date || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm font-bold text-white">{e.drug_name || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300 max-w-xs">
                      <span className="line-clamp-1">{e.reaction || '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{e.outcome || '\u2014'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${e.serious === 1 ? 'bg-red-500' : 'bg-zinc-700'}`} />
                    </td>
                    <td className="px-4 py-3">
                      <a href={mainSiteUrl(`/health/${e.companyId}`)} className="text-xs text-amber-400/60 hover:text-amber-400 transition-colors">
                        {e.companyName}
                      </a>
                    </td>
                  </tr>
                ))}
                {filteredAE.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">
                      No adverse events match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
