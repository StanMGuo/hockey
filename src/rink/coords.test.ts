import { describe, expect, it } from 'vitest';
import { clampToIce, isPortrait, landscapeViewBox, portraitViewBox } from './coords';

describe('coords', () => {
  it('T-RINK-01 clampToIce clamps extremes', () => {
    const p = clampToIce({ x: -100, y: 100 });
    expect(p.x).toBeGreaterThanOrEqual(-25);
    expect(p.y).toBeLessThanOrEqual(39.5);
  });

  it('T-RINK-02 orientation helpers', () => {
    expect(isPortrait(900, 400)).toBe(true);
    expect(isPortrait(400, 900)).toBe(false);
    expect(portraitViewBox()).toContain('-46');
    expect(landscapeViewBox()).toContain('-27');
  });
});
