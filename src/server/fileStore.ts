import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createMemoryStore, type MemorySnapshot } from './memoryStore';
import type { VisitStore } from './store';

export function createFileStore(filePath: string): VisitStore {
  return createMemoryStore({
    load: () => readSnapshot(filePath),
    save: (snapshot) => writeSnapshot(filePath, snapshot),
  });
}

function readSnapshot(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeSnapshot(filePath: string, snapshot: MemorySnapshot): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(snapshot));
}

let shared: VisitStore | null = null;

/** One store for the local dev process, so a later read sees what was just written. */
export function localFileStore(): VisitStore {
  shared ??= createFileStore('.data/visits.json');
  return shared;
}
