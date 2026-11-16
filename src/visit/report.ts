import { sameSpan, trimQueue, validateBody } from './decide';
import { sessionId, visitorId } from './identity';
import type { VisitBody, VisitKind, VisitSnapshot } from './types';

const QUEUE_KEY = 'hdt-visit-queue';
const HEARTBEAT_MS = 30_000;
const RETRY_MS = 60_000;

let current: VisitSnapshot | null = null;
let installed = false;
let heartbeat: ReturnType<typeof setTimeout> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let endSent = false;

function make(kind: VisitKind): VisitBody {
  return {
    visitorId: visitorId(),
    sessionId: sessionId(),
    kind,
    screen: current?.screen ?? 'home',
    mode: current?.mode ?? null,
    scenarioId: current?.scenarioId ?? null,
    sheet: current?.sheet ?? null,
  };
}

function loadQueue(): VisitBody[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const body = validateBody(item);
      return body ? [body] : [];
    });
  } catch {
    return [];
  }
}

function saveQueue(items: VisitBody[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(trimQueue(items)));
  } catch {
    /* the game still runs when storage is blocked */
  }
}

function enqueue(body: VisitBody): void {
  saveQueue([...loadQueue(), body]);
}

async function post(body: VisitBody): Promise<'ok' | 'drop' | 'retry'> {
  try {
    const res = await fetch('/api/visits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (res.status === 400) return 'drop';
    if (res.status === 204) return 'ok';
    return 'retry';
  } catch {
    return 'retry';
  }
}

function scheduleHeartbeat(): void {
  if (heartbeat) clearTimeout(heartbeat);
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  heartbeat = setTimeout(() => {
    heartbeat = null;
    if (!current || document.visibilityState === 'hidden') return;
    enqueue(make('beat'));
    void flush();
  }, HEARTBEAT_MS);
}

function scheduleRetry(): void {
  if (retry) return;
  retry = setTimeout(() => {
    retry = null;
    void flush();
  }, RETRY_MS);
}

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let queue = loadQueue();
    while (queue.length > 0) {
      const item = queue[0];
      if (!item) break;
      const result = await post(item);
      if (result === 'retry') {
        scheduleRetry();
        return;
      }
      queue = queue.slice(1);
      saveQueue(queue);
    }
    scheduleHeartbeat();
  } finally {
    flushing = false;
  }
}

function sendEnd(): void {
  if (!current || endSent) return;
  endSent = true;
  const body = make('end');
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
      if (navigator.sendBeacon('/api/visits', blob)) return;
    }
  } catch {
    /* fall through to the queue */
  }
  enqueue(body);
  void flush();
}

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendEnd();
    else {
      endSent = false;
      scheduleHeartbeat();
    }
  });
  window.addEventListener('pagehide', sendEnd);
  window.addEventListener('online', () => {
    void flush();
  });
  void flush();
}

export function noteVisit(snapshot: VisitSnapshot): void {
  try {
    install();
    if (current && sameSpan(current, snapshot)) return;
    current = snapshot;
    endSent = false;
    enqueue(make('beat'));
    void flush();
  } catch (err) {
    console.error(err);
  }
}
