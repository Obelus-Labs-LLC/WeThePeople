import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Filter } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';
import { fmtMoney as formatMoney } from '../utils/format';
import CanvasErrorBoundary from '../components/CanvasErrorBoundary';

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
  company: '#3B82F6',
  sector: '#F59E0B',
  channel: '#10B981',
  politician: '#EF4444',
};

export default function MoneyFlowPage() {
  const [data, setData] = useState<MoneyFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sector, setSector] = useState<string>('');
  const plotRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<typeof import('plotly.js') | null>(null);
  const [plotlyLoaded, setPlotlyLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (sector) params.set('sector', sector);
    fetch(`${API_BASE}/influence/money-flow?${params}`)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sector]);

  useEffect(() => {
    let cancelled = false;
    if (!data || !plotRef.current || data.nodes.length === 0) return;

    // Dynamically import Plotly to reduce initial bundle
    import('plotly.js').then((Plotly) => {
      if (cancelled) return;
      const P = (Plotly as unknown as { default?: typeof import('plotly.js') }).default || Plotly;
      plotlyRef.current = P as typeof import('plotly.js');
      setPlotlyLoaded(true);

      const nodeColors = data.nodes.map((n) => GROUP_COLORS[n.group] || '#6B7280');

      const trace = {
        type: 'sankey' as const,
        orientation: 'h' as const,
        node: {
          pad: 20,
          thickness: 24,
          line: { color: 'rgba(255,255,255,0.1)', width: 1 },
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
            const c = GROUP_COLORS[srcGroup] || '#6B7280';
            return c + '40'; // 25% opacity
          }),
          hovertemplate: '%{source.label} \u2192 %{target.label}<br>%{value:$,.0f}<extra></extra>',
        },
      };

      const layout = {
        font: { family: 'JetBrains Mono, monospace', size: 11, color: 'rgba(255,255,255,0.7)' },
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
      // Plotly failed to load — non-critical, chart simply won't render
    });

    const node = plotRef.current;
    return () => {
      cancelled = true;
      if (node && plotlyRef.current) {
        plotlyRef.current.purge(node);
      }
    };
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-16 lg:py-14">
        <Link to="/influence" className="inline-flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-6 no-underline">
          <ArrowLeft className="w-4 h-4" /> Influence Explorer
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Follow the Money</h1>
          <p className="text-white/50">
            Sankey diagram showing how corporate money flows through lobbying and PAC donations to politicians.
          </p>
        </div>

        {/* Sector filter */}
        <div className="flex items-center gap-3 mb-6">
          <Filter className="w-4 h-4 text-white/40" />
          {[
            { value: '', label: 'All Sectors' },
            { value: 'finance', label: 'Finance' },
            { value: 'health', label: 'Health' },
            { value: 'tech', label: 'Technology' },
            { value: 'energy', label: 'Energy' },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => setSector(s.value)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                sector === s.value
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-white/40 hover:text-white/70 bg-white/5'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-6">
          {[
            { label: 'Companies', color: GROUP_COLORS.company },
            { label: 'Lobbying Channels', color: GROUP_COLORS.sector },
            { label: 'PAC Donations', color: GROUP_COLORS.channel },
            { label: 'Politicians', color: GROUP_COLORS.politician },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-white/50 font-mono">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Sankey chart */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : !data || data.nodes.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            <p className="text-lg">No money flow data available yet.</p>
            <p className="text-sm mt-2">Data will appear once lobbying and donation syncs complete.</p>
          </div>
        ) : (
          <CanvasErrorBoundary fallbackHeight="600px">
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 overflow-hidden">
              <div ref={plotRef} style={{ width: '100%', minHeight: 600 }} />
            </div>
          </CanvasErrorBoundary>
        )}

        {/* Data source attribution */}
        <p className="text-white/20 text-xs mt-4 text-center">
          Data from Senate LDA (lobbying) and FEC (donations) via WeThePeople API
        </p>
      </div>
    </div>
  );
}
