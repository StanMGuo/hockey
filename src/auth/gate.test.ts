import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_PASSWORD,
  GATE_SESSION_KEY,
  checkPassword,
  isGateUnlocked,
  unlockGate,
} from './gate';

function mockSessionStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  });
  return map;
}

describe('gate password', () => {
  beforeEach(() => {
    mockSessionStorage();
  });

  it('accepts hardcoded password', () => {
    expect(checkPassword(APP_PASSWORD)).toBe(true);
  });

  it('rejects wrong password', () => {
    expect(checkPassword('')).toBe(false);
    expect(checkPassword('hawksu9')).toBe(false);
    expect(checkPassword('HAWKSU9RED')).toBe(false);
  });

  it('starts locked and unlocks via sessionStorage', () => {
    expect(isGateUnlocked()).toBe(false);
    unlockGate();
    expect(sessionStorage.getItem(GATE_SESSION_KEY)).toBe('1');
    expect(isGateUnlocked()).toBe(true);
  });

  it('treats missing sessionStorage as locked / no-throw unlock', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(isGateUnlocked()).toBe(false);
    expect(() => unlockGate()).not.toThrow();
  });
});
