import type { Progress } from '../types';
import { normalizeProgress } from '../state/progress';
import { createSql } from './db';

export class ProfileExistsError extends Error {}

export type ProfileRecord = {
  id: string;
  nameKey: string;
  displayName: string;
  jersey: number;
  pinHash: string;
  progress: Progress;
};

export type NewProfile = Omit<ProfileRecord, 'id'>;

export interface ProfileRepo {
  findByIdentity(nameKey: string, jersey: number): Promise<ProfileRecord | null>;
  insert(row: NewProfile): Promise<ProfileRecord>;
  createSession(profileId: string, token: string, expiresAt: Date): Promise<void>;
  findSession(token: string, now: Date): Promise<{ profileId: string } | null>;
  saveProgress(profileId: string, progress: Progress): Promise<Progress>;
  deleteSession(token: string): Promise<void>;
}

function isUnique(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
}

function mapRow(row: Record<string, unknown>): ProfileRecord {
  return {
    id: String(row.id),
    nameKey: String(row.name_key),
    displayName: String(row.display_name),
    jersey: Number(row.jersey),
    pinHash: String(row.pin_hash),
    progress: normalizeProgress(row.progress),
  };
}

export function createProfileStore(databaseUrl: string): ProfileRepo {
  const sql = createSql(databaseUrl);
  return {
    async findByIdentity(nameKey, jersey) {
      const rows = await sql`select id, name_key, display_name, jersey, pin_hash, progress
        from profiles where name_key = ${nameKey} and jersey = ${jersey} limit 1`;
      return rows[0] ? mapRow(rows[0]) : null;
    },
    async insert(row) {
      try {
        const progress = JSON.stringify(row.progress);
        const rows = await sql`insert into profiles (name_key, display_name, jersey, pin_hash, progress)
          values (${row.nameKey}, ${row.displayName}, ${row.jersey}, ${row.pinHash}, ${progress}::jsonb)
          returning id, name_key, display_name, jersey, pin_hash, progress`;
        return mapRow(rows[0]!);
      } catch (err) {
        if (isUnique(err)) throw new ProfileExistsError();
        throw err;
      }
    },
    async createSession(profileId, token, expiresAt) {
      await sql`insert into sessions (token, profile_id, expires_at) values (${token}, ${profileId}, ${expiresAt})`;
    },
    async findSession(token, now) {
      const rows = await sql`select profile_id from sessions where token = ${token} and expires_at > ${now} limit 1`;
      const row = rows[0];
      return row ? { profileId: String(row.profile_id) } : null;
    },
    async saveProgress(profileId, progress) {
      const payload = JSON.stringify(progress);
      const rows = await sql`update profiles set progress = ${payload}::jsonb where id = ${profileId} returning progress`;
      if (!rows[0]) throw new Error('missing profile');
      return normalizeProgress(rows[0].progress);
    },
    async deleteSession(token) {
      await sql`delete from sessions where token = ${token}`;
    },
  };
}
