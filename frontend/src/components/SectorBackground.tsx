/**
 * Shared sector-page background.
 *
 * Historical note: through April 2026 this rendered a repeating-linear-gradient
 * stripe pattern + an SVG cube overlay. Multiple users reported they found the
 * lines visually noisy, so the pattern was stripped on 2026-04-17 and replaced
 * with a flat fill (#272a2e — same tonal family as the original base, just
 * without the pattern).
 *
 * Kept as a component (rather than inlining the colour) so we can swap the
 * treatment later in one place if we ever reintroduce a background.
 */
export default function SectorBackground() {
  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ backgroundColor: '#272a2e' }}
    />
  );
}
