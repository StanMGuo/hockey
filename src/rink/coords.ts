import { clamp } from '../engine/geometry';

export const H = 42.5;
export const E = 75;
export const C = 28;
export const GL = 64;
export const LX = -32;
export const D_START = [
  { x: -21, y: -33 },
  { x: -21, y: 33 },
] as const;

export function clampToIce(p: { x: number; y: number }): { x: number; y: number } {
  let x = clamp(p.x, -25, 71.5);
  let y = clamp(p.y, -39.5, 39.5);
  const cy = H - C;
  if (x > E - C && Math.abs(y) > cy) {
    const vx = x - (E - C);
    const vy = Math.abs(y) - cy;
    const L = Math.hypot(vx, vy);
    const maxL = C - 3;
    if (L > maxL) {
      x = E - C + (vx / L) * maxL;
      y = Math.sign(y) * (cy + (vy / L) * maxL);
    }
  }
  return { x, y };
}

export function portraitViewBox(): string {
  return '-46 -78 92 105';
}

export function landscapeViewBox(): string {
  return '-27 -46 105 92';
}

export function isPortrait(innerHeight: number, innerWidth: number): boolean {
  return innerHeight > innerWidth * 1.05;
}
