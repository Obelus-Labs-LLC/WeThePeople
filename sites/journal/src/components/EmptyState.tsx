import { FileSearch } from 'lucide-react';

interface EmptyStateProps {
  message?: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-800/50 mb-6">
        <FileSearch size={28} className="text-zinc-600" />
      </div>
      <h3
        className="text-xl font-bold text-zinc-400 mb-2"
        style={{ fontFamily: 'Oswald, sans-serif' }}
      >
        No Stories Yet
      </h3>
      <p className="text-sm text-zinc-500 max-w-md leading-relaxed">
        {message || 'Our investigation pipeline is generating stories from government data. Check back soon for data-driven investigations into corporate influence.'}
      </p>
    </div>
  );
}
