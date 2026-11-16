import { neon } from '@neondatabase/serverless';
import { decideSpan, rateLimited } from '../visit/decide';
import {
  NINETY_DAYS_MS,
  TEN_MINUTES_MS,
  type IngestInput,
  type SessionRecord,
  type SpanRecord,
  type VisitStore,
} from './store';
import type { Screen, VisitMode, VisitSheet } from '../visit/types';

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

export function createNeonStore(databaseUrl: string): VisitStore {
  let ready: Promise<void> | null = null;
  const sql = () => neon(databaseUrl);

  async function ensure(): Promise<void> {
    if (!ready) {
      ready = (async () => {
        const q = sql();
        await q`CREATE TABLE IF NOT EXISTS visit_sessions (
          id text PRIMARY KEY,
          visitor_id text NOT NULL,
          started_at timestamptz NOT NULL,
          last_seen_at timestamptz NOT NULL,
          ip text,
          country text,
          region text,
          city text,
          user_agent text
        )`;
        await q`CREATE TABLE IF NOT EXISTS visit_spans (
          id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          session_id text NOT NULL,
          screen text NOT NULL,
          mode text,
          scenario_id text,
          sheet text,
          started_at timestamptz NOT NULL,
          last_seen_at timestamptz NOT NULL
        )`;
        await q`CREATE TABLE IF NOT EXISTS visit_ingest (
          ip text,
          at timestamptz NOT NULL
        )`;
        await q`CREATE INDEX IF NOT EXISTS visit_ingest_ip_at ON visit_ingest (ip, at)`;
      })().catch((err: unknown) => {
        ready = null;
        throw err;
      });
    }
    await ready;
  }

  return {
    async ingest(input: IngestInput) {
      const q = sql();
      await ensure();
      const ip = input.place.ip ?? '';
      const windowStart = new Date(input.at.getTime() - TEN_MINUTES_MS);
      const counted = await q`SELECT count(*)::int AS n FROM visit_ingest WHERE ip = ${ip} AND at >= ${windowStart}`;
      const count = Number((counted[0] as { n?: unknown } | undefined)?.n ?? 0);
      if (rateLimited(count)) return 'limited';
      await q`INSERT INTO visit_ingest (ip, at) VALUES (${ip}, ${input.at})`;

      const existing = await q`SELECT id FROM visit_sessions WHERE id = ${input.body.sessionId} LIMIT 1`;
      if (existing.length === 0) {
        await q`INSERT INTO visit_sessions (
          id, visitor_id, started_at, last_seen_at, ip, country, region, city, user_agent
        ) VALUES (
          ${input.body.sessionId},
          ${input.body.visitorId},
          ${input.at},
          ${input.at},
          ${input.place.ip},
          ${input.place.country},
          ${input.place.region},
          ${input.place.city},
          ${input.place.userAgent}
        )`;
      } else {
        await q`UPDATE visit_sessions SET last_seen_at = ${input.at} WHERE id = ${input.body.sessionId}`;
      }

      const latestRows = await q`SELECT id, screen, mode, scenario_id, sheet
        FROM visit_spans WHERE session_id = ${input.body.sessionId}
        ORDER BY started_at DESC, id DESC LIMIT 1`;
      const latest = latestRows[0] as
        | { id: unknown; screen: string; mode: string | null; scenario_id: string | null; sheet: string | null }
        | undefined;
      const identity = {
        screen: input.body.screen,
        mode: input.body.mode,
        scenarioId: input.body.scenarioId,
        sheet: input.body.sheet,
      };
      const current = latest
        ? {
            screen: latest.screen as IngestInput['body']['screen'],
            mode: latest.mode as IngestInput['body']['mode'],
            scenarioId: latest.scenario_id,
            sheet: latest.sheet as IngestInput['body']['sheet'],
          }
        : null;
      if (decideSpan(current, identity) === 'extend' && latest) {
        await q`UPDATE visit_spans SET last_seen_at = ${input.at} WHERE id = ${latest.id}`;
      } else {
        await q`INSERT INTO visit_spans (session_id, screen, mode, scenario_id, sheet, started_at, last_seen_at)
          VALUES (
            ${input.body.sessionId},
            ${identity.screen},
            ${identity.mode},
            ${identity.scenarioId},
            ${identity.sheet},
            ${input.at},
            ${input.at}
          )`;
      }

      const cutoff = new Date(input.at.getTime() - NINETY_DAYS_MS);
      await q`DELETE FROM visit_spans WHERE session_id IN (
        SELECT id FROM visit_sessions WHERE last_seen_at < ${cutoff}
      )`;
      await q`DELETE FROM visit_sessions WHERE last_seen_at < ${cutoff}`;
      await q`DELETE FROM visit_ingest WHERE at < ${windowStart}`;
      return 'ok';
    },

    async listRecent(limit: number) {
      const q = sql();
      await ensure();
      const sessionRows = await q`SELECT id, visitor_id, started_at, last_seen_at, ip, country, region, city, user_agent
        FROM visit_sessions ORDER BY started_at DESC LIMIT ${limit}`;
      const ids = sessionRows.map((row) => String((row as { id: unknown }).id));
      if (ids.length === 0) return [];
      const spanRows = await q`SELECT session_id, screen, mode, scenario_id, sheet, started_at, last_seen_at
        FROM visit_spans WHERE session_id = ANY(${ids})
        ORDER BY started_at ASC, id ASC`;
      const bySession = new Map<string, SpanRecord[]>();
      for (const row of spanRows) {
        const raw = row as {
          session_id: unknown;
          screen: string;
          mode: string | null;
          scenario_id: string | null;
          sheet: string | null;
          started_at: unknown;
          last_seen_at: unknown;
        };
        const sessionId = String(raw.session_id);
        const list = bySession.get(sessionId) ?? [];
        list.push({
          screen: raw.screen as Screen,
          mode: raw.mode as VisitMode,
          scenarioId: raw.scenario_id,
          sheet: raw.sheet as VisitSheet | null,
          startedAt: asDate(raw.started_at),
          lastSeenAt: asDate(raw.last_seen_at),
        });
        bySession.set(sessionId, list);
      }
      return sessionRows.map((row) => {
        const raw = row as {
          id: unknown;
          visitor_id: unknown;
          started_at: unknown;
          last_seen_at: unknown;
          ip: unknown;
          country: unknown;
          region: unknown;
          city: unknown;
          user_agent: unknown;
        };
        const id = String(raw.id);
        const session: SessionRecord = {
          id,
          visitorId: String(raw.visitor_id),
          startedAt: asDate(raw.started_at),
          lastSeenAt: asDate(raw.last_seen_at),
          ip: asText(raw.ip),
          country: asText(raw.country),
          region: asText(raw.region),
          city: asText(raw.city),
          userAgent: asText(raw.user_agent),
          spans: bySession.get(id) ?? [],
        };
        return session;
      });
    },
  };
}
