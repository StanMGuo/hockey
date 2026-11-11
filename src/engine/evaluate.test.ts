import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getScn, SCN } from '../data/scenarios';
import { D_START } from '../rink/coords';
import { evaluate } from './evaluate';
import { zonesFor } from './zones';

const dir = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(dir, '__fixtures__/evaluate.golden.json'), 'utf8')) as Record<
  string,
  {
    good: { allGood: boolean; pass: boolean; si: number; grades: string[]; dangers: (string | null)[] };
    bad: { allGood: boolean; pass: boolean; grades: string[] };
  }
>;

describe('evaluate', () => {
  it('T-EVAL-01 role swap keeps allGood', () => {
    const st = getScn('wall');
    const Z = zonesFor(st);
    const a = evaluate(st, [
      { x: Z.S.cx, y: Z.S.cy },
      { x: Z.W.cx, y: Z.W.cy },
    ]);
    const b = evaluate(st, [
      { x: Z.W.cx, y: Z.W.cy },
      { x: Z.S.cx, y: Z.S.cy },
    ]);
    expect(a.allGood).toBe(true);
    expect(b.allGood).toBe(true);
    expect(a.si).not.toBe(b.si);
    expect(a.pass).toBe(b.pass);
  });

  it('T-EVAL-02 both inside => good', () => {
    const st = getScn('wall');
    const Z = zonesFor(st);
    const ev = evaluate(st, [
      { x: Z.S.cx, y: Z.S.cy },
      { x: Z.W.cx, y: Z.W.cy },
    ]);
    expect(ev.res.every((r) => r.g === 'good')).toBe(true);
    expect(ev.allGood).toBe(true);
    expect(ev.pass).toBe(true);
  });

  it('T-EVAL-03 close still passes', () => {
    const st = getScn('wall');
    const Z = zonesFor(st);
    const ev = evaluate(st, [
      { x: Z.S.cx, y: Z.S.cy },
      { x: Z.W.cx + Z.W.rx * 1.4, y: Z.W.cy },
    ]);
    const w = ev.res[ev.wi]!;
    expect(w.g).toBe('close');
    expect(ev.pass).toBe(true);
    expect(ev.allGood).toBe(false);
  });

  it('T-EVAL-04 off fails', () => {
    const st = getScn('wall');
    const Z = zonesFor(st);
    const ev = evaluate(st, [
      { x: Z.S.cx, y: Z.S.cy },
      { x: Z.W.cx + Z.W.rx * 3, y: Z.W.cy },
    ]);
    expect(ev.res[ev.wi]!.g === 'off' || ev.res[ev.wi]!.g === 'danger').toBe(true);
    expect(ev.pass).toBe(false);
  });

  it('T-EVAL-05 chase past puck => deep danger', () => {
    const st = getScn('stolen');
    const ev = evaluate(st, [
      { x: st.puck[0] + 10, y: -33 },
      { x: -10, y: 0 },
    ]);
    expect(ev.res.some((r) => r.danger === 'deep')).toBe(true);
  });

  it('T-EVAL-06 them W too deep', () => {
    const st = getScn('stolen');
    const Z = zonesFor(st);
    const ev = evaluate(st, [
      { x: Z.S.cx, y: Z.S.cy },
      { x: 25, y: Z.W.cy },
    ]);
    expect(ev.res[ev.wi]!.danger).toBe('deep');
  });

  it('T-EVAL-07 us W tooDeep', () => {
    const st = getScn('wall');
    const Z = zonesFor(st);
    const ev = evaluate(st, [
      { x: Z.S.cx, y: Z.S.cy },
      { x: 45, y: Z.W.cy },
    ]);
    expect(ev.res[ev.wi]!.danger).toBe('tooDeep');
  });

  it('T-EVAL-08 boards danger when lane open', () => {
    const st = getScn('wall');
    const ev = evaluate(st, [
      { x: 10, y: 0 },
      { x: 12, y: 5 },
    ]);
    expect(ev.res.some((r) => r.danger === 'boards')).toBe(true);
  });

  it('T-EVAL-09 middle danger when them', () => {
    const st = getScn('stolen');
    const Z = zonesFor(st);
    const ev = evaluate(st, [
      { x: Z.S.cx, y: Z.S.cy },
      { x: 30, y: 30 },
    ]);
    expect(ev.res.some((r) => r.danger === 'middle' || r.danger === 'deep')).toBe(true);
  });

  it('T-EVAL-10 good not overwritten by danger', () => {
    const st = getScn('stolen');
    const Z = zonesFor(st);
    const ev = evaluate(st, [
      { x: Z.S.cx, y: Z.S.cy },
      { x: Z.W.cx, y: Z.W.cy },
    ]);
    expect(ev.res.every((r) => r.g === 'good')).toBe(true);
    expect(ev.res.every((r) => r.danger === null)).toBe(true);
  });

  it('T-EVAL-11 team flags', () => {
    const st = getScn('stolen');
    const same = evaluate(st, [
      { x: 0, y: 30 },
      { x: 5, y: 28 },
    ]);
    expect(same.team.includes('same') || same.team.includes('close')).toBe(true);
    const both = evaluate(st, [
      { x: 30, y: -20 },
      { x: 30, y: 20 },
    ]);
    expect(both.team.includes('bothDeep')).toBe(true);
  });

  it('T-EVAL-12/13 golden good and bad standings', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    for (const id of Object.keys(SCN)) {
      const st = getScn(id);
      const Z = zonesFor(st);
      const good = evaluate(st, [
        { x: Z.S.cx, y: Z.S.cy },
        { x: Z.W.cx, y: Z.W.cy },
      ]);
      expect(good.allGood).toBe(golden[id]!.good.allGood);
      expect(good.pass).toBe(golden[id]!.good.pass);
      const bad = evaluate(st, [
        { x: D_START[0].x, y: D_START[0].y },
        { x: D_START[1].x, y: D_START[1].y },
      ]);
      expect(bad.allGood).toBe(false);
      expect(bad.pass).toBe(golden[id]!.bad.pass);
    }
    vi.restoreAllMocks();
  });
});
