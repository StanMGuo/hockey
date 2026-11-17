import { afterEach, describe, expect, it } from 'vitest';
import { defaultProg } from '../state/progress';
import type { Progress } from '../types';
import { hashPin } from './pin';
import { ProfileExistsError, type NewProfile, type ProfileRecord, type ProfileRepo } from './profileStore';
import { handleCreate, handleLogin, handleLogout, handleSave, resetProfileLimits, type ProfileDeps } from './profiles';

const NOW = new Date('2026-11-17T15:00:00.000Z');
const TEAM = 'team-secret';

function memoryRepo(initial: ProfileRecord[] = []): ProfileRepo & { rows: ProfileRecord[]; sessions: string[] } {
  const rows = initial.map((row) => structuredClone(row));
  const sessions: { token: string; profileId: string; expiresAt: Date }[] = [];
  return {
    rows,
    sessions: [],
    async findByIdentity(nameKey, jersey) {
      return rows.find((row) => row.nameKey === nameKey && row.jersey === jersey) ?? null;
    },
    async insert(row: NewProfile) {
      if (rows.some((existing) => existing.nameKey === row.nameKey && existing.jersey === row.jersey)) {
        throw new ProfileExistsError();
      }
      const created = { ...row, id: `id-${rows.length + 1}` };
      rows.push(created);
      return created;
    },
    async createSession(profileId, token, expiresAt) {
      sessions.push({ token, profileId, expiresAt });
      this.sessions.push(token);
    },
    async findSession(token, now) {
      const found = sessions.find((session) => session.token === token && session.expiresAt > now);
      return found ? { profileId: found.profileId } : null;
    },
    async saveProgress(profileId, progress) {
      const row = rows.find((item) => item.id === profileId);
      if (!row) throw new Error('missing profile');
      row.progress = structuredClone(progress);
      return structuredClone(progress);
    },
    async deleteSession(token) {
      const index = sessions.findIndex((session) => session.token === token);
      if (index >= 0) sessions.splice(index, 1);
    },
  };
}

function deps(repo: ProfileRepo, teamPassword: string | undefined = TEAM): ProfileDeps {
  return { repo, now: () => NOW, teamPassword, ip: '203.0.113.8', configured: true };
}

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  resetProfileLimits();
});

describe('profiles', () => {
  it('returns missing, wrong pin, and a session for the right pin', async () => {
    const repo = memoryRepo([
      {
        id: 'p1',
        nameKey: 'sam',
        displayName: 'Sam',
        jersey: 7,
        pinHash: hashPin('1234'),
        progress: { ...defaultProg(), completed: 3 },
      },
    ]);
    const missing = await handleLogin(post('http://local/api/login', { nickname: 'Sam', jersey: '8', pin: '1234' }), deps(repo));
    expect(missing.status).toBe(404);
    const wrong = await handleLogin(post('http://local/api/login', { nickname: 'Sam', jersey: '07', pin: '0000' }), deps(repo));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'pin' });
    const ok = await handleLogin(post('http://local/api/login', { nickname: ' sam ', jersey: '7', pin: '1234' }), deps(repo));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { token: string; displayName: string; progress: Progress };
    expect(body.displayName).toBe('Sam');
    expect(body.progress.completed).toBe(3);
    expect(body.token.length).toBeGreaterThan(10);
  });

  it('locks pin guesses after five failures', async () => {
    const repo = memoryRepo([
      {
        id: 'p1',
        nameKey: 'sam',
        displayName: 'Sam',
        jersey: 7,
        pinHash: hashPin('1234'),
        progress: defaultProg(),
      },
    ]);
    for (let i = 0; i < 5; i++) {
      const res = await handleLogin(post('http://local/api/login', { nickname: 'Sam', jersey: 7, pin: '0000' }), deps(repo));
      expect(res.status).toBe(401);
    }
    const limited = await handleLogin(post('http://local/api/login', { nickname: 'Sam', jersey: 7, pin: '1234' }), deps(repo));
    expect(limited.status).toBe(429);
  });

  it('rejects a bad team password and does not overwrite an existing profile', async () => {
    const repo = memoryRepo();
    const bad = await handleCreate(
      post('http://local/api/profiles', { nickname: 'Sam', jersey: 7, pin: '1234', teamPassword: 'nope' }),
      deps(repo),
    );
    expect(bad.status).toBe(401);
    expect(repo.rows).toHaveLength(0);
    const created = await handleCreate(
      post('http://local/api/profiles', {
        nickname: 'Sam',
        jersey: 7,
        pin: '1234',
        teamPassword: TEAM,
        progress: { ...defaultProg(), completed: 2 },
      }),
      deps(repo),
    );
    expect(created.status).toBe(201);
    expect(repo.rows[0]?.progress.completed).toBe(2);
    const again = await handleCreate(
      post('http://local/api/profiles', { nickname: 'SAM', jersey: '07', pin: '9999', teamPassword: TEAM }),
      deps(repo),
    );
    expect(again.status).toBe(409);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]?.displayName).toBe('Sam');
  });

  it('requires a live session to save progress', async () => {
    const repo = memoryRepo();
    const created = await handleCreate(
      post('http://local/api/profiles', { nickname: 'Alex', jersey: 12, pin: '4321', teamPassword: TEAM }),
      deps(repo),
    );
    const { token } = (await created.json()) as { token: string };
    const anon = await handleSave(
      new Request('http://local/api/progress', { method: 'PUT', body: JSON.stringify(defaultProg()) }),
      deps(repo),
    );
    expect(anon.status).toBe(401);
    const next = defaultProg();
    next.learnIdx = 4;
    const saved = await handleSave(
      new Request('http://local/api/progress', {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(next),
      }),
      deps(repo),
    );
    expect(saved.status).toBe(200);
    expect(repo.rows[0]?.progress.learnIdx).toBe(4);
    await handleLogout(
      new Request('http://local/api/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } }),
      deps(repo),
    );
    const after = await handleSave(
      new Request('http://local/api/progress', {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(next),
      }),
      deps(repo),
    );
    expect(after.status).toBe(401);
  });
});
