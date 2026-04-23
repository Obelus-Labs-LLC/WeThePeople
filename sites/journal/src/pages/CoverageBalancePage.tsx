import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, Users, Building2, Scale } from 'lucide-react';
import { apiFetch } from '../api/client';
import { CATEGORY_META, SECTOR_LABELS } from '../types';
import type { Story, StoriesResponse } from '../types';

const backLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
  textDecoration: 'none',
  transition: 'color 0.2s',
};
const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: 'var(--color-accent-text)',
};
const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: 'clamp(36px, 5.5vw, 56px)',
  letterSpacing: '-0.025em',
  lineHeight: 1.05,
  color: 'var(--color-text-1)',
};
const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: '24px',
  letterSpacing: '-0.015em',
  color: 'var(--color-text-1)',
};
const bodyProse: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '16px',
  lineHeight: 1.8,
  color: 'var(--color-text-1)',
};
const metaMono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
};

function PartyBar({
  label,
  count,
  max,
  color,
  Icon,
}: {
  label: string;
  count: number;
  max: number;
  color: string;
  Icon: typeof Users;
}) {
  const pct = Math.round((count / max) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span
          className="flex items-center gap-2"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color,
          }}
        >
          <Icon size={13} /> {label}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--color-text-2)',
          }}
        >
          {count} {count === 1 ? 'story' : 'stories'}
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: '999px',
          background: 'rgba(235,229,213,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: '999px',
            transition: 'width 0.7s ease',
            boxShadow: `0 0 14px ${color}66`,
          }}
        />
      </div>
    </div>
  );
}

