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
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [watching, setWatching] = useState(false);
  const [itemId, setItemId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem('wtp_access_token');
    fetch(`${API_BASE}/auth/watchlist/check?entity_type=${entityType}&entity_id=${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => { setWatching(d.watching); setItemId(d.item_id); })
      .catch((err) => {
        console.warn('[WatchlistButton] check failed:', err);
      });
  }, [isAuthenticated, entityType, entityId]);

  const toggle = async () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (busy) return;
    setBusy(true);
    const token = localStorage.getItem('wtp_access_token');
    try {
      if (watching && itemId) {
        const r = await fetch(`${API_BASE}/auth/watchlist/${itemId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(`DELETE watchlist failed: HTTP ${r.status}`);
        setWatching(false);
        setItemId(null);
      } else {
        const r = await fetch(`${API_BASE}/auth/watchlist`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity_type: entityType, entity_id: entityId, entity_name: entityName, sector: sector || '' }),
        });
        if (!r.ok) throw new Error(`POST watchlist failed: HTTP ${r.status}`);
        const d = await r.json();
        setWatching(true);
        setItemId(d.id);
      }
    } catch (err) {
      console.warn('[WatchlistButton] toggle failed:', err);
    }
    setBusy(false);
  };

  return (
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
  );
}
