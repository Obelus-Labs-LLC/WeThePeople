import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell, { AuthField } from '../components/AuthShell';
import { getApiBaseUrl } from '../api/client';

/**
 * Forgot-password landing.
 *
 * Posts the email to /auth/forgot-password and shows a confirmation page.
 * The backend always returns the same generic success message regardless
 * of whether the email is registered (defeats user-enumeration), so we
 * mirror that on the UI: no "email not found" error, just a confirmation
 * that *if* an account exists, a reset link has been sent.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.status === 429) {
        setError('Too many requests. Try again in an hour.');
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        // 422 (bad email format) is the only response that should fail
        // here. Anything else is a server-side issue worth surfacing.
        const detail = await res.text().catch(() => '');
        setError(detail || `Request failed (${res.status}). Please try again.`);
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `Could not reach the server. ${err.message}`
          : 'Could not reach the server.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
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
            <Link to="/login" style={{ color: 'var(--color-accent-text)', fontWeight: 500 }}>
              Back to sign in
            </Link>
          </div>
        }
      >
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 28,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Check your email.
        </h1>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            color: 'var(--color-text-2)',
            lineHeight: 1.55,
            marginBottom: 18,
          }}
        >
          If an account exists for <strong>{email}</strong>, we just sent a
          reset link there. Click the link to set a new password. The link
          expires in 30 minutes.
        </p>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            color: 'var(--color-text-3)',
            lineHeight: 1.55,
          }}
        >
          Didn&rsquo;t get it? Check your spam folder, or email
          <a
            href="mailto:wethepeopleforus@gmail.com"
            style={{ color: 'var(--color-accent-text)', marginLeft: 6 }}
          >
            wethepeopleforus@gmail.com
          </a>
          {' '}from your account address and we&rsquo;ll reset it manually.
        </p>
      </AuthShell>
    );
  }

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
          Remembered it?{' '}
          <Link to="/login" style={{ color: 'var(--color-accent-text)', fontWeight: 500 }}>
            Sign in
          </Link>
        </div>
      }
    >
      <h1
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Reset your password.
      </h1>
      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: 'var(--color-text-2)',
          marginBottom: 20,
        }}
      >
        Enter the email associated with your account and we&rsquo;ll send a
        link to reset your password.
      </p>

      <form onSubmit={handleSubmit}>
        {error && (
          <div
            style={{
              padding: 10,
              borderRadius: 6,
              background: 'var(--color-red-dim, rgba(220,80,80,0.12))',
              border: '1px solid var(--color-red, #d6594d)',
              color: 'var(--color-red, #d6594d)',
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              marginBottom: 14,
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

        <button
          type="submit"
          disabled={submitting || !email.trim()}
          style={{
            width: '100%',
            marginTop: 10,
            padding: '12px 14px',
            borderRadius: 8,
            background: 'var(--color-accent)',
            color: '#000',
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            border: 'none',
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting || !email.trim() ? 0.6 : 1,
          }}
        >
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </AuthShell>
  );
}
