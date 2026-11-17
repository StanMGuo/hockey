import { describe, expect, it } from 'vitest';
import { MemoryProgressStore } from './LocalStorageProgressStore';
import { UNLOCK, defaultProg, initialProgressForCreate, isEmptyProgress, normalizeProgress, shouldDropAnonymous, unlocked } from './progress';

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

  it('T-ID-03 empty progress ignores sound and seenHow', () => {
    expect(isEmptyProgress(defaultProg())).toBe(true);
    const seen = defaultProg();
    seen.seenHow = true;
    seen.sound = false;
    expect(isEmptyProgress(seen)).toBe(true);
    const started = defaultProg();
    started.passes[1] = 1;
    expect(isEmptyProgress(started)).toBe(false);
  });

  it('T-ID-04 uploads a non-empty local progress only for a new profile', () => {
    const local = defaultProg();
    local.passes[1] = 2;
    local.completed = 2;
    expect(initialProgressForCreate(local)).toEqual(local);
    expect(shouldDropAnonymous(false, local)).toBe(false);
  });

  it('T-ID-05 keeps cloud progress when the profile already exists', () => {
    const local = defaultProg();
    local.completed = 4;
    expect(shouldDropAnonymous(true, local)).toBe(true);
    expect(initialProgressForCreate(defaultProg())).toEqual(defaultProg());
  });

  it('T-PROG-05 bad json normalize', () => {
    expect(normalizeProgress(null).passes[1]).toBe(0);
    expect(normalizeProgress('{ bad').passes[1]).toBe(0);
    expect(normalizeProgress({ passes: { 1: 2 } }).passes[1]).toBe(2);
  });
});
