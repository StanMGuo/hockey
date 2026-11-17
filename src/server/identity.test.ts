import { describe, expect, it } from 'vitest';
import { normalizeJersey, normalizeNickname, normalizePin } from './identity';

describe('identity', () => {
  it('T-ID-01 treats case and leading zeroes as the same player', () => {
    const a = normalizeNickname('Sam');
    const b = normalizeNickname('  sam  ');
    expect(a?.key).toBe('sam');
    expect(b?.key).toBe('sam');
    expect(a?.key).toBe(b?.key);
    expect(a?.display).toBe('Sam');
    expect(normalizeJersey('07')).toBe(7);
    expect(normalizeJersey('7')).toBe(7);
  });

  it('T-ID-02 rejects empty, long, out-of-range, and non-digit values', () => {
    expect(normalizeNickname('   ')).toBeNull();
    expect(normalizeNickname('A'.repeat(21))).toBeNull();
    expect(normalizeNickname('Sam!')).toBeNull();
    expect(normalizeJersey('100')).toBeNull();
    expect(normalizeJersey('-1')).toBeNull();
    expect(normalizeJersey('7a')).toBeNull();
    expect(normalizePin('123')).toBeNull();
    expect(normalizePin('12345')).toBeNull();
    expect(normalizePin('12a4')).toBeNull();
    expect(normalizePin('1234')).toBe('1234');
  });
});
