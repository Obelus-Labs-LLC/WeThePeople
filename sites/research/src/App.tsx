import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { EcosystemNav } from './components/EcosystemNav'
import {
  Search,
  Pill,
  FlaskConical,
  TrendingUp,
  FileSearch,
  Newspaper,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Globe,
  ArrowRight,
  Building2,
  ArrowRightLeft,
  DollarSign,
  Landmark,
  Radio,
  Signal,
  GraduationCap,
  BookOpen,
  HandCoins,
  Banknote,
} from 'lucide-react'

// ── Lazy-loaded pages ──

const PatentSearchPage = lazy(() => import('./pages/PatentSearchPage'))
const DrugLookupPage = lazy(() => import('./pages/DrugLookupPage'))
const ClinicalTrialsPage = lazy(() => import('./pages/ClinicalTrialsPage'))
const InsiderTradesPage = lazy(() => import('./pages/InsiderTradesPage'))
const FdaSafetyPage = lazy(() => import('./pages/FdaSafetyPage'))
const MarketMoversPage = lazy(() => import('./pages/MarketMoversPage'))
const RegulatoryNewsPage = lazy(() => import('./pages/RegulatoryNewsPage'))
const FoodSafetyPage = lazy(() => import('./pages/FoodSafetyPage'))
const ToxicReleasePage = lazy(() => import('./pages/ToxicReleasePage'))
const ForeignLobbyingPage = lazy(() => import('./pages/ForeignLobbyingPage'))
const GovSalaryPage = lazy(() => import('./pages/GovSalaryPage'))
const RevolvingDoorPage = lazy(() => import('./pages/RevolvingDoorPage'))
const CampaignFinancePage = lazy(() => import('./pages/CampaignFinancePage'))
const BillTextPage = lazy(() => import('./pages/BillTextPage'))
const EarmarksPage = lazy(() => import('./pages/EarmarksPage'))
const FccComplaintsPage = lazy(() => import('./pages/FccComplaintsPage'))
const SpectrumSearchPage = lazy(() => import('./pages/SpectrumSearchPage'))
const CollegeScorecardPage = lazy(() => import('./pages/CollegeScorecardPage'))
const StudentLoanPage = lazy(() => import('./pages/StudentLoanPage'))
const FederalGrantsPage = lazy(() => import('./pages/FederalGrantsPage'))
const TreasuryDataPage = lazy(() => import('./pages/TreasuryDataPage'))

// ── Loading fallback ──

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div
        className="animate-spin"
        role="status"
        style={{
          height: 32,
          width: 32,
          borderRadius: '999px',
          border: '2px solid rgba(235,229,213,0.15)',
          borderTopColor: 'var(--color-research)',
        }}
      >
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  )
}

// ── Tool cards ──

interface ToolCard {
  title: string
  description: string
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  path: string
  accent: string
  available: boolean
}

const VIOLET = 'var(--color-research)'
const DEM = 'var(--color-dem)'
const RED = 'var(--color-red)'
const GREEN = 'var(--color-green)'
const AMBER = 'var(--color-accent-text)'
const IND = 'var(--color-ind)'

