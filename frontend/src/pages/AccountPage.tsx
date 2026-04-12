import { useEffect, useState } from 'react';
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

const ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  free: { label: 'Free', color: 'text-zinc-400', bg: 'bg-zinc-800' },
  pro: { label: 'Pro', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  enterprise: { label: 'Enterprise', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  admin: { label: 'Admin', color: 'text-red-400', bg: 'bg-red-500/20' },
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
      const res = await fetch(`/api/auth/watchlist/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.statusText);
      setWatchlist((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // Delete failed — don't remove from UI
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0F1A' }}><div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const badge = ROLE_BADGE[user?.role || 'free'] || ROLE_BADGE.free;

  return (
    <div className="min-h-screen px-4 py-12" style={{ background: '#0A0F1A' }}>
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Your Account</h1>
          <Link to="/" className="text-sm text-zinc-400 hover:text-white transition-colors">Back to home</Link>
        </div>

        {/* Profile */}
        <div className="rounded-xl border border-zinc-800 bg-white/[0.03] p-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-800">
              <User className="w-7 h-7 text-zinc-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-white">{user?.display_name || user?.email}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color} ${badge.bg}`}>{badge.label}</span>
              </div>
              <p className="text-sm text-zinc-500">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Watchlist */}
        <div className="rounded-xl border border-zinc-800 bg-white/[0.03] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Your Watchlist</h2>
            <span className="text-xs text-zinc-500">({watchlist.length})</span>
          </div>
          {wlLoading ? (
            <p className="text-zinc-500 text-sm">Loading...</p>
          ) : watchlist.length === 0 ? (
            <p className="text-zinc-500 text-sm">No items tracked yet. Browse politicians and companies and click the star icon to add them.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {watchlist.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                  <div>
                    <Link to={item.entity_type === 'politician' ? `/politics/people/${item.entity_id}` : `/${item.sector || 'tech'}/companies/${item.entity_id}`} className="text-sm font-medium text-white hover:text-amber-400 transition-colors">
                      {item.entity_name || item.entity_id}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-500 capitalize">{item.entity_type}</span>
                      {item.sector && <span className="text-xs text-zinc-600">{item.sector}</span>}
                    </div>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tier info */}
        {user?.role === 'free' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-amber-400">Upgrade to Enterprise</h2>
            </div>
            <p className="text-sm text-zinc-400 mb-4">Get full API access, the verification pipeline, and bulk data exports.</p>
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
                } catch { alert('Checkout unavailable'); }
              }}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 transition-colors"
            >
              Upgrade - {PRESS_TIER_PRICE} (7-day free trial)
            </button>
          </div>
        )}

        {/* Logout */}
        <button onClick={logout} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors">
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>
    </div>
  );
}
