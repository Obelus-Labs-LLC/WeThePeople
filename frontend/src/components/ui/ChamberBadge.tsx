import React from 'react';

interface ChamberBadgeProps {
  chamber: string;
}

const ChamberBadge: React.FC<ChamberBadgeProps> = ({ chamber }) => {
  const isHouse = chamber?.toLowerCase().includes('house') || chamber?.toLowerCase() === 'lower';
  const isSenate = chamber?.toLowerCase().includes('senate') || chamber?.toLowerCase() === 'upper';

  const style = isSenate
    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
    : isHouse
      ? 'bg-teal-50 text-teal-700 border-teal-200'
      : 'bg-gray-50 text-gray-600 border-gray-200';

  const label = isSenate ? 'Senate' : isHouse ? 'House' : chamber;

  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
};

export default ChamberBadge;
