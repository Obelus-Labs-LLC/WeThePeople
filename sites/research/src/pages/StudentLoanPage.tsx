import { useState, useEffect } from 'react';
import { BookOpen, DollarSign, Scale, AlertTriangle } from 'lucide-react';
import { apiFetch, mainSiteUrl } from '../api/client';
import { ToolHeader } from '../components/ToolHeader';

// ── Types ──

interface EducationCompany {
  company_id: string;
  display_name: string;
  sector_type: string | null;
  contract_total: number | null;
  lobbying_total: number | null;
  enforcement_count: number | null;
  enforcement_total_fines: number | null;
  student_count: number | null;
  default_rate: number | null;
}

// ── Helpers ──

function fmtCurrency(val: number | null): string {
  if (val == null) return '\u2014';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtNum(val: number | null): string {
  if (val == null) return '\u2014';
  return val.toLocaleString();
}

function fmtPct(val: number | null): string {
  if (val == null) return '\u2014';
  return `${(val * 100).toFixed(1)}%`;
}

// ── Page ──

export default function StudentLoanPage() {
  const [companies, setCompanies] = useState<EducationCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const data = await apiFetch<{ companies: EducationCompany[] }>(
          '/education/companies',
          { params: { sector_type: 'student_lending' } },
        );
        if (!cancelled) {
          setCompanies(data.companies || []);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-400 mb-2">Failed to load student loan data</p>
          <p className="text-sm text-zinc-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-500 cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ToolHeader
        eyebrow="Education"
        title="Student Loan Servicer Tracker"
        description="Track student loan servicers and lending companies. View government contracts, lobbying spend, enforcement actions, and borrower outcomes."
        accent="var(--color-accent-text)"
      />

      {/* Summary stats */}
      {!loading && companies.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <SummaryCard
            label="Servicers Tracked"
            value={companies.length.toString()}
            icon={<BookOpen size={16} className="text-amber-400" />}
          />
          <SummaryCard
            label="Total Contracts"
            value={fmtCurrency(companies.reduce((sum, c) => sum + (c.contract_total || 0), 0))}
            icon={<DollarSign size={16} className="text-emerald-400" />}
          />
          <SummaryCard
            label="Total Lobbying"
            value={fmtCurrency(companies.reduce((sum, c) => sum + (c.lobbying_total || 0), 0))}
            icon={<Scale size={16} className="text-blue-400" />}
          />
          <SummaryCard
            label="Enforcement Actions"
            value={fmtNum(companies.reduce((sum, c) => sum + (c.enforcement_count || 0), 0))}
            icon={<AlertTriangle size={16} className="text-red-400" />}
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-zinc-900 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && companies.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
            <BookOpen size={36} className="text-zinc-700" />
          </div>
          <p className="text-lg font-semibold text-zinc-400 mb-2">No student loan servicers tracked</p>
          <p className="text-sm text-zinc-600">Check back later as data is added.</p>
        </div>
      )}

      {/* Company Cards */}
      {!loading && companies.length > 0 && (
        <div className="space-y-4">
          {companies.map((company, idx) => (
            <div
              key={company.company_id}
              className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5 hover:bg-zinc-900/70 hover:border-zinc-700 transition-all"
              style={{ opacity: 0, animation: `card-enter 0.3s ease-out ${idx * 0.05}s forwards` }}
            >
              {/* Company header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <a
                    href={mainSiteUrl(`/education/${company.company_id}`)}
                    className="text-lg font-semibold text-white hover:text-amber-300 transition-colors no-underline"
                  >
                    {company.display_name}
                  </a>
                  {company.sector_type && (
                    <span className="ml-3 rounded px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400">
                      {company.sector_type.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricBox
                  label="Gov Contracts"
                  value={fmtCurrency(company.contract_total)}
                  color="text-emerald-400"
                />
                <MetricBox
                  label="Lobbying Spend"
                  value={fmtCurrency(company.lobbying_total)}
                  color="text-blue-400"
                />
                <MetricBox
                  label="Enforcement Actions"
                  value={fmtNum(company.enforcement_count)}
                  color={company.enforcement_count && company.enforcement_count > 0 ? 'text-red-400' : 'text-zinc-400'}
                />
                <MetricBox
                  label="Total Fines"
                  value={fmtCurrency(company.enforcement_total_fines)}
                  color={company.enforcement_total_fines && company.enforcement_total_fines > 0 ? 'text-red-400' : 'text-zinc-400'}
                />
              </div>

              {/* Borrower stats if available */}
              {(company.student_count != null || company.default_rate != null) && (
                <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-6">
                  {company.student_count != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-600 uppercase tracking-wider">Borrowers</span>
                      <span className="text-sm font-medium text-zinc-300">{fmtNum(company.student_count)}</span>
                    </div>
                  )}
                  {company.default_rate != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-600 uppercase tracking-wider">Default Rate</span>
                      <span className={`text-sm font-medium ${company.default_rate > 0.1 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {fmtPct(company.default_rate)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes card-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-xl font-bold text-white">{value}</span>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <p className="text-xs text-zinc-600 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}
