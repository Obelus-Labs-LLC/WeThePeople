import { Link, Route, Routes } from 'react-router-dom'

import { HomePage } from '../views/HomePage'
import { PersonPage } from '../views/PersonPage'
import { ClaimDetailPage } from '../views/ClaimDetailPage'
import { BillTimelinePage } from '../views/BillTimelinePage'

export function App() {
  return (
    <main>
      <header style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>
          <Link to="/" style={{ textDecoration: 'none' }}>WeThePeople</Link>
        </h1>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to="/">Home</Link>
        </nav>
      </header>
      <hr />

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/people/:personId" element={<PersonPage />} />
        <Route path="/claims/:claimId" element={<ClaimDetailPage />} />
        <Route path="/bills/:billId/timeline" element={<BillTimelinePage />} />
      </Routes>
    </main>
  )
}
