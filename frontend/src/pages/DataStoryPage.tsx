import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Pause, SkipForward, SkipBack } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

interface StoryStep {
  title: string;
  description: string;
  chartType: 'bar' | 'treemap' | 'comparison';
  data: { label: string; value: number; color: string }[];
}

// Sector accent hexes align with --color-dem / --color-green / --color-ind / --color-accent / --color-red.
// Pre-fix only 7 of the 11 tracked sectors had entries — companies in
// chemicals/agriculture/telecom/education fell through to the gold
// fallback so all four rendered with the same color, making the bar
// chart unreadable when those sectors had data.
const SECTOR_COLORS: Record<string, string> = {
  politics: '#4A7FDE',
  finance: '#3DB87A',
  health: '#E63946',
  tech: '#B06FD8',
  technology: '#B06FD8',
  energy: '#C5A028',
  transportation: '#4A7FDE',
  defense: '#E05555',
  chemicals: '#84CC16',
  agriculture: '#65A30D',
  telecom: '#06B6D4',
  telecommunications: '#06B6D4',
  education: '#A855F7',
};

function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function DataStoryPage() {
  const [steps, setSteps] = useState<StoryStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [animatingBars, setAnimatingBars] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/influence/stats`).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
      fetch(`${API_BASE}/influence/top-lobbying?limit=10`).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
      fetch(`${API_BASE}/influence/top-contracts?limit=10`).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
    ])
      .then(([stats, lobbyLeaders, contractLeaders]) => {
        if (cancelled) return;
        const bySector = stats.by_sector || {};
        const storySteps: StoryStep[] = [
          {
            title: 'The Landscape',
            description: `Across ${Object.keys(bySector).length} sectors, corporations spent ${formatMoney(stats.total_lobbying_spend)} on lobbying and secured ${formatMoney(stats.total_contract_value)} in government contracts. ${stats.total_enforcement_actions} enforcement actions were filed.`,
            chartType: 'bar',
            data: Object.entries(bySector as Record<string, Record<string, number>>).map(([sector, data]) => ({
              label: sector.charAt(0).toUpperCase() + sector.slice(1),
              value: data.lobbying || 0,
              color: SECTOR_COLORS[sector] || '#C5A028',
            })),
          },
          {
            title: 'Lobbying Powerhouses',
            description: 'These are the top spenders trying to influence legislation. Every dollar spent on lobbying is an investment in shaping policy.',
            chartType: 'bar',
            data: (lobbyLeaders.leaders || []).slice(0, 8).map((l: { display_name: string; total_lobbying?: number; sector?: string }) => ({
              label: l.display_name,
              value: l.total_lobbying || 0,
              color: SECTOR_COLORS[l.sector || ''] || '#C5A028',
            })),
          },
          {
            title: 'Government Contracts',
            description: 'The same companies that lobby Congress also win billions in government contracts. Coincidence?',
            chartType: 'bar',
            data: (contractLeaders.leaders || []).slice(0, 8).map((l: { display_name: string; total_contracts?: number; sector?: string }) => ({
              label: l.display_name,
              value: l.total_contracts || 0,
              color: SECTOR_COLORS[l.sector || ''] || '#C5A028',
            })),
          },
          {
            title: 'Lobbying vs Contracts',
            description: 'For every dollar spent on lobbying, these companies win far more in contracts. The return on investment speaks for itself.',
            chartType: 'comparison',
            data: Object.entries(bySector as Record<string, Record<string, number>>).map(([sector, data]) => ({
              label: sector.charAt(0).toUpperCase() + sector.slice(1),
              value: data.contracts || 0,
              color: SECTOR_COLORS[sector] || '#C5A028',
            })),
          },
          {
            title: 'Enforcement Gap',
            description: `Despite all this spending, only ${stats.total_enforcement_actions} enforcement actions were taken. Who is holding corporations accountable?`,
            chartType: 'bar',
            data: Object.entries(bySector as Record<string, Record<string, number>>).map(([sector, data]) => ({
              label: sector.charAt(0).toUpperCase() + sector.slice(1),
              value: data.enforcement || 0,
              color: SECTOR_COLORS[sector] || '#C5A028',
            })),
          },
        ];
        setSteps(storySteps);
      })
      .catch((err) => { console.warn('[DataStoryPage] fetch failed:', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Trigger bar animation on step change
  useEffect(() => {
    setAnimatingBars(false);
    const t = setTimeout(() => setAnimatingBars(true), 50);
    return () => clearTimeout(t);
  }, [currentStep]);

  // Auto-play
  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [isPlaying, steps.length]);

  const step = steps[currentStep];
  const maxVal = step ? Math.max(...step.data.map((d) => d.value), 1) : 1;

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '2px solid var(--color-accent)',
            borderTopColor: 'transparent',
            animation: 'spin 1s linear infinite',
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: '48px 24px 80px',
        }}
      >
        {/* Back link */}
        <Link
          to="/influence"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: 'var(--color-text-2)',
            textDecoration: 'none',
            marginBottom: 32,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
        >
          <ArrowLeft size={14} /> Influence Explorer
        </Link>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(36px, 5vw, 56px)',
              lineHeight: 1.02,
              color: 'var(--color-text-1)',
              marginBottom: 10,
            }}
          >
            Follow the money
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
              color: 'var(--color-text-2)',
              lineHeight: 1.55,
              maxWidth: 540,
              margin: '0 auto',
            }}
          >
            An animated data story about corporate influence in American politics.
          </p>
        </div>

        {step && (
          <div style={{ marginBottom: 32 }}>
            {/* Step content */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div
                style={{
                  display: 'inline-block',
                  borderRadius: 999,
                  background: 'var(--color-accent-dim)',
                  border: '1px solid var(--color-border)',
                  padding: '4px 14px',
                  marginBottom: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--color-accent-text)',
                }}
              >
                Step {currentStep + 1} / {steps.length}
              </div>
              <h2
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontStyle: 'italic',
                  fontWeight: 900,
                  fontSize: 'clamp(24px, 3.5vw, 32px)',
                  lineHeight: 1.1,
                  color: 'var(--color-text-1)',
                  marginBottom: 10,
                  transition: 'all 500ms',
                }}
              >
                {step.title}
              </h2>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 15,
                  color: 'var(--color-text-2)',
                  maxWidth: 620,
                  margin: '0 auto',
                  lineHeight: 1.6,
                  transition: 'all 500ms',
                }}
              >
                {step.description}
              </p>
            </div>

            {/* Animated chart */}
            <div
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: 24,
                minHeight: 300,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {step.data.map((d, i) => (
                  <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        color: 'var(--color-text-1)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        width: 180,
                        textAlign: 'right',
                      }}
                    >
                      {d.label}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 32,
                        background: 'var(--color-surface-2)',
                        borderRadius: 8,
                        overflow: 'hidden',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 8,
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 12px',
                          width: animatingBars ? `${Math.max((d.value / maxVal) * 100, 2)}%` : '0%',
                          backgroundColor: d.color,
                          transition: `width ${800 + i * 150}ms ease-out ${i * 100}ms`,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#07090C',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {step.chartType === 'bar' && d.value > maxVal * 0.15
                            ? formatMoney(d.value)
                            : ''}
                        </span>
                      </div>
                    </div>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontSize: 11,
                        color: 'var(--color-text-3)',
                        width: 80,
                      }}
                    >
                      {formatMoney(d.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Playback controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <button
            onClick={() => setCurrentStep((p) => Math.max(p - 1, 0))}
            disabled={currentStep === 0}
            style={{
              padding: 10,
              borderRadius: '50%',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-2)',
              cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
              opacity: currentStep === 0 ? 0.3 : 1,
              transition: 'all 150ms',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => { if (currentStep !== 0) e.currentTarget.style.color = 'var(--color-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            <SkipBack size={18} />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              padding: 14,
              borderRadius: '50%',
              background: 'var(--color-accent-dim)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-accent-text)',
              cursor: 'pointer',
              transition: 'all 150ms',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(197,160,40,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent-dim)'; }}
          >
            {isPlaying ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button
            onClick={() => setCurrentStep((p) => Math.min(p + 1, steps.length - 1))}
            disabled={currentStep >= steps.length - 1}
            style={{
              padding: 10,
              borderRadius: '50%',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-2)',
              cursor: currentStep >= steps.length - 1 ? 'not-allowed' : 'pointer',
              opacity: currentStep >= steps.length - 1 ? 0.3 : 1,
              transition: 'all 150ms',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => { if (currentStep < steps.length - 1) e.currentTarget.style.color = 'var(--color-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 18 }}>
          {steps.map((_, i) => {
            const isActive = i === currentStep;
            const isPast = i < currentStep;
            return (
              <button
                key={i}
                onClick={() => { setCurrentStep(i); setIsPlaying(false); }}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: isActive
                    ? 'var(--color-accent)'
                    : isPast
                    ? 'var(--color-accent-dim)'
                    : 'var(--color-border-hover)',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  transform: isActive ? 'scale(1.25)' : 'scale(1)',
                  transition: 'all 200ms',
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
