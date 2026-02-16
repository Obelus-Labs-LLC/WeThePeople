import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = 'Loading...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-blue-600" />
      <div className="mt-3 text-sm text-stone-500">{message}</div>
    </div>
  );
};

export default LoadingSpinner;
