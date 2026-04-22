import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, ExternalLink, Building2 } from 'lucide-react';
import { apiFetch } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface FedJob {
  position_title: string;
  organization_name: string;
  department_name: string;
  salary_min: string;
  salary_max: string;
  location: string;
  grade: string;
  schedule_type: string;
  start_date: string;
  end_date: string;
  url: string;
}

// ── Helpers ──

function fmtSalary(val: string | null | undefined): string {
  if (!val) return '\u2014';
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '\u2014';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d;
  }
}

// ── Page ──

export default function GovSalaryPage() {
  const [jobs, setJobs] = useState<FedJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [agency, setAgency] = useState('');
  const [minSalary, setMinSalary] = useState('');
  const [location, setLocation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [total, setTotal] = useState(0);

  const [localSearch, setLocalSearch] = useState('');

  const filteredJobs = useMemo(() => {
    if (!localSearch.trim()) return jobs;
    const q = localSearch.toLowerCase();
    return jobs.filter(
      (j) =>
        j.position_title?.toLowerCase().includes(q) ||
        j.organization_name?.toLowerCase().includes(q) ||
        j.location?.toLowerCase().includes(q),
    );
  }, [jobs, localSearch]);

  function doSearch() {
    setLoading(true);
    setSubmitted(true);
    const params: Record<string, string | number> = { limit: 50 };
    if (keyword.trim()) params.keyword = keyword.trim();
    if (agency.trim()) params.agency = agency.trim();
    if (minSalary.trim()) params.min_salary = parseInt(minSalary) || 0;
    if (location.trim()) params.location = location.trim();

    apiFetch<{ total: number; jobs: FedJob[] }>('/research/fed-jobs', { params })
      .then((res) => {
        setJobs(res.jobs || []);
        setTotal(res.total || 0);
      })
      .catch(() => {
        setJobs([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }

  // Auto-search on mount with default params
  useEffect(() => {
    doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Federal Jobs"
        title="Government Salary Database"
        description="Search federal job openings with salary data from USAJobs. Filter by keyword, agency, minimum salary, and location."
        accent="var(--color-dem)"
      />

      {/* Search controls */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs text-zinc-500 font-mono uppercase mb-1.5">Keyword</label>
            <input
              type="text"
              placeholder="e.g. analyst, engineer..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 font-mono uppercase mb-1.5">Agency</label>
            <input
              type="text"
              placeholder="e.g. DOD, HHS..."
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 font-mono uppercase mb-1.5">Min Salary</label>
            <input
              type="number"
              placeholder="e.g. 100000"
              value={minSalary}
              onChange={(e) => setMinSalary(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 font-mono uppercase mb-1.5">Location</label>
            <input
              type="text"
              placeholder="e.g. Washington, DC..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-blue-500/50"
            />
          </div>
        </div>
        <button
          onClick={doSearch}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-2 text-sm font-medium text-white transition-colors"
        >
          <Search size={14} />
          Search Federal Jobs
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
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-blue-500/50"
            />
          </div>
          <span className="text-sm text-zinc-500">
            {filteredJobs.length} of {total.toLocaleString()} jobs
          </span>
          {loading && <div className="h-4 w-4 animate-spin rounded-full border border-blue-400 border-t-transparent" />}
        </div>
      )}

      {/* Loading state */}
      {loading && jobs.length === 0 && (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        </div>
      )}

      {/* Table */}
      {submitted && !loading && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">POSITION</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">AGENCY</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-500 font-mono">SALARY RANGE</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">LOCATION</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">GRADE</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-xs text-zinc-500 font-mono">CLOSES</th>
                  <th className="px-4 py-3 text-right text-xs text-zinc-500 font-mono w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((j, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-white">{j.position_title || '\u2014'}</p>
                      {j.schedule_type && <p className="text-xs text-zinc-500 font-mono">{j.schedule_type}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-zinc-300">{j.organization_name || '\u2014'}</p>
                      {j.department_name && j.department_name !== j.organization_name && (
                        <p className="text-xs text-zinc-600">{j.department_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-blue-400 font-mono">
                        {fmtSalary(j.salary_min)} &ndash; {fmtSalary(j.salary_max)}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-zinc-400">
                      {j.location || '\u2014'}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      {j.grade ? (
                        <span className="inline-block rounded px-2 py-1 text-xs font-bold font-mono bg-blue-500/10 text-blue-400">
                          {j.grade}
                        </span>
                      ) : '\u2014'}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-xs text-zinc-500 font-mono">
                      {fmtDate(j.end_date)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {j.url && (
                        <a
                          href={j.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-600 hover:text-blue-400 transition-colors"
                          title="View on USAJobs"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredJobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-500">
                      {localSearch.trim() ? 'No jobs match your filter.' : 'No federal job listings found. Try different search terms.'}
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
