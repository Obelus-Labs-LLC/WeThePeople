import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { EcosystemNav } from '../../shared/EcosystemNav';

// -- Lazy-loaded pages --

const HomePage = lazy(() => import('./pages/HomePage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const VaultPage = lazy(() => import('./pages/VaultPage'));

// -- Loading fallback --

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" role="status"><span className="sr-only">Loading...</span></div>
    </div>
  );
}

// -- Layout --

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <EcosystemNav active="verify" />
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </div>
  );
}

// -- App --

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout><HomePage /></Layout>} />
        <Route path="/results/:id" element={<Layout><ResultsPage /></Layout>} />
        <Route path="/vault" element={<Layout><VaultPage /></Layout>} />
        {/* Catch-all back to home */}
        <Route path="*" element={<Layout><HomePage /></Layout>} />
      </Routes>
    </BrowserRouter>
  );
}
