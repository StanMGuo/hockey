import type { Progress } from '../types';
import type { ProgressStore } from './ProgressStore';
import { normalizeProgress } from './progress';

export const QUEUE_KEY = 'hdt-progress-queue-v1';
export const UNSAVED_NOTE = '进度还没保存到你的档案';

export type PlayerSession = {
  token: string;
  displayName: string;
  jersey: number;
  nameKey: string;
  progress: Progress;
};

type QueueItem = { nameKey: string; jersey: number; progress: Progress };

function readQueue(): QueueItem | null {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QueueItem>;
    if (typeof parsed.nameKey !== 'string' || typeof parsed.jersey !== 'number') return null;
    return { nameKey: parsed.nameKey, jersey: parsed.jersey, progress: normalizeProgress(parsed.progress) };
  } catch {
    return null;
  }
}

function writeQueue(item: QueueItem): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(item));
  } catch {
    /* ignore quota / private mode */
  }
}

function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

export class SessionProgressStore implements ProgressStore {
  private data: Progress;
  private pending: boolean;
  private generation = 0;
  private onOnline: (() => void) | null = null;
  private readonly token: string;
  private readonly nameKey: string;
  private readonly jersey: number;

  constructor(token: string, nameKey: string, jersey: number, initial: Progress) {
    this.token = token;
    this.nameKey = nameKey;
    this.jersey = jersey;
    const queued = readQueue();
    if (queued && queued.nameKey === nameKey && queued.jersey === jersey) {
      this.data = queued.progress;
      this.pending = true;
    } else {
      this.data = structuredClone(initial);
      this.pending = false;
    }
    if (typeof window !== 'undefined') {
      this.onOnline = () => {
        if (this.pending) this.flush();
      };
      window.addEventListener('online', this.onOnline);
    }
    if (this.pending) this.flush();
  }

  dispose(): void {
    if (this.onOnline && typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
  }

  load(): Progress {
    return structuredClone(this.data);
  }

  save(prog: Progress): void {
    this.data = structuredClone(prog);
    this.flush();
  }

  unsavedNote(): string | null {
    return this.pending ? UNSAVED_NOTE : null;
  }

  flush(): void {
    const generation = ++this.generation;
    const progress = structuredClone(this.data);
    void this.push(progress, generation);
  }

  private async push(progress: Progress, generation: number): Promise<void> {
    try {
      const res = await fetch('/api/progress', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(progress),
      });
      if (!res.ok) throw new Error('save failed');
      if (generation !== this.generation) return;
      this.pending = false;
      const queued = readQueue();
      if (queued && queued.nameKey === this.nameKey && queued.jersey === this.jersey) clearQueue();
    } catch {
      if (generation !== this.generation) return;
      this.pending = true;
      writeQueue({ nameKey: this.nameKey, jersey: this.jersey, progress });
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('hdt-progress-queue'));
  }
}
