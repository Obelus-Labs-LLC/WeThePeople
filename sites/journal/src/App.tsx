import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { EcosystemNav } from './components/EcosystemNav';
import { Footer } from './components/Footer';
import { PersonalizationProvider, OnboardingModal } from './components/Personalization';

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
const MethodologyPage = lazy(() => import('./pages/MethodologyPage'));
const FundingPage = lazy(() => import('./pages/FundingPage'));
const TipPage = lazy(() => import('./pages/TipPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const EditorialReviewPage = lazy(() => import('./pages/EditorialReviewPage'));

// Review-mode flag. When set, every route renders EditorialReviewPage instead
// of normal content, so inbound links from tweets, the main site, and search
// results land on a clear placeholder rather than dead pages.
//
// Default ON. Set VITE_JOURNAL_REVIEW_MODE=0 in Vercel env to bring the
// journal back online after the audit/rebuild sequence in
// research/EDITORIAL_STANDARDS.md is complete.
const REVIEW_MODE =
  (import.meta.env.VITE_JOURNAL_REVIEW_MODE ?? '1') !== '0';

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
  // Review-mode short-circuit: every path renders the placeholder, EXCEPT
  // for the accountability surfaces that should remain public DURING the
  // review (the editorial standards page, the corrections page, the
  // verification methodology, and the funding disclosure). Hiding stories
  // is editorial caution; hiding the standards that govern them would
  // defeat the purpose of being publicly accountable about the review.
  // Keeps EcosystemNav + Footer in place so the page still looks like the
  // journal, but no story content, no personalization onboarding, no
  // analytics events tied to story views.
  if (REVIEW_MODE) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/standards" element={<Layout><StandardsPage /></Layout>} />
          <Route path="/editorial-standards" element={<Layout><StandardsPage /></Layout>} />
          <Route path="/corrections" element={<Layout><CorrectionsPage /></Layout>} />
          <Route path="/verify-our-data" element={<Layout><VerifyDataPage /></Layout>} />
          <Route path="/methodology" element={<Layout><MethodologyPage /></Layout>} />
          <Route path="/methodology/:topic" element={<Layout><MethodologyPage /></Layout>} />
          <Route path="/about/funding" element={<Layout><FundingPage /></Layout>} />
          <Route
            path="*"
            element={<Layout><EditorialReviewPage /></Layout>}
          />
        </Routes>
        <Analytics />
      </BrowserRouter>
    );
  }

  return (
    <PersonalizationProvider>
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
          {/* SEO-friendly alias. /standards is the canonical, but external
              links and outreach are more likely to use the more descriptive
              /editorial-standards path; both render the same component. */}
          <Route path="/editorial-standards" element={<Layout><StandardsPage /></Layout>} />
          <Route path="/methodology" element={<Layout><MethodologyPage /></Layout>} />
          <Route path="/methodology/:topic" element={<Layout><MethodologyPage /></Layout>} />
          <Route path="/about/funding" element={<Layout><FundingPage /></Layout>} />
          <Route path="/tip" element={<Layout><TipPage /></Layout>} />
          <Route path="/search" element={<Layout><SearchPage /></Layout>} />
          <Route path="*" element={<Layout><NotFoundPage /></Layout>} />
        </Routes>
        {/* OnboardingModal lives at the root so it can render over any
            page; visibility is driven by PersonalizationContext. */}
        <OnboardingModal />
        <Analytics />
      </BrowserRouter>
    </PersonalizationProvider>
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
