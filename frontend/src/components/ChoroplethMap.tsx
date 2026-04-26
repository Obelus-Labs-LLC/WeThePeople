import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import type { Layer, LeafletMouseEvent } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Types ──

interface StateData {
  value: number;
  count: number;
}

interface ChoroplethMapProps {
  data: Record<string, StateData>;
  metric: string;
  onStateClick?: (stateAbbr: string, stateName: string) => void;
}

interface GeoJSONFeature {
  type: string;
  properties: {
    name: string;
    abbr?: string;
    density?: number;
    [key: string]: unknown;
  };
  geometry: unknown;
}

interface GeoJSONCollection {
  type: string;
  features: GeoJSONFeature[];
}

// ── State abbreviation lookup ──

const STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
  Wyoming: 'WY', 'District of Columbia': 'DC',
};

// ── Color scales ──

const METRIC_COLORS: Record<string, { light: string; dark: string; label: string }> = {
  donations: { light: '#dbeafe', dark: '#1e40af', label: 'Donations' },
  lobbying:  { light: '#d1fae5', dark: '#065f46', label: 'Lobbying' },
  members:   { light: '#fef3c7', dark: '#92400e', label: 'Members' },
};

function interpolateColor(t: number, light: string, dark: string): string {
  // Parse hex colors
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const l = parse(light);
  const d = parse(dark);
  const r = Math.round(l[0] + (d[0] - l[0]) * t);
  const g = Math.round(l[1] + (d[1] - l[1]) * t);
  const b = Math.round(l[2] + (d[2] - l[2]) * t);
  return `rgb(${r},${g},${b})`;
}

function formatValue(value: number, metric: string): string {
  if (metric === 'members') return value.toLocaleString();
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

// ── GeoJSON source ──
// Vendored from https://github.com/PublicaMundi/MappingAPI (public domain) to
// eliminate dependency on raw.githubusercontent.com — which has no uptime SLA,
// gets rate-limited, and ships with Content-Type: text/plain (not application/json).
// Lives in /public/us-states.geo.json (served at site root, CDN-cached by Vercel).
const GEOJSON_URL = '/us-states.geo.json';

// ── Component ──

const ChoroplethMap: React.FC<ChoroplethMapProps> = ({ data, metric, onStateClick }) => {
  const [geoData, setGeoData] = useState<GeoJSONCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tooltipRef = useRef<L.Control | null>(null);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  // Fetch GeoJSON. The payload is ~2 MB, so navigating away mid-download
  // used to setState on an unmounted component; gate on the abort signal.
  useEffect(() => {
    const controller = new AbortController();
    fetch(GEOJSON_URL, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load map data: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!controller.signal.aborted) setGeoData(json as GeoJSONCollection);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        console.warn('[ChoroplethMap] geojson load failed:', err);
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Compute min/max for color scale
  const { minVal, maxVal } = useMemo(() => {
    const vals = Object.values(data).map((d) => d.value);
    if (vals.length === 0) return { minVal: 0, maxVal: 1 };
    return { minVal: Math.min(...vals), maxVal: Math.max(...vals) };
  }, [data]);

  const colors = METRIC_COLORS[metric] || METRIC_COLORS.donations;

  const getColor = useCallback(
    (value: number) => {
      if (maxVal === minVal) return colors.dark;
      const t = (value - minVal) / (maxVal - minVal);
      return interpolateColor(t, colors.light, colors.dark);
    },
    [minVal, maxVal, colors],
  );

  // Style each feature
  const style = useCallback(
    (feature?: GeoJSONFeature) => {
      if (!feature) return {};
      const name = feature.properties.name;
      const abbr = feature.properties.abbr || STATE_ABBR[name];
      const stateData = abbr ? data[abbr] : undefined;
      const value = stateData?.value || 0;

      return {
        fillColor: value > 0 ? getColor(value) : '#1e293b',
        weight: 1,
        opacity: 1,
        color: 'rgba(255,255,255,0.2)',
        fillOpacity: value > 0 ? 0.8 : 0.3,
      };
    },
    [data, getColor],
  );

  // Interaction handlers
  const onEachFeature = useCallback(
    (feature: GeoJSONFeature, layer: Layer) => {
      const name = feature.properties.name;
      const abbr = feature.properties.abbr || STATE_ABBR[name];
      const stateData = abbr ? data[abbr] : undefined;
      const value = stateData?.value || 0;
      const count = stateData?.count || 0;

      // Tooltip
      const tooltipContent = `
        <div style="font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.4;">
          <strong style="font-size: 13px;">${name}</strong><br/>
          <span style="color: #94a3b8;">${colors.label}:</span> ${formatValue(value, metric)}<br/>
          <span style="color: #94a3b8;">Records:</span> ${count.toLocaleString()}
        </div>
      `;

      layer.bindTooltip(tooltipContent, {
        sticky: true,
        className: 'choropleth-tooltip',
      });

      // Mouseover highlight
      layer.on({
        mouseover: (e: LeafletMouseEvent) => {
          const target = e.target;
          target.setStyle({
            weight: 2,
            color: '#ffffff',
            fillOpacity: 0.95,
          });
          target.bringToFront();
        },
        mouseout: (e: LeafletMouseEvent) => {
          if (geoJsonRef.current) {
            geoJsonRef.current.resetStyle(e.target);
          }
        },
        click: () => {
          if (onStateClick && abbr) {
            onStateClick(abbr, name);
          }
        },
      });
    },
    [data, metric, colors, onStateClick],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px] rounded-xl border border-white/10 bg-slate-900/50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[500px] rounded-xl border border-white/10 bg-slate-900/50">
        <p className="text-white/40 text-sm">Failed to load map: {error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="rounded-xl border border-white/10 overflow-hidden" style={{ height: 500 }}>
        <MapContainer
          center={[39.8, -98.5]}
          zoom={4}
          style={{ height: '100%', width: '100%', background: '#0f172a' }}
          zoomControl={false}
          attributionControl={false}
          scrollWheelZoom={true}
          minZoom={3}
          maxZoom={7}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
            attribution=""
          />
          {geoData && (
            <GeoJSON
              ref={(ref) => { geoJsonRef.current = ref as unknown as L.GeoJSON; }}
              key={`${metric}-${JSON.stringify(Object.keys(data).sort())}`}
              data={geoData as GeoJSON.FeatureCollection}
              style={style as L.StyleFunction}
              onEachFeature={onEachFeature as (feature: GeoJSON.Feature, layer: L.Layer) => void}
            />
          )}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-slate-900/90 border border-white/10 rounded-lg px-4 py-3 z-[1000]">
        <div className="text-xs text-white/50 mb-2 font-mono uppercase tracking-wider">
          {colors.label}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 font-mono">
            {formatValue(minVal, metric)}
          </span>
          <div
            className="h-3 w-24 rounded-sm"
            style={{
              background: `linear-gradient(to right, ${colors.light}, ${colors.dark})`,
            }}
          />
          <span className="text-xs text-white/40 font-mono">
            {formatValue(maxVal, metric)}
          </span>
        </div>
      </div>

      {/* Tooltip styles */}
      <style>{`
        .choropleth-tooltip {
          background: rgba(15, 23, 42, 0.95) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          border-radius: 8px !important;
          padding: 8px 12px !important;
          color: #e2e8f0 !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important;
        }
        .choropleth-tooltip::before {
          border-top-color: rgba(15, 23, 42, 0.95) !important;
        }
        .leaflet-container {
          background: #0f172a !important;
        }
      `}</style>
    </div>
  );
};

export default ChoroplethMap;
