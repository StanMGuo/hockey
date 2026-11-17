import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_KEY, VISITOR_KEY, sessionId, visitorId } from './identity';

function mockStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('T-LOG-06 visitor identity', () => {
  it('keeps the same visitor id on the second read', () => {
    vi.stubGlobal('localStorage', mockStorage());
    vi.stubGlobal('sessionStorage', mockStorage());
    const first = visitorId();
    expect(visitorId()).toBe(first);
    expect(localStorage.getItem(VISITOR_KEY)).toBe(first);
    expect(sessionId()).toBe(sessionStorage.getItem(SESSION_KEY));
  });

  it('builds a uuid when randomUUID is missing', () => {
    vi.stubGlobal('localStorage', mockStorage());
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
        return bytes;
      },
    });
    expect(visitorId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns a stable temporary id when storage throws', () => {
    const broken: Storage = {
      length: 0,
      clear: () => {
        throw new Error('nope');
      },
      getItem: () => {
        throw new Error('nope');
      },
      key: () => null,
      removeItem: () => {
        throw new Error('nope');
      },
      setItem: () => {
        throw new Error('nope');
      },
    };
    vi.stubGlobal('localStorage', broken);
    const first = visitorId();
    expect(visitorId()).toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
