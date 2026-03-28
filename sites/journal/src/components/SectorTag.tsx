import { SECTOR_LABELS } from '../types';

interface SectorTagProps {
  sector: string;
}

export function SectorTag({ sector }: SectorTagProps) {
  const label = SECTOR_LABELS[sector] ?? sector;

  return (
    <span className="inline-block text-xs text-zinc-500 border border-zinc-800 rounded px-2 py-0.5">
      {label}
    </span>
  );
}
