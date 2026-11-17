import type { Progress } from '../types';

export interface ProgressStore {
  load(): Progress;
  save(prog: Progress): void;
  unsavedNote?(): string | null;
  flush?(): void;
  dispose?(): void;
}
