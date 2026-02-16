import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { apiGetJson } from '../ui/api'
import type { BillTimelineResponse } from '../ui/types'

export function BillTimelinePage() {
  const { billId } = useParams()
  const bid = billId ?? ''

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<BillTimelineResponse | null>(null)

  const apiPath = useMemo(() => {
    const params = new URLSearchParams()
    params.set('limit', '100')
    params.set('offset', '0')
    return `/bills/${encodeURIComponent(bid)}/timeline?${params.toString()}`
  }, [bid])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiGetJson<BillTimelineResponse>(apiPath)
      .then((data) => {
        if (cancelled) return
        setTimeline(data)
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
      <h2 style={{ marginTop: 0 }}>Bill timeline</h2>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}

      {timeline && (
        <div>
          <div><strong>{timeline.bill_id}</strong> — actions: {timeline.total}</div>
          <ol>
            {timeline.actions.map((a) => (
              <li key={a.id}>
                <div>{a.action_date}</div>
                <div>{a.description}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
