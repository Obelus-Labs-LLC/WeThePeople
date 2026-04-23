import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
        {/* Header */}
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
            <LogIn size={22} style={{ color: 'var(--color-accent-text)' }} />
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
            Log in
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--color-text-2)' }}>
            Track politicians, companies, and influence.
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
              placeholder="Your password"
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
            {loading ? 'Logging in…' : 'Log in'}
          </button>
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
          No account?{' '}
          <Link
            to="/signup"
            style={{
              color: 'var(--color-accent-text)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Create one free
          </Link>
        </p>
      </div>
    </div>
  );
}
