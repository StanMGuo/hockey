import { APP_PASSWORD } from './gate';

export const LOG_COOKIE = 'hdt_log';
const WEEK_SECONDS = 7 * 24 * 60 * 60;

function bytes(value: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(value));
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(value)));
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, bytes(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function timingEqualText(a: string, b: string): boolean {
  return timingEqual(bytes(a), bytes(b));
}

/**
 * Hash both strings before comparing so the check does not stop on length.
 * The shared game password never opens the log, even if it was copied into the env var.
 */
export async function passwordOk(submitted: string, adminPassword: string | undefined): Promise<boolean> {
  if (!adminPassword) return false;
  const same = timingEqual(await sha256(submitted), await sha256(adminPassword));
  if (submitted === APP_PASSWORD) return false;
  return same;
}

export async function signCookie(adminPassword: string, now: Date): Promise<string> {
  const exp = Math.floor(now.getTime() / 1000) + WEEK_SECONDS;
  const mac = await hmacHex(adminPassword, String(exp));
  return `${exp}.${mac}`;
}

export async function verifyCookie(token: string | undefined, adminPassword: string | undefined, now: Date): Promise<boolean> {
  if (!token || !adminPassword) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expText = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp * 1000 <= now.getTime()) return false;
  const expected = await hmacHex(adminPassword, expText);
  return timingEqualText(expected, mac);
}

export function cookieHeader(value: string, secure: boolean): string {
  const base = `${LOG_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${WEEK_SECONDS}`;
  return secure ? `${base}; Secure` : base;
}

export function readCookie(header: string | null, name = LOG_COOKIE): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return undefined;
}
