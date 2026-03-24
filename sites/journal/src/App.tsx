import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { EcosystemNav } from '@shared/EcosystemNav'

function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <EcosystemNav active="journal" />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-2xl text-center">
          <h1 className="text-5xl font-bold tracking-tight mb-2" style={{ fontFamily: 'Oswald, sans-serif' }}>
            The Influence Journal
          </h1>
          <p className="text-zinc-400 text-lg mb-8">
            Coming Soon
          </p>
          <p className="text-zinc-300 text-base leading-relaxed mb-10">
            Data-driven investigations into corporate influence on government.
            Stories, blog posts, data deep-dives, and a weekly newsletter.
            Every claim cited. Every dollar traced.
          </p>
          <a
            href="https://wethepeopleforus.com"
            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg transition-colors text-sm font-medium"
          >
            &larr; Back to WeThePeople
          </a>
        </div>
      </main>
      <footer className="py-6 text-center text-zinc-600 text-xs">
        Part of the WeThePeople ecosystem &middot; wethepeopleforus.com
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  )
}