const tools: ToolCard[] = [
  {
    title: 'Patent Explorer',
    description:
      'Search across thousands of patents from tracked technology companies. Find prior art, explore patent portfolios, and link IP to policy.',
    icon: FileSearch,
    path: '/patents',
    accent: VIOLET,
    available: true,
  },
  {
    title: 'Drug Lookup',
    description:
      'Search for a drug or medication by name. View FDA recalls and clinical trials across all tracked health companies.',
    icon: Pill,
    path: '/drugs',
    accent: RED,
    available: true,
  },
  {
    title: 'Clinical Trial Tracker',
    description:
      'Visualize the clinical trial pipeline by phase. Browse Phase 1 through Phase 4 trials with enrollment data and status tracking.',
    icon: FlaskConical,
    path: '/clinical-trials',
    accent: DEM,
    available: true,
  },
  {
    title: 'Insider Trade Tracker',
    description:
      'Executive stock transactions from SEC Form 4 filings. Filter by transaction type, search by company or insider name.',
    icon: TrendingUp,
    path: '/insider-trades',
    accent: GREEN,
    available: true,
  },
  {
    title: 'FDA Safety Monitor',
    description:
      'Track FDA recalls, adverse events, and safety signals across tracked health companies. Filter by severity and classification.',
    icon: ShieldCheck,
    path: '/fda-approvals',
    accent: AMBER,
    available: true,
  },
  {
    title: 'Market Movers',
    description:
      'Biggest insider trades, complaint spikes, and notable sector news aggregated across the finance sector.',
    icon: Search,
    path: '/market-movers',
    accent: GREEN,
    available: true,
  },
  {
    title: 'Regulatory News',
    description:
      'Federal Reserve press releases, enforcement actions across finance and health, and regulatory news from government sources.',
    icon: Newspaper,
    path: '/regulatory-news',
    accent: DEM,
    available: true,
  },
  {
    title: 'Food Safety Search',
    description:
      'Search FDA and USDA food recall databases. Find recalls by product name, company, or reason — with severity classification and distribution data.',
    icon: ShieldAlert,
    path: '/food-safety',
    accent: RED,
    available: true,
  },
  {
    title: 'Toxic Release Inventory',
    description:
      'Explore EPA Toxic Release Inventory data. Filter by state, chemical, facility, or year to find reported toxic chemical releases near you.',
    icon: Flame,
    path: '/toxic-releases',
    accent: RED,
    available: true,
  },
  {
    title: 'Foreign Lobbying (FARA)',
    description:
      'Search the FARA registry for foreign agents, principals, and the countries they represent. Track who lobbies for foreign governments in the U.S.',
    icon: Globe,
    path: '/foreign-lobbying',
    accent: IND,
    available: true,
  },
  {
    title: 'Government Salary Database',
    description:
      'Search federal job openings with salary data from USAJobs. Filter by keyword, agency, minimum salary, and location across all government positions.',
    icon: Building2,
    path: '/gov-salaries',
    accent: DEM,
    available: true,
  },
  {
    title: 'Revolving Door Tracker',
    description:
      'Detect patterns of officials moving between government and lobbying. Cross-references FARA data with anomaly detection for revolving-door activity.',
    icon: ArrowRightLeft,
    path: '/revolving-door',
    accent: VIOLET,
    available: true,
  },
  {
    title: 'Campaign Finance Search',
    description:
      'Search FEC campaign finance data by candidate, state, and election cycle. View total raised, spent, cash on hand, and link to FEC profiles.',
    icon: DollarSign,
    path: '/campaign-finance',
    accent: GREEN,
    available: true,
  },
  {
    title: 'Bill Text Analysis',
    description:
      'Search congressional bills by lobbying topic and cross-reference with Senate lobbying disclosures. See which companies are lobbying on the same issues being legislated.',
    icon: FileSearch,
    path: '/bill-text',
    accent: AMBER,
    available: true,
  },
  {
    title: 'Earmarks Tracker',
    description:
      'Search congressionally directed spending from USASpending.gov. Find federal grants and direct payments by state, keyword, or congress member.',
    icon: Landmark,
    path: '/earmarks',
    accent: GREEN,
    available: true,
  },
  {
    title: 'FCC Complaint Lookup',
    description:
      'Search FCC consumer complaints by company, issue type, or state. Track telecom and broadband complaint trends across carriers.',
    icon: Radio,
    path: '/fcc-complaints',
    accent: DEM,
    available: true,
  },
  {
    title: 'Spectrum / License Search',
    description:
      'Search FCC spectrum licenses by company or entity. View call signs, frequencies, service types, grant and expiration dates.',
    icon: Signal,
    path: '/spectrum',
    accent: DEM,
    available: true,
  },
  {
    title: 'College Scorecard',
    description:
      'Explore Department of Education data on colleges and universities. Compare tuition, graduation rates, default rates, and post-graduation earnings.',
    icon: GraduationCap,
    path: '/college-scorecard',
    accent: VIOLET,
    available: true,
  },
  {
    title: 'Student Loan Servicers',
    description:
      'Track student loan servicers and lending companies. View government contracts, lobbying spend, enforcement actions, and borrower outcomes.',
    icon: BookOpen,
    path: '/student-loans',
    accent: AMBER,
    available: true,
  },
  {
    title: 'Federal Grants Explorer',
    description:
      'Search federal grant opportunities by keyword and agency. Find funding amounts, deadlines, eligibility requirements, and grant categories.',
    icon: HandCoins,
    path: '/federal-grants',
    accent: GREEN,
    available: true,
  },
  {
    title: 'Treasury / Budget Data',
    description:
      'Explore U.S. Treasury data including national debt trends, federal revenue sources, and government spending breakdowns over time.',
    icon: Banknote,
    path: '/treasury',
    accent: GREEN,
    available: true,
  },
]

