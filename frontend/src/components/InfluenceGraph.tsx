import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useNavigate } from 'react-router-dom';
import type { NetworkNode, NetworkEdge } from '../api/influence';

// ── Constants ──

const PARTY_COLORS: Record<string, string> = {
  D: '#3B82F6',
  R: '#EF4444',
  I: '#A855F7',
};

const SECTOR_COLORS: Record<string, string> = {
  finance: '#10B981',
  health: '#F43F5E',
  tech: '#8B5CF6',
  energy: '#F97316',
};

const EDGE_COLORS: Record<string, string> = {
  donation: '#10B981',
  legislation: '#3B82F6',
  trade: '#EF4444',
  lobbying: '#F59E0B',
  contract: '#6366F1',
};

const NODE_RADIUS: Record<string, number> = {
  person: 22,
  company: 18,
  bill: 14,
  ticker: 14,
  lobbying_issue: 12,
  agency: 14,
};

// ── Helpers ──

function initials(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  if (n > 0) return `$${Math.round(n).toLocaleString()}`;
  return '';
}

function getProfileRoute(node: NetworkNode): string | null {
  if (node.type === 'person' && node.person_id) {
    return `/politics/people/${node.person_id}`;
  }
  if (node.type === 'company') {
    const sector = node.sector;
    const eid = node.entity_id;
    if (sector === 'finance') return `/finance/${eid}`;
    if (sector === 'health') return `/health/${eid}`;
    if (sector === 'tech') return `/technology/${eid}`;
    if (sector === 'energy') return `/energy/${eid}`;
  }
  if (node.type === 'bill' && node.bill_id) {
    return `/politics/bill/${node.bill_id}`;
  }
  return null;
}

// ── Image cache for photo_url ──
const imageCache: Record<string, HTMLImageElement> = {};

function getImage(url: string): HTMLImageElement | null {
  if (imageCache[url]) return imageCache[url];
  const img = new Image();
  img.src = url;
  img.onload = () => { imageCache[url] = img; };
  return imageCache[url] || null;
}

// ── Types for the graph ──

interface GraphNode extends NetworkNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

// Use a plain object for links to avoid type conflicts with react-force-graph
type GraphLink = Record<string, any>;

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ── Component ──

interface InfluenceGraphProps {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  visibleEdgeTypes?: Set<string>;
  timelineYear?: number | null;
  width?: number;
  height?: number;
}

