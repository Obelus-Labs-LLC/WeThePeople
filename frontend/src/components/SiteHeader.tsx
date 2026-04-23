import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import Logo from './Logo';

/**
 * Main-site top navigation bar — landing only.
 *
 * Sticky 64px bar with backdrop-blur. Left: Logo (WTP box + WeThePeople
 * wordmark) linked to /. Right: search input + Log in + Sign up buttons.
 *
 * Home/Dashboard toggle removed per redesign — users pick a sector directly
 * from the landing grid. Sector pages use `SectorHeader` (52px) which
 * replaces this one.
 */
export default function SiteHeader() {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState('');

  return (
    <header
      className="sticky top-[52px] z-40 flex items-center justify-between w-full"
      style={{
        height: 64,
        padding: '0 32px',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'rgba(7, 9, 12, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Left — WTP mark + wordmark */}
      <Link
        to="/"
        className="no-underline shrink-0"
        style={{ display: 'inline-flex', alignItems: 'center', color: 'inherit' }}
      >
        <Logo size="sm" />
      </Link>

      {/* Right — search + auth */}
      <div className="flex items-center shrink-0" style={{ gap: 10 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim();
            if (q) navigate(`/politics/people?q=${encodeURIComponent(q)}`);
          }}
          className="relative"
        >
          <Search
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 14,
              height: 14,
              color: 'var(--color-text-3)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: 200,
              height: 34,
              padding: '0 12px 0 32px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--color-text-1)',
              outline: 'none',
            }}
          />
        </form>

        <Link
          to="/login"
          className="no-underline"
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-2)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
          }}
        >
          Log in
        </Link>

        <Link
          to="/signup"
          className="no-underline"
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-accent-text)',
            background: 'transparent',
            border: '1px solid var(--color-accent)',
          }}
        >
          Sign up
        </Link>
      </div>
    </header>
  );
}
