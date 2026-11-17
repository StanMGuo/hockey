import { randomBytes } from 'node:crypto';
import type { Progress } from '../types';
import { defaultProg, normalizeProgress } from '../state/progress';
import { classifyDatabaseUrl, noteRejectedDatabaseUrl, redactDatabaseError } from './db';
import { normalizeJersey, normalizeNickname, normalizePin } from './identity';
import { hashPin, secretEqual, verifyPin } from './pin';
import { createProfileStore, ProfileExistsError, type ProfileRepo } from './profileStore';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_BODY = 16 * 1024;
const FAIL_LIMIT = 5;

export type ProfileDeps = {
  repo: ProfileRepo;
  now: () => Date;
  teamPassword: string | undefined;
  ip: string;
  configured: boolean;
};

const pinFails = new Map<string, number[]>();
const teamFails = new Map<string, number[]>();

export function resetProfileLimits(): void {
  pinFails.clear();
  teamFails.clear();
}

function recent(map: Map<string, number[]>, key: string, now: number): number[] {
  const kept = (map.get(key) ?? []).filter((at) => now - at < TEN_MINUTES_MS);
  map.set(key, kept);
  return kept;
}

function blocked(map: Map<string, number[]>, key: string, now: number): boolean {
  return recent(map, key, now).length >= FAIL_LIMIT;
}

function mark(map: Map<string, number[]>, key: string, now: number): void {
  const list = recent(map, key, now);
  list.push(now);
  map.set(key, list);
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

async function readJson(request: Request): Promise<unknown | 'too-big' | 'bad'> {
  const text = await request.text();
  if (text.length > MAX_BODY) return 'too-big';
  try {
    return JSON.parse(text);
  } catch {
    return 'bad';
  }
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

type Identity = { display: string; key: string; jersey: number; pin: string };

function identityFrom(body: unknown): Identity | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as { nickname?: unknown; jersey?: unknown; pin?: unknown };
  if (typeof o.nickname !== 'string' || typeof o.pin !== 'string') return null;
  const jerseyText = typeof o.jersey === 'number' ? String(o.jersey) : typeof o.jersey === 'string' ? o.jersey : '';
  const name = normalizeNickname(o.nickname);
  const jersey = normalizeJersey(jerseyText);
  const pin = normalizePin(o.pin);
  if (!name || jersey == null || !pin) return null;
  return { display: name.display, key: name.key, jersey, pin };
}

function publicPlayer(token: string, displayName: string, jersey: number, nameKey: string, progress: Progress) {
  return { token, displayName, jersey, nameKey, progress };
}

export async function handleLogin(request: Request, deps: ProfileDeps): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!deps.configured) return json(503, { error: 'offline' });
  const body = await readJson(request);
  if (body === 'too-big' || body === 'bad') return json(400, { error: 'invalid' });
  const identity = identityFrom(body);
  if (!identity) return json(400, { error: 'invalid' });
  try {
    const found = await deps.repo.findByIdentity(identity.key, identity.jersey);
    if (!found) return json(404, { error: 'missing' });
    const key = `${identity.key}:${identity.jersey}`;
    const now = deps.now().getTime();
    if (blocked(pinFails, key, now)) return json(429, { error: 'limited' });
    if (!verifyPin(identity.pin, found.pinHash)) {
      mark(pinFails, key, now);
      return json(401, { error: 'pin' });
    }
    const token = newToken();
    await deps.repo.createSession(found.id, token, new Date(now + SESSION_MS));
    return json(200, publicPlayer(token, found.displayName, found.jersey, found.nameKey, found.progress));
  } catch (err) {
    console.error(redactDatabaseError(err));
    return json(503, { error: 'offline' });
  }
}

export async function handleCreate(request: Request, deps: ProfileDeps): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!deps.configured) return json(503, { error: 'offline' });
  const body = await readJson(request);
  if (body === 'too-big' || body === 'bad') return json(400, { error: 'invalid' });
  const identity = identityFrom(body);
  const teamPassword = body && typeof body === 'object' ? (body as { teamPassword?: unknown }).teamPassword : undefined;
  if (!identity || typeof teamPassword !== 'string') return json(400, { error: 'invalid' });
  if (deps.teamPassword && identity.pin === deps.teamPassword) return json(400, { error: 'invalid' });
  const now = deps.now().getTime();
  if (blocked(teamFails, deps.ip, now)) return json(429, { error: 'limited' });
  try {
    const existing = await deps.repo.findByIdentity(identity.key, identity.jersey);
    if (existing) return json(409, { error: 'exists' });
    if (!deps.teamPassword || !secretEqual(teamPassword, deps.teamPassword)) {
      mark(teamFails, deps.ip, now);
      return json(401, { error: 'team' });
    }
    const rawProgress = (body as { progress?: unknown }).progress;
    const progress = rawProgress === undefined ? defaultProg() : normalizeProgress(rawProgress);
    const created = await deps.repo.insert({
      nameKey: identity.key,
      displayName: identity.display,
      jersey: identity.jersey,
      pinHash: hashPin(identity.pin),
      progress,
    });
    const token = newToken();
    await deps.repo.createSession(created.id, token, new Date(now + SESSION_MS));
    return json(201, publicPlayer(token, created.displayName, created.jersey, created.nameKey, created.progress));
  } catch (err) {
    if (err instanceof ProfileExistsError) return json(409, { error: 'exists' });
    console.error(redactDatabaseError(err));
    return json(503, { error: 'offline' });
  }
}

export async function handleSave(request: Request, deps: ProfileDeps): Promise<Response> {
  if (request.method !== 'PUT') return new Response(null, { status: 405 });
  if (!deps.configured) return json(503, { error: 'offline' });
  const token = bearer(request);
  if (!token) return json(401, { error: 'session' });
  const body = await readJson(request);
  if (body === 'too-big' || body === 'bad' || !body || typeof body !== 'object') return json(400, { error: 'invalid' });
  try {
    const session = await deps.repo.findSession(token, deps.now());
    if (!session) return json(401, { error: 'session' });
    const progress = await deps.repo.saveProgress(session.profileId, normalizeProgress(body));
    return json(200, { progress });
  } catch (err) {
    console.error(redactDatabaseError(err));
    return json(503, { error: 'offline' });
  }
}

export async function handleLogout(request: Request, deps: ProfileDeps): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const token = bearer(request);
  if (token && deps.configured) {
    try {
      await deps.repo.deleteSession(token);
    } catch (err) {
      console.error(redactDatabaseError(err));
    }
  }
  return new Response(null, { status: 204 });
}

export function productionProfileDeps(request: Request): ProfileDeps {
  const raw = process.env.DATABASE_URL;
  const verdict = classifyDatabaseUrl(raw);
  if (verdict === 'rejected') noteRejectedDatabaseUrl();
  const configured = verdict === 'ok';
  return {
    repo: configured && raw ? createProfileStore(raw.trim()) : unavailableRepo,
    now: () => new Date(),
    teamPassword: process.env.TEAM_PASSWORD,
    ip: clientIp(request),
    configured,
  };
}

const unavailableRepo: ProfileRepo = {
  async findByIdentity() {
    return null;
  },
  async insert() {
    throw new Error('database unavailable');
  },
  async createSession() {},
  async findSession() {
    return null;
  },
  async saveProgress() {
    return defaultProg();
  },
  async deleteSession() {},
};