export default function InfluenceGraph({
  nodes,
  edges,
  visibleEdgeTypes,
  timelineYear,
  width,
  height,
}: InfluenceGraphProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(undefined);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ w: width || 800, h: height || 600 });

  // Resize observer
  useEffect(() => {
    if (width && height) {
      setDimensions({ w: width, h: height });
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) setDimensions({ w, h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  // Build graph data
  const graphData: GraphData = useMemo(() => {
    let filteredEdges = visibleEdgeTypes
      ? edges.filter((e) => visibleEdgeTypes.has(e.type))
      : [...edges];

    // Filter by timeline year (cumulative — show edges up to selected year)
    if (timelineYear != null) {
      filteredEdges = filteredEdges.filter((e) => {
        // Edges without year data are always visible
        if (e.year == null && (!e.years || e.years.length === 0)) return true;
        // Check single year field
        if (e.year != null && e.year <= timelineYear) return true;
        // Check years array — show if any year <= timelineYear
        if (e.years && e.years.some((y) => y <= timelineYear)) return true;
        return false;
      });
    }

    // Only include nodes that are connected by visible edges
    const connectedNodeIds = new Set<string>();
    for (const e of filteredEdges) {
      connectedNodeIds.add(e.source as string);
      connectedNodeIds.add(e.target as string);
    }

    const filteredNodes = nodes.filter((n) => connectedNodeIds.has(n.id));

    return {
      nodes: filteredNodes.map((n) => ({ ...n })),
      links: filteredEdges.map((e) => ({ ...e })),
    };
  }, [nodes, edges, visibleEdgeTypes, timelineYear]);

  // Zoom to fit on data change
  useEffect(() => {
    const timer = setTimeout(() => {
      fgRef.current?.zoomToFit(400, 60);
    }, 500);
    return () => clearTimeout(timer);
  }, [graphData]);

  // Custom node rendering
  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x || 0;
      const y = node.y || 0;
      const r = (NODE_RADIUS[node.type] || 14) / Math.max(globalScale * 0.5, 1);
      const fontSize = Math.max(10 / globalScale, 3);
      const isHovered = hoveredNode?.id === node.id;

      if (node.type === 'person') {
        const color = PARTY_COLORS[node.party?.charAt(0) || ''] || '#6B7280';
        const img = node.photo_url ? getImage(node.photo_url) : null;

        // Circle background
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (isHovered) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 / globalScale;
          ctx.stroke();
        }

        // Photo or initials
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, r - 1 / globalScale, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${fontSize * 1.2}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(initials(node.label), x, y);
        }

        // Label below
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(node.label.split(' ').slice(-1)[0], x, y + r + fontSize);

      } else if (node.type === 'company') {
        const color = SECTOR_COLORS[node.sector || ''] || '#6B7280';
        const w = r * 2.2;
        const h = r * 1.4;

        // Rounded rect
        ctx.beginPath();
        const rx = 4 / globalScale;
        ctx.moveTo(x - w / 2 + rx, y - h / 2);
        ctx.lineTo(x + w / 2 - rx, y - h / 2);
        ctx.quadraticCurveTo(x + w / 2, y - h / 2, x + w / 2, y - h / 2 + rx);
        ctx.lineTo(x + w / 2, y + h / 2 - rx);
        ctx.quadraticCurveTo(x + w / 2, y + h / 2, x + w / 2 - rx, y + h / 2);
        ctx.lineTo(x - w / 2 + rx, y + h / 2);
        ctx.quadraticCurveTo(x - w / 2, y + h / 2, x - w / 2, y + h / 2 - rx);
        ctx.lineTo(x - w / 2, y - h / 2 + rx);
        ctx.quadraticCurveTo(x - w / 2, y - h / 2, x - w / 2 + rx, y - h / 2);
        ctx.closePath();
        ctx.fillStyle = color + '30';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = (isHovered ? 2 : 1) / globalScale;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = `${fontSize * 0.9}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const shortLabel = node.ticker || (node.label.length > 12 ? node.label.slice(0, 12) + '..' : node.label);
        ctx.fillText(shortLabel, x, y);

      } else if (node.type === 'bill') {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#3B82F630';
        ctx.fill();
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = (isHovered ? 2 : 1) / globalScale;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = `${fontSize * 1.4}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\uD83D\uDCDC', x, y);

      } else if (node.type === 'lobbying_issue') {
        // Diamond shape
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        ctx.fillStyle = '#F59E0B30';
        ctx.fill();
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = (isHovered ? 2 : 1) / globalScale;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = `${fontSize * 0.8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const issueShort = node.label.length > 16 ? node.label.slice(0, 16) + '..' : node.label;
        ctx.fillText(issueShort, x, y);

      } else if (node.type === 'ticker') {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#EF444430';
        ctx.fill();
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = (isHovered ? 2 : 1) / globalScale;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.ticker || node.label, x, y);

      } else if (node.type === 'agency') {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#6366F130';
        ctx.fill();
        ctx.strokeStyle = '#6366F1';
        ctx.lineWidth = (isHovered ? 2 : 1) / globalScale;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = `${fontSize * 0.8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const agencyShort = node.label.length > 14 ? node.label.slice(0, 14) + '..' : node.label;
        ctx.fillText(agencyShort, x, y);

      } else {
        // Fallback
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#4B5563';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label.slice(0, 8), x, y);
      }
    },
    [hoveredNode],
  );

  // Link styling
  const linkColor = useCallback((link: GraphLink) => {
    return EDGE_COLORS[link.type] || '#4B5563';
  }, []);

  const linkWidth = useCallback((link: GraphLink) => {
    const amount = Math.abs(link.amount || 0);
    if (amount >= 1e7) return 4;
    if (amount >= 1e6) return 3;
    if (amount >= 1e5) return 2;
    return 1;
  }, []);

  // Interactions
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const route = getProfileRoute(node);
      if (route) navigate(route);
    },
    [navigate],
  );

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNode(node || null);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ minHeight: 400 }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.w}
        height={dimensions.h}
        backgroundColor="transparent"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
          const r = (NODE_RADIUS[node.type] || 14) * 1.2;
          ctx.beginPath();
          ctx.arc(node.x || 0, node.y || 0, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0.85}
        linkCurvature={0.15}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        cooldownTicks={80}
        d3AlphaDecay={0.04}
        d3VelocityDecay={0.3}
      />

      {/* Tooltip */}
      {hoveredNode && (
        <div className="pointer-events-none absolute top-4 right-4 z-10 max-w-[280px] rounded-lg border border-white/10 bg-slate-900/95 px-4 py-3 text-sm text-white shadow-xl backdrop-blur">
          <div className="font-bold text-base mb-1">{hoveredNode.label}</div>
          <div className="text-white/50 text-xs uppercase tracking-wider mb-2">
            {hoveredNode.type === 'person' && (
              <>
                {hoveredNode.party === 'D' ? 'Democrat' : hoveredNode.party === 'R' ? 'Republican' : hoveredNode.party === 'I' ? 'Independent' : ''}
                {hoveredNode.state ? ` \u00B7 ${hoveredNode.state}` : ''}
                {hoveredNode.chamber ? ` \u00B7 ${hoveredNode.chamber}` : ''}
              </>
            )}
            {hoveredNode.type === 'company' && (
              <>{hoveredNode.sector}{hoveredNode.ticker ? ` \u00B7 ${hoveredNode.ticker}` : ''}</>
            )}
            {hoveredNode.type === 'bill' && <>Legislation</>}
            {hoveredNode.type === 'ticker' && <>Stock ticker</>}
            {hoveredNode.type === 'lobbying_issue' && <>Lobbying issue</>}
            {hoveredNode.type === 'agency' && <>Government agency</>}
          </div>
          {getProfileRoute(hoveredNode) && (
            <div className="text-blue-400 text-xs">Click to view profile</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-3 text-[10px] text-white/50">
        {Object.entries(EDGE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
            <span className="capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
