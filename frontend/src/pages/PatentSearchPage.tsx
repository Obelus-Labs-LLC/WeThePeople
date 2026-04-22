import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Calendar, ExternalLink, SearchX, FileText, Building2 } from 'lucide-react';
import { TechSectorHeader } from '../components/SectorHeader';
import {
  ResearchToolLayout,
  ResearchSection,
  ResearchRowCard,
  ResearchEmptyState,
} from '../components/research/ResearchToolLayout';
import {
  getTechCompanies,
  getTechCompanyPatents,
  type TechPatentItem,
} from '../api/tech';
import { fmtDate, fmtNum } from '../utils/format';

interface PatentWithCompany extends TechPatentItem {
  company_id: string;
  company_name: string;
}

export default function PatentSearchPage() {
  const [query, setQuery] = useState('');
  const [allPatents, setAllPatents] = useState<PatentWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const compRes = await getTechCompanies({ limit: 200 });
        const comps = compRes.companies || [];
        if (cancelled) return;
        const patentResults = await Promise.allSettled(
          comps.map((c) =>
            getTechCompanyPatents(c.company_id, { limit: 50 }).then((r) =>
              (r.patents || []).map((p) => ({ ...p, company_id: c.company_id, company_name: c.display_name })),
            ),
          ),
        );
        if (cancelled) return;
        const combined: PatentWithCompany[] = [];
        for (const result of patentResults) if (result.status === 'fulfilled') combined.push(...result.value);
        combined.sort((a, b) => {
          if (!a.patent_date && !b.patent_date) return 0;
          if (!a.patent_date) return 1;
          if (!b.patent_date) return -1;
          return new Date(b.patent_date).getTime() - new Date(a.patent_date).getTime();
        });
        setAllPatents(combined);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load patents');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allPatents.slice(0, 100);
    const q = query.toLowerCase();
    return allPatents.filter(
      (p) =>
        (p.patent_title && p.patent_title.toLowerCase().includes(q)) ||
        (p.patent_number && p.patent_number.toLowerCase().includes(q)) ||
        (p.patent_abstract && p.patent_abstract.toLowerCase().includes(q)) ||
        p.company_name.toLowerCase().includes(q),
    );
  }, [allPatents, query]);

  const totalPatents = allPatents.length;
  const uniqueCompanies = new Set(allPatents.map((p) => p.company_id)).size;
  const totalClaims = allPatents.reduce((sum, p) => sum + (p.num_claims || 0), 0);

  return (
    <ResearchToolLayout
      sectorHeader={<TechSectorHeader />}
      eyebrow={{ label: 'Patent Search', color: 'var(--color-ind)' }}
      title="Patent Explorer"
      description="Search the full patent catalog across tracked technology companies — by title, number, abstract, or issuer."
      accent="var(--color-ind)"
      loading={loading}
      error={error}
      stats={[
        { label: 'Total Patents', value: fmtNum(totalPatents), icon: FileText, accent: 'var(--color-ind)' },
        { label: 'Companies', value: fmtNum(uniqueCompanies), icon: Building2 },
        { label: 'Total Claims', value: fmtNum(totalClaims), icon: FileText },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ position: 'relative', maxWidth: '640px' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-3)' }} />
          <input
            type="text"
            placeholder="Search patents by title, number, abstract, or company..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 14px 12px 40px',
              borderRadius: '10px',
              border: '1px solid rgba(235,229,213,0.1)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-1)',
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              outline: 'none',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>

        <ResearchSection
          title={query ? `${fmtNum(filtered.length)} Results` : 'Recent Patents'}
          subtitle={query ? `Patents matching "${query}"` : `Showing the ${Math.min(100, totalPatents)} most recently issued patents.`}
        >
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: '96px', borderRadius: '12px', background: 'var(--color-surface)', opacity: 0.6 }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <ResearchEmptyState icon={SearchX} text={query ? 'No patents match your search.' : 'No patents available.'} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map((p) => {
                const isExpanded = expandedId === p.id;
                return (
                  <ResearchRowCard key={`${p.company_id}-${p.id}`} accent="var(--color-ind)" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-1)', margin: '0 0 6px' }}>
                          {p.patent_title || 'Untitled Patent'}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                          {p.patent_number && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-accent)' }}>US{p.patent_number}</span>
                          )}
                          <Link
                            to={`/technology/${p.company_id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-ind)', textDecoration: 'none' }}
                          >
                            {p.company_name}
                          </Link>
                          {p.patent_date && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                              <Calendar size={11} />{fmtDate(p.patent_date)}
                            </span>
                          )}
                          {p.num_claims != null && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>{p.num_claims} claims</span>
                          )}
                        </div>
                        {p.patent_abstract && (
                          <p
                            style={{
                              margin: '10px 0 0',
                              fontFamily: 'var(--font-body)',
                              fontSize: '13px',
                              color: 'var(--color-text-2)',
                              lineHeight: 1.5,
                              display: isExpanded ? 'block' : '-webkit-box',
                              WebkitLineClamp: isExpanded ? undefined : 2,
                              WebkitBoxOrient: isExpanded ? undefined : 'vertical',
                              overflow: isExpanded ? 'visible' : 'hidden',
                            }}
                          >
                            {p.patent_abstract}
                          </p>
                        )}
                      </div>
                      {p.patent_number && (
                        <a
                          href={`https://patents.google.com/patent/US${p.patent_number.replace(/[^0-9A-Za-z]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            borderRadius: '999px',
                            background: 'rgba(235,229,213,0.06)',
                            color: 'var(--color-text-1)',
                            flexShrink: 0,
                          }}
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
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
