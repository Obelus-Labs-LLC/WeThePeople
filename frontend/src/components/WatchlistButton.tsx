import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

interface Props {
  entityType: string;
  entityId: string;
  entityName: string;
  sector?: string;
  size?: number;
}

export default function WatchlistButton({ entityType, entityId, entityName, sector, size = 18 }: Props) {
  const { isAuthenticated, authedFetch } = useAuth();
  const navigate = useNavigate();
  const [watching, setWatching] = useState(false);
  const [itemId, setItemId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Transient toast — surfaced near the star so the user can see that
  // a follow / unfollow actually failed instead of just silently
  // appearing to do nothing.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    authedFetch(`${API_BASE}/auth/watchlist/check?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setWatching(!!d.watching);
        setItemId(d.item_id ?? null);
      })
      .catch((err) => {
        // Transient failure: leave button unfilled; do not flip state
        // based on a partially-parsed body.
        console.warn('[WatchlistButton] check failed:', err);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, entityType, entityId, authedFetch]);

  // Auto-clear the error toast after 4 seconds so it doesn't linger.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const toggle = async () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (busy) return;
    setBusy(true);
    setError(null);
    // Capture the pre-toggle state so we can roll back on failure.
    const wasWatching = watching;
    const previousItemId = itemId;
    try {
      if (wasWatching && previousItemId) {
        // Optimistic remove — flip immediately so the click feels
        // responsive, then roll back if the server rejects.
        setWatching(false);
        setItemId(null);
        const r = await authedFetch(`${API_BASE}/auth/watchlist/${previousItemId}`, { method: 'DELETE' });
        if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
      } else {
        // Optimistic add: show the filled star, but we don't know the
        // server-assigned itemId yet so leave it null until response.
        setWatching(true);
        const r = await authedFetch(`${API_BASE}/auth/watchlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity_type: entityType, entity_id: entityId, entity_name: entityName, sector: sector || '' }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json().catch(() => ({}));
        if (typeof d.id === 'number') {
          setItemId(d.id);
        }
      }
    } catch (err) {
      console.warn('[WatchlistButton] toggle failed:', err);
      // Roll back the optimistic change so the UI matches reality.
      setWatching(wasWatching);
      setItemId(previousItemId);
      const detail = err instanceof Error ? err.message : 'unknown error';
      setError(
        wasWatching
          ? `Couldn't unfollow (${detail}). Try again.`
          : `Couldn't follow (${detail}). Try again.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={toggle}
        disabled={busy}
        title={watching ? 'Remove from watchlist' : 'Add to watchlist'}
        className={`inline-flex items-center justify-center rounded-lg p-1.5 transition-colors ${
          watching
            ? 'text-amber-400 hover:text-amber-300 bg-amber-500/10'
            : 'text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10'
        }`}
      >
        <Star size={size} fill={watching ? 'currentColor' : 'none'} />
      </button>
      {error && (
        <span
          role="alert"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 30,
            whiteSpace: 'nowrap',
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid rgba(230, 57, 70, 0.35)',
            background: 'rgba(230, 57, 70, 0.12)',
            color: 'var(--color-red, #E63946)',
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            pointerEvents: 'none',
          }}
        >
          {error}
        </span>
      )}
    </span>
  );
}
