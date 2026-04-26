import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getApiBaseUrl } from '../api/client';
import { PRESS_TIER_PRICE } from '../config';

const API_BASE = getApiBaseUrl();

/**
 * Account page redesign. Tabbed layout matching the design handoff:
 *   Profile | Notifications | Follows | API Keys | Billing | Danger Zone
 *
 * All real backend data stays wired up:
 *   - Profile tab reads user + watchlist counts
 *   - Follows tab shows the watchlist with unfollow action
 *   - API Keys tab hits /api/auth/api-keys (GET/POST/DELETE)
 *   - Billing tab shows the Enterprise upgrade checkout flow
 *   - Notifications and Danger Zone surface what would be available without
 *     creating fake endpoints (save handler = "Not yet wired" alert).
 */

interface WatchlistItem {
  id: number;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  sector: string;
  created_at: string;
}

// Map a watchlist row to its detail URL. Routes are registered as
// `/{sector}/:companyId` (no `/companies/` segment), and finance uses
// `/finance/:institution_id`. Returns `null` if we don't know how to
// link this entity, so the caller can render a non-link fallback —
// avoids the 404 that the previous unconditional URL produced for any
// non-politician entity_type.
function watchlistItemUrl(item: WatchlistItem): string | null {
  if (item.entity_type === 'politician' || item.entity_type === 'person') {
    return `/politics/people/${item.entity_id}`;
  }
  if (item.entity_type === 'bill') {
    return `/politics/bill/${item.entity_id}`;
  }
  if (item.entity_type === 'institution' || item.sector === 'finance') {
    return `/finance/${item.entity_id}`;
  }
  if (item.entity_type === 'company') {
    const sector = item.sector || 'technology';
    // Sector slugs in the watchlist sometimes use the API slug (`tech`)
    // and the route uses `/technology/`. Normalise here.
    const routeSector = sector === 'tech' ? 'technology' : sector;
    return `/${routeSector}/${item.entity_id}`;
  }
  if (item.entity_type === 'sector' && item.sector) {
    const routeSector = item.sector === 'tech' ? 'technology' : item.sector;
    return `/${routeSector}`;
  }
  return null;
}

interface APIKey {
  id: number;
  name: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
}

type TabId =
  | 'profile'
  | 'notifications'
  | 'follows'
  | 'apikeys'
  | 'billing'
  | 'dangerzone';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'follows', label: 'Follows' },
  { id: 'apikeys', label: 'API Keys' },
  { id: 'billing', label: 'Billing' },
  { id: 'dangerzone', label: 'Danger Zone' },
];

const ROLE_BADGE: Record<string, { label: string; token: string; bg: string }> = {
  free: {
    label: 'Free',
    token: 'var(--color-text-2)',
    bg: 'rgba(235,229,213,0.08)',
  },
  pro: {
    label: 'Pro',
    token: 'var(--color-dem)',
    bg: 'rgba(74,127,222,0.15)',
  },
  enterprise: {
    label: 'Enterprise',
    token: 'var(--color-accent-text)',
    bg: 'var(--color-accent-dim)',
  },
  admin: {
    label: 'Admin',
    token: 'var(--color-red)',
    bg: 'rgba(230,57,70,0.15)',
  },
};

// ── Styles ────────────────────────────────────────────────────────────

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text-1)',
};

const card: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: 24,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontStyle: 'italic',
  fontWeight: 700,
  fontSize: 18,
  color: 'var(--color-text-1)',
  marginBottom: 14,
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-2)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const fieldInput: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 8,
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-1)',
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  border: '1.5px solid var(--color-border)',
  outline: 'none',
  transition: 'border-color 0.15s',
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  background: 'var(--color-accent)',
  color: '#07090C',
  border: 'none',
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--color-text-1)',
  border: '1px solid var(--color-border-hover)',
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const overlineStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-3)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 8,
};

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

