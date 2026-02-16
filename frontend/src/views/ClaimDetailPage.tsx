import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { apiGetJson } from '../ui/api'
import type { LedgerEntry } from '../ui/types'

export function ClaimDetailPage() {
  const { claimId } = useParams()
  const cid = claimId ?? ''

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [row, setRow] = useState<LedgerEntry | null>(null)

  const ledgerClaimPath = useMemo(() => `/ledger/claim/${encodeURIComponent(cid)}`, [cid])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    apiGetJson<LedgerEntry>(ledgerClaimPath)
      .then((r) => {
        if (cancelled) return
        setRow(r)
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
  }, [ledgerClaimPath])

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Claim</h2>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}

      {row && (
        <div>
          <div>
            <strong>Person:</strong>{' '}
            <Link to={`/people/${encodeURIComponent(row.person_id)}`}>{row.person_id}</Link>
          </div>
          <div><strong>Tier:</strong> {row.tier}</div>
          <div><strong>Text:</strong> {row.normalized_text}</div>
          <div>
            <strong>Source:</strong>{' '}
            {row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer">link</a> : '—'}
          </div>
        </div>
      )}

      {row && (
        <div style={{ marginTop: 12 }}>
          <h3>Why</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.why, null, 2)}</pre>

          <h3>Matched bill</h3>
          <div>{row.matched_bill_id ?? '—'}</div>
          {row.matched_bill_id ? (
            <div>
              <Link to={`/bills/${encodeURIComponent(row.matched_bill_id)}/timeline`}>View bill timeline</Link>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
