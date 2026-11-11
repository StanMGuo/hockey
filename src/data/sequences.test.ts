import { describe, expect, it } from 'vitest';
import { POOL, SCN } from './scenarios';
import { SEQS, randomSequence } from './sequences';

describe('randomSequence', () => {
  it('T-DATA-05 constraints with mocked rng', () => {
    let i = 0;
    // POOL indices 0,2,10,12,4,14 → us,us,them,them,us,them (3 changes, 6 distinct bases)
    const values = [0, 2, 10, 12, 4, 14].map((k) => (k + 0.5) / POOL.length);
    const rng = () => values[i++ % values.length]!;
    const ids = randomSequence(rng);
    expect(ids.length).toBe(6);
    expect(SCN[ids[0]!]!.has).toBe('us');
    const bases = ids.map((id) => id.replace(/_m$/, ''));
    expect(new Set(bases).size).toBe(6);
    let changes = 0;
    for (let k = 1; k < ids.length; k++) {
      if (SCN[ids[k]!]!.has !== SCN[ids[k - 1]!]!.has) changes++;
    }
    expect(changes).toBeGreaterThanOrEqual(2);
    expect(changes).toBeLessThanOrEqual(4);
  });

  it('T-DATA-06 fallback is cycle steps', () => {
    // Force exhausted tries by always returning same id candidate
    const ids = randomSequence(() => 0);
    // With rng=0, pick always returns POOL[0]; uniqueness fails every try → fallback
    expect(ids).toEqual(SEQS[0]!.steps);
  });
});
