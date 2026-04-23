import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, ShieldCheck, MapPin, CheckCircle2 } from 'lucide-react';
import { fetchVerificationStatus, verifyResidence } from '../api/civic';
import { useAuth } from '../contexts/AuthContext';

// ── Level ladder ──

const LEVEL_INFO: Array<{ label: string; desc: string; token: string; hex: string }> = [
  {
    label: 'Unverified',
    desc: 'Email confirmed. Basic access.',
    token: 'var(--color-text-3)',
    hex: '#B4ADA0',
  },
  {
    label: 'Residence Verified',
    desc: 'ZIP code confirmed. District-specific content unlocked.',
    token: 'var(--color-accent-text)',
    hex: '#C5A028',
  },
  {
    label: 'Document Verified',
    desc: 'Full identity verified. Maximum trust level.',
    token: 'var(--color-green)',
    hex: '#3DB87A',
  },
];

// ── Shared styles ──

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const contentWrap: React.CSSProperties = {
  maxWidth: '720px',
  margin: '0 auto',
  padding: '64px 24px 96px',
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 12px',
  borderRadius: '999px',
  background: 'var(--color-accent-dim)',
  color: 'var(--color-accent-text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '20px',
};

const backLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--color-text-2)',
  textDecoration: 'none',
  marginBottom: '24px',
  transition: 'color 0.2s',
};

// ── Page ──

export default function CivicVerifyPage() {
  const { isAuthenticated } = useAuth();
  const [level, setLevel] = useState(0);
  const [verifiedState, setVerifiedState] = useState<string | null>(null);
  const [verifiedZip, setVerifiedZip] = useState<string | null>(null);
  const [zip, setZip] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) return;
    fetchVerificationStatus()
      .then((data) => {
        if (cancelled) return;
        setLevel(data.level);
        setVerifiedState(data.verified_state);
        setVerifiedZip(data.verified_zip);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const handleVerify = async () => {
    if (!zip.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await verifyResidence(zip.trim());
      setMessage(res.message);
      setLevel(res.level);
      setVerifiedState(res.state);
      setVerifiedZip(res.zip);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    }
    setSubmitting(false);
  };

  return (
    <main id="main-content" style={pageShell}>
      <div style={contentWrap}>
        <Link
          to="/civic"
          style={backLink}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
        >
          <ArrowLeft size={14} /> Civic Hub
        </Link>

        <span style={eyebrowStyle}>Civic / Verification</span>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: 'clamp(40px, 6vw, 64px)',
            lineHeight: 1.02,
            letterSpacing: '-0.02em',
            margin: '0 0 12px',
            color: 'var(--color-text-1)',
          }}
        >
          Citizen <span style={{ color: 'var(--color-accent-text)' }}>verification</span>
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '16px',
            lineHeight: 1.55,
            color: 'var(--color-text-2)',
            margin: '0 0 40px',
          }}
        >
          Verify your identity to unlock district-specific features and increase the weight of your civic participation.
        </p>

        {/* Tier ladder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '40px' }}>
          {LEVEL_INFO.map((info, i) => {
            const active = level >= i;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  borderRadius: '14px',
                  padding: '16px',
                  border: `1px solid ${active ? `${info.hex}33` : 'rgba(235,229,213,0.06)'}`,
                  background: active ? `${info.hex}14` : 'var(--color-surface)',
                  opacity: active ? 1 : 0.5,
                  transition: 'all 0.25s',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: active ? `${info.hex}26` : 'var(--color-surface-2)',
                  }}
                >
                  {active ? (
                    <CheckCircle2 size={20} style={{ color: info.token }} />
                  ) : (
                    <span
                      style={{
                        color: 'var(--color-text-3)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                      }}
                    >
                      {i}
                    </span>
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: active ? info.token : 'var(--color-text-3)',
                    }}
                  >
                    {info.label}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-text-2)', marginTop: '2px' }}>
                    {info.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!isAuthenticated ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 24px',
              background: 'var(--color-surface)',
              borderRadius: '16px',
              border: '1px solid rgba(235,229,213,0.08)',
            }}
          >
            <Shield size={32} style={{ color: 'var(--color-text-3)', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-text-2)', margin: '0 0 12px' }}>
              You must be logged in to verify your identity.
            </p>
            <Link
              to="/login"
              style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-accent-text)', textDecoration: 'none' }}
            >
              Log in →
            </Link>
          </div>
        ) : level >= 1 ? (
          <div
            style={{
              padding: '24px',
              borderRadius: '16px',
              border: '1px solid rgba(61,184,122,0.28)',
              background: 'rgba(61,184,122,0.08)',
              textAlign: 'center',
            }}
          >
            <ShieldCheck size={32} style={{ color: 'var(--color-green)', margin: '0 auto 12px', display: 'block' }} />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--color-green)',
                margin: '0 0 6px',
              }}
            >
              Residence Verified
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-text-2)', margin: 0 }}>
              {verifiedZip && (
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-1)' }}>{verifiedZip}</span>
              )}
              {verifiedState && <span> — {verifiedState}</span>}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-text-3)', marginTop: '12px' }}>
              District-specific features are unlocked.
            </p>
          </div>
        ) : (
          <div
            style={{
              padding: '24px',
              borderRadius: '16px',
              border: '1px solid rgba(235,229,213,0.08)',
              background: 'var(--color-surface)',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--color-text-2)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                margin: '0 0 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <MapPin size={14} style={{ color: 'var(--color-accent-text)' }} />
              Verify your residence
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-text-2)', margin: '0 0 16px', lineHeight: 1.55 }}>
              Enter your ZIP code to confirm your congressional district. This unlocks district-specific representative data and increases the weight of your votes.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="Enter ZIP code"
                maxLength={5}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: 'var(--color-surface-2)',
                  border: '1px solid rgba(235,229,213,0.1)',
                  borderRadius: '10px',
                  color: 'var(--color-text-1)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(235,229,213,0.1)'; }}
              />
              <button
                onClick={handleVerify}
                disabled={zip.length < 5 || submitting}
                style={{
                  padding: '12px 22px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--color-accent)',
                  color: '#07090C',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  cursor: zip.length < 5 || submitting ? 'not-allowed' : 'pointer',
                  opacity: zip.length < 5 || submitting ? 0.5 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {submitting ? 'Verifying…' : 'Verify'}
              </button>
            </div>
            {message && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-green)', marginTop: '12px' }}>
                {message}
              </p>
            )}
            {error && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-red)', marginTop: '12px' }}>
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
