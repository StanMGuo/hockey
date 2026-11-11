import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getScn, SCN } from '../data/scenarios';
import { zonesFor } from './zones';
import { kindOf } from './kind';

const golden = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__/zones.golden.json'), 'utf8'),
) as Record<string, ReturnType<typeof zonesFor>>;

function expectZoneClose(
  a: { cx: number; cy: number; rx: number; ry: number },
  b: { cx: number; cy: number; rx: number; ry: number },
) {
  expect(a.cx).toBeCloseTo(b.cx, 9);
  expect(a.cy).toBeCloseTo(b.cy, 9);
  expect(a.rx).toBeCloseTo(b.rx, 9);
  expect(a.ry).toBeCloseTo(b.ry, 9);
}

describe('zonesFor', () => {
  it('T-ZONE-01 each kind representative matches golden', () => {
    for (const id of ['wall', 'stolen', 'rim', 'carry', 'out']) {
      const Z = zonesFor(getScn(id));
      expectZoneClose(Z.S, golden[id]!.S);
      expectZoneClose(Z.W, golden[id]!.W);
      expect(Z.kind).toBe(golden[id]!.kind);
    }
  });

  it('T-ZONE-02 own deep delta increases cx', () => {
    const shallow = zonesFor({ ...getScn('wall'), puck: [20, -37] });
    const deep = zonesFor({ ...getScn('wall'), puck: [65, -37] });
    expect(deep.S.cx).toBeGreaterThan(shallow.S.cx);
    expect(deep.W.cx).toBeGreaterThan(shallow.W.cx);
  });

  it('T-ZONE-03 carry/out clamp bounds', () => {
    const carry = zonesFor(getScn('carry'));
    expect(carry.S.cx).toBeGreaterThanOrEqual(1);
    expect(carry.S.cx).toBeLessThanOrEqual(26);
    const out = zonesFor(getScn('out'));
    expect(out.S.cx).toBeGreaterThanOrEqual(-20);
    expect(out.S.cx).toBeLessThanOrEqual(-8);
  });

  it('T-ZONE-04 sneak has lurker', () => {
    const Z = zonesFor(getScn('sneak'));
    expect(Z.lurker).not.toBeNull();
    expect(Z.W.cx).toBeLessThanOrEqual((Z.lurker!.x - 6));
  });

  it('T-ZONE-05 wall (own, no sneak) lurker null', () => {
    expect(zonesFor(getScn('wall')).lurker).toBeNull();
  });

  it('T-ZONE-06 mirror flips cy signs', () => {
    for (const id of Object.keys(SCN).filter((k) => !k.endsWith('_m'))) {
      const a = zonesFor(getScn(id));
      const b = zonesFor(getScn(id + '_m'));
      expect(b.S.cx).toBeCloseTo(a.S.cx, 9);
      expect(b.S.cy).toBeCloseTo(-a.S.cy, 9);
      expect(b.W.cx).toBeCloseTo(a.W.cx, 9);
      expect(b.W.cy).toBeCloseTo(-a.W.cy, 9);
    }
  });

  it('all scenarios match golden zones', () => {
    for (const id of Object.keys(SCN)) {
      const Z = zonesFor(getScn(id));
      expect(kindOf(getScn(id))).toBe(Z.kind);
      expectZoneClose(Z.S, golden[id]!.S);
      expectZoneClose(Z.W, golden[id]!.W);
    }
  });
});
