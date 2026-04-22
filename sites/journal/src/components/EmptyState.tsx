import { FileSearch } from 'lucide-react';

interface EmptyStateProps {
  message?: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-20 text-center px-4"
    >
      <div
        className="inline-flex items-center justify-center mb-6"
        style={{
          width: 64,
          height: 64,
          borderRadius: '999px',
          background: 'rgba(235,229,213,0.04)',
          border: '1px solid rgba(235,229,213,0.08)',
        }}
      >
        <FileSearch size={26} style={{ color: 'var(--color-text-3)' }} />
      </div>
      <h3
        className="mb-3"
        style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontWeight: 900,
          fontSize: '26px',
          letterSpacing: '-0.01em',
          color: 'var(--color-text-1)',
        }}
      >
        No Stories Yet
      </h3>
      <p
        className="max-w-md"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '14px',
          lineHeight: 1.7,
          color: 'var(--color-text-2)',
        }}
      >
        {message || 'Our investigation pipeline is generating stories from government data. Check back soon for data-driven investigations into corporate influence.'}
      </p>
    </div>
  );
}
