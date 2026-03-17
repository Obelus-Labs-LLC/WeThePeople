import React from 'react';
import './EnergyLayout.css';

/**
 * Shared layout for all energy sector pages.
 * Animated cube pattern background (CSS-only).
 */
export default function EnergyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen" style={{ background: '#181c21' }}>
      {/* Animated cube pattern background — fixed behind content */}
      <div className="energy-bg-container fixed inset-0 z-0 pointer-events-none">
        <div className="energy-pattern-bg" />
        {/* SVG cube grid overlay */}
        <svg
          className="energy-cube-svg"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 800 800"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id="energy-cubes" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
              <path
                d="M40 0 L80 20 L80 60 L40 80 L0 60 L0 20 Z"
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="1"
              />
              <path
                d="M40 0 L40 40 M0 20 L40 40 M80 20 L40 40"
                fill="none"
                stroke="rgba(255,255,255,0.03)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#energy-cubes)" />
        </svg>
      </div>
      {/* Page content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
