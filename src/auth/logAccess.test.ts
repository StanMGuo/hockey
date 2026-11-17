import { afterEach, describe, expect, it } from 'vitest';
import { cookieHeader, passwordOk, signCookie, verifyCookie } from './logAccess';

const ADMIN = 'log-admin-pass';
const NOW = new Date('2026-11-15T23:00:00.000Z');

afterEach(() => {
  delete process.env.LOG_ADMIN_PASSWORD;
  delete process.env.TEAM_PASSWORD;
});

describe('T-LOG-07 log access', () => {
  it('rejects the game password and accepts a different admin password', async () => {
    process.env.TEAM_PASSWORD = 'shared-game-password';
    expect(await passwordOk('shared-game-password', ADMIN)).toBe(false);
    expect(await passwordOk('shared-game-password', 'shared-game-password')).toBe(false);
    delete process.env.TEAM_PASSWORD;
    expect(await passwordOk('wrong', ADMIN)).toBe(false);
    expect(await passwordOk(ADMIN, ADMIN)).toBe(true);
    expect(await passwordOk(ADMIN, undefined)).toBe(false);
  });

  it('rejects a tampered cookie and an expired cookie', async () => {
    const token = await signCookie(ADMIN, NOW);
    expect(await verifyCookie(token, ADMIN, NOW)).toBe(true);
    const flipped = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    expect(await verifyCookie(flipped, ADMIN, NOW)).toBe(false);
    const [exp] = token.split('.');
    expect(await verifyCookie(token, ADMIN, new Date((Number(exp) + 1) * 1000))).toBe(false);
    expect(cookieHeader(token, false)).toContain('HttpOnly');
    expect(cookieHeader(token, false)).not.toContain('Secure');
    expect(cookieHeader(token, true)).toContain('Secure');
  });
});
