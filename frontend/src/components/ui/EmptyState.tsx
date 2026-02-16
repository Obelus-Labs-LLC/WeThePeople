import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon = '📭', title, message }) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 py-16 px-8">
      <div className="text-4xl">{icon}</div>
      <div className="mt-3 text-lg font-semibold text-stone-700">{title}</div>
      {message && <div className="mt-1 text-sm text-stone-500 text-center max-w-md">{message}</div>}
    </div>
  );
};

export default EmptyState;
