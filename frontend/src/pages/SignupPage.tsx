import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthShell, { AuthField } from '../components/AuthShell';

/**
 * Signup page redesign. Uses the shared <AuthShell> + <AuthField> layout with
 * the new "Create an account" copy, helper text under each field, an optional
 * ZIP code input (frontend-only; not persisted backend-side yet), and the
 * three-checkbox consent block (Terms/Privacy acceptance, weekly-digest
 * opt-in, anomaly-alerts opt-in).
 */
export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [digestOptIn, setDigestOptIn] = useState(true);
  const [alertOptIn, setAlertOptIn] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Already-authenticated users have no business on /signup.
  if (!authLoading && isAuthenticated) {
    return <Navigate to="/account" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!acceptTerms) {
      setError('You must agree to the Terms of Use and Privacy Policy.');
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    setLoading(true);
    try {
      // zip_code + notification preferences are now persisted by the backend
      // on /auth/register (see routers/auth.py RegisterRequest). They can also
      // be updated afterwards via POST /auth/preferences.
      await register(email, password, {
        zipCode: zipCode || undefined,
        digestOptIn,
        alertOptIn,
      });
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const consentRows: Array<{
    key: string;
    checked: boolean;
    onToggle: () => void;
    forceChecked?: boolean;
    content: React.ReactNode;
  }> = [
    {
      key: 'terms',
      checked: acceptTerms,
      onToggle: () => setAcceptTerms((v) => !v),
      content: (
        <>
          By creating an account you agree to our{' '}
          <Link
            to="/terms"
            style={{ color: 'var(--color-accent-text)', textDecoration: 'none' }}
          >
            Terms of Use
          </Link>{' '}
          and{' '}
          <Link
            to="/privacy"
            style={{ color: 'var(--color-accent-text)', textDecoration: 'none' }}
          >
            Privacy Policy
          </Link>
          .
        </>
      ),
    },
    {
      key: 'digest',
      checked: digestOptIn,
      onToggle: () => setDigestOptIn((v) => !v),
      content: <>Email me the Weekly Digest (3 emails/mo)</>,
    },
    {
      key: 'alerts',
      checked: alertOptIn,
      onToggle: () => setAlertOptIn((v) => !v),
      content: <>Email me when a politician I follow has an anomaly flagged</>,
    },
  ];

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
          Already have an account?{' '}
          <Link
            to="/login"
            style={{
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Sign in
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
          Create an account
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
          Free forever. No ads. Three emails a month, max — and only if you
          want them.
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
          helper="We'll send a verification link here."
          autoComplete="email"
          required
        />
        <AuthField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="At least 12 characters"
          helper="At least 12 chars, mix of letters and numbers."
          autoComplete="new-password"
          minLength={12}
          required
        />
        <AuthField
          label="ZIP Code (optional)"
          value={zipCode}
          onChange={(v) => setZipCode(v.replace(/\D/g, '').slice(0, 5))}
          placeholder="94103"
          helper="Used to show your reps and personalize your weekly digest. You can change or remove it later from Account."
          autoComplete="postal-code"
          maxLength={5}
        />

        {/* Consent block */}
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 9,
            margin: '18px 0 20px',
          }}
        >
          {consentRows.map((row) => (
            <label
              key={row.key}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '5px 0',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={row.checked}
                onChange={row.onToggle}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
              />
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  border: `1.5px solid ${
                    row.checked ? 'var(--color-accent)' : 'var(--color-border-hover)'
                  }`,
                  background: row.checked ? 'var(--color-accent)' : 'transparent',
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
                {row.checked ? '✓' : ''}
              </span>
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  color: 'var(--color-text-2)',
                  lineHeight: 1.5,
                }}
              >
                {row.content}
              </span>
            </label>
          ))}
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
          }}
        >
          {loading ? 'Creating account\u2026' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
