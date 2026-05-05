import React, { useEffect, useState, useRef } from 'react';
import { Filter, Network, Users, Landmark, Building2 } from 'lucide-react';
import {
  ResearchToolLayout,
  ResearchSection,
  ResearchEmptyState,
} from '../components/research/ResearchToolLayout';
import { getApiBaseUrl } from '../api/client';
import CanvasErrorBoundary from '../components/CanvasErrorBoundary';
import { fmtDollar, fmtNum } from '../utils/format';

const API_BASE = getApiBaseUrl();

interface SankeyNode {
  name: string;
  group: string;
}

interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

interface MoneyFlowData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

const GROUP_COLORS: Record<string, string> = {
  company: 'var(--color-dem)',
  sector: 'var(--color-accent)',
  channel: 'var(--color-green)',
  politician: 'var(--color-red)',
};

// Plotly accepts solid hex/rgb — resolve CSS vars to computed values at runtime.
function resolveCssVar(varName: string): string {
  if (typeof window === 'undefined') return '#6B7280';
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || '#6B7280';
}

// All 11 sectors WTP tracks. Pre-fix the picker only listed the
// original four (Finance/Health/Tech/Energy), so 6 sectors had no
// money-flow filter at all and any company in them silently disappeared
// from the Sankey.
const SECTOR_OPTIONS = [
  { value: '', label: 'All Sectors' },
  { value: 'finance', label: 'Finance' },
  { value: 'health', label: 'Health' },
  { value: 'tech', label: 'Technology' },
  { value: 'energy', label: 'Energy' },
  { value: 'defense', label: 'Defense' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'chemicals', label: 'Chemicals' },
  { value: 'telecom', label: 'Telecom' },
  { value: 'education', label: 'Education' },
];

const LEGEND_ITEMS = [
  { label: 'Companies', group: 'company' },
  { label: 'Lobbying Channels', group: 'sector' },
  { label: 'PAC Donations', group: 'channel' },
  { label: 'Politicians', group: 'politician' },
];

export default function MoneyFlowPage() {
  const [data, setData] = useState<MoneyFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sector, setSector] = useState<string>('');
  const plotRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<typeof import('plotly.js') | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (sector) params.set('sector', sector);
    fetch(`${API_BASE}/influence/money-flow?${params}`)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('Failed to load money-flow data.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sector]);

  useEffect(() => {
    let cancelled = false;
    if (!data || !plotRef.current || data.nodes.length === 0) return;

    import('plotly.js').then((Plotly) => {
      if (cancelled) return;
      const P = (Plotly as unknown as { default?: typeof import('plotly.js') }).default || Plotly;
      plotlyRef.current = P as typeof import('plotly.js');

      const nodeColors = data.nodes.map((n) => {
        const varName = GROUP_COLORS[n.group];
        if (!varName) return '#6B7280';
        if (varName.startsWith('var(--')) {
          const inner = varName.slice(4, -1);
          return resolveCssVar(inner);
        }
        return varName;
      });

      const trace = {
        type: 'sankey' as const,
        orientation: 'h' as const,
        node: {
          pad: 20,
          thickness: 24,
          line: { color: 'rgba(235,229,213,0.1)', width: 1 },
          label: data.nodes.map((n) => n.name),
          color: nodeColors,
          hovertemplate: '%{label}<extra></extra>',
        },
        link: {
          source: data.links.map((l) => l.source),
          target: data.links.map((l) => l.target),
          value: data.links.map((l) => l.value),
          color: data.links.map((l) => {
            const srcGroup = data.nodes[l.source]?.group;
            const varName = GROUP_COLORS[srcGroup];
            if (!varName) return 'rgba(107,114,128,0.25)';
            if (varName.startsWith('var(--')) {
              const inner = varName.slice(4, -1);
              return resolveCssVar(inner) + '40';
            }
            return varName + '40';
          }),
          hovertemplate: '%{source.label} \u2192 %{target.label}<br>%{value:$,.0f}<extra></extra>',
        },
      };

      const layout = {
        font: { family: 'JetBrains Mono, monospace', size: 11, color: 'rgba(235,229,213,0.7)' },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        margin: { l: 10, r: 10, t: 10, b: 10 },
        height: 600,
      };

      P.newPlot(plotRef.current!, [trace], layout, {
        displayModeBar: false,
        responsive: true,
      });
    }).catch(() => {
      // Plotly failed to load — non-critical
    });

    const node = plotRef.current;
    return () => {
      cancelled = true;
      if (node && plotlyRef.current) plotlyRef.current.purge(node);
    };
  }, [data]);

  const totalFlow = data ? data.links.reduce((sum, l) => sum + (l.value || 0), 0) : 0;
  const companyCount = data ? data.nodes.filter((n) => n.group === 'company').length : 0;
  const politicianCount = data ? data.nodes.filter((n) => n.group === 'politician').length : 0;

  return (
    <ResearchToolLayout
      eyebrow={{ label: 'Influence Explorer', color: 'var(--color-accent)' }}
      title="Follow the Money"
      description="Sankey diagram showing how corporate money flows through lobbying and PAC donations to politicians."
      accent="var(--color-accent)"
      loading={loading && !data}
      error={error}
      stats={[
        { label: 'Total Flow', value: fmtDollar(totalFlow), icon: Network, accent: 'var(--color-green)' },
        { label: 'Companies', value: fmtNum(companyCount), icon: Building2 },
        { label: 'Politicians', value: fmtNum(politicianCount), icon: Users, accent: 'var(--color-red)' },
        { label: 'Connections', value: fmtNum(data?.links.length ?? 0), icon: Landmark },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Filter size={14} color="var(--color-text-3)" />
          {SECTOR_OPTIONS.map((s) => {
            const active = sector === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setSector(s.value)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${active ? 'rgba(197,160,40,0.3)' : 'rgba(235,229,213,0.1)'}`,
                  background: active ? 'rgba(197,160,40,0.12)' : 'transparent',
                  color: active ? 'var(--color-accent)' : 'var(--color-text-2)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
          {LEGEND_ITEMS.map((item) => (
            <div key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '999px', background: GROUP_COLORS[item.group] }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-3)' }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>

        <ResearchSection
          title="Flow Diagram"
          subtitle="Each strand's thickness represents the dollar volume flowing from source to target."
        >
          {loading ? (
            <div style={{ height: '620px', borderRadius: '14px', background: 'var(--color-surface)', opacity: 0.6 }} />
          ) : !data || data.nodes.length === 0 ? (
            <ResearchEmptyState icon={Network} text="No money-flow data available yet. Data appears after lobbying and donation syncs complete." />
          ) : (
            <CanvasErrorBoundary fallbackHeight="600px">
              <div
                style={{
                  padding: '16px',
                  borderRadius: '14px',
                  border: '1px solid rgba(235,229,213,0.08)',
                  background: 'var(--color-surface)',
                  overflow: 'hidden',
                }}
              >
                <div ref={plotRef} style={{ width: '100%', minHeight: '600px' }} />
              </div>
            </CanvasErrorBoundary>
          )}
        </ResearchSection>

        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-3)', textAlign: 'center', margin: 0 }}>
          Data from Senate LDA (lobbying) and FEC (donations) via WeThePeople API
        </p>
      </div>
    </ResearchToolLayout>
  );
}
