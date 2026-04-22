import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, RefreshCw, FileX, Edit3, ArrowRight } from 'lucide-react';

import { getApiBase } from '../api/client';

const API_BASE = getApiBase();

interface Correction {
  id: number;
  story_id: number;
  story_title: string;
  story_slug: string;
  type: string;
  description: string;
  date: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Type → visual token map ──────────────────────────────────────
interface TypeTokens {
  color: string;
  border: string;
  bg: string;
  label: string;
  Icon: typeof FileX;
}

function tokensFor(type: string): TypeTokens {
  switch (type) {
    case 'retraction':
      return {
        color: 'var(--color-red)', border: 'rgba(230,57,70,0.35)', bg: 'rgba(230,57,70,0.06)',
        label: 'Retraction', Icon: FileX,
      };
    case 'correction':
      return {
        color: 'var(--color-accent-text)', border: 'rgba(197,160,40,0.35)', bg: 'rgba(197,160,40,0.06)',
        label: 'Correction', Icon: Edit3,
      };
    case 'update':
      return {
        color: 'var(--color-dem)', border: 'rgba(74,127,222,0.35)', bg: 'rgba(74,127,222,0.06)',
        label: 'Update', Icon: RefreshCw,
      };
    case 'clarification':
      return {
        color: 'var(--color-accent-text)', border: 'rgba(197,160,40,0.28)', bg: 'rgba(197,160,40,0.04)',
        label: 'Clarification', Icon: AlertTriangle,
      };
    case 'reader_report':
      return {
        color: 'var(--color-text-2)', border: 'rgba(235,229,213,0.1)', bg: 'rgba(235,229,213,0.02)',
        label: 'Under Review', Icon: Edit3,
      };
    default:
      return {
        color: 'var(--color-text-2)', border: 'rgba(235,229,213,0.1)', bg: 'rgba(235,229,213,0.02)',
        label: type, Icon: Edit3,
      };
  }
}

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
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: 'clamp(36px, 5.5vw, 56px)',
  letterSpacing: '-0.025em',
  lineHeight: 1.05,
  color: 'var(--color-text-1)',
};
const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontWeight: 900,
  fontSize: '26px',
  letterSpacing: '-0.015em',
  color: 'var(--color-text-1)',
};

export default function CorrectionsPage() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/stories/corrections/all?limit=100`)
      .then((res) => res.json())
      .then((data) => {
        setCorrections(
          (data.corrections || []).filter((c: Correction) => c.type !== 'reader_report')
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main
      id="main-content"
      className="flex-1 px-4 py-10 sm:py-16"
      style={{ color: 'var(--color-text-1)' }}
    >
      <div className="max-w-[720px] mx-auto">
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

        <p className="mb-3" style={eyebrowStyle}>Editorial Standards</p>
        <h1 className="mb-8" style={h1Style}>
          Corrections &amp; Retractions
        </h1>

        {/* Policy */}
        <div className="space-y-6 mb-14">
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '16px',
              lineHeight: 1.8,
              color: 'var(--color-text-1)',
            }}
          >
            The Influence Journal is committed to accuracy. When we get something wrong, we fix it
            publicly and promptly. Every correction and retraction is documented here for full transparency.
          </p>

          <div
            style={{
              borderRadius: '14px',
              border: '1px solid rgba(235,229,213,0.08)',
              background: 'var(--color-surface)',
              padding: '22px',
            }}
          >
            <h2 className="mb-4" style={{ ...h2Style, fontSize: '22px' }}>
              Our Corrections Policy
            </h2>
            <div
              className="space-y-3"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                lineHeight: 1.7,
                color: 'var(--color-text-2)',
              }}
            >
              <p>
                <strong style={{ color: 'var(--color-text-1)' }}>Corrections</strong> are issued when a
                factual error is identified in a published story. We fix the error in the story text and
                add a visible correction notice at the top of the article.
              </p>
              <p>
                <strong style={{ color: 'var(--color-text-1)' }}>Clarifications</strong> are issued when
                the original text was not technically wrong but could be misleading. We add context to
                prevent misinterpretation.
              </p>
              <p>
                <strong style={{ color: 'var(--color-text-1)' }}>Retractions</strong> are issued when a
                story contains fundamental errors that cannot be fixed by a correction, such as data
                misattribution where an entity's records were incorrectly assigned to a different entity.
                Retracted stories remain visible with a prominent retraction notice so the record is complete.
              </p>
              <p>
                <strong style={{ color: 'var(--color-text-1)' }}>Updates</strong> are issued when new
                data becomes available that materially changes the story's findings.
              </p>
            </div>
          </div>

          <div
            style={{
              borderRadius: '14px',
              border: '1px solid rgba(235,229,213,0.08)',
              background: 'var(--color-surface)',
              padding: '22px',
            }}
          >
            <h2 className="mb-3" style={{ ...h2Style, fontSize: '22px' }}>
              Report an Error
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                lineHeight: 1.7,
                color: 'var(--color-text-2)',
              }}
            >
              Anyone can report an error in a story. Use the "Report an error" button on any story page,
              or contact us at{' '}
              <a
                href="mailto:corrections@wethepeopleforus.com"
                style={{
                  color: 'var(--color-accent-text)',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                corrections@wethepeopleforus.com
              </a>
              . We review all reports and respond within 48 hours.
            </p>
          </div>
        </div>

        {/* Correction log */}
        <h2 className="mb-6" style={h2Style}>Correction Log</h2>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div
              className="animate-spin"
              style={{
                height: 24,
                width: 24,
                borderRadius: '999px',
                border: '2px solid rgba(235,229,213,0.15)',
                borderTopColor: 'var(--color-accent)',
              }}
            />
          </div>
        )}

        {!loading && corrections.length === 0 && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--color-text-3)',
              paddingBlock: 24,
            }}
          >
            No corrections or retractions have been issued.
          </p>
        )}

        {!loading && corrections.length > 0 && (
          <div className="space-y-4">
            {corrections.map((c) => {
              const tokens = tokensFor(c.type);
              const Icon = tokens.Icon;
              return (
                <div
                  key={c.id}
                  style={{
                    borderRadius: '14px',
                    border: `1px solid ${tokens.border}`,
                    background: tokens.bg,
                    padding: '20px 22px',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0" style={{ marginTop: 2 }}>
                      <Icon size={16} style={{ color: tokens.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.22em',
                            textTransform: 'uppercase',
                            color: tokens.color,
                          }}
                        >
                          {tokens.label}
                        </span>
                        {c.date && (
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10px',
                              color: 'var(--color-text-3)',
                            }}
                          >
                            {formatDate(c.date)}
                          </span>
                        )}
                      </div>
                      <Link
                        to={`/story/${c.story_slug}`}
                        className="block"
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontStyle: 'italic',
                          fontWeight: 900,
                          fontSize: '18px',
                          letterSpacing: '-0.01em',
                          color: 'var(--color-text-1)',
                          textDecoration: 'none',
                          transition: 'color 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = tokens.color)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
                      >
                        {c.story_title}
                      </Link>
                      <p
                        className="mt-2"
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '14px',
                          lineHeight: 1.65,
                          color: 'var(--color-text-2)',
                        }}
                      >
                        {c.description}
                      </p>
                    </div>
                    <Link
                      to={`/story/${c.story_slug}`}
                      className="shrink-0 transition-colors"
                      style={{
                        color: 'var(--color-text-3)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = tokens.color)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
                    >
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
