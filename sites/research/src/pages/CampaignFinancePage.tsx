import { useState, useEffect, useMemo } from 'react';
import { Search, ExternalLink } from 'lucide-react';
import { apiFetch } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface Candidate {
  candidate_id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  district: string;
  incumbent_challenge: string;
  total_receipts: number;
  total_disbursements: number;
  cash_on_hand: number;
  debt: number;
  cycle: number;
  fec_url: string;
}

// ── Helpers ──

function fmtDollar(n: number | null | undefined): string {
  if (n == null) return '\u2014';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function partyBadgeClasses(party: string): string {
  const p = party.toLowerCase();
  if (p.includes('democrat')) return 'bg-blue-500/10 text-blue-400';
  if (p.includes('republican')) return 'bg-red-500/10 text-red-400';
  if (p.includes('libertarian')) return 'bg-amber-500/10 text-amber-400';
  if (p.includes('green')) return 'bg-emerald-500/10 text-emerald-400';
  return 'bg-zinc-500/10 text-zinc-400';
}

const STATES = [
  '', 'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','GU','VI','AS','MP',
];

const CYCLES = [2024, 2022, 2020, 2018, 2016];

// ── Page ──

export default function CampaignFinancePage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [state, setState] = useState('');
  const [cycle, setCycle] = useState(2024);
  const [submitted, setSubmitted] = useState(false);
  const [total, setTotal] = useState(0);

  const [localSearch, setLocalSearch] = useState('');

  const filteredCandidates = useMemo(() => {
    if (!localSearch.trim()) return candidates;
    const q = localSearch.toLowerCase();
    return candidates.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.party?.toLowerCase().includes(q) ||
        c.state?.toLowerCase().includes(q) ||
        c.office?.toLowerCase().includes(q),
    );
  }, [candidates, localSearch]);

  function doSearch() {
    setLoading(true);
    setSubmitted(true);
    const params: Record<string, string | number> = { limit: 50, cycle };
    if (candidateSearch.trim()) params.candidate = candidateSearch.trim();
    if (state) params.state = state;

    apiFetch<{ total: number; candidates: Candidate[] }>('/research/campaign-finance', { params })
      .then((res) => {
        setCandidates(res.candidates || []);
        setTotal(res.total || 0);
      })
      .catch(() => {
        setCandidates([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }

  // Auto-search on mount
  useEffect(() => {
    doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Campaign Finance"
        title="Campaign Finance Search"
        description="Search FEC campaign finance data. Find candidates by name, state, and election cycle with total raised, spent, and cash on hand."
        accent="var(--color-green)"
      />

      {/* Search controls */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs text-zinc-500 font-mono uppercase mb-1.5">Candidate Name</label>
            <input
              type="text"
              placeholder="e.g. Smith, Johnson..."
              value={candidateSearch}
              onChange={(e) => setCandidateSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-emerald-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 font-mono uppercase mb-1.5">State</label>
            <select
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white outline-none cursor-pointer"
              style={{ colorScheme: 'dark' }}
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">ALL STATES</option>
              {STATES.filter(Boolean).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 font-mono uppercase mb-1.5">Election Cycle</label>
            <select
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white outline-none cursor-pointer"
              style={{ colorScheme: 'dark' }}
              value={cycle}
              onChange={(e) => setCycle(Number(e.target.value))}
            >
              {CYCLES.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={doSearch}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-2 text-sm font-medium text-white transition-colors"
        >
          <Search size={14} />
          Search Candidates
        </button>
      </div>

      {/* Results header + local filter */}
      {submitted && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter results..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-emerald-500/50"
            />
          </div>
          <span className="text-sm text-zinc-500">
            {filteredCandidates.length} of {total.toLocaleString()} candidates
          </span>
          {loading && <div className="h-4 w-4 animate-spin rounded-full border border-emerald-400 border-t-transparent" />}
        </div>
      )}

      {/* Loading state */}
      {loading && candidates.length === 0 && (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
        </div>
      )}

      {/* Table */}
      {submitted && !loading && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">CANDIDATE</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">PARTY</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">OFFICE</th>
                  <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono">TOTAL RAISED</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-right text-xs text-zinc-500 font-mono">SPENT</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-right text-xs text-zinc-500 font-mono">CASH ON HAND</th>
                  <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((c) => (
                  <tr key={c.candidate_id} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-white">{c.name || '\u2014'}</p>
                      <p className="text-xs text-zinc-600 font-mono">
                        {c.state}{c.district ? `-${c.district}` : ''} {c.incumbent_challenge ? `\u00b7 ${c.incumbent_challenge}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded px-2 py-1 text-xs font-bold font-mono ${partyBadgeClasses(c.party)}`}>
                        {c.party || '\u2014'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300">{c.office || '\u2014'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-emerald-400 font-mono">{fmtDollar(c.total_receipts)}</span>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right text-sm text-white font-mono">
                      {fmtDollar(c.total_disbursements)}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right text-sm text-white font-mono">
                      {fmtDollar(c.cash_on_hand)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.fec_url && (
                        <a
                          href={c.fec_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-600 hover:text-emerald-400 transition-colors"
                          title="View on FEC.gov"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredCandidates.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-500">
                      {localSearch.trim() ? 'No candidates match your filter.' : 'No candidates found. Try different search terms.'}
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
