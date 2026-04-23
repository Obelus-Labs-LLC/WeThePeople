import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { User, Star, Shield, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PRESS_TIER_PRICE } from '../config';

interface WatchlistItem {
  id: number;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  sector: string;
  created_at: string;
}

// Role badge tokens: label + color token
const ROLE_BADGE: Record<string, { label: string; token: string; bgHex: string }> = {
  free:       { label: 'Free',       token: 'var(--color-text-2)',   bgHex: 'rgba(235,229,213,0.08)' },
  pro:        { label: 'Pro',        token: 'var(--color-dem)',      bgHex: 'rgba(74,127,222,0.15)' },
  enterprise: { label: 'Enterprise', token: 'var(--color-accent-text)', bgHex: 'rgba(197,160,40,0.15)' },
  admin:      { label: 'Admin',      token: 'var(--color-red)',      bgHex: 'rgba(230,57,70,0.15)' },
};

export default function AccountPage() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [wlLoading, setWlLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) return;
    const token = localStorage.getItem('wtp_access_token');
    fetch('/api/auth/watchlist', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((d) => { if (!cancelled) setWatchlist(d.items || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setWlLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const removeItem = async (id: number) => {
    const token = localStorage.getItem('wtp_access_token');
    try {
      const res = await fetch(`/api/auth/watchlist/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(res.statusText);
      setWatchlist((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // Delete failed — don't remove from UI
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            height: 32,
            width: 32,
            borderRadius: '50%',
            border: '2px solid var(--color-border)',
            borderTopColor: 'var(--color-accent)',
            animation: 'spin 1s linear infinite',
          }}
        />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const badge = ROLE_BADGE[user?.role || 'free'] || ROLE_BADGE.free;

  const cardBox: React.CSSProperties = {
    borderRadius: 12,
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    padding: 20,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
        padding: '48px 16px 64px',
      }}
    >
      <div
        style={{
          maxWidth: 800,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 900,
              fontSize: 'clamp(32px, 5vw, 44px)',
              lineHeight: 1.05,
              color: 'var(--color-text-1)',
            }}
          >
            Your account
          </h1>
          <Link
            to="/"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-text-2)',
              textDecoration: 'none',
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)'; }}
          >
            Back to home
          </Link>
        </div>

        {/* Profile */}
        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--color-surface-2)',
              }}
            >
              <User size={26} style={{ color: 'var(--color-text-2)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 16,
                    fontWeight: 600,
                    color: 'var(--color-text-1)',
                  }}
                >
                  {user?.display_name || user?.email}
                </span>
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    color: badge.token,
                    background: badge.bgHex,
                  }}
                >
                  {badge.label}
                </span>
              </div>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-3)' }}>
                {user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Watchlist */}
        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Star size={18} style={{ color: 'var(--color-accent-text)' }} />
            <h2
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--color-text-1)',
              }}
            >
              Your watchlist
            </h2>
            <span style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12, color: 'var(--color-text-3)' }}>
              ({watchlist.length})
            </span>
          </div>
          {wlLoading ? (
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-3)' }}>
              Loading…
            </p>
          ) : watchlist.length === 0 ? (
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--color-text-3)', lineHeight: 1.6 }}>
              No items tracked yet. Browse politicians and companies and click the star icon to add them.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 10,
              }}
            >
              {watchlist.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-2)',
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Link
                      to={item.entity_type === 'politician'
                        ? `/politics/people/${item.entity_id}`
                        : `/${item.sector || 'tech'}/companies/${item.entity_id}`}
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--color-text-1)',
                        textDecoration: 'none',
                        transition: 'color 150ms',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-text)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-1)'; }}
                    >
                      {item.entity_name || item.entity_id}
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 11,
                          color: 'var(--color-text-3)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {item.entity_type}
                      </span>
                      {item.sector && (
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--color-text-3)' }}>
                          {item.sector}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    style={{
                      padding: 6,
                      borderRadius: 8,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-text-3)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 150ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(230,57,70,0.10)';
                      e.currentTarget.style.color = 'var(--color-red)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--color-text-3)';
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upgrade tier */}
        {user?.role === 'free' && (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid rgba(197,160,40,0.30)',
              background: 'var(--color-accent-dim)',
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Shield size={18} style={{ color: 'var(--color-accent-text)' }} />
              <h2
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--color-accent-text)',
                }}
              >
                Upgrade to Enterprise
              </h2>
            </div>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: 'var(--color-text-2)',
                marginBottom: 14,
                lineHeight: 1.55,
              }}
            >
              Get full API access, the verification pipeline, and bulk data exports.
            </p>
            <button
              onClick={async () => {
                const token = localStorage.getItem('wtp_access_token');
                try {
                  const r = await fetch('/api/auth/checkout/enterprise', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const d = await r.json();
                  if (d.checkout_url) window.location.href = d.checkout_url;
                  else alert(d.detail || 'Checkout unavailable');
                } catch {
                  alert('Checkout unavailable');
                }
              }}
              style={{
                borderRadius: 10,
                background: 'var(--color-accent)',
                color: '#07090C',
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '10px 16px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Upgrade — {PRESS_TIER_PRICE} (7-day free trial)
            </button>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          style={{
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 10,
            border: '1px solid var(--color-border)',
            background: 'transparent',
            padding: '10px 16px',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: 'var(--color-text-2)',
            cursor: 'pointer',
            transition: 'all 150ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-text-1)';
            e.currentTarget.style.borderColor = 'var(--color-border-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-2)';
            e.currentTarget.style.borderColor = 'var(--color-border)';
          }}
        >
          <LogOut size={14} />
          Log out
        </button>
      </div>
    </div>
  );
}
