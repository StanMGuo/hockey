import { describe, expect, it } from 'vitest';
import { formatDevice } from './format';

describe('formatDevice', () => {
  it('names Windows, and does not call an iPhone a Mac', () => {
    expect(
      formatDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('Windows');
    expect(
      formatDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone');
    expect(formatDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')).toBe('Mac');
    expect(formatDevice(null)).toBe('未知');
  });
});
