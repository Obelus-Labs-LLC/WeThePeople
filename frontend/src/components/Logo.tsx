import React from 'react';

/**
 * WTP Logo — thin-bordered italic-serif mark + Inter wordmark.
 *
 * Replaces the legacy filled-blue "WP" square. Used in SectorHeader,
 * Footer, and anywhere the brand mark appears.
 *
 * Sibling sites (Verify, Research, Journal) pass their own `mark` +
 * `accent` to re-skin with their accent color and three-letter mark
 * ("VFY", "RSH", etc.).
 */

type LogoSize = 'sm' | 'md' | 'lg';

interface LogoProps {
  size?: LogoSize;
  /** Accent colour for border + inner mark. Defaults to --color-accent. */
  accent?: string;
  /** 3-letter mark inside the border. Defaults to "WTP". */
  mark?: string;
  /** Wordmark text to the right of the box. Set to null to hide. */
  wordmark?: string | null;
  /** Optional extra className for positioning the outer flex container. */
  className?: string;
}

/**
 * Size presets mirror the spec:
 *   sm: 26px box, 10px mark, 13px wordmark
 *   md: 32px box, 12px mark, 15px wordmark  (default)
 *   lg: 44px box, 16px mark, 20px wordmark
 */
const SIZES: Record<LogoSize, { box: number; mark: number; gap: number; word: number }> = {
  sm: { box: 26, mark: 10, gap: 8,  word: 13 },
  md: { box: 32, mark: 12, gap: 10, word: 15 },
  lg: { box: 44, mark: 16, gap: 12, word: 20 },
};

export default function Logo({
  size = 'md',
  accent = 'var(--color-accent)',
  mark = 'WTP',
  wordmark = 'WeThePeople',
  className = '',
}: LogoProps) {
  const s = SIZES[size];

  return (
    <div
      className={`inline-flex items-center ${className}`}
      style={{ gap: s.gap }}
      aria-label={wordmark ? `${mark} — ${wordmark}` : mark}
    >
      <div
        aria-hidden="true"
        style={{
          width: s.box,
          height: s.box,
          border: `1.5px solid ${accent}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Playfair Display', serif",
          fontStyle: 'italic',
          fontSize: s.mark,
          color: accent,
          letterSpacing: '-0.03em',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        {mark}
      </div>
      {wordmark !== null && (
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: s.word,
            color: 'var(--color-text-1)',
            letterSpacing: '0.005em',
          }}
        >
          {wordmark}
        </span>
      )}
    </div>
  );
}
