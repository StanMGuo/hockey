import { isUuid } from './decide';

export const VISITOR_KEY = 'hdt-visitor-id';
export const SESSION_KEY = 'hdt-visit-session';

const memory: { visitor: string | null; session: string | null } = { visitor: null, session: null };

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
      const created = randomId();
      storage.setItem(key, created);
      return created;
    } catch {
      /* storage threw; fall through to the in-page id */
    }
  }
  const cached = kind === 'visitor' ? memory.visitor : memory.session;
  if (cached) return cached;
  const created = randomId();
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
