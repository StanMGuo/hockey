import { describe, expect, it } from 'vitest';
import { BASE, LEARN_ORDER, SCN, getScn, mirror } from './scenarios';
import { SEQS } from './sequences';

describe('scenarios data', () => {
  it('T-DATA-01 BASE length and unique ids', () => {
    expect(BASE.length).toBe(11);
    expect(new Set(BASE.map((b) => b.id)).size).toBe(11);
  });

  it('T-DATA-02 mirror flips y and side', () => {
    const m = mirror(getScn('behindnet'));
    expect(m.id).toBe('behindnet_m');
    expect(m.puck[1]).toBe(-getScn('behindnet').puck[1]);
    expect(m.side).toBe(-1);
  });

  it('T-DATA-03 LEARN_ORDER in SCN', () => {
    for (const id of LEARN_ORDER) expect(SCN[id]).toBeTruthy();
  });

  it('T-DATA-04 SEQS steps resolvable', () => {
    for (const seq of SEQS) {
      if (!seq.steps) continue;
      for (const id of seq.steps) expect(() => getScn(id)).not.toThrow();
    }
  });
});
