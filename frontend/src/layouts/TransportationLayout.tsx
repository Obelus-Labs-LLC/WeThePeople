import React from 'react';
import SectorBackground from '../components/SectorBackground';

/**
 * Shared layout for all transportation sector pages.
 * Uses standardized cube pattern background (same as all sectors).
 * NOTE: All sector layouts use identical implementation. Kept separate for future per-sector customization.
 */
export default function TransportationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen" style={{ background: '#272a2e' }}>
      <SectorBackground />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
