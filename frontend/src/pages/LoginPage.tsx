import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthShell, { AuthField } from '../components/AuthShell';

/**
 * Login page redesign. Uses the shared <AuthShell> + <AuthField> layout with
 * the new "Welcome back" copy, Remember-me checkbox, Forgot-password link,
 * and OR-divider + OAuth provider buttons (visual only — email/password is
 * the only auth path the backend currently exposes).
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Already-authenticated users have no business on /login. Honor an
  // explicit `?next=...` redirect so sibling sites (verify, journal,
  // research) that deep-link a logged-in user back through /login can
  // bounce them to the requested destination. Falls back to /account
  // when no next is supplied. Reject absolute URLs that aren't on the
  // wethepeopleforus.com domain — preventing open-redirect abuse where
  // a phishing link sends users through /login → attacker.example.
  if (!authLoading && isAuthenticated) {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    if (next) {
      try {
        const target = new URL(next, window.location.origin);
        const sameOrigin = target.origin === window.location.origin;
        const trustedSubdomain = /(^|\.)wethepeopleforus\.com$/i.test(target.hostname);
        if (sameOrigin) {
          // Internal route — use SPA navigation so we don't reload.
          return <Navigate to={target.pathname + target.search + target.hash} replace />;
        }
        if (trustedSubdomain) {
          window.location.replace(target.toString());
          return null;
        }
      } catch {
        // Malformed `next` — fall through to /account.
      }
    }
    return <Navigate to="/account" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      // Same trust rules as the already-authed redirect above. A
      // verify-subdomain `next` lands the freshly-logged-in user back
      // where they came from instead of dumping them on the homepage.
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next');
      if (next) {
        try {
          const target = new URL(next, window.location.origin);
          const sameOrigin = target.origin === window.location.origin;
          const trustedSubdomain = /(^|\.)wethepeopleforus\.com$/i.test(target.hostname);
          if (sameOrigin) {
            navigate(target.pathname + target.search + target.hash);
            return;
          }
          if (trustedSubdomain) {
            window.location.replace(target.toString());
            return;
          }
        } catch {
          // Malformed `next` — fall through to default.
        }
      }
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const notifyOAuth = (provider: string) => {
    // OAuth flows aren't wired up yet on the backend — surface a transparent
    // message rather than silently failing.
    alert(
      `${provider} sign-in is coming soon. For now, please create a free account with your email.`,
    );
  };

  return (
    <AuthShell
      footer={
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: 'var(--color-text-3)',
            textAlign: 'center',
            marginTop: 20,
          }}
        >
          Don&apos;t have an account?{' '}
          <Link
            to="/signup"
            style={{
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Create one
          </Link>
        </div>
      }
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          padding: '32px 28px',
        }}
      >
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: 26,
            color: 'var(--color-text-1)',
            marginBottom: 6,
          }}
        >
          Welcome back
        </h1>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: 'var(--color-text-2)',
            marginBottom: 24,
            lineHeight: 1.55,
          }}
        >
          Sign in to save politicians, subscribe to alerts, and track your
          reps.
        </p>

        {error && (
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
            {error}
          </div>
        )}

        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <AuthField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />

        {/* Forgot password — the "Remember me" checkbox was removed
            because tokens already persist across sessions via
            localStorage. The checkbox didn't change behavior, so it
            was a UX promise we couldn't keep. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <Link
            to="/forgot-password"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
            }}
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
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
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'opacity 150ms',
            marginBottom: 14,
          }}
        >
          {loading ? 'Signing in\u2026' : 'Sign in'}
        </button>

        {/* OR divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            margin: '20px 0',
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              color: 'var(--color-text-3)',
              letterSpacing: '0.08em',
            }}
          >
            OR
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </div>

        {/* OAuth provider buttons — visual only until backend support lands */}
        {[
          { name: 'Google', glyph: 'G' },
          { name: 'GitHub', glyph: '⌥' },
        ].map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => notifyOAuth(p.name)}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: 8,
              borderRadius: 9,
              background: 'transparent',
              color: 'var(--color-text-1)',
              border: '1px solid var(--color-border)',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              transition: 'border-color 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
            }}
          >
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--color-text-2)',
              }}
            >
              {p.glyph}
            </span>
            Continue with {p.name}
          </button>
        ))}
      </form>
    </AuthShell>
  );
}
