import { isUuid } from './decide';

export const VISITOR_KEY = 'hdt-visitor-id';
export const SESSION_KEY = 'hdt-visit-session';

const memory: { visitor: string | null; session: string | null } = { visitor: null, session: null };

function browserStorage(kind: 'local' | 'session'): Storage | null {
  try {
    const storage = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

function persistentId(kind: 'visitor' | 'session'): string {
  const key = kind === 'visitor' ? VISITOR_KEY : SESSION_KEY;
  const storage = browserStorage(kind === 'visitor' ? 'local' : 'session');
  if (storage) {
    try {
      const existing = storage.getItem(key);
      if (existing && isUuid(existing)) return existing;
      const created = crypto.randomUUID();
      storage.setItem(key, created);
      return created;
    } catch {
      /* storage threw; fall through to the in-page id */
    }
  }
  const cached = kind === 'visitor' ? memory.visitor : memory.session;
  if (cached) return cached;
  const created = crypto.randomUUID();
  if (kind === 'visitor') memory.visitor = created;
  else memory.session = created;
  return created;
}

export function visitorId(): string {
  return persistentId('visitor');
}

export function sessionId(): string {
  return persistentId('session');
}
