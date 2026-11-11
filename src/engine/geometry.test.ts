import { describe, expect, it } from 'vitest';
import { clamp, ellD, grade, sideOf } from './geometry';

describe('geometry', () => {
  it('T-GEO-01 clamp', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('T-GEO-02 ellD center / boundary / outside', () => {
    const z = { cx: 0, cy: 0, rx: 2, ry: 4 };
    expect(ellD({ x: 0, y: 0 }, z)).toBe(0);
    expect(ellD({ x: 2, y: 0 }, z)).toBeCloseTo(1);
    expect(ellD({ x: 4, y: 0 }, z)).toBeGreaterThan(1);
  });

  it('T-GEO-03 grade thresholds', () => {
    expect(grade(1)).toBe('good');
    expect(grade(1.8)).toBe('close');
    expect(grade(1.81)).toBe('off');
  });

  it('T-GEO-04 sideOf', () => {
    expect(sideOf({ puck: [0, 1] })).toBe(1);
    expect(sideOf({ puck: [0, -1] })).toBe(-1);
    expect(sideOf({ puck: [0, -1], side: 1 })).toBe(1);
    expect(sideOf({ puck: [0, 1], side: -1 })).toBe(-1);
  });
});
