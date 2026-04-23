import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Key,
  Quote,
  Code2,
  Zap,
  Download,
  Braces,
  FileSignature,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import {
  getPressApiKey,
  setPressApiKey,
  hasPressApiKey,
  getApiBaseUrl,
} from '../api/client';

const API_BASE = getApiBaseUrl();

// ── Palette (mirrors the Civic & Influence design handoff) ───────────
const GOLD = '#C5A028';
const GOLDT = '#D4AE35';
const DBL = '#4A7FDE';
const DRD = '#E63946';
const DGR = '#3DB87A';
const DPR = '#B06FD8';

// ── Shared styles ────────────────────────────────────────────────────
const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: '1180px',
  margin: '0 auto',
  padding: '56px 32px 96px',
};

const backLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--color-text-2)',
  textDecoration: 'none',
  marginBottom: '20px',
  transition: 'color 0.2s',
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: GOLDT,
  marginBottom: '10px',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(36px, 5.5vw, 60px)',
  lineHeight: 1.02,
  letterSpacing: '-0.02em',
  margin: '0 0 12px',
  color: 'var(--color-text-1)',
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '15px',
  lineHeight: 1.65,
  color: 'var(--color-text-2)',
  margin: '0 0 32px',
  maxWidth: '620px',
};

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  margin: '0 0 12px',
};

// ── Tool catalog (matches the design's six-tile grid) ────────────────
interface Tool {
  key: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
  href?: string;
  note?: string;
}

const TOOLS: Tool[] = [
  {
    key: 'citation',
    title: 'Citation Export',
    description:
      'Copy any data point as a formatted footnote for AP, Chicago, or MLA style.',
    icon: Quote,
    color: GOLD,
    note: 'Footnote format opens from any stat card on the site.',
  },
  {
    key: 'embed',
    title: 'Embed Code',
    description:
      'Paste a live chart into your CMS. Updates automatically and ships with alt text.',
    icon: Code2,
    color: DBL,
    note: 'Coming soon — contact the team for early access.',
  },
  {
    key: 'priority',
    title: 'Priority Alerts',
    description:
      'Get anomaly flags 12 hours before they hit the public feed.',
    icon: Zap,
    color: DRD,
    href: `${API_BASE}/anomalies?limit=25`,
  },
  {
    key: 'bulk',
    title: 'Bulk CSV',
    description:
      'Pre-joined tables — politician, votes, lobbying, contracts, contributions.',
    icon: Download,
    color: DGR,
    href: `${API_BASE}/ops/coverage`,
  },
  {
    key: 'factcheck',
    title: 'Fact-Check API',
    description:
      'Submit a claim, get back a structured verdict. Free tier: 100 requests per day.',
    icon: Braces,
    color: DPR,
    href: `${API_BASE}/claims?limit=20`,
  },
  {
    key: 'foia',
    title: 'FOIA Assist',
    description:
      'Pre-drafted FOIA templates and agency contact sheets, ready to file.',
    icon: FileSignature,
    color: GOLD,
    note: 'Templates are in development — request early access below.',
  },
];

// ── Outlets strip ────────────────────────────────────────────────────
const OUTLETS = [
  'ProPublica',
  'NYT Upshot',
  'Axios',
  'The Intercept',
  '40+ outlets',
];

