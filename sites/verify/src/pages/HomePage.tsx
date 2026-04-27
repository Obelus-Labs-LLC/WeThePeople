import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  apiPost, apiFetch, humanizeError, ApiError,
  isAuthenticated, loginRedirectUrl,
} from '../api/client';
import QuotaBadge from '../components/QuotaBadge';

/**
 * Verify (Veritas) home page — hero pill + URL/text submit form + recent
 * verification list. Matches the design from `WTP Ecosystem Sites.html`:
 * the emerald accent identifies Verify within the WTP ecosystem nav, and
 * the layout follows the spec's editorial-italic headline + clean form +
 * scored verdict cards pattern.
 *
 * Backend integration is unchanged from the previous version:
 *   - GET  /claims/dashboard/stats   – stats + 5 recent claims
 *   - POST /claims/verify            – plain-text or claim submission
 *   - POST /claims/verify-url        – URL/YouTube submission (transcript)
 *
 * On submit we route to /results/quick with the response in router state,
 * matching the existing ResultsPage contract.
 */

type InputType = 'TEXT' | 'URL' | 'YOUTUBE';

function detectInputType(value: string): InputType {
  const trimmed = value.trim();
  if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(trimmed)) return 'YOUTUBE';
  if (/^https?:\/\//i.test(trimmed)) return 'URL';
  return 'TEXT';
}

interface DashboardStats {
  total_claims: number;
  total_evaluated: number;
  unique_entities: number;
  tier_distribution?: Record<string, number>;
  recent?: Array<{
    id: number;
    person_id?: string | null;
    text: string;
    tier?: string | null;
    created_at?: string | null;
  }>;
}

// ── Tokens ──────────────────────────────────────────────────────────────
// Verify owns the emerald accent. We pull from CSS vars so theme tweaks
// (e.g. dark/light mode someday) propagate automatically.
const ACCENT = 'var(--color-accent)';
const ACCENT_DIM = 'var(--color-accent-dim)';
const ACCENT_TEXT = 'var(--color-accent-text)';
const T1 = 'var(--color-text-1)';
const T2 = 'var(--color-text-2)';
const T3 = 'var(--color-text-3)';
const SURF = 'var(--color-surface)';
const SURF2 = 'var(--color-surface-2)';
const BORDER = 'var(--color-border)';
const BORDER_HOVER = 'var(--color-border-hover)';
const BG = 'var(--color-bg)';

// Color a tier badge — keyed off the backend's evaluation.tier field.
// `null`/missing means we couldn't score it (yet) — render as muted.
const TIER_LABEL: Record<string, string> = {
  strong: 'Supported',
  moderate: 'Mostly True',
  weak: 'Mixed Evidence',
  none: 'Unverified',
};
const TIER_COLOR: Record<string, string> = {
  strong: '#10B981',
  moderate: '#3DB87A',
  weak: '#C5A028',
  none: 'rgba(235,229,213,0.4)',
};

const FONT_DISPLAY = "'Playfair Display', Georgia, serif";
const FONT_BODY = "'Inter', sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Fira Code', monospace";

