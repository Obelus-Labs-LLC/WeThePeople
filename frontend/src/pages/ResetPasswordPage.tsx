import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import AuthShell, { AuthField } from '../components/AuthShell';
import { getApiBaseUrl } from '../api/client';

/**
 * Reset-password landing reached via the emailed link.
 *
 * URL shape: /reset-password?token=<jwt>
 *
 * Posts {token, new_password} to /auth/reset-password. On success, sends
 * the user back to /login with a one-time success notice. The session
 * cookie is cleared server-side so the user must explicitly sign in
 * with the new password — no implicit auth carries over a reset.
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
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
            <Link to="/forgot-password" style={{ color: 'var(--color-accent-text)', fontWeight: 500 }}>
              Request a new reset link
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
          Reset link missing.
        </h1>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: 'var(--color-text-2)',
            lineHeight: 1.55,
          }}
        >
          The link you followed didn&rsquo;t carry a reset token. Request a
          fresh link and try again.
        </p>
      </AuthShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (res.status === 401) {
        setError(
          'This reset link is invalid or has expired. Request a new one.',
        );
        setSubmitting(false);
        return;
      }
      if (res.status === 429) {
        setError('Too many requests. Wait a few minutes and try again.');
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        setError(detail || `Reset failed (${res.status}).`);
        setSubmitting(false);
        return;
      }
      // Send the user to /login with a one-time success notice.
      navigate('/login?reset=ok', { replace: true });
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `Could not reach the server. ${err.message}`
          : 'Could not reach the server.',
      );
      setSubmitting(false);
    }
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
        Set a new password.
      </h1>
      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: 'var(--color-text-2)',
          marginBottom: 20,
        }}
      >
        Pick something at least 8 characters. After you save, sign in
        with the new password.
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
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <AuthField
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          placeholder="Type it again"
          autoComplete="new-password"
          minLength={8}
          required
        />

        <button
          type="submit"
          disabled={submitting || !password || !confirm}
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
            opacity: submitting || !password || !confirm ? 0.6 : 1,
          }}
        >
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  );
}
