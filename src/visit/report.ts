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
let flushAgain = false;
let endSent = false;
let memoryQueue: VisitBody[] | null = null;
const keepaliveItems = new WeakSet<VisitBody>();

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

function readStored(): VisitBody[] {
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

function loadQueue(): VisitBody[] {
  memoryQueue ??= readStored();
  return memoryQueue;
}

function saveQueue(items: VisitBody[]): void {
  memoryQueue = trimQueue(items);
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(memoryQueue));
  } catch {
    /* a Windows PC that blocks site data still keeps the queue in memory */
  }
}

function enqueue(body: VisitBody): void {
  saveQueue([...loadQueue(), body]);
}

async function post(body: VisitBody, keepalive = false): Promise<'ok' | 'drop' | 'retry'> {
  try {
    const res = await fetch('/api/visits', {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
      keepalive,
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
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  try {
    for (;;) {
      const item = loadQueue()[0];
      if (!item) break;
      const keepalive = keepaliveItems.has(item);
      keepaliveItems.delete(item);
      const result = await post(item, keepalive);
      if (result === 'retry') {
        if (keepalive) keepaliveItems.add(item);
        scheduleRetry();
        flushAgain = false;
        return;
      }
      const latest = loadQueue();
      const rest = latest[0] === item ? latest.slice(1) : latest.filter((entry) => entry !== item);
      saveQueue(rest);
    }
    scheduleHeartbeat();
  } finally {
    flushing = false;
    if (flushAgain) {
      flushAgain = false;
      void flush();
    }
  }
}

function sendEnd(): void {
  if (!current || endSent) return;
  endSent = true;
  const body = make('end');
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const payload = JSON.stringify(body);
      if (navigator.sendBeacon('/api/visits', payload)) return;
    }
  } catch {
    /* fall through to the queue */
  }
  enqueue(body);
  keepaliveItems.add(body);
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
