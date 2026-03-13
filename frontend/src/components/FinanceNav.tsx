import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV_TABS = [
  { label: 'Overview', path: '/finance' },
  { label: 'Institutions', path: '/finance/institutions' },
  { label: 'News & Regulatory', path: '/finance/news' },
  { label: 'Insider Trades', path: '/finance/insider-trades' },
  { label: 'Compare', path: '/finance/compare' },
];

export default function FinanceNav() {
  const location = useLocation();

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/10 pb-0 mb-8">
      {NAV_TABS.map((tab) => {
        const isActive = location.pathname === tab.path;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`whitespace-nowrap px-5 py-3 font-heading text-sm font-bold uppercase tracking-wider transition-colors no-underline border-b-2 ${
              isActive
                ? 'text-[#34D399] border-[#34D399]'
                : 'text-white/40 border-transparent hover:text-white/70'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