// ── Home page ──

function HomePage() {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const filteredTools = q
    ? tools.filter(
        (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
      )
    : tools

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ color: 'var(--color-text-1)' }}
    >
      <EcosystemNav active="research" />

      <main id="main-content" className="flex-1 px-4 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-12">
            <div
              className="inline-flex items-center gap-2 mb-4"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: 'var(--color-research)',
              }}
            >
              <span
                aria-hidden
                style={{
                  height: 7,
                  width: 7,
                  borderRadius: '999px',
                  background: 'var(--color-research)',
                  boxShadow: '0 0 10px var(--color-research)',
                }}
              />
              WTP Research
            </div>
            <h1
              className="mb-4"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: 'clamp(44px, 6.5vw, 72px)',
                letterSpacing: '-0.03em',
                lineHeight: 1,
                color: 'var(--color-text-1)',
              }}
            >
              Civic data, on demand.
            </h1>
            <p
              className="max-w-2xl mx-auto"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '16px',
                lineHeight: 1.7,
                color: 'var(--color-text-2)',
              }}
            >
              Deep-dive research tools for civic data. Explore patents, drug pipelines, clinical
              trials, insider trades, and regulatory activity — all powered by the WeThePeople
              platform.
            </p>
          </div>

          {/* Search */}
          <div className="relative max-w-lg mx-auto mb-12">
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-3)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="search"
              placeholder="Search tools…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                padding: '12px 16px 12px 42px',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--color-text-1)',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-research)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            />
          </div>

          {/* Tool grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTools.map((tool) => {
              const Icon = tool.icon
              const card = (
                <div
                  className="group relative flex flex-col h-full"
                  style={{
                    borderRadius: '16px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    padding: '24px',
                    transition: 'border-color 0.2s, transform 0.2s',
                    cursor: tool.available ? 'pointer' : 'default',
                    opacity: tool.available ? 1 : 0.55,
                  }}
                  onMouseEnter={(e) => {
                    if (!tool.available) return
                    e.currentTarget.style.borderColor = `${tool.accent}66`
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div
                    className="flex items-center justify-center mb-5"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '10px',
                      background: `${tool.accent}1A`,
                      border: `1px solid ${tool.accent}33`,
                    }}
                  >
                    <Icon size={20} style={{ color: tool.accent }} />
                  </div>

                  <h2
                    className="mb-2"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      fontWeight: 900,
                      fontSize: '22px',
                      letterSpacing: '-0.015em',
                      lineHeight: 1.15,
                      color: 'var(--color-text-1)',
                    }}
                  >
                    {tool.title}
                  </h2>

                  <p
                    className="flex-1 mb-5"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px',
                      lineHeight: 1.6,
                      color: 'var(--color-text-2)',
                    }}
                  >
                    {tool.description}
                  </p>

                  <div className="flex items-center justify-between">
                    {tool.available ? (
                      <span
                        className="flex items-center gap-1.5"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 700,
                          letterSpacing: '0.2em',
                          textTransform: 'uppercase',
                          color: tool.accent,
                        }}
                      >
                        Open Tool
                        <ArrowRight size={13} />
                      </span>
                    ) : (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          fontWeight: 700,
                          letterSpacing: '0.22em',
                          textTransform: 'uppercase',
                          color: 'var(--color-text-3)',
                        }}
                      >
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>
              )

              return tool.available ? (
                <Link key={tool.path} to={tool.path} className="no-underline">
                  {card}
                </Link>
              ) : (
                <div key={tool.path}>{card}</div>
              )
            })}
          </div>

          {/* Data source note */}
          <div className="mt-16 text-center">
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--color-text-3)',
              }}
            >
              All data sourced from the{' '}
              <a
                href="https://wethepeopleforus.com"
                style={{
                  color: 'var(--color-research)',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                WeThePeople
              </a>{' '}
              platform API. Research tools query the same backend that powers the main site.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

function SiteFooter() {
  const linkStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'var(--color-text-3)',
    textDecoration: 'none',
    transition: 'color 0.2s',
  }
  return (
    <footer
      style={{
        borderTop: '1px solid var(--color-border)',
        padding: '28px 16px',
      }}
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-text-3)',
          }}
        >
          Part of the WeThePeople Ecosystem
        </p>
        <div className="flex items-center gap-6">
          <a
            href="https://wethepeopleforus.com"
            style={linkStyle}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-research)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
          >
            Main Site
          </a>
          <a
            href="https://wethepeopleforus.com/methodology"
            style={linkStyle}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-research)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
          >
            Methodology
          </a>
          <a
            href="https://github.com/Obelus-Labs-LLC/WeThePeople"
            style={linkStyle}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-research)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-3)')}
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  )
}

