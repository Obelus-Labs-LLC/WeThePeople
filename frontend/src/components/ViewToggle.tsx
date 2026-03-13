import React from 'react';
import { Globe, LayoutGrid } from 'lucide-react';
import './ViewToggle.css';

export type ViewMode = 'dome' | 'list';

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}

// Sparkle config — small decorative particles inside the knob
const SPARKLES = [
  { deg: 0, width: 30, duration: 15 },
  { deg: 45, width: 10, duration: 30 },
  { deg: 90, width: 25, duration: 20 },
  { deg: 135, width: 15, duration: 25 },
  { deg: 180, width: 20, duration: 18 },
  { deg: 225, width: 8, duration: 35 },
  { deg: 270, width: 22, duration: 22 },
  { deg: 315, width: 12, duration: 28 },
];

export default function ViewToggle({ mode, onChange }: ViewToggleProps) {
  const isChecked = mode === 'list';

  const handleChange = () => {
    onChange(isChecked ? 'dome' : 'list');
  };

  return (
    <div className="flex flex-col items-center">
      <div className="view-toggle-cont">
        <input
          id="view-toggle"
          className="toggle-input"
          type="checkbox"
          checked={isChecked}
          onChange={handleChange}
        />
        <label htmlFor="view-toggle" className="toggle-label">
          <span className="cont-icon">
            {SPARKLES.map((s, i) => (
              <span
                key={i}
                className="sparkle"
                style={{
                  '--deg': s.deg,
                  '--width': s.width,
                  '--duration': s.duration,
                } as React.CSSProperties}
              />
            ))}
            <span className="icon">
              {isChecked ? <LayoutGrid size={16} /> : <Globe size={16} />}
            </span>
          </span>
        </label>
      </div>
      <div className="view-toggle-labels">
        <span className={!isChecked ? 'active' : ''}>Dome</span>
        <span className={isChecked ? 'active' : ''}>Directory</span>
      </div>
    </div>
  );
}