// ── Page ─────────────────────────────────────────────────────────────
export default function PressToolsPage() {
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(hasPressApiKey);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<Record<string, unknown> | null>(null);

  const handleSubmitKey = async () => {
    const key = keyInput.trim();
    if (!key) return;
    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/ops/runtime`, {
        headers: { 'X-WTP-API-KEY': key },
      });
      if (res.status === 401) {
        setError('Invalid API key. Please check your key and try again.');
        setValidating(false);
        return;
      }
      if (!res.ok) {
        setError(`Server error (${res.status}). The API may be unavailable.`);
        setValidating(false);
        return;
      }
      setPressApiKey(key);
      setHasKey(true);
      const data = await res.json();
      setRuntimeInfo(data);
    } catch {
      setError('Could not connect to the API. Check your network connection.');
    }
    setValidating(false);
  };

  const handleClearKey = () => {
    setPressApiKey('');
    setHasKey(false);
    setRuntimeInfo(null);
    setKeyInput('');
  };

  useEffect(() => {
    let cancelled = false;
    if (!hasKey) return;
    const key = getPressApiKey();
    fetch(`${API_BASE}/ops/runtime`, {
      headers: { 'X-WTP-API-KEY': key },
    })
      .then((r) => {
        if (cancelled) return null;
        if (r.status === 401) {
          handleClearKey();
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setRuntimeInfo(data);
      })
      .catch((err) => { console.warn('[PressToolsPage] fetch failed:', err); });
    return () => {
      cancelled = true;
    };
  }, [hasKey]);

  return (
    <main id="main-content" style={pageShell}>
      <div style={contentWrap}>
        <Link
          to="/influence"
          style={backLink}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = GOLDT;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-2)';
          }}
        >
          <ArrowLeft size={14} /> Influence Explorer
        </Link>

        <div style={eyebrowStyle}>Press Toolkit · Free for newsroom use</div>
        <h1 style={titleStyle}>Built for working journalists.</h1>
        <p style={subtitleStyle}>
          Export citation-ready data, pull raw CSVs, embed live charts, and get first dibs
          on anomaly flags before they hit the public feed.
        </p>

        {/* ── Access gate ── */}
        {!hasKey ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '26px',
              background: 'var(--color-surface)',
              border: '1px solid rgba(235,229,213,0.08)',
              borderRadius: '14px',
              marginBottom: '32px',
              maxWidth: '640px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Key size={16} style={{ color: GOLDT }} />
              <span style={sectionLabel}>Connect your press key</span>
            </div>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--color-text-2)',
                margin: '0 0 4px',
                lineHeight: 1.6,
              }}
            >
              Enter a press-tier API key to unlock priority endpoints. Keys are stored
              locally in your browser and sent via the X-WTP-API-KEY header.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitKey()}
                placeholder="Paste your API key"
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  background: 'var(--color-surface-2)',
                  border: '1px solid rgba(235,229,213,0.1)',
                  borderRadius: '9px',
                  color: 'var(--color-text-1)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = GOLDT;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(235,229,213,0.1)';
                }}
              />
              <button
                onClick={handleSubmitKey}
                disabled={validating || !keyInput.trim()}
                style={{
                  padding: '11px 22px',
                  borderRadius: '9px',
                  border: 'none',
                  background: GOLD,
                  color: '#07090C',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  cursor: validating || !keyInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: validating || !keyInput.trim() ? 0.5 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {validating ? 'Checking…' : 'Connect'}
              </button>
            </div>
            {error && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  color: 'var(--color-red)',
                  margin: 0,
                }}
              >
                {error}
              </p>
            )}
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--color-text-3)',
                margin: 0,
              }}
            >
              Need a key? Apply below and we'll be in touch.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 18px',
              background: `${DGR}14`,
              border: `1px solid ${DGR}30`,
              borderRadius: '12px',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={16} style={{ color: DGR }} />
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-1)',
                }}
              >
                Press access active
              </span>
              {runtimeInfo && typeof runtimeInfo.environment === 'string' && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--color-text-3)',
                  }}
                >
                  · {runtimeInfo.environment}
                </span>
              )}
            </div>
            <button
              onClick={handleClearKey}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(235,229,213,0.12)',
                background: 'transparent',
                color: 'var(--color-text-2)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          </div>
        )}

        {/* ── Tool grid ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '12px',
            marginBottom: '32px',
          }}
        >
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const actionLabel = tool.href ? 'Open endpoint' : 'Request access';
            return (
              <div
                key={tool.key}
                style={{
                  padding: '22px',
                  background: 'var(--color-surface)',
                  border: '1px solid rgba(235,229,213,0.08)',
                  borderRadius: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '9px',
                    background: `${tool.color}1F`,
                    border: `1px solid ${tool.color}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: tool.color,
                  }}
                >
                  <Icon size={18} />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontWeight: 700,
                    fontSize: '18px',
                    color: 'var(--color-text-1)',
                  }}
                >
                  {tool.title}
                </div>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--color-text-2)',
                    lineHeight: 1.6,
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {tool.description}
                </p>
                {tool.href ? (
                  <a
                    href={tool.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: tool.color,
                      textDecoration: 'none',
                    }}
                  >
                    {actionLabel} <ExternalLink size={11} />
                  </a>
                ) : (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--color-text-3)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {tool.note}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Press credentials card ── */}
        <div
          style={{
            padding: '24px',
            background: 'var(--color-surface)',
            border: '1px solid rgba(235,229,213,0.08)',
            borderRadius: '14px',
            marginBottom: '28px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              marginBottom: '16px',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  fontWeight: 700,
                  fontSize: '20px',
                  color: 'var(--color-text-1)',
                }}
              >
                Request press credentials
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  color: 'var(--color-text-3)',
                  marginTop: '4px',
                }}
              >
                Newsroom verification · free tier 1k API calls/day · priority 10k/day
              </div>
            </div>
            <a
              href="mailto:press@wethepeopleforus.com?subject=Press%20access%20request"
              style={{
                padding: '11px 20px',
                borderRadius: '9px',
                background: GOLD,
                color: '#07090C',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textDecoration: 'none',
              }}
            >
              Apply →
            </a>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              paddingTop: '14px',
              borderTop: '1px solid rgba(235,229,213,0.08)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--color-text-3)',
              letterSpacing: '0.04em',
            }}
          >
            {OUTLETS.map((o) => (
              <span key={o}>✓ {o}</span>
            ))}
          </div>
        </div>

        {/* ── Runtime footer (only when authenticated) ── */}
        {hasKey && runtimeInfo && (
          <div
            style={{
              padding: '20px',
              background: 'var(--color-surface)',
              border: '1px solid rgba(235,229,213,0.06)',
              borderRadius: '14px',
            }}
          >
            <div style={sectionLabel}>API runtime</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '10px 24px',
              }}
            >
              {Object.entries(runtimeInfo)
                .slice(0, 10)
                .map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      gap: '8px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                    }}
                  >
                    <span style={{ color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>
                      {k}:
                    </span>
                    <span
                      style={{
                        color: 'var(--color-text-1)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {String(v)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
