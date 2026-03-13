import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const POLITICS_LINKS = [
  { label: 'Sectors', to: '/' },
  { label: 'Dashboard', to: '/politics' },
  { label: 'People', to: '/politics/people' },
  { label: 'Activity', to: '/politics/activity' },
  { label: 'Power', to: '/politics/power' },
  { label: 'Compare', to: '/politics/compare' },
];

export default function PoliticsNav() {
  const { pathname } = useLocation();

  return (
    <div className="flex items-center gap-1">
      {POLITICS_LINKS.map((link) => {
        const active = link.to === '/'
          ? pathname === '/'
          : pathname === link.to;
        return (
          <Link
            key={link.label}
            to={link.to}
            className={`rounded-lg px-3 py-1.5 font-body text-sm font-medium transition-colors no-underline ${
              active
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
