import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '../api/client';
import Footer from '../components/Footer';

const API_BASE = getApiBaseUrl();

/**
 * Weekly Digest subscribe page. Redesigned as a two-column layout: a pitch
 * column on the left (overline, headline, copy, social-proof stats) and a
 * compact subscribe card on the right. Drops the previous zip/sector/preview
 * UI in favor of the "one-click subscribe" pattern from the design spec; the
 * backend still accepts an empty zip + full sector set, and users can fine-
 * tune preferences from the Account page once they verify.
 */
const DEFAULT_SECTORS = [
  'politics',
  'finance',
  'health',
  'technology',
  'energy',
  'transportation',
];

const STATS: Array<[string, string]> = [
  ['12,400+', 'subscribers'],
  ['96%', 'open rate'],
  ['~4 min', 'to read'],
];

export default function DigestSignupPage() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailFocus, setEmailFocus] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setSubmitError('Please agree to receive the weekly digest to continue.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`${API_BASE}/digest/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Lowercase email defensively — emails are case-insensitive per
        // RFC 5321. Backend accepts empty zip + default sectors; users can
        // refine these from the Account page after verifying.
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          zip_code: '',
          sectors: DEFAULT_SECTORS,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Subscription failed');
      setSubmitted(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        @media (max-width: 820px) {
          .digest-grid { grid-template-columns: 1fr !important; gap: 28px !important; }
        }
      `}</style>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
        }}
      >
        <div
          className="digest-grid"
          style={{
            maxWidth: 880,
            width: '100%',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 40,
            alignItems: 'center',
          }}
        >
          {/* Pitch column */}
          <div>
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--color-accent-text)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              Weekly Digest &middot; Free
            </div>
            <h1
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: 'clamp(32px, 5vw, 46px)',
                lineHeight: 1.05,
                letterSpacing: '-0.01em',
                color: 'var(--color-text-1)',
                marginBottom: 18,
              }}
            >
              The 5 things that moved Washington last week.
            </h1>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 15,
                color: 'var(--color-text-2)',
                lineHeight: 1.7,
                marginBottom: 24,
                maxWidth: 420,
              }}
            >
              Every Sunday, one short email. Biggest lobbying filings, the vote
              nobody&apos;s covering, the anomaly we flagged, and what to watch
              for. No ads, no upsells, one-click unsubscribe.
            </p>
            <div style={{ display: 'flex', gap: 22 }}>
              {STATS.map(([value, label]) => (
                <div key={label}>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      fontSize: 22,
                      fontWeight: 700,
                      color: 'var(--color-text-1)',
                      marginBottom: 2,
                    }}
                  >
                    {value}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 11,
                      color: 'var(--color-text-3)',
                    }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subscribe card */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              padding: 28,
            }}
          >
            {!submitted ? (
              <form onSubmit={handleSubmit}>
                <h3
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontStyle: 'italic',
                    fontWeight: 700,
                    fontSize: 20,
                    color: 'var(--color-text-1)',
                    marginBottom: 14,
                  }}
                >
                  Subscribe
                </h3>

                {/* Email field */}
                <div style={{ marginBottom: 14 }}>
                  <label
                    style={{
                      display: 'block',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--color-text-2)',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setEmailFocus(true)}
                    onBlur={() => setEmailFocus(false)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: 8,
                      background: 'var(--color-surface)',
                      color: 'var(--color-text-1)',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 14,
                      border: `1.5px solid ${
                        emailFocus ? 'var(--color-accent)' : 'var(--color-border)'
                      }`,
                      outline: 'none',
                      transition: 'border-color 0.15s',
                    }}
                  />
                </div>

                {/* Consent checkbox */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginBottom: 18,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                  />
                  <span
                    aria-hidden
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      border: `1.5px solid ${
                        consent ? 'var(--color-accent)' : 'var(--color-border-hover)'
                      }`,
                      background: consent ? 'var(--color-accent)' : 'transparent',
                      flexShrink: 0,
                      marginTop: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#07090C',
                    }}
                  >
                    {consent ? '✓' : ''}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12,
                      color: 'var(--color-text-2)',
                      lineHeight: 1.5,
                    }}
                  >
                    I agree to receive the weekly digest email and can
                    unsubscribe anytime.
                  </span>
                </label>

                {submitError && (
                  <div
                    role="alert"
                    style={{
                      marginBottom: 14,
                      borderRadius: 8,
                      background: 'rgba(230,57,70,0.08)',
                      border: '1px solid rgba(230,57,70,0.25)',
                      padding: '10px 14px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      color: 'var(--color-red)',
                    }}
                  >
                    {submitError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !email}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 9,
                    background: 'var(--color-accent)',
                    color: '#07090C',
                    border: 'none',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: submitting || !email ? 'not-allowed' : 'pointer',
                    opacity: submitting || !email ? 0.6 : 1,
                    transition: 'opacity 150ms',
                  }}
                >
                  {submitting ? 'Subscribing\u2026' : 'Subscribe'}
                </button>
                <div
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 11,
                    color: 'var(--color-text-3)',
                    textAlign: 'center',
                    marginTop: 14,
                  }}
                >
                  We&apos;ll never share your email. Unsubscribe with one click.
                </div>
              </form>
            ) : (
              <div style={{ textAlign: 'center', padding: '28px 0' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'var(--color-accent-dim)',
                    border: '1px solid rgba(197,160,40,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--color-accent)',
                    margin: '0 auto 18px',
                  }}
                >
                  ✓
                </div>
                <h3
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontStyle: 'italic',
                    fontWeight: 700,
                    fontSize: 22,
                    color: 'var(--color-text-1)',
                    marginBottom: 8,
                  }}
                >
                  Check your inbox
                </h3>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    color: 'var(--color-text-2)',
                    lineHeight: 1.6,
                  }}
                >
                  We sent a verification link to{' '}
                  <strong style={{ color: 'var(--color-text-1)' }}>
                    {email || 'your email'}
                  </strong>
                  . Click it to confirm. First digest arrives Sunday.
                </p>
                <Link
                  to="/"
                  style={{
                    display: 'inline-block',
                    marginTop: 18,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--color-accent-text)',
                    textDecoration: 'none',
                  }}
                >
                  Back to home
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
