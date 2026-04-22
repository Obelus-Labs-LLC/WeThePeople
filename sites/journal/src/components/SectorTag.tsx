import { SECTOR_LABELS } from '../types';

interface SectorTagProps {
  sector: string;
}

export function SectorTag({ sector }: SectorTagProps) {
  const label = SECTOR_LABELS[sector] ?? sector;

  return (
    <span
      className="inline-block"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        padding: '3px 8px',
        borderRadius: '999px',
        border: '1px solid rgba(235,229,213,0.12)',
        color: 'var(--color-text-3)',
      }}
    >
      {label}
    </span>
  );
}
