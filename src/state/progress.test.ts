import { describe, expect, it } from 'vitest';
import { MemoryProgressStore } from './LocalStorageProgressStore';
import { UNLOCK, defaultProg, normalizeProgress, unlocked } from './progress';

describe('progress', () => {
  it('T-PROG-01 default shape', () => {
    expect(defaultProg()).toEqual({
      passes: { 1: 0, 2: 0, 3: 0 },
      completed: 0,
      learnIdx: 0,
      game: {},
      unlockAll: false,
      sound: true,
      seenHow: false,
    });
  });

  it('T-PROG-02 unlock ladder', () => {
    const p = defaultProg();
    expect(unlocked(p, 1)).toBe(true);
    expect(unlocked(p, 2)).toBe(false);
    p.passes[1] = UNLOCK;
    expect(unlocked(p, 2)).toBe(true);
    expect(unlocked(p, 3)).toBe(false);
  });

  it('T-PROG-03 unlockAll', () => {
    const p = defaultProg();
    p.unlockAll = true;
    expect(unlocked(p, 4)).toBe(true);
  });

  it('T-PROG-04 save/load roundtrip', () => {
    const store = new MemoryProgressStore();
    const p = defaultProg();
    p.passes[1] = 3;
    p.completed = 7;
    store.save(p);
    expect(store.load()).toEqual(p);
  });

  it('T-PROG-05 bad json normalize', () => {
    expect(normalizeProgress(null).passes[1]).toBe(0);
    expect(normalizeProgress('{ bad').passes[1]).toBe(0);
    expect(normalizeProgress({ passes: { 1: 2 } }).passes[1]).toBe(2);
  });
});
