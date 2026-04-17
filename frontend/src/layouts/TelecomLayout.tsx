import React from 'react';
import SectorBackground from '../components/SectorBackground';

export default function TelecomLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen" style={{ background: '#272a2e' }}>
      <SectorBackground />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
