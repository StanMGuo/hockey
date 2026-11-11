import type { Progress } from '../types';
import type { ProgressStore } from './ProgressStore';
import { STORE_KEY, defaultProg, normalizeProgress } from './progress';

export class LocalStorageProgressStore implements ProgressStore {
  load(): Progress {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultProg();
      return normalizeProgress(JSON.parse(raw));
    } catch {
      return defaultProg();
    }
  }

  save(prog: Progress): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(prog));
    } catch {
      /* ignore quota / private mode */
    }
  }
}

export class MemoryProgressStore implements ProgressStore {
  private data: Progress;
  constructor(initial?: Progress) {
    this.data = initial ? structuredClone(initial) : defaultProg();
  }
  load(): Progress {
    return structuredClone(this.data);
  }
  save(prog: Progress): void {
    this.data = structuredClone(prog);
  }
}
