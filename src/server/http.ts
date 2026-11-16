import { cookieHeader, passwordOk, readCookie, signCookie, verifyCookie } from '../auth/logAccess';
import { durationMs, validateBody } from '../visit/decide';
import type { SessionView } from '../logs/format';
import { localFileStore } from './fileStore';
import { createNeonStore } from './visitsStore';
import type { Place, SessionRecord, VisitStore } from './store';

const MAX_BODY = 2048;

export type HandlerDeps = {
  store: VisitStore;
  now: () => Date;
  databaseUrl: string | null;
  adminPassword: string | undefined;
  secure: boolean;
};

function empty(status: number, headers?: Headers): Response {
  return new Response(null, { status, headers });
}

function headerText(request: Request, name: string): string | null {
  const value = request.headers.get(name);
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded ? decoded : null;
  } catch {
    return null;
  }
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip')?.trim();
  return real || null;
}

function placeFrom(request: Request): Place {
  const agent = request.headers.get('user-agent');
  return {
    ip: clientIp(request),
    country: headerText(request, 'x-vercel-ip-country'),
    region: headerText(request, 'x-vercel-ip-country-region'),
    city: headerText(request, 'x-vercel-ip-city'),
    userAgent: agent ? agent.slice(0, 200) : null,
  };
}

export function toSessionView(session: SessionRecord): SessionView {
  return {
    visitorId: session.visitorId,
    startedAt: session.startedAt.toISOString(),
    durationMs: durationMs(session.startedAt, session.lastSeenAt),
    ip: session.ip,
    country: session.country,
    region: session.region,
    city: session.city,
    spans: session.spans.map((span) => ({
      screen: span.screen,
      mode: span.mode,
      scenarioId: span.scenarioId,
      sheet: span.sheet,
      durationMs: durationMs(span.startedAt, span.lastSeenAt),
    })),
  };
}

export async function handleVisits(request: Request, deps: HandlerDeps): Promise<Response> {
  if (request.method === 'GET') return listVisits(request, deps);
  if (request.method === 'POST') return ingestVisit(request, deps);
  return empty(405);
}

async function listVisits(request: Request, deps: HandlerDeps): Promise<Response> {
  const ok = await verifyCookie(readCookie(request.headers.get('cookie')), deps.adminPassword, deps.now());
  if (!ok) return empty(401);
  if (!deps.databaseUrl) return Response.json({ sessions: [], storage: 'unconfigured' });
  try {
    const sessions = await deps.store.listRecent(100);
    return Response.json({ sessions: sessions.map(toSessionView) });
  } catch (err) {
    console.error(err);
    return empty(500);
  }
}

async function ingestVisit(request: Request, deps: HandlerDeps): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY) return empty(400);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return empty(400);
  }
  const body = validateBody(json);
  if (!body) return empty(400);
  if (!deps.databaseUrl) return empty(204);
  try {
    const result = await deps.store.ingest({ body, at: deps.now(), place: placeFrom(request) });
    if (result === 'limited') return empty(429);
    return empty(204);
  } catch (err) {
    console.error(err);
    return empty(204);
  }
}

export async function handleLogSession(request: Request, deps: HandlerDeps): Promise<Response> {
  if (request.method !== 'POST') return empty(405);
  if (!deps.adminPassword) return empty(503);
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return empty(400);
  }
  const password = json && typeof json === 'object' ? (json as { password?: unknown }).password : undefined;
  if (typeof password !== 'string') return empty(400);
  if (!(await passwordOk(password, deps.adminPassword))) return empty(401);
  const token = await signCookie(deps.adminPassword, deps.now());
  const headers = new Headers();
  headers.set('set-cookie', cookieHeader(token, deps.secure));
  return empty(204, headers);
}

const noopStore: VisitStore = {
  async ingest() {
    return 'ok';
  },
  async listRecent() {
    return [];
  },
};

export function productionDeps(request: Request): HandlerDeps {
  const configured = process.env.DATABASE_URL?.trim() || null;
  const local = !configured && !process.env.VERCEL;
  return {
    store: configured ? createNeonStore(configured) : local ? localFileStore() : noopStore,
    now: () => new Date(),
    databaseUrl: configured ?? (local ? 'file://.data/visits.json' : null),
    adminPassword: process.env.LOG_ADMIN_PASSWORD,
    secure: process.env.VERCEL === '1' || request.headers.get('x-forwarded-proto') === 'https',
  };
}
