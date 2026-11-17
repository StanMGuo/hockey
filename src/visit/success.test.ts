import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatSession, type SessionView } from '../logs/format';
import { LogsTable } from '../logs/LogsTable';
import { handleLogSession, handleVisits, type HandlerDeps } from '../server/http';
import { createMemoryStore } from '../server/memoryStore';
import type { VisitStore } from '../server/store';
import type { VisitBody } from './types';

const VISITOR = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const SESSION_TWO = '33333333-3333-4333-8333-333333333333';
const T = new Date('2026-11-15T23:00:00.000Z');
const ADMIN = 'log-admin-pass';
const ZONE = 'UTC';
const CITY = '%E5%A4%9A%E4%BC%A6%E5%A4%9A';

const GEO: Record<string, string> = {
  'content-type': 'application/json',
  'x-vercel-ip-country': 'CA',
  'x-vercel-ip-country-region': 'ON',
  'x-vercel-ip-city': CITY,
  'x-forwarded-for': '203.0.113.8, 10.0.0.1',
};

function deps(store: VisitStore, now: () => Date, databaseUrl: string | null = 'postgres://memory/test'): HandlerDeps {
  return { store, now, databaseUrl, adminPassword: ADMIN, secure: false };
}

async function postAt(
  store: VisitStore,
  at: Date,
  fields: Pick<VisitBody, 'sessionId' | 'screen' | 'mode' | 'scenarioId' | 'sheet'>,
  headers: Record<string, string> = GEO,
): Promise<Response> {
  const clock = { at };
  return handleVisits(
    new Request('http://local/api/visits', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        visitorId: VISITOR,
        kind: 'beat',
        ...fields,
      }),
    }),
    deps(store, () => clock.at),
  );
}

async function script(store: VisitStore): Promise<void> {
  const steps: { at: Date; fields: Pick<VisitBody, 'sessionId' | 'screen' | 'mode' | 'scenarioId' | 'sheet'> }[] = [
    { at: T, fields: { sessionId: SESSION, screen: 'home', mode: null, scenarioId: null, sheet: null } },
    {
      at: new Date(T.getTime() + 5_000),
      fields: { sessionId: SESSION, screen: 'play', mode: 'learn', scenarioId: 'wall', sheet: null },
    },
    {
      at: new Date(T.getTime() + 45_000),
      fields: { sessionId: SESSION, screen: 'play', mode: 'learn', scenarioId: 'wall', sheet: null },
    },
    {
      at: new Date(T.getTime() + 50_000),
      fields: { sessionId: SESSION, screen: 'home', mode: null, scenarioId: null, sheet: null },
    },
  ];
  for (const step of steps) {
    const res = await postAt(store, step.at, step.fields);
    expect(res.status).toBe(204);
  }
}

async function read(store: VisitStore, now: Date): Promise<SessionView[]> {
  const d = deps(store, () => now);
  const login = await handleLogSession(
    new Request('http://local/api/logs/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: ADMIN }),
    }),
    d,
  );
  expect(login.status).toBe(204);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const listed = await handleVisits(new Request('http://local/api/visits', { headers: { cookie: cookie ?? '' } }), d);
  expect(listed.status).toBe(200);
  const json = (await listed.json()) as { sessions: SessionView[] };
  return json.sessions;
}

