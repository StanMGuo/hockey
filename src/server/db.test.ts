import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('postgres', () => ({
  default: vi.fn(),
}));

import postgres from 'postgres';
import { classifyDatabaseUrl, redactDatabaseError } from './db';
import { productionDeps } from './http';

const OK_URL =
  'postgresql://hockey_app.lxwyjdlepsntcosczors:plan-fake-secret@aws-0-example.pooler.supabase.com:6543/postgres';

const REJECTED = [
  'postgresql://user:secret@ep-example.neon.tech:6543/neondb',
  'postgresql://postgres.lxwyjdlepsntcosczors:secret@aws-0-example.pooler.supabase.com:6543/postgres',
  'postgresql://hockey_app.lxwyjdlepsntcosczors:secret@aws-0-example.pooler.supabase.com:5432/postgres',
  'postgresql://hockey_app.lxwyjdlepsntcosczors:secret@aws-0-example.pooler.supabase.com:6543/postgres?sslmode=disable',
  'postgresql://hockey_app:secret@aws-0-example.pooler.supabase.com:6543/postgres',
];

afterEach(() => {
  delete process.env.DATABASE_URL;
  vi.clearAllMocks();
});

describe('database url', () => {
  it('T-DB-01 does not connect when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(classifyDatabaseUrl(undefined)).toBe('missing');
    expect(classifyDatabaseUrl('   ')).toBe('missing');
    const deps = productionDeps(new Request('http://local/api/visits'));
    expect(deps.databaseUrl).toBeNull();
    expect(postgres).not.toHaveBeenCalled();
  });

  it('T-DB-02 rejects other connection strings and logs once without the secret', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const url of REJECTED) {
      process.env.DATABASE_URL = url;
      expect(classifyDatabaseUrl(url)).toBe('rejected');
      const deps = productionDeps(new Request('http://local/api/visits'));
      expect(deps.databaseUrl).toBeNull();
    }
    const text = errors.mock.calls.flat().map(String).join('\n');
    expect(errors).toHaveBeenCalledTimes(1);
    expect(text).toContain('DATABASE_URL rejected');
    for (const url of REJECTED) expect(text).not.toContain(url);
    expect(postgres).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('T-DB-03 selects the configured store without opening a connection', () => {
    process.env.DATABASE_URL = OK_URL;
    expect(classifyDatabaseUrl(OK_URL)).toBe('ok');
    const deps = productionDeps(new Request('http://local/api/visits'));
    expect(deps.databaseUrl).toBe('configured');
    expect(postgres).not.toHaveBeenCalled();
  });

  it('redacts the connection string from logged errors', () => {
    process.env.DATABASE_URL = OK_URL;
    const err = new Error(`failed ${OK_URL}`);
    const out = redactDatabaseError(err);
    expect(out).toBeInstanceOf(Error);
    expect((out as Error).message).not.toContain('plan-fake-secret');
    expect((out as Error).message).not.toContain('lxwyjdlepsntcosczors');
  });
});
