import React from 'react';
import FloatingLines from '../components/FloatingLines';

/**
 * Shared layout for all politics sector pages.
 * Renders the FloatingLines WebGL background behind page content.
 */
export default function PoliticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#020617]">
      {/* FloatingLines background — fixed so it stays behind on scroll */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <FloatingLines
          linesGradient={['#e90101', '#fafafa', '#0804fb']}
          animationSpeed={1}
          interactive
          bendRadius={5}
          bendStrength={-0.5}
          mouseDamping={0.05}
          parallax
          parallaxStrength={0.2}
        />
      </div>
      {/* Page content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