describe('visit success', () => {
  it('T-LOG-S1 keeps the visitor id across a new session', async () => {
    const store = createMemoryStore();
    await script(store);
    const again = await postAt(store, new Date(T.getTime() + 3_600_000), {
      sessionId: SESSION_TWO,
      screen: 'home',
      mode: null,
      scenarioId: null,
      sheet: null,
    });
    expect(again.status).toBe(204);
    const sessions = await read(store, new Date(T.getTime() + 3_600_000));
    expect(sessions.map((session) => session.visitorId)).toEqual([VISITOR, VISITOR]);
  });

  it('T-LOG-S2 records the start time and formats it in the given zone', async () => {
    const store = createMemoryStore();
    await script(store);
    const [session] = await read(store, new Date(T.getTime() + 50_000));
    expect(session?.startedAt).toBe(T.toISOString());
    expect(formatSession(session!, ZONE).when).toBe('2026-11-15 23:00');
  });

  it('T-LOG-S3 decodes a city header and shows 未知 when the headers are empty', async () => {
    const store = createMemoryStore();
    await script(store);
    const [session] = await read(store, new Date(T.getTime() + 50_000));
    expect(formatSession(session!, ZONE).place).toBe('多伦多, ON, CA');

    const bare = createMemoryStore();
    const res = await postAt(
      bare,
      T,
      { sessionId: SESSION, screen: 'home', mode: null, scenarioId: null, sheet: null },
      { 'content-type': 'application/json' },
    );
    expect(res.status).toBe(204);
    const [empty] = await read(bare, T);
    expect(formatSession(empty!, ZONE).place).toBe('未知');
  });

  it('T-LOG-S4 shows home, then Learn / wall, then home', async () => {
    const store = createMemoryStore();
    await script(store);
    const [session] = await read(store, new Date(T.getTime() + 50_000));
    const path = formatSession(session!, ZONE).path;
    const home = path.indexOf('首页');
    const learn = path.indexOf('Learn', home + 1);
    const wall = path.indexOf('wall', learn);
    const homeAgain = path.indexOf('首页', learn + 1);
    expect(home).toBeGreaterThanOrEqual(0);
    expect(learn).toBeGreaterThan(home);
    expect(wall).toBeGreaterThan(learn);
    expect(homeAgain).toBeGreaterThan(learn);
  });

  it('T-LOG-S5 measures 50 seconds for the visit and 40 seconds on Learn', async () => {
    const store = createMemoryStore();
    await script(store);
    const [session] = await read(store, new Date(T.getTime() + 50_000));
    expect(session?.durationMs).toBe(50_000);
    expect(session!.durationMs).toBeGreaterThan(0);
    const learn = session?.spans.find((span) => span.scenarioId === 'wall');
    expect(learn?.durationMs).toBe(40_000);
    expect(formatSession(session!, ZONE).duration).toBe('50 秒');
  });

  it('T-LOG-S6 renders all five columns into the log table', async () => {
    const store = createMemoryStore();
    await script(store);
    const [session] = await read(store, new Date(T.getTime() + 50_000));
    const row = formatSession(session!, ZONE);
    const html = renderToStaticMarkup(createElement(LogsTable, { sessions: [session!], timeZone: ZONE }));
    expect(html).toContain(row.visitor);
    expect(html).toContain(row.when);
    expect(html).toContain(row.place);
    expect(html).toContain(row.path);
    expect(html).toContain(row.duration);
    expect(row.visitor).toBe(VISITOR.slice(0, 8));
  });

  it('T-LOG-S8 shows Windows when the visit came from a Windows computer', async () => {
    const store = createMemoryStore();
    const res = await postAt(
      store,
      T,
      { sessionId: SESSION, screen: 'play', mode: 'game', scenarioId: 'wall', sheet: null },
      {
        ...GEO,
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    );
    expect(res.status).toBe(204);
    const [session] = await read(store, new Date(T.getTime() + 1_000));
    expect(session?.device).toBe('Windows');
    const html = renderToStaticMarkup(createElement(LogsTable, { sessions: [session!], timeZone: ZONE }));
    expect(html).toContain('系统');
    expect(html).toContain('Windows');
    expect(html).toContain('Game / wall');
  });

  it('T-LOG-S7 hides the log and does not write when the database is unset', async () => {
    const store = createMemoryStore();
    await script(store);
    const now = new Date(T.getTime() + 50_000);
    const d = deps(store, () => now);
    const anon = await handleVisits(new Request('http://local/api/visits'), d);
    expect(anon.status).toBe(401);
    process.env.TEAM_PASSWORD = ADMIN;
    const game = await handleLogSession(
      new Request('http://local/api/logs/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: ADMIN }),
      }),
      d,
    );
    delete process.env.TEAM_PASSWORD;
    expect(game.status).toBe(401);
    const sessions = await read(store, now);
    expect(sessions[0]?.visitorId).toBe(VISITOR);

    let writes = 0;
    const counting: VisitStore = {
      async ingest() {
        writes += 1;
        return 'ok';
      },
      async listRecent() {
        return [];
      },
    };
    const skipped = await handleVisits(
      new Request('http://local/api/visits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          visitorId: VISITOR,
          sessionId: SESSION,
          kind: 'beat',
          screen: 'home',
          mode: null,
          scenarioId: null,
          sheet: null,
        }),
      }),
      deps(counting, () => T, null),
    );
    expect(skipped.status).toBe(204);
    expect(writes).toBe(0);
  });
});
