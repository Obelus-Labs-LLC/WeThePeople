import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiGetJson } from '../ui/api'
import type { PersonDirectoryEntry } from '../ui/types'

export function HomePage() {
  const [query, setQuery] = useState('')
  const [onlyWithLedger, setOnlyWithLedger] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [people, setPeople] = useState<PersonDirectoryEntry[]>([])

  const apiPath = useMemo(() => {
    const q = query.trim()
    const params = new URLSearchParams()
    params.set('active_only', '1')
    params.set('limit', '100')
    params.set('offset', '0')
    if (onlyWithLedger) params.set('has_ledger', '1')
    if (q.length > 0) params.set('q', q)
    return `/people?${params.toString()}`
  }, [query, onlyWithLedger])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiGetJson<PersonDirectoryEntry[]>(apiPath)
      .then((data) => {
        if (cancelled) return
        setPeople(data)
      })
      .catch((e) => {
        if (cancelled) return
        setError(typeof e?.bodyText === 'string' && e.bodyText.length > 0 ? e.bodyText : 'Request failed')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiPath])

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>People</h2>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or id"
          style={{ flex: 1, padding: 8 }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={onlyWithLedger}
            onChange={(e) => setOnlyWithLedger(e.target.checked)}
          />
          Only with ledger
        </label>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}

      <ul>
        {people.map((p) => (
          <li key={p.person_id}>
            <Link to={`/people/${encodeURIComponent(p.person_id)}`}>{p.display_name}</Link>
            {p.chamber ? ` — ${p.chamber}` : ''}
            {p.state ? ` (${p.state})` : ''}
          </li>
        ))}
      </ul>
    </section>
  )
}
