import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Plus, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

/**
 * "Follow / Following" button for any entity (politician, company,
 * bill). Backed by /auth/watchlist endpoints. Shape:
 *
 *   <FollowButton entityType="person"  entityId="mitch_mcconnell" entityName="Sen. Mitch McConnell" />
 *   <FollowButton entityType="company" entityId="lockheed-martin" entityName="Lockheed Martin" sector="defense" />
 *   <FollowButton entityType="bill"    entityId="hr-1234"         entityName="HR 1234" />
 *
 * Behavior:
 *  - Signed-out: renders a small "Sign in to follow" link to /login.
 *  - Signed-in, not following: ghost-bordered "Follow" button. Click
 *    POSTs /auth/watchlist and flips to "Following".
 *  - Signed-in, following: filled "Following ★" button. Click DELETEs
 *    /auth/watchlist/{id} and flips back to "Follow".
 *
 * Failure handling: any network error reverts the button state and
 * surfaces a small inline error tooltip below the button. The
 * `compact` variant skips the inline error tooltip — useful when
 * the button sits in a tight inline header next to other chrome.
 *
 * Why a watchlist button matters: the Phase 2 alert system fires
 * when stories drop matching either (a) the user's onboarding
 * sectors or (b) any entity_id on their watchlist. Without these
 * buttons there's no UI path to (b) — the list could only be built
 * via API. This closes that loop.
 */
export interface FollowButtonProps {
  entityType: 'person' | 'politician' | 'company' | 'institution' | 'bill';
  entityId: string;
  entityName?: string;
  sector?: string;
  /** Compact variant: smaller padding, no inline error. */
  compact?: boolean;
  /** Optional callback fired AFTER a successful add/remove. */
  onChange?: (watching: boolean) => void;
}

type State = 'idle' | 'loading' | 'following' | 'not-following' | 'error';

export default function FollowButton({
  entityType,
  entityId,
  entityName,
  sector,
  compact = false,
  onChange,
}: FollowButtonProps) {
  const { isAuthenticated, authedFetch } = useAuth();
  const [state, setState] = useState<State>('idle');
  const [itemId, setItemId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Initial check.
  useEffect(() => {
    if (!isAuthenticated) {
      setState('idle');
      return;
    }
    let cancelled = false;
    setState('loading');
    const params = new URLSearchParams({
      entity_type: entityType,
      entity_id: entityId,
    });
    authedFetch(`${API_BASE}/auth/watchlist/check?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        if (d?.watching) {
          setState('following');
          setItemId(d.item_id ?? null);
        } else {
          setState('not-following');
          setItemId(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState('not-following');
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, entityType, entityId, authedFetch]);

  const handleFollow = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await authedFetch(`${API_BASE}/auth/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName ?? entityId,
          sector: sector ?? null,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setState('following');
      setItemId(d?.id ?? null);
      onChange?.(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not follow');
      setState('not-following');
    } finally {
      setBusy(false);
    }
  };

  const handleUnfollow = async () => {
    if (!itemId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await authedFetch(`${API_BASE}/auth/watchlist/${itemId}`, {
        method: 'DELETE',
      });
      if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
      setState('not-following');
      setItemId(null);
      onChange?.(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unfollow');
      setState('following');
    } finally {
      setBusy(false);
    }
  };

  // Signed-out path.
  if (!isAuthenticated) {
    return (
      <Link
        to={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: compact ? '4px 10px' : '6px 14px',
          borderRadius: 999,
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-2)',
          fontFamily: "'Inter', sans-serif",
          fontSize: compact ? 12 : 13,
          fontWeight: 600,
          textDecoration: 'none',
          background: 'transparent',
        }}
      >
        <Star size={compact ? 12 : 14} />
        Sign in to follow
      </Link>
    );
  }

  // Loading / unknown.
  if (state === 'loading' || state === 'idle') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: compact ? '4px 10px' : '6px 14px',
          borderRadius: 999,
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-3)',
          fontFamily: "'Inter', sans-serif",
          fontSize: compact ? 12 : 13,
        }}
      >
        <Loader2 size={compact ? 12 : 14} className="animate-spin" />
        Checking…
      </span>
    );
  }

  const watching = state === 'following';

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={watching ? handleUnfollow : handleFollow}
        disabled={busy}
        aria-pressed={watching}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: compact ? '4px 12px' : '6px 16px',
          borderRadius: 999,
          fontFamily: "'Inter', sans-serif",
          fontSize: compact ? 12 : 13,
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
          background: watching ? 'var(--color-accent)' : 'transparent',
          color: watching ? '#07090C' : 'var(--color-text-1)',
          border: `1px solid ${watching ? 'var(--color-accent)' : 'var(--color-border)'}`,
          transition: 'all 0.15s',
        }}
      >
        {watching ? (
          <>
            <Star size={compact ? 12 : 14} fill="#07090C" />
            Following
          </>
        ) : (
          <>
            <Plus size={compact ? 12 : 14} />
            Follow
          </>
        )}
      </button>
      {error && !compact && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            color: '#fca5a5',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
            padding: '4px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {error}
        </div>
      )}
    </span>
  );
}
