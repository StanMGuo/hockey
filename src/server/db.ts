import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

loadLocalEnv(['DATABASE_URL', 'TEAM_PASSWORD', 'LOG_ADMIN_PASSWORD']);

const PROJECT_REF = 'lxwyjdlepsntcosczors';

export type DatabaseVerdict = 'ok' | 'missing' | 'rejected';

let rejectedNoted = false;

export function classifyDatabaseUrl(value: string | undefined): DatabaseVerdict {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return 'missing';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return 'rejected';
  }
  const user = decodeURIComponent(url.username);
  const role = user.split('.')[0] ?? '';
  const protocolOk = url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  const userOk = user.startsWith('hockey_app') && role === 'hockey_app';
  const portOk = url.port === '6543';
  const sslOk = url.searchParams.get('sslmode') !== 'disable';
  const refOk = user.includes(PROJECT_REF) || url.hostname.includes(PROJECT_REF);
  if (protocolOk && userOk && portOk && sslOk && refOk) return 'ok';
  return 'rejected';
}

export function noteRejectedDatabaseUrl(): void {
  if (rejectedNoted) return;
  rejectedNoted = true;
  console.error('DATABASE_URL rejected');
}

type Row = Record<string, unknown>;

export type SqlQuery = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;

export function createSql(url: string): SqlQuery {
  let client: SqlQuery | null = null;
  return (strings, ...values) => {
    client ??= postgres(url, { max: 1, prepare: false, ssl: 'require' }) as unknown as SqlQuery;
    return client(strings, ...values);
  };
}

export function redactDatabaseError(err: unknown): unknown {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return err;
  const pieces = secretPieces(raw);
  const scrub = (text: string) => pieces.reduce((out, piece) => out.split(piece).join('[redacted]'), text);
  if (typeof err === 'string') return scrub(err);
  if (err instanceof Error) {
    const redacted = new Error(scrub(err.message));
    redacted.name = err.name;
    if (err.stack) redacted.stack = scrub(err.stack);
    return redacted;
  }
  return err;
}

function loadLocalEnv(keys: string[]): void {
  const wanted = new Set(keys.filter((key) => !process.env[key]?.trim()));
  if (wanted.size === 0) return;
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    if (!wanted.has(key) || process.env[key]?.trim()) continue;
    process.env[key] = trimmed.slice(eq + 1);
    wanted.delete(key);
    if (wanted.size === 0) break;
  }
}

function secretPieces(url: string): string[] {
  const pieces = new Set<string>([url]);
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      pieces.add(parsed.password);
      pieces.add(encodeURIComponent(parsed.password));
    }
  } catch {
    return [url];
  }
  return [...pieces].filter((piece) => piece.length > 0);
}
