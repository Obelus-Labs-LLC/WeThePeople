import React from 'react';
import SectorBackground from '../components/SectorBackground';

/**
 * Shared layout for all health sector pages.
 * Uses standardized cube pattern background.
 */
export default function HealthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen" style={{ background: '#181c21' }}>
      <SectorBackground />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
