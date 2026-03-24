import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { EcosystemNav } from '@shared/EcosystemNav'
import {
  Search,
  Pill,
  FlaskConical,
  TrendingUp,
  FileSearch,
  Newspaper,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react'

// ── Lazy-loaded pages ──

const PatentSearchPage = lazy(() => import('./pages/PatentSearchPage'))
const DrugLookupPage = lazy(() => import('./pages/DrugLookupPage'))
const ClinicalTrialsPage = lazy(() => import('./pages/ClinicalTrialsPage'))
const InsiderTradesPage = lazy(() => import('./pages/InsiderTradesPage'))

// ── Loading fallback ──

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
    </div>
  )
}

// ── Tool cards ──

interface ToolCard {
  title: string
  description: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  path: string
  color: string
  available: boolean
}

const tools: ToolCard[] = [
  {
    title: 'Patent Explorer',
    description: 'Search across thousands of patents from tracked technology companies. Find prior art, explore patent portfolios, and link IP to policy.',
    icon: FileSearch,
    path: '/patents',
    color: '#8B5CF6',
    available: true,
  },
  {
    title: 'Drug Lookup',
    description: 'Search for a drug or medication by name. View FDA recalls and clinical trials across all tracked health companies.',
    icon: Pill,
    path: '/drugs',
    color: '#DC2626',
    available: true,
  },
  {
    title: 'Clinical Trial Tracker',
    description: 'Visualize the clinical trial pipeline by phase. Browse Phase 1 through Phase 4 trials with enrollment data and status tracking.',
    icon: FlaskConical,
    path: '/clinical-trials',
    color: '#3B82F6',
    available: true,
  },
  {
    title: 'Insider Trade Tracker',
    description: 'Executive stock transactions from SEC Form 4 filings. Filter by transaction type, search by company or insider name.',
    icon: TrendingUp,
    path: '/insider-trades',
    color: '#10B981',
    available: true,
  },
  {
    title: 'FDA Approvals',
    description: 'Track FDA drug approvals, rejections, and recent recall activity across tracked health companies.',
    icon: ShieldCheck,
    path: '/fda-approvals',
    color: '#F59E0B',
    available: false,
  },
  {
    title: 'Market Movers',
    description: 'Biggest insider trades, complaint spikes, and notable sector news aggregated across the finance sector.',
    icon: Search,
    path: '/market-movers',
    color: '#34D399',
    available: false,
  },
  {
    title: 'Regulatory News',
    description: 'Federal Reserve press releases, regulatory actions, and consumer complaints. Filter by institution.',
    icon: Newspaper,
    path: '/regulatory-news',
    color: '#60A5FA',
    available: false,
  },
]

// ── Home page ──

function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <EcosystemNav active="research" />

      <main className="flex-1 px-4 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-16">
            <h1
              className="text-5xl sm:text-6xl font-bold tracking-tight mb-3 text-white"
              style={{ fontFamily: 'Oswald, sans-serif' }}
            >
              WTP Research
            </h1>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              Deep-dive research tools for civic data. Explore patents, drugs,
              clinical trials, insider trades, and regulatory activity — all powered by the
              WeThePeople data platform.
            </p>
          </div>

          {/* Tool grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {tools.map((tool) => {
              const Icon = tool.icon
              const content = (
                <div
                  className={`group relative flex flex-col rounded-xl border p-6 transition-all duration-200 h-full ${
                    tool.available
                      ? 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/80 cursor-pointer'
                      : 'border-zinc-800/50 bg-zinc-900/20 opacity-60'
                  }`}
                >
                  {/* Icon */}
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg mb-4"
                    style={{ background: `${tool.color}15` }}
                  >
                    <Icon size={20} style={{ color: tool.color }} />
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {tool.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-zinc-400 leading-relaxed flex-1 mb-4">
                    {tool.description}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    {tool.available ? (
                      <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">
                        Open tool
                        <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-zinc-600 uppercase tracking-wider">
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>
              )

              return tool.available ? (
                <Link key={tool.path} to={tool.path} className="no-underline">
                  {content}
                </Link>
              ) : (
                <div key={tool.path}>{content}</div>
              )
            })}
          </div>

          {/* Data source note */}
          <div className="mt-16 text-center">
            <p className="text-sm text-zinc-600">
              All data sourced from the{' '}
              <a
                href="https://wethepeopleforus.com"
                className="text-zinc-400 hover:text-zinc-300 underline underline-offset-2 transition-colors"
              >
                WeThePeople
              </a>{' '}
              platform API. Research tools query the same backend that powers the main site.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-600">
            Part of the WeThePeople ecosystem
          </p>
          <div className="flex items-center gap-6">
            <a
              href="https://wethepeopleforus.com"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Main Site
            </a>
            <a
              href="https://wethepeopleforus.com/methodology"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Methodology
            </a>
            <a
              href="https://github.com/Obelus-Labs-LLC/WeThePeople"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── Layout wrapper for tool pages ──

function ToolLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <EcosystemNav active="research" />
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </main>
      <footer className="border-t border-zinc-900 py-6 px-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <p className="text-xs text-zinc-600">
            Part of the WeThePeople ecosystem
          </p>
          <a
            href="https://wethepeopleforus.com"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            wethepeopleforus.com
          </a>
        </div>
      </footer>
    </div>
  )
}

// ── App ──

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/patents" element={<ToolLayout><PatentSearchPage /></ToolLayout>} />
        <Route path="/drugs" element={<ToolLayout><DrugLookupPage /></ToolLayout>} />
        <Route path="/clinical-trials" element={<ToolLayout><ClinicalTrialsPage /></ToolLayout>} />
        <Route path="/insider-trades" element={<ToolLayout><InsiderTradesPage /></ToolLayout>} />
        {/* Catch-all back to home */}
        <Route path="*" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  )
}
