import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const API = getApiBaseUrl();

/**
 * Public pricing page for the Veritas verification engine.
 *
 * The page renders entirely from server-driven /auth/pricing data so
 * the numbers (daily limits, prices, features) can never drift between
 * the API, the docs, and the UI. The /auth/checkout endpoint mints
 * Stripe sessions for Student / Pro / Newsroom / Enterprise plans;
 * Free is no-op (just register).
 *
 * Student plan requires a .edu (or .ac.*) email — the backend rejects
 * with a structured `edu_required` error if the user's email doesn't
 * qualify, and we surface that here.
 */

type Billing = 'monthly' | 'annual';

interface TierMeta {
  label: string;
  daily_limit: number;
  monthly_price_cents: number;
  annual_price_cents: number | null;
  audience: string;
  features: string[];
}

interface PricingResponse {
  tiers: Record<string, TierMeta>;
}

const ORDER = ['free', 'student', 'pro', 'newsroom', 'enterprise'];

function formatPrice(cents: number | null): string {
  if (cents == null) return 'Custom';
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(0)}`;
}

function annualPerMonth(cents: number | null): string | null {
  if (cents == null || cents === 0) return null;
  return `$${(cents / 100 / 12).toFixed(2)}/mo`;
}

export default function PricingPage() {
  const [tiers, setTiers] = useState<Record<string, TierMeta> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing>('monthly');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const { isAuthenticated, authedFetch } = useAuth();

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/auth/pricing`)
      .then((r) => {
        if (!r.ok) throw new Error(`Pricing endpoint returned ${r.status}`);
        return r.json();
      })
      .then((data: PricingResponse) => {
        if (cancelled) return;
        setTiers(data.tiers);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? 'Could not load pricing');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCheckout = async (plan: string) => {
    setCheckoutError(null);
    if (!isAuthenticated) {
      // Free has no checkout; everything paid needs an account first.
      window.location.href = `/login?next=${encodeURIComponent('/pricing')}`;
      return;
    }
    setCheckingOut(plan);
    try {
      const r = await authedFetch(`${API}/auth/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billing }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      // FastAPI returns {detail: {error, message, ...}} for our structured 4xx
      const detail = data?.detail;
      const msg =
        (detail && typeof detail === 'object' && (detail as { message?: string }).message) ||
        (typeof detail === 'string' ? detail : null) ||
        `Checkout failed (${r.status})`;
      setCheckoutError(msg);
    } catch (err) {
      setCheckoutError((err as Error)?.message ?? 'Checkout failed.');
    } finally {
      setCheckingOut(null);
    }
  };

  return (
    <main id="main-content" style={{ padding: '40px 24px 80px', maxWidth: 1200, margin: '0 auto' }}>
      <Link
        to="/"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-text-3)',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 32,
        }}
      >
        <ArrowLeft size={12} /> Back
      </Link>

      <header style={{ textAlign: 'center', marginBottom: 48 }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-text)',
            marginBottom: 12,
          }}
        >
          Veritas Verification — Pricing
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(36px, 6vw, 56px)',
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          One engine, five tiers.
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 16,
            color: 'var(--color-text-2)',
            maxWidth: 640,
            margin: '16px auto 0',
            lineHeight: 1.6,
          }}
        >
          All paid plans run the same zero-LLM Veritas engine. Tiers differ
          only by daily verification budget and support level. Public read
          access (the civic data, stories, research tools) is free for
          everyone, no account needed.
        </p>

        {/* Monthly / Annual toggle */}
        <div
          role="tablist"
          aria-label="Billing period"
          style={{
            display: 'inline-flex',
            marginTop: 28,
            border: '1px solid var(--color-border)',
            borderRadius: 999,
            padding: 4,
            background: 'var(--color-surface)',
          }}
        >
          {(['monthly', 'annual'] as const).map((b) => {
            const active = billing === b;
            return (
              <button
                key={b}
                role="tab"
                aria-selected={active}
                onClick={() => setBilling(b)}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '8px 18px',
                  borderRadius: 999,
                  border: 'none',
                  background: active ? 'var(--color-accent)' : 'transparent',
                  color: active ? '#07090C' : 'var(--color-text-2)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {b === 'annual' ? 'Annual (save ~17%)' : 'Monthly'}
              </button>
            );
          })}
        </div>
      </header>

      {loading && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-3)' }}>Loading pricing…</p>
      )}
      {error && (
        <p style={{ textAlign: 'center', color: 'var(--color-red)' }}>{error}</p>
      )}
      {checkoutError && (
        <div
          role="alert"
          style={{
            margin: '0 auto 32px',
            maxWidth: 640,
            padding: '14px 18px',
            border: '1px solid rgba(230,57,70,0.35)',
            background: 'rgba(230,57,70,0.06)',
            borderRadius: 12,
            color: 'var(--color-red)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          {checkoutError}
        </div>
      )}

      {tiers && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {ORDER.filter((slug) => tiers[slug]).map((slug) => {
            const t = tiers[slug];
            const cents = billing === 'annual' && t.annual_price_cents != null
              ? t.annual_price_cents
              : t.monthly_price_cents;
            const subline =
              billing === 'annual' && t.annual_price_cents != null
                ? annualPerMonth(t.annual_price_cents)
                : null;
            const isPaid = slug !== 'free';
            const isFeatured = slug === 'pro';
            return (
              <article
                key={slug}
                style={{
                  border: isFeatured
                    ? '1.5px solid rgba(197,160,40,0.45)'
                    : '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  borderRadius: 16,
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <div>
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      color: isFeatured ? 'var(--color-accent-text)' : 'var(--color-text-3)',
                      marginBottom: 4,
                    }}
                  >
                    {t.label}
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 900,
                      fontSize: 36,
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                      margin: 0,
                    }}
                  >
                    {formatPrice(cents)}
                    {cents > 0 && (
                      <span
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--color-text-3)',
                          marginLeft: 6,
                        }}
                      >
                        /{billing === 'annual' ? 'yr' : 'mo'}
                      </span>
                    )}
                  </p>
                  {subline && (
                    <p
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--color-text-3)',
                        marginTop: 4,
                      }}
                    >
                      ≈ {subline}
                    </p>
                  )}
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      color: 'var(--color-text-2)',
                      marginTop: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {t.audience}
                  </p>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                  {t.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        fontFamily: 'var(--font-body)',
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: 'var(--color-text-1)',
                      }}
                    >
                      <Check size={14} style={{ flexShrink: 0, marginTop: 3, color: 'var(--color-accent-text)' }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => isPaid ? handleCheckout(slug) : (window.location.href = '/signup')}
                  disabled={checkingOut === slug}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    padding: '12px 18px',
                    borderRadius: 10,
                    border: 'none',
                    background: isFeatured ? 'var(--color-accent)' : 'rgba(235,229,213,0.06)',
                    color: isFeatured ? '#07090C' : 'var(--color-text-1)',
                    cursor: checkingOut === slug ? 'wait' : 'pointer',
                    marginTop: 'auto',
                  }}
                >
                  {checkingOut === slug
                    ? 'Loading…'
                    : isPaid
                      ? `Choose ${t.label}`
                      : 'Sign up free'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      <footer
        style={{
          marginTop: 56,
          padding: 24,
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          borderRadius: 14,
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          lineHeight: 1.7,
          color: 'var(--color-text-2)',
        }}
      >
        <strong style={{ color: 'var(--color-text-1)' }}>Things to know:</strong>
        <ul style={{ marginTop: 10, paddingLeft: 20 }}>
          <li>Free tier requires a (free) account — anonymous use of Veritas isn't supported.</li>
          <li>Student tier requires a .edu or international academic email (e.g. .ac.uk).</li>
          <li>Annual plans bill once and run for 12 months. Cancel anytime — refunds prorated.</li>
          <li>All prices are USD. Stripe Tax is enabled where applicable.</li>
          <li>Need an enterprise quote, custom integration, or a non-profit/student team plan? Email <a href="mailto:wethepeopleforus@gmail.com" style={{ color: 'var(--color-accent-text)' }}>wethepeopleforus@gmail.com</a>.</li>
        </ul>
      </footer>
    </main>
  );
}
