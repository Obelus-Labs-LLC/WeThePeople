/**
 * EcosystemNav — Cross-site navigation bar for the WTP ecosystem.
 *
 * Drop this into any of the three sites' layouts. Pass the `active` prop
 * to highlight the current site.
 *
 * Usage:
 *   <EcosystemNav active="core" />
 *   <EcosystemNav active="research" />
 *   <EcosystemNav active="journal" />
 */

import React from 'react';

interface EcosystemNavProps {
  active: 'core' | 'research' | 'journal'
}

const sites = [
  { key: 'core' as const, label: 'WeThePeople', href: 'https://wethepeopleforus.com' },
  { key: 'research' as const, label: 'Research', href: 'https://research.wethepeopleforus.com' },
  { key: 'journal' as const, label: 'Journal', href: 'https://journal.wethepeopleforus.com' },
]

export function EcosystemNav({ active }: EcosystemNavProps) {
  return (
    <nav className="w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-10 text-sm">
        <div className="flex items-center gap-1">
          {sites.map((site, i) => (
            <React.Fragment key={site.key}>
              {i > 0 && <span className="text-zinc-700 mx-1">|</span>}
              {site.key === active ? (
                <span className="text-white font-medium px-2 py-1">
                  {site.label}
                </span>
              ) : (
                <a
                  href={site.href}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1"
                >
                  {site.label}
                </a>
              )}
            </React.Fragment>
          ))}
        </div>
        <a
          href="https://wethepeopleforus.com/login"
          className="text-zinc-500 hover:text-amber-400 transition-colors px-2 py-1"
        >
          Log in
        </a>
      </div>
    </nav>
  )
}
