import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await register(email, password, displayName || undefined);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    padding: '10px 14px',
    color: 'var(--color-text-1)',
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 150ms',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-text-2)',
    marginBottom: 6,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'var(--color-accent-dim)',
              marginBottom: 16,
            }}
          >
            <UserPlus size={22} style={{ color: 'var(--color-accent-text)' }} />
          </div>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(28px, 4vw, 36px)',
              lineHeight: 1.05,
              color: 'var(--color-text-1)',
              marginBottom: 6,
            }}
          >
            Create your account
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--color-text-2)' }}>
            Free. Track what matters to you.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {error && (
            <div
              style={{
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

          <div>
            <label style={labelStyle}>Display name (optional)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              borderRadius: 10,
              background: 'var(--color-accent)',
              color: '#07090C',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '12px 16px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'opacity 150ms',
              marginTop: 4,
            }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>

          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              color: 'var(--color-text-3)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Free tier includes watchlist, weekly digest, and full platform access.
          </p>
        </form>

        <p
          style={{
            textAlign: 'center',
            marginTop: 24,
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: 'var(--color-text-3)',
          }}
        >
          Already have an account?{' '}
          <Link
            to="/login"
            style={{
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