// ── Main ─────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { user, isAuthenticated, loading, logout, authedFetch } = useAuth();

  // Tab is driven by `?tab=` so deep-links from UserMenu / external nav
  // land on the right pane (e.g. /account?tab=follows for the watchlist).
  // Falls back to 'profile' for unknown / missing values.
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs: TabId[] = ['profile', 'notifications', 'follows', 'apikeys', 'billing', 'dangerzone'];
  const initialTab = (() => {
    const q = searchParams.get('tab');
    return (q && (validTabs as string[]).includes(q)) ? (q as TabId) : 'profile';
  })();
  const [tab, _setTab] = useState<TabId>(initialTab);
  const setTab = (next: TabId) => {
    _setTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'profile') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  // Watchlist (real data) - track an explicit error so the empty list is
  // not silently shown when the API actually failed.
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [wlLoading, setWlLoading] = useState(true);
  const [wlError, setWlError] = useState<string | null>(null);

  // API keys (real data)
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [akLoading, setAkLoading] = useState(true);
  const [akError, setAkError] = useState<string | null>(null);
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);

  // Local-only notification preferences until backend lands
  const [notifDigest, setNotifDigest] = useState(true);
  const [notifAnomaly, setNotifAnomaly] = useState(true);
  const [notifInvest, setNotifInvest] = useState(false);
  const [notifUpdates, setNotifUpdates] = useState(false);

  // Profile editor state (display_name is backend-persisted; zip is local-only)
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [zipCode, setZipCode] = useState('');

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name ?? '');
      setEmail(user.email);
    }
  }, [user]);

  // Watchlist fetch — uses authedFetch so a 401 mid-session triggers
  // refresh + replay instead of silently rendering "no items".
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setWlError(null);
    authedFetch(`${API_BASE}/auth/watchlist`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setWatchlist(d.items || []);
      })
      .catch((err) => {
        console.warn('[AccountPage] watchlist fetch failed:', err);
        if (!cancelled) setWlError(err?.message || 'Could not load watchlist');
      })
      .finally(() => {
        if (!cancelled) setWlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authedFetch]);

  // API keys fetch
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setAkError(null);
    authedFetch(`${API_BASE}/auth/api-keys`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setApiKeys(Array.isArray(d) ? d : []);
      })
      .catch((err) => {
        console.warn('[AccountPage] api-keys fetch failed:', err);
        if (!cancelled) setAkError(err?.message || 'Could not load API keys');
      })
      .finally(() => {
        if (!cancelled) setAkLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authedFetch]);

  const removeWatchlist = async (id: number) => {
    // Optimistic remove. On failure, restore the row and show why so the
    // user isn't left thinking the unfollow worked.
    const removed = watchlist.find((i) => i.id === id);
    setWatchlist((prev) => prev.filter((i) => i.id !== id));
    try {
      const res = await authedFetch(`${API_BASE}/auth/watchlist/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('[AccountPage] watchlist delete failed:', err);
      if (removed) setWatchlist((prev) => [removed, ...prev]);
      alert('Could not remove item from watchlist. Try again.');
    }
  };

  const createKey = async () => {
    const name = window.prompt('Name for this API key?', 'Production');
    if (!name) return;
    try {
      const res = await authedFetch(`${API_BASE}/auth/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes: ['read'] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || `Could not create key (HTTP ${res.status})`);
        return;
      }
      const data = await res.json().catch(() => null);
      // Validate response shape before mutating local state. A backend
      // shape drift (renamed field, missing id) used to cause runtime
      // TypeErrors when the new key was rendered.
      if (
        !data ||
        typeof data !== 'object' ||
        typeof data.id !== 'number' ||
        typeof data.raw_key !== 'string' ||
        typeof data.name !== 'string'
      ) {
        console.warn('[AccountPage] unexpected /auth/api-keys POST shape:', data);
        alert('Key created, but the server returned an unexpected shape. Refresh the page to see it.');
        return;
      }
      setNewKeyRaw(data.raw_key);
      setApiKeys((prev) => [
        {
          id: data.id,
          name: data.name,
          scopes: Array.isArray(data.scopes) ? data.scopes : ['read'],
          created_at: data.created_at ?? new Date().toISOString(),
          expires_at: data.expires_at ?? null,
          is_active: true,
        },
        ...prev,
      ]);
    } catch (err) {
      console.warn('[AccountPage] createKey failed:', err);
      alert('Network error creating key. Check your connection and try again.');
    }
  };

  const revokeKey = async (id: number) => {
    if (!window.confirm('Revoke this key? This cannot be undone.')) return;
    try {
      const res = await authedFetch(`${API_BASE}/auth/api-keys/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      console.warn('[AccountPage] revokeKey failed:', err);
      alert('Could not revoke key.');
    }
  };

  const upgradeEnterprise = async () => {
    try {
      const r = await authedFetch(`${API_BASE}/auth/checkout/enterprise`, {
        method: 'POST',
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err.detail || `Checkout unavailable (HTTP ${r.status})`);
        return;
      }
      const d = await r.json();
      if (d.checkout_url) window.location.href = d.checkout_url;
      else alert(d.detail || 'Checkout unavailable');
    } catch (err) {
      console.warn('[AccountPage] upgradeEnterprise failed:', err);
      alert('Checkout unavailable. Try again in a moment.');
    }
  };

  const badge = useMemo(
    () => ROLE_BADGE[user?.role || 'free'] || ROLE_BADGE.free,
    [user?.role],
  );

  if (loading) {
    return (
      <div
        style={{
          ...pageShell,
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

  return (
    <div style={pageShell}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 32px 80px' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={overlineStyle}>Account Settings</div>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 700,
              fontSize: 'clamp(28px, 4vw, 36px)',
              color: 'var(--color-text-1)',
              marginBottom: 6,
            }}
          >
            {user?.display_name || user?.email?.split('@')[0] || 'Your account'}
          </h1>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-text-3)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span>{user?.email}</span>
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 999,
                color: badge.token,
                background: badge.bg,
              }}
            >
              {badge.label}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 20,
            borderBottom: '1px solid var(--color-border)',
            marginBottom: 28,
            overflowX: 'auto',
            flexWrap: 'nowrap',
          }}
        >
          {TABS.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  padding: '10px 0',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-text-1)' : 'var(--color-text-3)',
                  position: 'relative',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      left: 0,
                      right: 0,
                      height: 1.5,
                      background: 'var(--color-accent)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'profile' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
                gap: 24,
              }}
              className="account-grid"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={card}>
                  <h3 style={sectionTitle}>Profile</h3>
                  <div style={{ marginBottom: 14 }}>
                    <label style={fieldLabel}>Display Name</label>
                    <input
                      style={fieldInput}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={fieldLabel}>Email</label>
                    <input
                      style={fieldInput}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 11,
                        color: 'var(--color-text-3)',
                        marginTop: 5,
                      }}
                    >
                      Changing email requires re-verification.
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={fieldLabel}>ZIP Code</label>
                    <input
                      style={fieldInput}
                      inputMode="numeric"
                      maxLength={5}
                      value={zipCode}
                      onChange={(e) =>
                        setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))
                      }
                      placeholder="e.g. 94103"
                    />
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 11,
                        color: 'var(--color-text-3)',
                        marginTop: 5,
                      }}
                    >
                      Used to show your reps on the homepage.
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{ ...primaryBtn, marginTop: 4 }}
                    onClick={() =>
                      alert(
                        'Profile edit API is coming soon. Email wethepeopleforus@gmail.com to update for now.',
                      )
                    }
                  >
                    Save changes
                  </button>
                </div>

                <div style={card}>
                  <h3 style={sectionTitle}>Password</h3>
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      color: 'var(--color-text-2)',
                      lineHeight: 1.5,
                      marginBottom: 12,
                    }}
                  >
                    Self-serve password change is not yet wired up. Until it
                    is, email <strong>wethepeopleforus@gmail.com</strong> from
                    your account address and we will reset it manually within
                    one business day.
                  </div>
                  <a
                    href="mailto:wethepeopleforus@gmail.com?subject=Password%20reset%20request"
                    style={{ ...secondaryBtn, marginTop: 4, display: 'inline-block', textDecoration: 'none' }}
                  >
                    Email password reset
                  </a>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Impact card */}
                <div
                  style={{
                    background: 'var(--color-accent-dim)',
                    border: '1px solid rgba(197,160,40,0.3)',
                    borderRadius: 12,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--color-accent-text)',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    Your Impact
                  </div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      fontSize: 32,
                      fontWeight: 700,
                      color: 'var(--color-accent-text)',
                      lineHeight: 1,
                      marginBottom: 4,
                    }}
                  >
                    {watchlist.length}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12,
                      color: 'var(--color-text-2)',
                    }}
                  >
                    entit{watchlist.length === 1 ? 'y' : 'ies'} followed
                  </div>
                  <div
                    style={{
                      height: 1,
                      background: 'rgba(197,160,40,0.2)',
                      margin: '14px 0',
                    }}
                  />
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      fontSize: 22,
                      fontWeight: 700,
                      color: 'var(--color-text-1)',
                      marginBottom: 2,
                    }}
                  >
                    {apiKeys.length}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 11,
                      color: 'var(--color-text-2)',
                    }}
                  >
                    active API key{apiKeys.length === 1 ? '' : 's'}
                  </div>
                </div>

                {/* Logout */}
                <button
                  type="button"
                  onClick={logout}
                  style={{
                    ...secondaryBtn,
                    width: '100%',
                    textAlign: 'center',
                  }}
                >
                  Log out
                </button>
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div style={{ ...card, maxWidth: 720 }}>
              <h3 style={sectionTitle}>Notifications</h3>
              {[
                {
                  name: 'Weekly Digest',
                  desc: 'Top 5 stories and anomalies from last 7 days',
                  on: notifDigest,
                  set: setNotifDigest,
                },
                {
                  name: 'Breaking anomaly alerts',
                  desc: 'Only for politicians you follow — rare, <1/mo',
                  on: notifAnomaly,
                  set: setNotifAnomaly,
                },
                {
                  name: 'New investigations',
                  desc: 'When the Journal publishes a deep-dive',
                  on: notifInvest,
                  set: setNotifInvest,
                },
                {
                  name: 'Feature updates',
                  desc: 'New tools, site changes',
                  on: notifUpdates,
                  set: setNotifUpdates,
                },
              ].map((row) => (
                <div
                  key={row.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text-1)',
                      }}
                    >
                      {row.name}
                    </div>
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        color: 'var(--color-text-3)',
                      }}
                    >
                      {row.desc}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => row.set(!row.on)}
                    aria-pressed={row.on}
                    aria-label={`Toggle ${row.name}`}
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      background: row.on ? 'var(--color-accent)' : 'var(--color-surface-2)',
                      border: `1px solid ${row.on ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: row.on ? '#07090C' : 'var(--color-text-2)',
                        position: 'absolute',
                        top: 2,
                        left: row.on ? 18 : 2,
                        transition: 'left 0.15s',
                      }}
                    />
                  </button>
                </div>
              ))}
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  color: 'var(--color-text-3)',
                  marginTop: 14,
                }}
              >
                Preferences are stored locally until the notifications backend
                ships.
              </div>
            </div>
          )}

          {tab === 'follows' && (
            <div>
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  color: 'var(--color-text-3)',
                  marginBottom: 12,
                }}
              >
                {wlLoading
                  ? 'Loading\u2026'
                  : `${watchlist.length} entit${watchlist.length === 1 ? 'y' : 'ies'} followed · Get alerts when they have new votes, anomalies, or enforcement actions.`}
              </div>
              <div
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {wlError && !wlLoading && (
                  <div
                    style={{
                      padding: '24px 20px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      color: 'var(--color-red)',
                      lineHeight: 1.6,
                    }}
                  >
                    Could not load your watchlist: {wlError}. Refresh the page
                    to try again.
                  </div>
                )}
                {!wlError && watchlist.length === 0 && !wlLoading && (
                  <div
                    style={{
                      padding: '24px 20px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      color: 'var(--color-text-3)',
                      lineHeight: 1.6,
                    }}
                  >
                    Nothing here yet. Browse politicians and companies, then
                    click the star on a profile to follow them.
                  </div>
                )}
                {watchlist.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--color-border)',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {(() => {
                        const url = watchlistItemUrl(item);
                        const labelStyle = {
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--color-text-1)',
                          textDecoration: 'none',
                        } as const;
                        const label = item.entity_name || item.entity_id;
                        if (!url) {
                          return <span style={labelStyle}>{label}</span>;
                        }
                        return (
                          <Link
                            to={url}
                            style={labelStyle}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--color-accent-text)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--color-text-1)';
                            }}
                          >
                            {label}
                          </Link>
                        );
                      })()}
                      <div
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 11,
                          color: 'var(--color-text-3)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {item.entity_type}
                        {item.sector ? ` · ${item.sector}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeWatchlist(item.id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 6,
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--color-text-3)',
                        cursor: 'pointer',
                      }}
                    >
                      Unfollow
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'apikeys' && (
            <div style={{ maxWidth: 720 }}>
              {newKeyRaw && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: '1px solid rgba(197,160,40,0.4)',
                    background: 'var(--color-accent-dim)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--color-accent-text)',
                      marginBottom: 6,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    New key — copy it now
                  </div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      fontSize: 13,
                      color: 'var(--color-text-1)',
                      wordBreak: 'break-all',
                      marginBottom: 8,
                    }}
                  >
                    {newKeyRaw}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(newKeyRaw);
                      setNewKeyRaw(null);
                    }}
                    style={{
                      ...primaryBtn,
                      padding: '7px 14px',
                      fontSize: 12,
                    }}
                  >
                    Copy and dismiss
                  </button>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    color: 'var(--color-text-2)',
                  }}
                >
                  Free tier: 1,000 requests/day. Upgrade in the Billing tab.
                </div>
                <button
                  type="button"
                  onClick={createKey}
                  style={{
                    ...primaryBtn,
                    padding: '7px 14px',
                    fontSize: 12,
                  }}
                >
                  + New key
                </button>
              </div>

              <div
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {akLoading && (
                  <div
                    style={{
                      padding: '20px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      color: 'var(--color-text-3)',
                    }}
                  >
                    Loading keys\u2026
                  </div>
                )}
                {akError && !akLoading && (
                  <div
                    style={{
                      padding: '20px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      color: 'var(--color-red)',
                    }}
                  >
                    Could not load API keys: {akError}. Refresh the page to
                    try again.
                  </div>
                )}
                {!akError && !akLoading && apiKeys.length === 0 && (
                  <div
                    style={{
                      padding: '20px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      color: 'var(--color-text-3)',
                    }}
                  >
                    No API keys yet. Create one to programmatically access
                    WTP data.
                  </div>
                )}
                {apiKeys.map((k) => (
                  <div
                    key={k.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr) 120px 80px',
                      padding: '14px 20px',
                      gap: 12,
                      borderBottom: '1px solid var(--color-border)',
                      alignItems: 'center',
                    }}
                    className="apikey-row"
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--color-text-1)',
                        }}
                      >
                        {k.name}
                      </div>
                      <div
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 11,
                          color: 'var(--color-text-3)',
                        }}
                      >
                        Created {formatDate(k.created_at)}
                        {k.scopes?.length ? ` · ${k.scopes.join(', ')}` : ''}
                      </div>
                    </div>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontSize: 12,
                        color: 'var(--color-text-2)',
                        wordBreak: 'break-all',
                      }}
                    >
                      wtp_live_••••{String(k.id).padStart(4, '0')}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 11,
                        color: k.is_active
                          ? 'var(--color-green)'
                          : 'var(--color-text-3)',
                        fontWeight: 600,
                      }}
                    >
                      {k.is_active ? 'Active' : 'Revoked'}
                    </span>
                    <button
                      type="button"
                      onClick={() => revokeKey(k.id)}
                      disabled={!k.is_active}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 11,
                        fontWeight: 500,
                        color: k.is_active
                          ? 'var(--color-red)'
                          : 'var(--color-text-3)',
                        cursor: k.is_active ? 'pointer' : 'not-allowed',
                        opacity: k.is_active ? 1 : 0.5,
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'billing' && (
            <div style={{ ...card, maxWidth: 720 }}>
              <h3 style={sectionTitle}>
                You&apos;re on the {badge.label} plan
              </h3>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  color: 'var(--color-text-2)',
                  marginBottom: 20,
                  lineHeight: 1.6,
                }}
              >
                WeThePeople is free forever. Support us by donating — donations
                fund data infrastructure, not profit.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                {[
                  { amount: '$5', cadence: '/month', label: 'Coffee-money' },
                  { amount: '$25', cadence: '/month', label: 'Data-citizen', featured: true },
                  { amount: '$100', cadence: '/month', label: 'Data-champion' },
                ].map((tier) => (
                  <div
                    key={tier.label}
                    style={{
                      padding: '18px 20px',
                      borderRadius: 10,
                      border: `1.5px solid ${tier.featured ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      background: tier.featured ? 'var(--color-accent-dim)' : 'transparent',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 10,
                        fontWeight: 700,
                        color: tier.featured ? 'var(--color-accent-text)' : 'var(--color-text-3)',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        marginBottom: 10,
                      }}
                    >
                      {tier.label}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 4,
                        marginBottom: 14,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 30,
                          fontWeight: 700,
                          color: 'var(--color-text-1)',
                        }}
                      >
                        {tier.amount}
                      </span>
                      <span
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: 12,
                          color: 'var(--color-text-3)',
                        }}
                      >
                        {tier.cadence}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        alert(
                          'Thanks! Per-tier donation checkout is coming soon. Email wethepeopleforus@gmail.com to set one up manually.',
                        )
                      }
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: 7,
                        background: tier.featured ? 'var(--color-accent)' : 'transparent',
                        color: tier.featured ? '#07090C' : 'var(--color-text-1)',
                        border: tier.featured ? 'none' : '1px solid var(--color-border)',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>

              {user?.role === 'free' && (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    border: '1px solid rgba(197,160,40,0.3)',
                    background: 'var(--color-accent-dim)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--color-accent-text)',
                      marginBottom: 6,
                    }}
                  >
                    Upgrade to Enterprise
                  </div>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12,
                      color: 'var(--color-text-2)',
                      marginBottom: 12,
                      lineHeight: 1.55,
                    }}
                  >
                    Full API access, verification pipeline, bulk exports.
                  </p>
                  <button
                    type="button"
                    onClick={upgradeEnterprise}
                    style={{
                      ...primaryBtn,
                      padding: '9px 14px',
                      fontSize: 12,
                    }}
                  >
                    Upgrade — {PRESS_TIER_PRICE} (7-day free trial)
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'dangerzone' && (
            <div
              style={{
                maxWidth: 720,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {[
                {
                  title: 'Export all your data',
                  desc: 'Download a ZIP of your profile, follows, and digest history.',
                  btn: 'Export',
                  danger: false,
                },
                {
                  title: 'Delete your account',
                  desc: 'Permanent. All data removed within 30 days.',
                  btn: 'Delete account',
                  danger: true,
                },
              ].map((row) => (
                <div
                  key={row.title}
                  style={{
                    padding: '20px 22px',
                    borderRadius: 12,
                    border: `1px solid ${row.danger ? 'rgba(230,57,70,0.4)' : 'var(--color-border)'}`,
                    background: row.danger
                      ? 'rgba(230,57,70,0.05)'
                      : 'var(--color-surface)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text-1)',
                        marginBottom: 3,
                      }}
                    >
                      {row.title}
                    </div>
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        color: 'var(--color-text-3)',
                      }}
                    >
                      {row.desc}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      alert(
                        row.danger
                          ? 'Account deletion is coming soon. Email wethepeopleforus@gmail.com to request removal.'
                          : 'Data export is coming soon. Email wethepeopleforus@gmail.com for a manual export.',
                      )
                    }
                    style={{
                      padding: '8px 14px',
                      borderRadius: 7,
                      background: row.danger ? 'var(--color-red)' : 'transparent',
                      color: row.danger ? '#fff' : 'var(--color-text-1)',
                      border: row.danger ? 'none' : '1px solid var(--color-border-hover)',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {row.btn}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Responsive: single-column account grid below 720px */}
      <style>{`
        @media (max-width: 720px) {
          .account-grid { grid-template-columns: 1fr !important; }
          .apikey-row { grid-template-columns: 1fr !important; gap: 6px !important; }
        }
      `}</style>
    </div>
  );
}
