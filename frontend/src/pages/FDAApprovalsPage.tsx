import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, ExternalLink, Building2, Search, Filter,
  CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { HealthSectorHeader } from '../components/SectorHeader';
import {
  getHealthCompanies,
  getHealthCompanyRecalls,
  type CompanyListItem,
  type RecallItem,
} from '../api/health';
import { fmtDate } from '../utils/format';
import { getApiBaseUrl } from '../api/client';

// ── Types ──

interface FDAApprovalItem {
  drug_name: string;
  company_name: string;
  company_id: string;
  approval_date: string;
  indication: string;
  status: 'approved' | 'rejected' | 'pending';
  source_url: string;
}

interface FDAApprovalsResponse {
  total: number;
  approvals: FDAApprovalItem[];
}

// ── API ──

const API_BASE = getApiBaseUrl();

async function getFDAApprovals(): Promise<FDAApprovalsResponse> {
  try {
    const res = await fetch(`${API_BASE}/health/fda/approvals`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    // API may not exist yet - return empty
    return { total: 0, approvals: [] };
  }
}

// ── Status badge helpers ──

function statusConfig(status: string) {
  switch (status) {
    case 'approved':
      return { icon: CheckCircle2, color: '#10B981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', label: 'APPROVED' };
    case 'rejected':
      return { icon: XCircle, color: '#DC2626', bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.2)', label: 'REJECTED' };
    default:
      return { icon: Clock, color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', label: 'PENDING' };
  }
}

// ── Recall classification color ──

function recallClassColor(cls: string | null): { bar: string; label: string } {
  if (!cls) return { bar: '#64748B', label: 'Unknown' };
  if (cls.includes('I') && !cls.includes('II') && !cls.includes('III'))
    return { bar: '#DC2626', label: 'Class I' };
  if (cls.includes('II') && !cls.includes('III'))
    return { bar: '#F59E0B', label: 'Class II' };
  if (cls.includes('III'))
    return { bar: '#3B82F6', label: 'Class III' };
  return { bar: '#64748B', label: cls };
}

// ── Page ──

export default function FDAApprovalsPage() {
  const [approvals, setApprovals] = useState<FDAApprovalItem[]>([]);
  const [recentRecalls, setRecentRecalls] = useState<(RecallItem & { companyId: string; companyName: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    async function loadData() {
      try {
        // Try fetching FDA approvals endpoint
        const approvalsRes = await getFDAApprovals();

        if (approvalsRes.approvals.length > 0) {
          setApprovals(approvalsRes.approvals);
        } else {
          setApiAvailable(false);
        }

        // Also fetch recent recalls as FDA activity data
        const companiesRes = await getHealthCompanies({ limit: 30 });
        const companies = companiesRes.companies || [];

        const recallSets = await Promise.all(
          companies.slice(0, 20).map((c) =>
            getHealthCompanyRecalls(c.company_id, { limit: 10 })
              .then((res) =>
                (res.recalls || []).map((r) => ({
                  ...r,
                  companyId: c.company_id,
                  companyName: c.display_name,
                }))
              )
              .catch(() => [] as (RecallItem & { companyId: string; companyName: string })[])
          )
        );

        const allRecalls = recallSets
          .flat()
          .sort((a, b) => {
            const da = a.recall_initiation_date ? new Date(a.recall_initiation_date).getTime() : 0;
            const db = b.recall_initiation_date ? new Date(b.recall_initiation_date).getTime() : 0;
            return db - da;
          })
          .slice(0, 50);

        setRecentRecalls(allRecalls);
      } catch (err) {
        console.error('FDA approvals load error:', err);
        setApiAvailable(false);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DC2626] border-t-transparent" />
          <p className="text-sm text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            Loading FDA activity data...
          </p>
        </div>
      </div>
    );
  }

  const filteredRecalls = recentRecalls.filter((r) => {
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      if (
        !(r.product_description && r.product_description.toLowerCase().includes(q)) &&
        !(r.companyName.toLowerCase().includes(q)) &&
        !(r.recall_number && r.recall_number.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'ongoing' && !(r.status && r.status.toLowerCase().includes('ongoing'))) return false;
      if (statusFilter === 'terminated' && !(r.status && r.status.toLowerCase().includes('terminated'))) return false;
      if (statusFilter === 'completed' && !(r.status && r.status.toLowerCase().includes('completed'))) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col w-full min-h-screen">
      <div className="mx-auto w-full max-w-[1400px] flex flex-col px-8 py-8 md:px-12 md:py-10">
        <HealthSectorHeader />

        {/* Header */}
        <div className="flex items-end justify-between pb-6 mb-8 shrink-0 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={16} style={{ color: '#DC2626' }} />
              <span
                className="text-sm uppercase text-white/40"
                style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.2em' }}
              >
                FDA ACTIVITY
              </span>
            </div>
            <h1
              className="text-4xl md:text-5xl font-bold text-white"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              FDA Approvals & Recalls
            </h1>
            <p className="text-sm mt-2 text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Track FDA approvals, rejections, and recent recall activity across tracked companies.
            </p>
          </div>
        </div>

        {/* Approvals section (if API available) */}
        {apiAvailable && approvals.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-bold uppercase mb-4 text-white/50"
              style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
              RECENT APPROVALS
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {approvals.map((a, idx) => {
                const cfg = statusConfig(a.status);
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-white/10 bg-white/[0.05] backdrop-blur-sm p-5"
                    style={{
                      opacity: 0,
                      animation: `card-enter 0.3s ease-out ${idx * 0.05}s forwards`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="flex items-center gap-1 rounded border px-2 py-1 text-xs font-bold"
                        style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color }}>
                        <StatusIcon size={12} /> {cfg.label}
                      </span>
                      <span className="text-xs text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtDate(a.approval_date)}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-1" style={{ fontFamily: "'Syne', sans-serif" }}>
                      {a.drug_name}
                    </h3>
                    <p className="text-sm text-white/50 mb-3 line-clamp-2">{a.indication}</p>

                    <div className="flex items-center justify-between border-t border-white/10 pt-3">
                      <Link
                        to={`/health/${a.company_id}`}
                        className="flex items-center gap-2 text-sm no-underline transition-colors hover:text-[#FCA5A5]"
                        style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.5)' }}
                      >
                        <Building2 size={14} />
                        {a.company_name}
                      </Link>
                      {a.source_url && (
                        <a
                          href={a.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs hover:underline"
                          style={{ color: '#93C5FD' }}
                        >
                          FDA Source <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Coming soon notice if no approvals API */}
        {!apiAvailable && (
          <div className="rounded-xl border border-white/10 bg-white/[0.05] backdrop-blur-sm p-8 mb-8 text-center">
            <ShieldCheck size={40} className="mx-auto mb-4 text-white/20" />
            <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
              FDA Approvals Endpoint Coming Soon
            </h3>
            <p className="text-sm text-white/40 mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              The /api/health/fda/approvals endpoint is not yet available. Below you can browse recent FDA recall activity across all tracked companies.
            </p>
          </div>
        )}

        {/* Recent Recalls Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase text-white/50"
              style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
              RECENT FDA RECALLS ({filteredRecalls.length})
            </h2>
          </div>

          {/* Search + Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Search product or company..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#DC2626]/50 transition-colors"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
            </div>
            <div className="flex gap-2">
              {['all', 'ongoing', 'terminated', 'completed'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="rounded-lg border px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    background: statusFilter === s ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.05)',
                    borderColor: statusFilter === s ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.1)',
                    color: statusFilter === s ? '#FCA5A5' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {s === 'all' ? 'ALL' : s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Recall Cards */}
          {filteredRecalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-white/10 bg-white/[0.03]">
              <Search size={48} className="text-white/10 mb-4" />
              <p className="text-sm text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                No recalls match your filters.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecalls.map((r, idx) => {
                const cls = recallClassColor(r.classification);
                return (
                  <div
                    key={`${r.id}-${idx}`}
                    className="flex rounded-xl border border-white/10 overflow-hidden"
                    style={{
                      opacity: 0,
                      animation: `card-enter 0.3s ease-out ${idx * 0.02}s forwards`,
                    }}
                  >
                    {/* Color bar */}
                    <div className="w-2 shrink-0" style={{ background: cls.bar }} />

                    {/* Content */}
                    <div className="flex-1 p-5 bg-white/[0.05] backdrop-blur-sm">
                      {/* Top: badges */}
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {r.classification && (
                          <span
                            className="rounded border px-2 py-1 text-xs font-bold"
                            style={{
                              background: `${cls.bar}15`,
                              borderColor: `${cls.bar}30`,
                              color: cls.bar,
                            }}
                          >
                            {r.classification}
                          </span>
                        )}
                        {r.status && (
                          <span
                            className="rounded px-2 py-1 text-xs font-bold"
                            style={{
                              background: r.status.toLowerCase().includes('ongoing') ? 'rgba(220,38,38,0.1)' : 'rgba(255,255,255,0.05)',
                              color: r.status.toLowerCase().includes('ongoing') ? '#FCA5A5' : 'rgba(255,255,255,0.4)',
                            }}
                          >
                            {r.status.toUpperCase()}
                          </span>
                        )}
                        {r.recall_number && (
                          <span className="text-xs ml-auto" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.3)' }}>
                            {r.recall_number}
                          </span>
                        )}
                      </div>

                      {/* Product */}
                      <p className="text-sm font-semibold text-white mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
                        {r.product_description || 'No product description'}
                      </p>

                      {/* Reason */}
                      {r.reason_for_recall && (
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 mb-3">
                          <p className="text-xs uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.3)' }}>REASON</p>
                          <p className="text-sm text-white/60 line-clamp-2">{r.reason_for_recall}</p>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between border-t border-white/10 pt-3">
                        <Link
                          to={`/health/${r.companyId}`}
                          className="flex items-center gap-2 text-sm no-underline transition-colors hover:text-[#FCA5A5]"
                          style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.5)' }}
                        >
                          <Building2 size={14} />
                          {r.companyName}
                          <ExternalLink size={12} />
                        </Link>
                        <span className="text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>
                          {fmtDate(r.recall_initiation_date)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes card-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
