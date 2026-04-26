import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';

const API_BASE = getApiBaseUrl();

interface AnomalyBadgeProps {
  entityType: string;  // 'person' or 'company'
  entityId: string;
}

export default function AnomalyBadge({ entityType, entityId }: AnomalyBadgeProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!entityType || !entityId) return;
    const controller = new AbortController();
    fetch(
      `${API_BASE}/anomalies/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}?min_score=7`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setCount(data.total || 0);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.warn('[AnomalyBadge] fetch failed:', err);
        }
      });
    return () => controller.abort();
  }, [entityType, entityId]);

  if (count === 0) return null;

  return (
    <Link
      to={`/influence/anomalies?entity_type=${entityType}&entity_id=${entityId}`}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-80 bg-amber-500/20 text-amber-400 border-amber-500/30 no-underline"
      title={`${count} suspicious pattern${count !== 1 ? 's' : ''} detected (score >= 7)`}
    >
      <AlertTriangle className="w-3.5 h-3.5" />
      {count} suspicious pattern{count !== 1 ? 's' : ''}
    </Link>
  );
}
