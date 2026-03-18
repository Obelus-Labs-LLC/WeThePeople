import React from 'react';
import Plasma from '../components/Plasma';

/**
 * Shared layout for all health sector pages.
 * Full-screen Plasma WebGL shader background in white.
 */
export default function HealthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen" style={{ background: '#0a0a0f' }}>
      {/* Plasma shader background — fixed, full viewport */}
      <div className="fixed inset-0 z-0" style={{ width: '100%', height: '100%' }}>
        <Plasma
          color="#ffffff"
          speed={1}
          direction="forward"
          scale={1.7}
          opacity={0.15}
          mouseInteractive
        />
      </div>

      {/* Page content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
