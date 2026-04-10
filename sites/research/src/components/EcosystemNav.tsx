/**
 * EcosystemNav — Cross-site navigation bar for the WTP ecosystem.
 * Copied from sites/shared/EcosystemNav.tsx for build isolation.
 */

interface EcosystemNavProps {
  active: 'core' | 'research' | 'journal' | 'verify'
}

const sites = [
  { key: 'core' as const, label: 'WeThePeople', href: 'https://wethepeopleforus.com' },
  { key: 'research' as const, label: 'Research', href: 'https://research.wethepeopleforus.com' },
  { key: 'journal' as const, label: 'Journal', href: 'https://journal.wethepeopleforus.com' },
  { key: 'verify' as const, label: 'Veritas', href: 'https://verify.wethepeopleforus.com' },
]

export function EcosystemNav({ active }: EcosystemNavProps) {
  return (
    <nav className="w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-10 text-sm">
        <div className="flex items-center gap-1">
          {sites.map((site, i) => (
            <span key={site.key}>
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
            </span>
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
