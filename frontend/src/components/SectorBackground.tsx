import '../layouts/EnergyLayout.css';

/**
 * Shared animated cube-pattern background for all sector pages.
 * Extracted from EnergyLayout — CSS-only, zero JS overhead.
 */
export default function SectorBackground() {
  return (
    <div className="energy-bg-container fixed inset-0 z-0 pointer-events-none">
      <div className="energy-pattern-bg" />
      <svg
        className="energy-cube-svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 800 800"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="sector-cubes" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
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
        <rect width="100%" height="100%" fill="url(#sector-cubes)" />
      </svg>
    </div>
  );
}
