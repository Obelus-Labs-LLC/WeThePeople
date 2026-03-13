import React from 'react';
import MagicRings from '../components/MagicRings';

/**
 * Shared layout for all technology sector pages.
 * Renders the MagicRings WebGL background behind page content.
 */
export default function TechLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#09090B]">
      {/* MagicRings background — fixed so it stays behind on scroll */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <MagicRings
          color="#3B82F6"
          colorTwo="#8B5CF6"
          speed={0.6}
          ringCount={5}
          attenuation={12}
          lineThickness={1.5}
          baseRadius={0.3}
          radiusStep={0.12}
          scaleRate={0.08}
          opacity={0.4}
          blur={0}
          noiseAmount={0.06}
          rotation={-15}
          ringGap={1.6}
          fadeIn={0.8}
          fadeOut={0.6}
          followMouse={true}
          mouseInfluence={0.15}
          hoverScale={1.1}
          parallax={0.03}
          clickBurst={true}
        />
      </div>
      {/* Page content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
