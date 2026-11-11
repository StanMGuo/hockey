import type { Progress } from '../types';

export interface ProgressStore {
  load(): Progress;
  save(prog: Progress): void;
}
