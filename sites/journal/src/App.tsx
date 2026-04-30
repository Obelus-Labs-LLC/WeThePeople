import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { EcosystemNav } from './components/EcosystemNav';
import { Footer } from './components/Footer';

// ── Lazy-loaded pages ──

const HomePage = lazy(() => import('./pages/HomePage'));
const StoryPage = lazy(() => import('./pages/StoryPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const SubscribePage = lazy(() => import('./pages/SubscribePage'));
const CoverageBalancePage = lazy(() => import('./pages/CoverageBalancePage'));
const VerifyDataPage = lazy(() => import('./pages/VerifyDataPage'));
const CorrectionsPage = lazy(() => import('./pages/CorrectionsPage'));
const StandardsPage = lazy(() => import('./pages/StandardsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// ── Loading fallback ──

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" role="status"><span className="sr-only">Loading...</span></div>
    </div>
  );
}

// ── Layout ──

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <EcosystemNav active="journal" />
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
      <Footer />
    </div>
  );
}

// ── App ──

/**
 * Routing notes:
 *   - Canonical story URL is `/story/:slug`. The legacy `/stories/:slug`
 *     pattern redirects to it so inbound links still resolve, but search
 *     engines and crawlers consistently see one canonical path.
 *   - Unknown routes hit the dedicated NotFoundPage. The previous
 *     fallback rendered HomePage, which made broken links invisible to
 *     analytics and gave bots a 200-OK on missing pages.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout><HomePage /></Layout>} />
        <Route path="/story/:slug" element={<Layout><StoryPage /></Layout>} />
        <Route path="/stories/:slug" element={<RedirectToStory />} />
        <Route path="/category/:category" element={<Layout><CategoryPage /></Layout>} />
        <Route path="/about" element={<Layout><AboutPage /></Layout>} />
        <Route path="/subscribe" element={<Layout><SubscribePage /></Layout>} />
        <Route path="/coverage" element={<Layout><CoverageBalancePage /></Layout>} />
        <Route path="/verify-our-data" element={<Layout><VerifyDataPage /></Layout>} />
        <Route path="/corrections" element={<Layout><CorrectionsPage /></Layout>} />
        <Route path="/standards" element={<Layout><StandardsPage /></Layout>} />
        <Route path="*" element={<Layout><NotFoundPage /></Layout>} />
      </Routes>
      <Analytics />
    </BrowserRouter>
  );
}

/**
 * Redirect legacy `/stories/:slug` → `/story/:slug`. Replaces the entry
 * in history so the user's Back button takes them to where they came
 * from, not the old URL.
 */
function RedirectToStory() {
  const slug = window.location.pathname.replace(/^\/stories\//, '').replace(/\/$/, '');
  return <Navigate to={`/story/${slug}${window.location.search}${window.location.hash}`} replace />;
}
