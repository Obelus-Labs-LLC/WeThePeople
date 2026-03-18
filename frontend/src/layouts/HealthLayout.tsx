import React from 'react';
import LightRays from '../components/LightRays';

/**
 * Shared layout for all health sector pages.
 * LightRays background — lightweight, no WebGL.
 */
export default function HealthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen" style={{ background: '#0a0a0f' }}>
      {/* LightRays background — fixed, full viewport */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <LightRays
          raysOrigin="top-center"
          raysColor="#ff0000"
          raysSpeed={1}
          lightSpread={2}
          rayLength={3}
          pulsating
          fadeDistance={2}
          saturation={1}
          noiseAmount={0.3}
        />
      </div>

      {/* Page content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
