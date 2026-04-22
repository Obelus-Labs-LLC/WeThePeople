import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, ExternalLink, Building2, Search,
  CheckCircle2, XCircle, Clock, AlertTriangle,
} from 'lucide-react';
import { HealthSectorHeader } from '../components/SectorHeader';
import {
  ResearchToolLayout,
  ResearchSection,
  ResearchRowCard,
  ResearchEmptyState,
} from '../components/research/ResearchToolLayout';
import {
  getHealthCompanies,
  getHealthCompanyRecalls,
  type RecallItem,
} from '../api/health';
import { fmtDate, fmtNum } from '../utils/format';
import { getApiBaseUrl } from '../api/client';

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

const API_BASE = getApiBaseUrl();

async function getFDAApprovals(): Promise<FDAApprovalsResponse> {
  try {
    const res = await fetch(`${API_BASE}/health/fda/approvals`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    return { total: 0, approvals: [] };
  }
}

function statusConfig(status: string) {
  switch (status) {
    case 'approved':
      return { icon: CheckCircle2, color: 'var(--color-green)', label: 'APPROVED' };
    case 'rejected':
      return { icon: XCircle, color: 'var(--color-red)', label: 'REJECTED' };
    default:
      return { icon: Clock, color: 'var(--color-accent)', label: 'PENDING' };
  }
}

function recallClassAccent(cls: string | null): string {
  if (!cls) return 'var(--color-text-3)';
  if (cls.includes('I') && !cls.includes('II') && !cls.includes('III')) return 'var(--color-red)';
  if (cls.includes('II') && !cls.includes('III')) return 'var(--color-accent)';
  if (cls.includes('III')) return 'var(--color-dem)';
  return 'var(--color-text-3)';
}

export default function FDAApprovalsPage() {
  const [approvals, setApprovals] = useState<FDAApprovalItem[]>([]);
  const [recentRecalls, setRecentRecalls] = useState<(RecallItem & { companyId: string; companyName: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const approvalsRes = await getFDAApprovals();
        if (approvalsRes.approvals.length > 0) {
          setApprovals(approvalsRes.approvals);
        } else {
          setApiAvailable(false);
        }
        if (cancelled) return;

        const companiesRes = await getHealthCompanies({ limit: 30 });
        if (cancelled) return;
        const companies = companiesRes.companies || [];
        const recallSets = await Promise.all(
          companies.slice(0, 20).map((c) =>
            getHealthCompanyRecalls(c.company_id, { limit: 10 })
              .then((res) => (res.recalls || []).map((r) => ({ ...r, companyId: c.company_id, companyName: c.display_name })))
              .catch(() => [] as (RecallItem & { companyId: string; companyName: string })[]),
          ),
        );
        if (cancelled) return;
        const allRecalls = recallSets
          .flat()
          .sort((a, b) => {
            const da = a.recall_initiation_date ? new Date(a.recall_initiation_date).getTime() : 0;
            const db = b.recall_initiation_date ? new Date(b.recall_initiation_date).getTime() : 0;
            return db - da;
          })
          .slice(0, 50);
        setRecentRecalls(allRecalls);
      } catch {
        setApiAvailable(false);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const filteredRecalls = recentRecalls.filter((r) => {
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      if (
        !(r.product_description && r.product_description.toLowerCase().includes(q)) &&
        !r.companyName.toLowerCase().includes(q) &&
        !(r.recall_number && r.recall_number.toLowerCase().includes(q))
      ) return false;
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'ongoing' && !(r.status && r.status.toLowerCase().includes('ongoing'))) return false;
      if (statusFilter === 'terminated' && !(r.status && r.status.toLowerCase().includes('terminated'))) return false;
      if (statusFilter === 'completed' && !(r.status && r.status.toLowerCase().includes('completed'))) return false;
    }
    return true;
  });

  const classICount = recentRecalls.filter((r) => r.classification && r.classification.includes('I') && !r.classification.includes('II')).length;

  return (
    <ResearchToolLayout
      sectorHeader={<HealthSectorHeader />}
      eyebrow={{ label: 'FDA Activity', color: 'var(--color-red)' }}
      title="FDA Approvals & Recalls"
      description="FDA approvals, rejections, and recent recall activity across tracked health and pharma companies."
      accent="var(--color-red)"
      loading={loading}
      stats={[
        { label: 'Approvals', value: fmtNum(approvals.length), icon: CheckCircle2, accent: 'var(--color-green)' },
        { label: 'Recalls', value: fmtNum(recentRecalls.length), icon: ShieldCheck, accent: 'var(--color-accent)' },
        { label: 'Class I', value: fmtNum(classICount), icon: AlertTriangle, accent: 'var(--color-red)' },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {apiAvailable && approvals.length > 0 && (
          <ResearchSection
            title="Recent FDA Approvals"
            subtitle="Newly approved drugs and devices from tracked companies."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {approvals.map((a, idx) => {
                const cfg = statusConfig(a.status);
                const StatusIcon = cfg.icon;
                return (
                  <ResearchRowCard key={idx} accent={cfg.color}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', background: `${cfg.color}1f`, border: `1px solid ${cfg.color}33`, color: cfg.color }}>
                        <StatusIcon size={11} /> {cfg.label}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                        {fmtDate(a.approval_date)}
                      </span>
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 900, fontSize: '18px', color: 'var(--color-text-1)', margin: '0 0 4px' }}>
                      {a.drug_name}
                    </h3>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-text-2)', margin: '0 0 12px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {a.indication}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid rgba(235,229,213,0.06)' }}>
                      <Link
                        to={`/health/${a.company_id}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', textDecoration: 'none' }}
                      >
                        <Building2 size={12} />
                        {a.company_name}
                      </Link>
                      {a.source_url && (
                        <a
                          href={a.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-dem)', textDecoration: 'none' }}
                        >
                          FDA Source <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </ResearchRowCard>
                );
              })}
            </div>
          </ResearchSection>
        )}

        {!apiAvailable && (
          <div style={{ padding: '28px', borderRadius: '14px', border: '1px dashed rgba(235,229,213,0.1)', background: 'var(--color-surface)', textAlign: 'center' }}>
            <ShieldCheck size={40} color="var(--color-text-3)" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 900, fontSize: '20px', color: 'var(--color-text-1)', margin: '0 0 6px' }}>
              FDA Approvals Endpoint Coming Soon
            </h3>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-text-3)', margin: 0 }}>
              Approvals data isn't live yet — browsing recent recall activity instead.
            </p>
          </div>
        )}

        <ResearchSection
          title={`Recent FDA Recalls (${fmtNum(filteredRecalls.length)})`}
          subtitle="FDA enforcement reports across tracked companies."
          action={(
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)' }} />
                <input
                  type="text"
                  placeholder="Search product, company, number…"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{
                    padding: '8px 12px 8px 34px',
                    borderRadius: '8px',
                    border: '1px solid rgba(235,229,213,0.1)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-1)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    outline: 'none',
                    width: '240px',
                  }}
                />
              </div>
              {['all', 'ongoing', 'terminated', 'completed'].map((s) => {
                const active = statusFilter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${active ? 'rgba(230,57,70,0.3)' : 'rgba(235,229,213,0.1)'}`,
                      background: active ? 'rgba(230,57,70,0.15)' : 'transparent',
                      color: active ? 'var(--color-red)' : 'var(--color-text-3)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    {s === 'all' ? 'ALL' : s.toUpperCase()}
                  </button>
                );
              })}
            </div>
          )}
        >
          {filteredRecalls.length === 0 ? (
            <ResearchEmptyState icon={Search} text="No recalls match your filters." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredRecalls.map((r) => {
                const accent = recallClassAccent(r.classification);
                return (
                  <ResearchRowCard key={r.id} accent={accent}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                      {r.classification && (
                        <span style={{ padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, background: `${accent}1f`, border: `1px solid ${accent}33`, color: accent }}>
                          {r.classification}
                        </span>
                      )}
                      {r.status && (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            fontWeight: 700,
                            background: r.status.toLowerCase().includes('ongoing') ? 'rgba(230,57,70,0.15)' : 'rgba(235,229,213,0.05)',
                            color: r.status.toLowerCase().includes('ongoing') ? 'var(--color-red)' : 'var(--color-text-3)',
                          }}
                        >
                          {r.status.toUpperCase()}
                        </span>
                      )}
                      {r.recall_number && (
                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)' }}>
                          {r.recall_number}
                        </span>
                      )}
                    </div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-1)', margin: '0 0 10px' }}>
                      {r.product_description || 'No product description'}
                    </p>
                    {r.reason_for_recall && (
                      <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(235,229,213,0.06)', background: 'rgba(235,229,213,0.03)', marginBottom: '10px' }}>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 4px' }}>Reason</p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-text-2)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {r.reason_for_recall}
                        </p>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(235,229,213,0.06)' }}>
                      <Link
                        to={`/health/${r.companyId}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)', textDecoration: 'none' }}
                      >
                        <Building2 size={12} />
                        {r.companyName}
                        <ExternalLink size={10} />
                      </Link>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                        {fmtDate(r.recall_initiation_date)}
                      </span>
                    </div>
                  </ResearchRowCard>
                );
              })}
            </div>
          )}
        </ResearchSection>
      </div>
    </ResearchToolLayout>
  );
}
