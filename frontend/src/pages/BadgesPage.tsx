import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Trophy,
  ShieldCheck,
  Target,
  BookOpen,
  Megaphone,
  Vote,
  CheckCheck,
  FileText,
  ScrollText,
} from 'lucide-react';
import { fetchBadges, fetchMyBadges, BadgeItem, UserBadgeItem } from '../api/civic';

// ── Icon / category config ──

const ICON_MAP: Record<string, typeof Trophy> = {
  vote: Vote,
  'check-check': CheckCheck,
  trophy: Trophy,
  target: Target,
  'book-open': BookOpen,
  'file-text': FileText,
  megaphone: Megaphone,
  scroll: ScrollText,
  'shield-check': ShieldCheck,
};

const CATEGORY_TOKEN: Record<string, { token: string; hex: string; label: string }> = {
  engagement: { token: 'var(--color-accent-text)', hex: '#C5A028', label: 'Engagement' },
  research: { token: 'var(--color-green)', hex: '#3DB87A', label: 'Research' },
  community: { token: 'var(--color-dem)', hex: '#4A7FDE', label: 'Community' },
  verification: { token: 'var(--color-ind)', hex: '#B06FD8', label: 'Verification' },
};

const LEVEL_LABELS = ['', 'Bronze', 'Silver', 'Gold'];

function categoryInfo(cat: string) {
  return (
    CATEGORY_TOKEN[cat] || {
      token: 'var(--color-text-2)',
      hex: '#6E7A85',
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
    }
  );
}

// ── Shared styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: '960px',
  margin: '0 auto',
  padding: '64px 24px 96px',
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 12px',
  borderRadius: '999px',
  background: 'var(--color-accent-dim)',
  color: 'var(--color-accent-text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '20px',
};

const backLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--color-text-2)',
  textDecoration: 'none',
  marginBottom: '24px',
  transition: 'color 0.2s',
};

// ── Page ──

export default function BadgesPage() {
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [earned, setEarned] = useState<UserBadgeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchBadges(), fetchMyBadges()]).then(([b, e]) => {
      if (cancelled) return;
      if (b.status === 'fulfilled') setBadges(b.value.items);
      if (e.status === 'fulfilled') setEarned(e.value.items);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const earnedSlugs = new Set(earned.map((e) => e.badge_slug));

  const grouped = badges.reduce<Record<string, BadgeItem[]>>((acc, b) => {
    (acc[b.category] ||= []).push(b);
    return acc;
  }, {});

  return (
    <main id="main-content" style={pageShell}>
      <div style={contentWrap}>
        <Link
          to="/civic"
          style={backLink}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
        >
          <ArrowLeft size={14} /> Civic Hub
        </Link>

        <span style={eyebrowStyle}>Civic / Badges</span>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(44px, 7vw, 72px)',
            lineHeight: 1.02,
            letterSpacing: '-0.02em',
            margin: '0 0 12px',
            color: 'var(--color-text-1)',
          }}
        >
          Civic <span style={{ color: 'var(--color-accent-text)' }}>badges</span>
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '16px',
            lineHeight: 1.55,
            color: 'var(--color-text-2)',
            margin: '0 0 32px',
          }}
        >
          Earn badges through civic participation. Vote on promises, annotate bills, submit proposals, and verify your identity.
        </p>

        {/* Summary */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '40px', flexWrap: 'wrap' }}>
          <div
            style={{
              padding: '14px 20px',
              background: 'var(--color-surface)',
              border: '1px solid rgba(235,229,213,0.08)',
              borderRadius: '12px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: '28px',
                color: 'var(--color-accent-text)',
                lineHeight: 1,
              }}
            >
              {earned.length}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--color-text-3)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginTop: '6px',
              }}
            >
              Earned
            </div>
          </div>
          <div
            style={{
              padding: '14px 20px',
              background: 'var(--color-surface)',
              border: '1px solid rgba(235,229,213,0.08)',
              borderRadius: '12px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: '28px',
                color: 'var(--color-text-2)',
                lineHeight: 1,
              }}
            >
              {badges.length - earned.length}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--color-text-3)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginTop: '6px',
              }}
            >
              Remaining
            </div>
          </div>
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }} aria-busy="true">
            <div
              role="status"
              style={{
                width: '32px',
                height: '32px',
                border: '2px solid var(--color-accent)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            >
              <span style={{ position: 'absolute', left: '-9999px' }}>Loading badges…</span>
            </div>
          </div>
        )}

        {!loading &&
          Object.entries(grouped).map(([category, items]) => {
            const info = categoryInfo(category);
            return (
              <section key={category} style={{ marginBottom: '40px' }}>
                <h2
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: info.token,
                    margin: '0 0 16px',
                  }}
                >
                  {info.label}
                </h2>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '12px',
                  }}
                >
                  {items.map((b) => {
                    const isEarned = earnedSlugs.has(b.slug);
                    const Icon = ICON_MAP[b.icon] || Trophy;
                    return (
                      <div
                        key={b.slug}
                        style={{
                          position: 'relative',
                          padding: '16px',
                          borderRadius: '14px',
                          border: `1px solid ${isEarned ? `${info.hex}33` : 'rgba(235,229,213,0.06)'}`,
                          background: isEarned ? `${info.hex}10` : 'var(--color-surface)',
                          opacity: isEarned ? 1 : 0.45,
                          transition: 'all 0.25s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: isEarned ? `${info.hex}1F` : 'var(--color-surface-2)',
                              color: isEarned ? info.token : 'var(--color-text-3)',
                            }}
                          >
                            <Icon size={18} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: 'var(--color-text-1)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {b.name}
                            </div>
                            {b.level > 1 && (
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '10px',
                                  color: 'var(--color-text-3)',
                                  letterSpacing: '0.08em',
                                }}
                              >
                                {LEVEL_LABELS[b.level] || `Level ${b.level}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <p
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '12px',
                            color: 'var(--color-text-2)',
                            margin: 0,
                            lineHeight: 1.5,
                          }}
                        >
                          {b.description}
                        </p>
                        {isEarned && (
                          <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                            <ShieldCheck size={14} style={{ color: 'var(--color-green)' }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