// ── Layout wrapper for tool pages ──

function ToolLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ color: 'var(--color-text-1)' }}
    >
      <EcosystemNav active="research" />
      <main id="main-content" className="flex-1">
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
      </main>
      <SiteFooter />
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
        <Route path="/fda-approvals" element={<ToolLayout><FdaSafetyPage /></ToolLayout>} />
        <Route path="/market-movers" element={<ToolLayout><MarketMoversPage /></ToolLayout>} />
        <Route path="/regulatory-news" element={<ToolLayout><RegulatoryNewsPage /></ToolLayout>} />
        <Route path="/food-safety" element={<ToolLayout><FoodSafetyPage /></ToolLayout>} />
        <Route path="/toxic-releases" element={<ToolLayout><ToxicReleasePage /></ToolLayout>} />
        <Route path="/foreign-lobbying" element={<ToolLayout><ForeignLobbyingPage /></ToolLayout>} />
        <Route path="/gov-salaries" element={<ToolLayout><GovSalaryPage /></ToolLayout>} />
        <Route path="/revolving-door" element={<ToolLayout><RevolvingDoorPage /></ToolLayout>} />
        <Route path="/campaign-finance" element={<ToolLayout><CampaignFinancePage /></ToolLayout>} />
        <Route path="/bill-text" element={<ToolLayout><BillTextPage /></ToolLayout>} />
        <Route path="/earmarks" element={<ToolLayout><EarmarksPage /></ToolLayout>} />
        <Route path="/fcc-complaints" element={<ToolLayout><FccComplaintsPage /></ToolLayout>} />
        <Route path="/spectrum" element={<ToolLayout><SpectrumSearchPage /></ToolLayout>} />
        <Route path="/college-scorecard" element={<ToolLayout><CollegeScorecardPage /></ToolLayout>} />
        <Route path="/student-loans" element={<ToolLayout><StudentLoanPage /></ToolLayout>} />
        <Route path="/federal-grants" element={<ToolLayout><FederalGrantsPage /></ToolLayout>} />
        <Route path="/treasury" element={<ToolLayout><TreasuryDataPage /></ToolLayout>} />
        <Route path="*" element={<HomePage />} />
      </Routes>
      <Analytics />
    </BrowserRouter>
  )
}
