import React from 'react';
import Aurora from '../components/Aurora';

/**
 * Shared layout for all finance sector pages.
 * Renders the Aurora WebGL background behind page content.
 */
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#0a0a0f]">
      {/* Aurora background — fixed so it stays behind on scroll */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Aurora
          colorStops={['#5227FF', '#7cff67', '#5227FF']}
          amplitude={1.0}
          blend={0.5}
          speed={1.0}
        />
      </div>
      {/* Page content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
