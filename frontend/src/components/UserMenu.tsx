import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, ChevronDown, LogOut, Star, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ROLE_COLORS: Record<string, string> = {
  free: 'text-zinc-400 bg-zinc-800',
  pro: 'text-blue-400 bg-blue-500/20',
  enterprise: 'text-amber-400 bg-amber-500/20',
  admin: 'text-red-400 bg-red-500/20',
};

export default function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isAuthenticated) {
    return (
      <Link
        to="/login"
        className="flex items-center gap-1.5 rounded-xl bg-zinc-900/85 backdrop-blur-md border border-white/15 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-900/95 hover:border-white/25 transition-colors shadow-lg shadow-black/30"
      >
        <User size={14} />
        Log in
      </Link>
    );
  }

  const roleClass = ROLE_COLORS[user?.role || 'free'] || ROLE_COLORS.free;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl bg-zinc-900/85 backdrop-blur-md border border-white/15 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-900/95 hover:border-white/25 transition-colors shadow-lg shadow-black/30"
      >
        <User size={14} />
        <span className="max-w-[120px] truncate">{user?.display_name || user?.email?.split('@')[0]}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleClass}`}>
          {user?.role}
        </span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/15 bg-zinc-900/95 backdrop-blur-md shadow-xl shadow-black/40 z-50 overflow-hidden">
          <Link to="/account" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
            <Settings size={14} />
            Account
          </Link>
          <Link to="/account?tab=follows" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
            <Star size={14} />
            Watchlist
          </Link>
          <div className="border-t border-zinc-800" />
          <button onClick={() => { logout(); setOpen(false); }} className="flex items-center gap-2 w-full px-4 py-3 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-red-400 transition-colors">
            <LogOut size={14} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