export default function HomePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [textMode, setTextMode] = useState(false);
  const [inputFocus, setInputFocus] = useState(false);
  /** Bumped after every verify call so the QuotaBadge refetches. */
  const [quotaRefresh, setQuotaRefresh] = useState(0);
  /** Soft-paywall state — set when /claims/verify returns 401/429. */
  const [authWall, setAuthWall] = useState<{
    type: 'auth' | 'rate' | null;
    message?: string;
  }>({ type: null });

  const authed = isAuthenticated();
  const inputType = detectInputType(input);

  // Stats are non-fatal — log if they fail so we don't silently hide a
  // misbehaving endpoint, but never block the page on the call.
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<DashboardStats>('/claims/dashboard/stats', { signal: controller.signal })
      .then(setStats)
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.warn('[Veritas] dashboard stats unavailable:', err);
        }
      });
    return () => controller.abort();
  }, []);

  const handleVerify = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Paste a URL or claim text above to get started.');
      return;
    }
    if (trimmed.length < 20) {
      setError(
        `Text is too short (${trimmed.length} chars). Enter at least 20 so the engine can extract verifiable claims.`,
      );
      return;
    }

    // Hard auth gate — anonymous use of Veritas is no longer allowed.
    // Show the inline auth wall before even calling the API so the
    // failure mode is "click to sign up" rather than "click then see
    // a 401 toast".
    if (!isAuthenticated()) {
      setAuthWall({
        type: 'auth',
        message: 'Verification requires a free account — get 5 verifications per day, no credit card.',
      });
      return;
    }

    setLoading(true);
    setError('');
    setAuthWall({ type: null });

    try {
      const detected = detectInputType(trimmed);
      const result =
        detected === 'URL' || detected === 'YOUTUBE'
          ? await apiPost('/claims/verify-url', { url: trimmed })
          : await apiPost('/claims/verify', { text: trimmed });

      // A successful verify just consumed one of the user's daily
      // budget — bump the refresh key so the badge re-reads /auth/quota.
      setQuotaRefresh((n) => n + 1);
      navigate('/results/quick', { state: { result, inputText: trimmed } });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setAuthWall({
            type: 'auth',
            message: 'Your session expired. Sign back in to keep verifying.',
          });
          return;
        }
        if (err.status === 429) {
          // Bump quota so the badge updates to "0 of N · Upgrade".
          setQuotaRefresh((n) => n + 1);
          setAuthWall({
            type: 'rate',
            message: "You've used today's free verifications. Upgrade for more, or come back tomorrow.",
          });
          return;
        }
      }
      setError(humanizeError(err));
    } finally {
      setLoading(false);
    }
  }, [input, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleVerify();
  };

  const recent = stats?.recent ?? [];

  // Show a helper subtext under the input that explains what we'll do with
  // it. Switches between URL transcript flow and raw-text claim flow.
  const helperText = textMode ? (
    <>
      Paste raw claim text — we&apos;ll extract verifiable statements and score
      each one ·{' '}
      <span
        style={{ color: ACCENT_TEXT, cursor: 'pointer' }}
        onClick={() => setTextMode(false)}
      >
        switch back to URL input
      </span>
    </>
  ) : (
    <>
      Or paste raw text:{' '}
      <span
        style={{ color: ACCENT_TEXT, cursor: 'pointer' }}
        onClick={() => setTextMode(true)}
      >
        switch to text input
      </span>{' '}
      · Supports audio/video URLs via transcript extraction
    </>
  );

  return (
    <main
      id="main-content"
      style={{
        flex: 1,
        overflowY: 'auto',
        background: BG,
        color: T1,
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 40px' }}>
        {/* ── Quota / auth pill (top right of content) ──────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <QuotaBadge refreshKey={quotaRefresh} />
        </div>

        {/* ── Soft paywall: shown when /verify returns 401 or 429 ──── */}
        {authWall.type && (
          <div
            role="alert"
            style={{
              marginBottom: 24,
              padding: '16px 20px',
              border: '1.5px solid rgba(16,185,129,0.5)',
              background: 'rgba(16,185,129,0.06)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <strong style={{ color: ACCENT_TEXT, fontFamily: FONT_BODY, fontSize: 14 }}>
                {authWall.type === 'auth' ? 'Sign in to verify' : 'Daily limit reached'}
              </strong>
              <p style={{
                margin: '4px 0 0', fontFamily: FONT_BODY, fontSize: 13,
                color: T2, lineHeight: 1.5,
              }}>
                {authWall.message}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {authWall.type === 'auth' ? (
                <>
                  <a
                    href={loginRedirectUrl()}
                    style={{
                      fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                      padding: '10px 16px', borderRadius: 10,
                      background: ACCENT, color: '#07090C', textDecoration: 'none',
                    }}
                  >
                    Sign in
                  </a>
                  <a
                    href="https://wethepeopleforus.com/signup?next=https://verify.wethepeopleforus.com"
                    style={{
                      fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                      padding: '10px 16px', borderRadius: 10,
                      border: `1px solid ${BORDER_HOVER}`, color: T1,
                      textDecoration: 'none', background: 'transparent',
                    }}
                  >
                    Create account
                  </a>
                </>
              ) : (
                <>
                  <a
                    href="https://wethepeopleforus.com/pricing"
                    style={{
                      fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                      padding: '10px 16px', borderRadius: 10,
                      background: ACCENT, color: '#07090C', textDecoration: 'none',
                    }}
                  >
                    See plans
                  </a>
                  <button
                    onClick={() => setAuthWall({ type: null })}
                    style={{
                      fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                      padding: '10px 16px', borderRadius: 10,
                      border: `1px solid ${BORDER_HOVER}`, color: T2,
                      background: 'transparent', cursor: 'pointer',
                    }}
                  >
                    Dismiss
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 40, maxWidth: 680 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              border: `1px solid ${ACCENT_DIM}`,
              borderRadius: 20,
              padding: '5px 14px',
              background: ACCENT_DIM,
              marginBottom: 20,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: ACCENT,
                animation: 'pulse 2s ease-in-out infinite',
              }}
              className="animate-pulse-dot"
            />
            <span
              style={{
                fontFamily: FONT_BODY,
                fontSize: 11,
                fontWeight: 700,
                color: ACCENT_TEXT,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Real-time claim verification
            </span>
          </div>

          <h1
            style={{
              fontFamily: FONT_DISPLAY,
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(36px, 5.5vw, 48px)',
              color: T1,
              lineHeight: 1.0,
              marginBottom: 14,
              letterSpacing: '-0.01em',
            }}
          >
            What&apos;s true.
            <br />
            What isn&apos;t.
          </h1>
          <p
            style={{
              fontFamily: FONT_BODY,
              fontSize: 15,
              color: T2,
              lineHeight: 1.7,
              maxWidth: 620,
            }}
          >
            Submit any URL — speech, interview, social post, or article — and
            Veritas extracts every verifiable claim, checks each one against
            29+ authoritative sources, and produces a structured verdict.
            Zero AI hallucination. Deterministic by design.
          </p>
        </section>

        {/* ── Submit form ────────────────────────────────────────────── */}
        <section
          style={{
            background: SURF,
            border: `1px solid ${BORDER_HOVER}`,
            borderRadius: 14,
            padding: 28,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 13,
              fontWeight: 700,
              color: T1,
              marginBottom: 16,
            }}
          >
            {textMode ? 'Paste claim text for fact-checking' : 'Submit a source for fact-checking'}
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {textMode ? (
              <textarea
                aria-label="Claim text to verify"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocus(true)}
                onBlur={() => setInputFocus(false)}
                placeholder='Paste a claim — e.g. "Lockheed received $45B in DoD contracts last year."'
                rows={3}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1.5px solid ${input || inputFocus ? ACCENT : BORDER}`,
                  background: BG,
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  color: T1,
                  outline: 'none',
                  resize: 'vertical',
                  transition: 'border-color 0.2s',
                  lineHeight: 1.5,
                }}
              />
            ) : (
              <input
                aria-label="URL to verify"
                type="url"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocus(true)}
                onBlur={() => setInputFocus(false)}
                placeholder="Paste a URL — speech transcript, news article, tweet, YouTube video…"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1.5px solid ${input || inputFocus ? ACCENT : BORDER}`,
                  background: BG,
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  color: T1,
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
              />
            )}

            <button
              type="button"
              onClick={handleVerify}
              disabled={loading || !input.trim()}
              style={{
                padding: '12px 22px',
                borderRadius: 8,
                border: 'none',
                cursor: loading || !input.trim() ? 'default' : 'pointer',
                background: input.trim() ? ACCENT : 'rgba(255,255,255,0.05)',
                fontFamily: FONT_BODY,
                fontSize: 14,
                fontWeight: 700,
                color: input.trim() ? '#07090C' : T3,
                opacity: loading ? 0.6 : input.trim() ? 1 : 0.5,
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                alignSelf: textMode ? 'flex-start' : 'auto',
                height: textMode ? undefined : 44,
              }}
            >
              {loading ? 'Analyzing…' : 'Analyze →'}
            </button>
          </div>

          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 11,
              color: T3,
              minHeight: 16,
            }}
          >
            {helperText}
          </div>

          {/* Detected input-type hint — emerald for URL/YouTube, neutral for text */}
          {!textMode && input.trim().length > 0 && (
            <div
              style={{
                marginTop: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: FONT_MONO,
                fontSize: 10,
                color: inputType === 'TEXT' ? T3 : ACCENT_TEXT,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: inputType === 'TEXT' ? T3 : ACCENT,
                }}
              />
              Detected: {inputType}
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 14,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid rgba(230,57,70,0.25)',
                background: 'rgba(230,57,70,0.08)',
                fontFamily: FONT_BODY,
                fontSize: 13,
                color: 'var(--color-red)',
              }}
            >
              {error}
            </div>
          )}

          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {loading ? 'Verifying claims, please wait…' : ''}
          </div>
        </section>

        {/* ── Recent verifications ──────────────────────────────────── */}
        {recent.length > 0 && (
          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 11,
                  fontWeight: 700,
                  color: T3,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Recent Verifications
              </div>
              <button
                type="button"
                onClick={() => navigate('/vault')}
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 12,
                  fontWeight: 600,
                  color: ACCENT_TEXT,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Browse vault →
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recent.map((c) => {
                const tierKey = (c.tier || 'none').toLowerCase();
                const label = TIER_LABEL[tierKey] || 'Unverified';
                const color = TIER_COLOR[tierKey] || TIER_COLOR.none;
                // Date string — falls back to "—" if backend returned null.
                const date = c.created_at
                  ? new Date(c.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '—';

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate(`/results/${c.id}`)}
                    style={{
                      padding: '16px 20px',
                      borderRadius: 10,
                      border: `1px solid ${BORDER}`,
                      background: SURF,
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 16,
                      alignItems: 'flex-start',
                      textAlign: 'left',
                      transition: 'border-color 0.15s, transform 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = BORDER_HOVER;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = BORDER;
                    }}
                  >
                    {/* Verdict column — tier label + accent badge */}
                    <div
                      style={{
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        width: 88,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 11,
                          fontWeight: 700,
                          color: T3,
                          letterSpacing: '0.05em',
                        }}
                      >
                        #{c.id}
                      </div>
                      <span
                        style={{
                          fontFamily: FONT_BODY,
                          fontSize: 10,
                          fontWeight: 700,
                          color,
                          background: `${color}18`,
                          borderRadius: 4,
                          padding: '2px 6px',
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </span>
                    </div>

                    {/* Content column — claim text + meta row */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: FONT_BODY,
                          fontSize: 13,
                          color: T1,
                          fontStyle: 'italic',
                          marginBottom: 7,
                          lineHeight: 1.5,
                          // Wrap claim text in display quotes — matches the
                          // editorial feel of the design's verdict cards.
                          // Two-line clamp keeps the row tidy.
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        &ldquo;{c.text}&rdquo;
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 10,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        {c.person_id && (
                          <span
                            style={{
                              fontFamily: FONT_MONO,
                              fontSize: 10,
                              color: T3,
                              background: SURF2,
                              borderRadius: 4,
                              padding: '2px 6px',
                              letterSpacing: '0.05em',
                            }}
                          >
                            {c.person_id}
                          </span>
                        )}
                        <span
                          style={{
                            fontFamily: FONT_MONO,
                            fontSize: 11,
                            color: T3,
                            marginLeft: 'auto',
                          }}
                        >
                          {date}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Stats footer ──────────────────────────────────────────── */}
        {stats && (stats.total_claims > 0 || stats.total_evaluated > 0) && (
          <div
            style={{
              marginTop: 40,
              paddingTop: 24,
              borderTop: `1px solid ${BORDER}`,
              display: 'flex',
              gap: 24,
              alignItems: 'center',
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: T3,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <div>
              <span style={{ color: T1, fontWeight: 700 }}>
                {stats.total_claims.toLocaleString()}
              </span>{' '}
              claims indexed
            </div>
            <span style={{ opacity: 0.4 }}>·</span>
            <div>
              <span style={{ color: T1, fontWeight: 700 }}>
                {stats.total_evaluated.toLocaleString()}
              </span>{' '}
              evaluated
            </div>
            <span style={{ opacity: 0.4 }}>·</span>
            <div>
              <span style={{ color: T1, fontWeight: 700 }}>
                {stats.unique_entities.toLocaleString()}
              </span>{' '}
              entities
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
