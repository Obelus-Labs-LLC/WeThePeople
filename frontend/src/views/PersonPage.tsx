import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { apiGetJson } from '../ui/api'
import type { PersonDirectoryEntry, PersonLedgerResponse } from '../ui/types'

export function PersonPage() {
  const { personId } = useParams()
  const pid = personId ?? ''

  const [dirLoading, setDirLoading] = useState(false)
  const [dirError, setDirError] = useState<string | null>(null)
  const [person, setPerson] = useState<PersonDirectoryEntry | null>(null)

  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const [ledger, setLedger] = useState<PersonLedgerResponse | null>(null)

  const ledgerPath = useMemo(() => {
    const params = new URLSearchParams()
    params.set('limit', '50')
    params.set('offset', '0')
    return `/ledger/person/${encodeURIComponent(pid)}?${params.toString()}`
  }, [pid])

  useEffect(() => {
    let cancelled = false
    setDirLoading(true)
    setDirError(null)
    apiGetJson<PersonDirectoryEntry>(`/people/${encodeURIComponent(pid)}`)
      .then((data) => {
        if (cancelled) return
        setPerson(data)
      })
      .catch((e) => {
        if (cancelled) return
        setDirError(typeof e?.bodyText === 'string' && e.bodyText.length > 0 ? e.bodyText : 'Request failed')
      })
      .finally(() => {
        if (cancelled) return
        setDirLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pid])

  useEffect(() => {
    let cancelled = false
    setLedgerLoading(true)
    setLedgerError(null)
    apiGetJson<PersonLedgerResponse>(ledgerPath)
      .then((data) => {
        if (cancelled) return
        setLedger(data)
      })
      .catch((e) => {
        if (cancelled) return
        setLedgerError(typeof e?.bodyText === 'string' && e.bodyText.length > 0 ? e.bodyText : 'Request failed')
      })
      .finally(() => {
        if (cancelled) return
        setLedgerLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ledgerPath])

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Person</h2>

      {dirLoading && <p>Loading person…</p>}
      {dirError && <p style={{ color: 'crimson' }}>Error: {dirError}</p>}
      {person && (
        <div>
          <div><strong>{person.display_name}</strong></div>
          <div>{[person.chamber, person.state, person.party].filter(Boolean).join(' · ')}</div>
        </div>
      )}

      <h3>Ledger</h3>
      {ledgerLoading && <p>Loading ledger…</p>}
      {ledgerError && <p style={{ color: 'crimson' }}>Error: {ledgerError}</p>}
      {ledger && (
        <div>
          <div>Total: {ledger.total}</div>
          <ul>
            {ledger.entries.map((e) => (
              <li key={e.id}>
                <div>
                  <span>{e.tier}</span>
                  {e.claim_date ? ` · ${e.claim_date}` : ''}
                </div>
                <div>{e.normalized_text}</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Link to={`/claims/${e.claim_id}`}>Claim detail</Link>
                  {e.matched_bill_id ? (
                    <Link to={`/bills/${encodeURIComponent(e.matched_bill_id)}/timeline`}>Bill timeline</Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
