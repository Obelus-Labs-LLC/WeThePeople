import React, { useEffect, useRef, useCallback } from 'react';

interface WavesProps {
  /** Color of the wave lines */
  lineColor?: string;
  /** Canvas background color */
  backgroundColor?: string;
  /** Horizontal wave oscillation speed */
  waveSpeedX?: number;
  /** Vertical wave oscillation speed */
  waveSpeedY?: number;
  /** Horizontal wave amplitude in px */
  waveAmpX?: number;
  /** Vertical wave amplitude in px */
  waveAmpY?: number;
  /** Spring friction (0–1, higher = more damping) */
  friction?: number;
  /** Spring tension (0–1, higher = snappier) */
  tension?: number;
  /** Max cursor displacement in px */
  maxCursorMove?: number;
  /** Horizontal gap between control points */
  xGap?: number;
  /** Vertical gap between wave lines */
  yGap?: number;
}

interface Point {
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
}

const Waves: React.FC<WavesProps> = ({
  lineColor = '#4a8eb0',
  backgroundColor = '#000000',
  waveSpeedX = 0.035,
  waveSpeedY = 0.01,
  waveAmpX = 40,
  waveAmpY = 20,
  friction = 0.9,
  tension = 0.01,
  maxCursorMove = 120,
  xGap = 12,
  yGap = 36,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const boundRef = useRef({ width: 0, height: 0 });
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const linesRef = useRef<Point[][]>([]);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);

  const initLines = useCallback(() => {
    const { width, height } = boundRef.current;
    const lines: Point[][] = [];
    const rows = Math.ceil(height / yGap) + 1;
    const cols = Math.ceil(width / xGap) + 2;

    for (let r = 0; r < rows; r++) {
      const row: Point[] = [];
      for (let c = 0; c < cols; c++) {
        const x = c * xGap;
        const y = r * yGap;
        row.push({ x, y, ox: x, oy: y, vx: 0, vy: 0 });
      }
      lines.push(row);
    }
    linesRef.current = lines;
  }, [xGap, yGap]);

  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    const { width, height } = boundRef.current;
    if (!ctx) return;

    frameRef.current++;
    const t = frameRef.current;
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    for (const row of linesRef.current) {
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;

      for (let i = 0; i < row.length; i++) {
        const p = row[i];

        // Wave motion
        const waveX = Math.sin(t * waveSpeedX + p.oy * 0.01 + i * 0.1) * waveAmpX;
        const waveY = Math.cos(t * waveSpeedY + p.ox * 0.008 + i * 0.08) * waveAmpY;

        // Cursor repulsion
        const dx = p.ox + waveX - mx;
        const dy = p.oy + waveY - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let cursorPushX = 0;
        let cursorPushY = 0;

        if (dist < maxCursorMove && dist > 0) {
          const force = (1 - dist / maxCursorMove) * maxCursorMove * 0.5;
          cursorPushX = (dx / dist) * force;
          cursorPushY = (dy / dist) * force;
        }

        // Target position
        const tx = p.ox + waveX + cursorPushX;
        const ty = p.oy + waveY + cursorPushY;

        // Spring physics
        p.vx += (tx - p.x) * tension;
        p.vy += (ty - p.y) * tension;
        p.vx *= friction;
        p.vy *= friction;
        p.x += p.vx;
        p.y += p.vy;

        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          const prev = row[i - 1];
          const cpx = (prev.x + p.x) / 2;
          const cpy = (prev.y + p.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, cpx, cpy);
        }
      }

      ctx.stroke();
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [
    lineColor,
    backgroundColor,
    waveSpeedX,
    waveSpeedY,
    waveAmpX,
    waveAmpY,
    friction,
    tension,
    maxCursorMove,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
      boundRef.current = { width: rect.width, height: rect.height };
      initLines();
    };

    // Track mouse at document level so waves react even under content layers
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('mousemove', handleMouseMove);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [initLines, tick]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};

export default Waves;
