import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MapPin, Check, ArrowRight, AlertTriangle, Vote, TrendingUp, Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';
import Footer from '../components/Footer';

const API_BASE = getApiBaseUrl();

const SECTOR_OPTIONS = [
  { value: 'politics', label: 'Politics', checked: true },
  { value: 'finance', label: 'Finance', checked: true },
  { value: 'health', label: 'Health', checked: true },
  { value: 'technology', label: 'Technology', checked: true },
  { value: 'energy', label: 'Energy', checked: true },
  { value: 'transportation', label: 'Transportation', checked: true },
];

// Party token colors — parallel hex for opacity variants
const PARTY_HEX: Record<string, string> = {
  D: '#4A7FDE',
  R: '#E05555',
  I: '#B06FD8',
};
const PARTY_TOKEN: Record<string, string> = {
  D: 'var(--color-dem)',
  R: 'var(--color-rep)',
  I: 'var(--color-ind)',
};

interface DigestPreviewRep {
  name: string;
  party: string;
  chamber: string;
  person_id: string;
  photo_url?: string;
  trades: Array<{
    ticker: string;
    asset_name?: string;
    transaction_type: string;
    amount_range: string;
    transaction_date: string | null;
  }>;
  votes: Array<{
    question: string;
    vote_date: string | null;
    result: string;
    position: string;
    related_bill: string | null;
  }>;
  anomalies: Array<{
    pattern_type: string;
    title: string;
    score: number;
  }>;
}