export default function CoverageBalancePage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<StoriesResponse | Story[]>('/stories/latest', {
      params: { limit: 50 },
      signal: controller.signal,
    })
      .then((data) => {
        const items = Array.isArray(data) ? data : data.stories ?? [];
        setStories(items);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load stories');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const partyStats = useMemo(() => {
    let dem = 0;
    let rep = 0;
    let ind = 0;
    let noParty = 0;

    for (const story of stories) {
      const evidence = story.evidence as Record<string, unknown> | undefined;
      const entityIds = story.entity_ids ?? [];
      const storyParties = new Set<string>();

      if (evidence) {
        const evidenceStr = JSON.stringify(evidence).toLowerCase();
        if (
          evidenceStr.includes('"party":"d"') ||
          evidenceStr.includes('"party": "d"') ||
          evidenceStr.includes('democrat')
        ) {
          storyParties.add('D');
        }
        if (
          evidenceStr.includes('"party":"r"') ||
          evidenceStr.includes('"party": "r"') ||
          evidenceStr.includes('republican')
        ) {
          storyParties.add('R');
        }
        if (
          evidenceStr.includes('"party":"i"') ||
          evidenceStr.includes('"party": "i"') ||
          evidenceStr.includes('independent')
        ) {
          storyParties.add('I');
        }
      }

      for (const eid of entityIds) {
        const upper = eid.toUpperCase();
        if (upper.includes(':D:') || upper.includes(':D-') || upper.endsWith(':D')) storyParties.add('D');
        if (upper.includes(':R:') || upper.includes(':R-') || upper.endsWith(':R')) storyParties.add('R');
        if (upper.includes(':I:') || upper.includes(':I-') || upper.endsWith(':I')) storyParties.add('I');
      }

      if (storyParties.has('D')) dem++;
      if (storyParties.has('R')) rep++;
      if (storyParties.has('I')) ind++;
      if (storyParties.size === 0) noParty++;
    }

    return { dem, rep, ind, noParty };
  }, [stories]);

  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const story of stories) {
      const cat = story.category || 'unknown';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [stories]);

  const sectorBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const story of stories) {
      const sec = story.sector || 'unknown';
      counts[sec] = (counts[sec] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [stories]);

  const maxParty = Math.max(partyStats.dem, partyStats.rep, partyStats.ind, partyStats.noParty, 1);

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-10 sm:py-16"
      style={{ color: 'var(--color-text-1)' }}
    >
      <article className="max-w-[720px] mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 mb-8"
          style={backLinkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
        >
          <ArrowLeft size={12} />
          Back to Journal
        </Link>

        <p className="mb-3" style={eyebrowStyle}>
          Coverage Balance
        </p>
        <h1 className="mb-8" style={h1Style}>
          Non-Partisan Coverage Report
        </h1>

        <div className="space-y-5 mb-14">
          <p style={bodyProse}>
            The Influence Journal covers all politicians and corporations regardless of party
            affiliation. Our story detection is pattern-based and party-blind. When lobbying money
            flows to a politician, when a corporation wins a suspicious contract, or when a lawmaker
            trades stock in a company they regulate, our system flags it — regardless of party,
            state, or seniority.
          </p>
          <p style={{ ...bodyProse, fontSize: '15px', color: 'var(--color-text-2)' }}>
            This page provides a live breakdown of our published stories so you can see for yourself
            that our coverage is balanced.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div
              className="animate-spin"
              style={{
                height: 28,
                width: 28,
                borderRadius: '999px',
                border: '2px solid rgba(235,229,213,0.15)',
                borderTopColor: 'var(--color-accent)',
              }}
            />
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              borderRadius: '14px',
              border: '1px solid rgba(230,57,70,0.35)',
              background: 'rgba(230,57,70,0.06)',
              padding: '20px 22px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--color-red)',
              }}
            >
              {error}
            </p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Total stories */}
            <div
              className="text-center mb-12"
              style={{
                borderRadius: '16px',
                border: '1px solid rgba(197,160,40,0.25)',
                background: 'linear-gradient(135deg, rgba(197,160,40,0.08) 0%, var(--color-surface) 60%)',
                padding: '30px 24px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, rgba(197,160,40,0.15) 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                  opacity: 0.25,
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <BarChart3
                  size={26}
                  style={{ color: 'var(--color-accent-text)', margin: '0 auto 10px' }}
                />
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 900,
                    fontSize: '56px',
                    letterSpacing: '-0.025em',
                    lineHeight: 1,
                    color: 'var(--color-text-1)',
                    marginBottom: 8,
                  }}
                >
                  {stories.length}
                </p>
                <p style={metaMono}>Total Stories Published</p>
              </div>
            </div>

            {/* Party coverage */}
            <h2 className="mb-3" style={h2Style}>
              Stories by Party Involvement
            </h2>
            <p
              className="mb-7"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                lineHeight: 1.7,
                color: 'var(--color-text-2)',
              }}
            >
              A story may involve politicians from multiple parties and is counted once for each
              party mentioned. Stories about corporations with no identified politician are counted
              separately.
            </p>

            <div className="space-y-5 mb-14">
              <PartyBar
                label="Democrat"
                count={partyStats.dem}
                max={maxParty}
                color="var(--color-dem)"
                Icon={Users}
              />
              <PartyBar
                label="Republican"
                count={partyStats.rep}
                max={maxParty}
                color="var(--color-rep)"
                Icon={Users}
              />
              {partyStats.ind > 0 && (
                <PartyBar
                  label="Independent"
                  count={partyStats.ind}
                  max={maxParty}
                  color="var(--color-ind)"
                  Icon={Users}
                />
              )}
              {partyStats.noParty > 0 && (
                <PartyBar
                  label="Corporate Only"
                  count={partyStats.noParty}
                  max={maxParty}
                  color="var(--color-text-2)"
                  Icon={Building2}
                />
              )}
            </div>

            {/* Category breakdown */}
            <h2 className="mb-5" style={h2Style}>
              Stories by Category
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-14">
              {categoryBreakdown.map(([cat, count]) => {
                const meta = CATEGORY_META[cat];
                const color = meta?.color ?? 'var(--color-text-2)';
                const bg = meta?.bg ?? 'rgba(235,229,213,0.03)';
                return (
                  <div
                    key={cat}
                    className="flex items-center justify-between"
                    style={{
                      borderRadius: '12px',
                      border: `1px solid ${color}26`,
                      background: bg,
                      padding: '12px 16px',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color,
                      }}
                    >
                      {meta?.label ?? cat}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        color: 'var(--color-text-2)',
                      }}
                    >
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Sector breakdown */}
            <h2 className="mb-5" style={h2Style}>
              Stories by Sector
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-14">
              {sectorBreakdown.map(([sec, count]) => (
                <div
                  key={sec}
                  className="flex items-center justify-between"
                  style={{
                    borderRadius: '12px',
                    border: '1px solid rgba(235,229,213,0.08)',
                    background: 'var(--color-surface)',
                    padding: '12px 16px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-1)',
                    }}
                  >
                    {SECTOR_LABELS[sec] ?? sec}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      color: 'var(--color-text-2)',
                    }}
                  >
                    {count}
                  </span>
                </div>
              ))}
            </div>

            {/* Methodology note */}
            <div
              style={{
                borderRadius: '14px',
                border: '1px solid rgba(197,160,40,0.28)',
                background: 'rgba(197,160,40,0.05)',
                padding: '22px',
              }}
            >
              <div className="flex items-start gap-3">
                <Scale
                  size={18}
                  style={{ color: 'var(--color-accent-text)', marginTop: 3, flexShrink: 0 }}
                />
                <div>
                  <h3
                    className="mb-2"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      color: 'var(--color-accent-text)',
                    }}
                  >
                    Our Commitment
                  </h3>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px',
                      lineHeight: 1.7,
                      color: 'var(--color-text-2)',
                    }}
                  >
                    The Influence Journal covers all politicians and corporations regardless of
                    party affiliation. Our story detection algorithms are pattern-based and
                    party-blind. When the data shows influence, we report it — no matter who is
                    involved.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </article>
    </main>
  );
}
