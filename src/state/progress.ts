import type { Progress } from '../types';

export const STORE_KEY = 'hdt-progress-v1';
export const UNLOCK = 5;

export function defaultProg(): Progress {
  return {
    passes: { 1: 0, 2: 0, 3: 0 },
    completed: 0,
    learnIdx: 0,
    game: {},
    unlockAll: false,
    sound: true,
    seenHow: false,
  };
}

export function unlocked(prog: Progress, level: number): boolean {
  return level === 1 || prog.unlockAll || (prog.passes[level - 1] || 0) >= UNLOCK;
}

export function normalizeProgress(raw: unknown): Progress {
  const d = defaultProg();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Partial<Progress>;
  return {
    passes: { 1: o.passes?.[1] || 0, 2: o.passes?.[2] || 0, 3: o.passes?.[3] || 0 },
    completed: typeof o.completed === 'number' ? o.completed : 0,
    learnIdx: typeof o.learnIdx === 'number' ? o.learnIdx : 0,
    game: o.game && typeof o.game === 'object' ? o.game : {},
    unlockAll: !!o.unlockAll,
    sound: o.sound !== false,
    seenHow: !!o.seenHow,
  };
}