interface DigestPreview {
  zip_code: string;
  state: string;
  representatives: DigestPreviewRep[];
  generated_at: string;
  message?: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: '10px 14px 10px 40px',
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

export default function DigestSignupPage() {
  const [email, setEmail] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [sectors, setSectors] = useState<Record<string, boolean>>(
    Object.fromEntries(SECTOR_OPTIONS.map((s) => [s.value, s.checked]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const selectedSectors = Object.entries(sectors)
      .filter(([, v]) => v)
      .map(([k]) => k);

    try {
      const res = await fetch(`${API_BASE}/digest/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Lowercase email defensively — emails are case-insensitive per RFC 5321,
        // and uppercase submissions from autofill/mobile keyboards were creating
        // duplicate rows that couldn't match the server-side dedup check.
        body: JSON.stringify({ email: email.trim().toLowerCase(), zip_code: zipCode, sectors: selectedSectors }),
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

  const loadPreview = async () => {
    const cleaned = zipCode.replace(/\D/g, '').slice(0, 5);
    if (cleaned.length !== 5) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`${API_BASE}/digest/preview/${cleaned}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Preview failed');
      setPreview(data);
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : 'Could not load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
      }}
    >
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'var(--color-accent-dim)',
              marginBottom: 20,
            }}
          >
            <Mail size={24} style={{ color: 'var(--color-accent-text)' }} />
          </div>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(32px, 5vw, 48px)',
              lineHeight: 1.05,
              color: 'var(--color-text-1)',
              marginBottom: 12,
            }}
          >
            Your weekly influence report
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
              color: 'var(--color-text-2)',
              maxWidth: 520,
              margin: '0 auto',
              lineHeight: 1.55,
            }}
          >
            A personalized email about what your representatives did this week &mdash; trades, votes, lobbying, and more.
          </p>
        </div>

        {submitted ? (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid rgba(61,184,122,0.25)',
              background: 'rgba(61,184,122,0.08)',
              padding: '32px 24px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(61,184,122,0.15)',
                marginBottom: 16,
              }}
            >
              <Check size={22} style={{ color: 'var(--color-green)' }} />
            </div>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: 24,
                color: 'var(--color-text-1)',
                marginBottom: 8,
              }}
            >
              You're subscribed
            </h2>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                color: 'var(--color-text-2)',
                lineHeight: 1.6,
                marginBottom: 20,
              }}
            >
              Check your email to verify your subscription. Once verified, you'll receive your first weekly digest.
            </p>
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-accent-text)',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
            >
              <ArrowRight size={14} /> Back to home
            </Link>
          </div>
        ) : (
          <>
            {/* Subscription form */}
            <form
              onSubmit={handleSubmit}
              style={{
                borderRadius: 12,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                padding: 24,
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <div>
                  <label style={labelStyle}>Email address</label>
                  <div style={{ position: 'relative' }}>
                    <Mail
                      size={15}
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-text-3)',
                        pointerEvents: 'none',
                      }}
                    />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      style={inputStyle}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Zip code</label>
                  <div style={{ position: 'relative' }}>
                    <MapPin
                      size={15}
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-text-3)',
                        pointerEvents: 'none',
                      }}
                    />
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      maxLength={5}
                      pattern="[0-9]{5}"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                      placeholder="90210"
                      style={inputStyle}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                    />
                  </div>
                </div>
              </div>

              {/* Sector checkboxes */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ ...labelStyle, marginBottom: 10 }}>Sectors to track</label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 8,
                  }}
                >
                  {SECTOR_OPTIONS.map((s) => {
                    const isChecked = sectors[s.value];
                    return (
                      <label
                        key={s.value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          borderRadius: 10,
                          border: `1px solid ${isChecked ? 'var(--color-accent)' : 'var(--color-border)'}`,
                          background: isChecked ? 'var(--color-accent-dim)' : 'var(--color-surface-2)',
                          padding: '10px 12px',
                          cursor: 'pointer',
                          transition: 'all 150ms',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => setSectors({ ...sectors, [s.value]: e.target.checked })}
                          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                        />
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: `1px solid ${isChecked ? 'var(--color-accent)' : 'var(--color-border-hover)'}`,
                            background: isChecked ? 'var(--color-accent)' : 'transparent',
                            flexShrink: 0,
                          }}
                        >
                          {isChecked && <Check size={11} strokeWidth={3} style={{ color: '#07090C' }} />}
                        </div>
                        <span
                          style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 13,
                            fontWeight: 500,
                            color: isChecked ? 'var(--color-text-1)' : 'var(--color-text-2)',
                          }}
                        >
                          {s.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {submitError && (
                <div
                  style={{
                    marginBottom: 16,
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
                disabled={submitting || !email || zipCode.length !== 5}
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
                  cursor: submitting || !email || zipCode.length !== 5 ? 'not-allowed' : 'pointer',
                  opacity: submitting || !email || zipCode.length !== 5 ? 0.4 : 1,
                  transition: 'opacity 150ms',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Subscribing...
                  </>
                ) : (
                  <>
                    <Mail size={16} />
                    Subscribe to weekly digest
                  </>
                )}
              </button>
            </form>

            {/* Preview section */}
            <div
              style={{
                borderRadius: 12,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                padding: 24,
              }}
            >
              <h3
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--color-text-1)',
                  marginBottom: 6,
                }}
              >
                Preview your digest
              </h3>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  color: 'var(--color-text-2)',
                  marginBottom: 14,
                  lineHeight: 1.5,
                }}
              >
                Enter your zip code above, then click below to see a sample of what you'll receive.
              </p>
              <button
                onClick={loadPreview}
                disabled={previewLoading || zipCode.length !== 5}
                style={{
                  borderRadius: 10,
                  border: '1px solid var(--color-border-hover)',
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text-1)',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '10px 18px',
                  cursor: previewLoading || zipCode.length !== 5 ? 'not-allowed' : 'pointer',
                  opacity: previewLoading || zipCode.length !== 5 ? 0.4 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'background 150ms',
                }}
              >
                {previewLoading ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Loading preview...
                  </>
                ) : (
                  <>
                    Preview for{' '}
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontSize: 12,
                        color: 'var(--color-accent-text)',
                      }}
                    >
                      {zipCode || '?????'}
                    </span>
                  </>
                )}
              </button>

              {previewError && (
                <div
                  style={{
                    marginTop: 14,
                    borderRadius: 8,
                    background: 'rgba(230,57,70,0.08)',
                    border: '1px solid rgba(230,57,70,0.25)',
                    padding: '10px 14px',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    color: 'var(--color-red)',
                  }}
                >
                  {previewError}
                </div>
              )}

              {preview && (
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Preview meta */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 10,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      fontSize: 11,
                      color: 'var(--color-text-3)',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={12} /> Zip {preview.zip_code}
                    </span>
                    <span style={{ color: 'var(--color-border-hover)' }}>|</span>
                    <span>State {preview.state}</span>
                    <span style={{ color: 'var(--color-border-hover)' }}>|</span>
                    <span>
                      {preview.representatives.length} representative{preview.representatives.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {preview.representatives.map((rep) => {
                    const partyToken = PARTY_TOKEN[rep.party] || 'var(--color-text-2)';
                    const partyHex = PARTY_HEX[rep.party] || 'rgba(235,229,213,0.5)';
                    return (
                      <div
                        key={rep.person_id}
                        style={{
                          borderRadius: 10,
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface-2)',
                          padding: 16,
                        }}
                      >
                        {/* Rep header */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 14,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Link
                            to={`/politics/people/${rep.person_id}`}
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontSize: 14,
                              fontWeight: 600,
                              color: 'var(--color-text-1)',
                              textDecoration: 'none',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
                          >
                            {rep.name}
                          </Link>
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 11,
                              fontWeight: 600,
                              color: partyToken,
                              background: `${partyHex}1F`,
                              border: `1px solid ${partyHex}30`,
                              padding: '2px 8px',
                              borderRadius: 999,
                            }}
                          >
                            {rep.party}
                          </span>
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              fontSize: 10,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: 'var(--color-text-3)',
                              background: 'var(--color-bg)',
                              padding: '3px 8px',
                              borderRadius: 4,
                            }}
                          >
                            {rep.chamber}
                          </span>
                        </div>

                        {/* Trades */}
                        {rep.trades.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                marginBottom: 8,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: 10,
                                fontWeight: 600,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: 'var(--color-green)',
                              }}
                            >
                              <TrendingUp size={12} /> Trades ({rep.trades.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {rep.trades.slice(0, 5).map((t, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontFamily: "'Inter', sans-serif",
                                    fontSize: 12,
                                    color: 'var(--color-text-2)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                      fontSize: 10,
                                      fontWeight: 700,
                                      letterSpacing: '0.04em',
                                      color: t.transaction_type === 'purchase' ? 'var(--color-green)' : 'var(--color-red)',
                                    }}
                                  >
                                    {t.transaction_type === 'purchase' ? 'BUY' : 'SELL'}
                                  </span>
                                  <span
                                    style={{
                                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                      fontSize: 12,
                                      color: 'var(--color-text-1)',
                                    }}
                                  >
                                    {t.ticker || t.asset_name}
                                  </span>
                                  <span style={{ color: 'var(--color-text-3)' }}>{t.amount_range}</span>
                                  {t.transaction_date && (
                                    <span
                                      style={{
                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                        fontSize: 11,
                                        color: 'var(--color-text-3)',
                                      }}
                                    >
                                      {t.transaction_date}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Votes */}
                        {rep.votes.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                marginBottom: 8,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: 10,
                                fontWeight: 600,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: 'var(--color-dem)',
                              }}
                            >
                              <Vote size={12} /> Votes ({rep.votes.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {rep.votes.slice(0, 5).map((v, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontFamily: "'Inter', sans-serif",
                                    fontSize: 12,
                                    color: 'var(--color-text-2)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                      fontSize: 10,
                                      fontWeight: 700,
                                      letterSpacing: '0.04em',
                                      color:
                                        v.position === 'Yea'
                                          ? 'var(--color-green)'
                                          : v.position === 'Nay'
                                          ? 'var(--color-red)'
                                          : 'var(--color-text-3)',
                                    }}
                                  >
                                    {v.position}
                                  </span>
                                  <span
                                    style={{
                                      color: 'var(--color-text-1)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      flex: 1,
                                      minWidth: 0,
                                    }}
                                  >
                                    {v.question}
                                  </span>
                                  {v.related_bill && (
                                    <span
                                      style={{
                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                        fontSize: 11,
                                        color: 'var(--color-text-3)',
                                      }}
                                    >
                                      {v.related_bill}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Anomalies */}
                        {rep.anomalies.length > 0 && (
                          <div>
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                marginBottom: 8,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: 10,
                                fontWeight: 600,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: 'var(--color-accent-text)',
                              }}
                            >
                              <AlertTriangle size={12} /> Suspicious patterns ({rep.anomalies.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {rep.anomalies.map((a, i) => {
                                const scoreColor =
                                  a.score >= 8
                                    ? 'var(--color-red)'
                                    : a.score >= 6
                                    ? '#F59E0B'
                                    : 'var(--color-accent-text)';
                                const scoreBg =
                                  a.score >= 8
                                    ? 'rgba(230,57,70,0.15)'
                                    : a.score >= 6
                                    ? 'rgba(245,158,11,0.15)'
                                    : 'var(--color-accent-dim)';
                                return (
                                  <div
                                    key={i}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      fontFamily: "'Inter', sans-serif",
                                      fontSize: 12,
                                      color: 'var(--color-text-2)',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: scoreColor,
                                        background: scoreBg,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                      }}
                                    >
                                      {a.score.toFixed(0)}
                                    </span>
                                    <span style={{ color: 'var(--color-text-1)' }}>{a.title}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {rep.trades.length === 0 && rep.votes.length === 0 && rep.anomalies.length === 0 && (
                          <p
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontSize: 12,
                              color: 'var(--color-text-3)',
                              fontStyle: 'italic',
                              margin: 0,
                            }}
                          >
                            No activity in the last 7 days
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
