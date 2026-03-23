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
    fetch(`${API_BASE}/anomalies/entity/${entityType}/${entityId}?min_score=7`)
      .then((r) => r.json())
      .then((data) => setCount(data.total || 0))
      .catch(() => {});
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
