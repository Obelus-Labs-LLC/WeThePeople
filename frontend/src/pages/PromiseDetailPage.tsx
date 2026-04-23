import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Target, CheckCircle2, XCircle, Clock, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react';
import { fetchPromise, castVote, PromiseItem } from '../api/civic';

// ── Status token map ──

const STATUS_TOKEN: Record<string, { token: string; hex: string; label: string }> = {
  pending: { token: 'var(--color-text-3)', hex: '#6E7A85', label: 'Pending' },
  in_progress: { token: 'var(--color-dem)', hex: '#4A7FDE', label: 'In Progress' },
  partially_fulfilled: { token: 'var(--color-accent-text)', hex: '#C5A028', label: 'Partially Fulfilled' },
  fulfilled: { token: 'var(--color-green)', hex: '#3DB87A', label: 'Fulfilled' },
  broken: { token: 'var(--color-red)', hex: '#E63946', label: 'Broken' },
  retired: { token: 'var(--color-text-3)', hex: '#6E7A85', label: 'Retired' },
};

function getStatus(s: string) {
  return STATUS_TOKEN[s] || STATUS_TOKEN.pending;
}

const MILESTONE_ICON: Record<string, typeof CheckCircle2> = {
  achieved: CheckCircle2,
  missed: XCircle,
  pending: Clock,
};

const MILESTONE_TOKEN: Record<string, { token: string; hex: string }> = {
  achieved: { token: 'var(--color-green)', hex: '#3DB87A' },
  missed: { token: 'var(--color-red)', hex: '#E63946' },
  pending: { token: 'var(--color-text-3)', hex: '#6E7A85' },
};

// ── Shared styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: '820px',
  margin: '0 auto',
  padding: '56px 24px 96px',
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
  marginBottom: '20px',
  transition: 'color 0.2s',
};

// ── Page ──

export default function PromiseDetailPage() {
  const { promiseId } = useParams<{ promiseId: string }>();
  const [promise, setPromise] = useState<PromiseItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!promiseId) return;
    fetchPromise(parseInt(promiseId))
      .then((p) => { if (!cancelled) setPromise(p); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [promiseId]);

  const handleVote = async (value: 1 | -1) => {
    if (!promise || voting) return;
    setVoting(true);
    try {
      await castVote('promise', promise.id, value);
      const updated = await fetchPromise(promise.id);
      setPromise(updated);
    } catch {
      // silently fail for unauth users
    }
    setVoting(false);
  };

  if (loading) {
    return (
      <main id="main-content" style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          <span style={{ position: 'absolute', left: '-9999px' }}>Loading…</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  if (error || !promise) {
    return (
      <main id="main-content" style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-red)', margin: '0 0 16px' }}>
            {error || 'Promise not found'}
          </p>
          <Link
            to="/civic"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
            }}
          >
            Back to Civic Hub
          </Link>
        </div>
      </main>
    );
  }

  const sc = getStatus(promise.status);

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

        <span style={eyebrowStyle}>Civic / Promise</span>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
          <Target size={28} style={{ color: 'var(--color-accent-text)', flexShrink: 0, marginTop: '8px' }} />
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: 'clamp(28px, 4.5vw, 48px)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                margin: '0 0 14px',
                color: 'var(--color-text-1)',
              }}
            >
              {promise.title}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
              <Link
                to={`/politics/people/${promise.person_id}`}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: 'var(--color-accent-text)',
                  textDecoration: 'none',
                }}
              >
                {promise.person_name || promise.person_id}
              </Link>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: '4px',
                  background: `${sc.hex}1F`,
                  color: sc.token,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {sc.label}
              </span>
              {promise.category && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--color-text-3)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {promise.category}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {promise.description && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              lineHeight: 1.65,
              color: 'var(--color-text-2)',
              margin: '0 0 20px',
            }}
          >
            {promise.description}
          </p>
        )}

        {/* Source */}
        {promise.source_url && (
          <a
            href={promise.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--color-text-2)',
              textDecoration: 'none',
              marginBottom: '24px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            <ExternalLink size={12} /> Source
          </a>
        )}

        {/* Progress */}
        <div
          style={{
            padding: '20px',
            borderRadius: '14px',
            border: '1px solid rgba(235,229,213,0.08)',
            background: 'var(--color-surface)',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--color-text-2)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Progress
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--color-accent-text)',
              }}
            >
              {promise.progress}%
            </span>
          </div>
          <div
            style={{
              height: '8px',
              width: '100%',
              background: 'var(--color-surface-2)',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                background: 'var(--color-accent)',
                borderRadius: '999px',
                width: `${promise.progress}%`,
                transition: 'width 0.6s ease',
              }}
            />
          </div>
        </div>

        {/* Voting */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleVote(1)}
            disabled={voting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(61,184,122,0.28)',
              background: 'rgba(61,184,122,0.1)',
              color: 'var(--color-green)',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: voting ? 'not-allowed' : 'pointer',
              opacity: voting ? 0.5 : 1,
              transition: 'background 0.2s',
            }}
          >
            <ThumbsUp size={14} /> Support
          </button>
          <button
            onClick={() => handleVote(-1)}
            disabled={voting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(230,57,70,0.28)',
              background: 'rgba(230,57,70,0.1)',
              color: 'var(--color-red)',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: voting ? 'not-allowed' : 'pointer',
              opacity: voting ? 0.5 : 1,
              transition: 'background 0.2s',
            }}
          >
            <ThumbsDown size={14} /> Oppose
          </button>
          {promise.confidence_score != null && (
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--color-text-3)',
              }}
            >
              confidence: {(promise.confidence_score * 100).toFixed(1)}%
            </span>
          )}
        </div>

        {/* Milestones */}
        <h2
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-text-2)',
            margin: '0 0 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          Milestones
          <span style={{ color: 'var(--color-text-3)', fontSize: '11px' }}>
            {promise.milestones?.length || 0}
          </span>
        </h2>
        {!promise.milestones || promise.milestones.length === 0 ? (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              background: 'var(--color-surface)',
              borderRadius: '14px',
              border: '1px solid rgba(235,229,213,0.06)',
            }}
          >
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-text-3)', margin: 0 }}>
              No milestones yet.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {promise.milestones.map((m) => {
              const Icon = MILESTONE_ICON[m.status] || Clock;
              const mi = MILESTONE_TOKEN[m.status] || MILESTONE_TOKEN.pending;
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '14px 16px',
                    background: 'var(--color-surface)',
                    border: '1px solid rgba(235,229,213,0.08)',
                    borderRadius: '12px',
                  }}
                >
                  <Icon
                    size={16}
                    style={{ color: mi.token, flexShrink: 0, marginTop: '2px' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--color-text-1)',
                      }}
                    >
                      {m.title}
                    </div>
                    {m.description && (
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '12px',
                          color: 'var(--color-text-2)',
                          marginTop: '4px',
                          lineHeight: 1.5,
                        }}
                      >
                        {m.description}
                      </p>
                    )}
                    {m.achieved_date && (
                      <span
                        style={{
                          display: 'block',
                          marginTop: '6px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          color: 'var(--color-text-3)',
                        }}
                      >
                        {new Date(m.achieved_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {m.evidence_url && (
                    <a
                      href={m.evidence_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--color-text-3)', flexShrink: 0, transition: 'color 0.2s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-3)'; }}
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
