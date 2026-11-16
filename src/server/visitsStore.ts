import { decideSpan, rateLimited } from '../visit/decide';
import type { Screen, VisitMode, VisitSheet } from '../visit/types';
import { createSql } from './db';
import {
  NINETY_DAYS_MS,
  TEN_MINUTES_MS,
  type IngestInput,
  type SessionRecord,
  type SpanRecord,
  type VisitStore,
} from './store';

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

export function createVisitStore(databaseUrl: string): VisitStore {
  const sql = createSql(databaseUrl);

  return {
    async ingest(input: IngestInput) {
      const ip = input.place.ip ?? '';
      const windowStart = new Date(input.at.getTime() - TEN_MINUTES_MS);
      const counted = await sql`SELECT count(*)::int AS n FROM visit_ingest WHERE ip = ${ip} AND at >= ${windowStart}`;
      const count = Number((counted[0] as { n?: unknown } | undefined)?.n ?? 0);
      if (rateLimited(count)) return 'limited';
      await sql`INSERT INTO visit_ingest (ip, at) VALUES (${ip}, ${input.at})`;

      const existing = await sql`SELECT id FROM visit_sessions WHERE id = ${input.body.sessionId} LIMIT 1`;
      if (existing.length === 0) {
        await sql`INSERT INTO visit_sessions (
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
        await sql`UPDATE visit_sessions SET last_seen_at = ${input.at} WHERE id = ${input.body.sessionId}`;
      }

      const latestRows = await sql`SELECT id, screen, mode, scenario_id, sheet
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
        await sql`UPDATE visit_spans SET last_seen_at = ${input.at} WHERE id = ${latest.id}`;
      } else {
        await sql`INSERT INTO visit_spans (session_id, screen, mode, scenario_id, sheet, started_at, last_seen_at)
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
      await sql`DELETE FROM visit_spans WHERE session_id IN (
        SELECT id FROM visit_sessions WHERE last_seen_at < ${cutoff}
      )`;
      await sql`DELETE FROM visit_sessions WHERE last_seen_at < ${cutoff}`;
      await sql`DELETE FROM visit_ingest WHERE at < ${windowStart}`;
      return 'ok';
    },

    async listRecent(limit: number) {
      const sessionRows = await sql`SELECT id, visitor_id, started_at, last_seen_at, ip, country, region, city, user_agent
        FROM visit_sessions ORDER BY started_at DESC LIMIT ${limit}`;
      const ids = sessionRows.map((row) => String((row as { id: unknown }).id));
      if (ids.length === 0) return [];
      const spanRows = await sql`SELECT session_id, screen, mode, scenario_id, sheet, started_at, last_seen_at
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
