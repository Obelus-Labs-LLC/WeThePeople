import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { EcosystemNav } from './components/EcosystemNav';
import { Footer } from './components/Footer';

// ── Lazy-loaded pages ──

const HomePage = lazy(() => import('./pages/HomePage'));
const StoryPage = lazy(() => import('./pages/StoryPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const SubscribePage = lazy(() => import('./pages/SubscribePage'));

// ── Loading fallback ──

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout><HomePage /></Layout>} />
        <Route path="/story/:slug" element={<Layout><StoryPage /></Layout>} />
        <Route path="/category/:category" element={<Layout><CategoryPage /></Layout>} />
        <Route path="/about" element={<Layout><AboutPage /></Layout>} />
        <Route path="/subscribe" element={<Layout><SubscribePage /></Layout>} />
        {/* Catch-all back to home */}
        <Route path="*" element={<Layout><HomePage /></Layout>} />
      </Routes>
    </BrowserRouter>
  );
}
