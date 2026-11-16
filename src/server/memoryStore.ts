import { decideSpan, rateLimited } from '../visit/decide';
import { NINETY_DAYS_MS, TEN_MINUTES_MS, type IngestInput, type SessionRecord, type VisitStore } from './store';

type Hit = { ip: string; at: Date };

export type MemorySnapshot = {
  sessions: SessionRecord[];
  hits: Hit[];
};

export function createMemoryStore(hooks?: {
  load?: () => unknown;
  save?: (snapshot: MemorySnapshot) => void;
}): VisitStore {
  const loaded = revive(hooks?.load?.() ?? null);
  const sessions: SessionRecord[] = loaded.sessions;
  const hits: Hit[] = loaded.hits;
  const save = () => hooks?.save?.({ sessions, hits });

  return {
    async ingest(input: IngestInput) {
      const ip = input.place.ip ?? '';
      const windowStart = input.at.getTime() - TEN_MINUTES_MS;
      const recent = hits.filter((hit) => hit.ip === ip && hit.at.getTime() >= windowStart);
      if (rateLimited(recent.length)) return 'limited';
      hits.push({ ip, at: input.at });

      const cutoff = input.at.getTime() - NINETY_DAYS_MS;
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (sessions[i]!.lastSeenAt.getTime() < cutoff) sessions.splice(i, 1);
      }
      for (let i = hits.length - 1; i >= 0; i--) {
        if (hits[i]!.at.getTime() < windowStart) hits.splice(i, 1);
      }

      applyIngest(sessions, input);
      save();
      return 'ok';
    },
    async listRecent(limit: number) {
      return sessions
        .slice()
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, limit)
        .map((session) => ({
          ...session,
          spans: session.spans
            .slice()
            .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
            .map((span) => ({ ...span })),
        }));
    },
  };
}

function revive(raw: unknown): MemorySnapshot {
  if (!raw || typeof raw !== 'object') return { sessions: [], hits: [] };
  const data = raw as { sessions?: SessionRecord[]; hits?: Hit[] };
  return {
    sessions: (data.sessions ?? []).map((session) => ({
      ...session,
      startedAt: new Date(session.startedAt),
      lastSeenAt: new Date(session.lastSeenAt),
      spans: (session.spans ?? []).map((span) => ({
        ...span,
        startedAt: new Date(span.startedAt),
        lastSeenAt: new Date(span.lastSeenAt),
      })),
    })),
    hits: (data.hits ?? []).map((hit) => ({ ip: hit.ip, at: new Date(hit.at) })),
  };
}

export function applyIngest(sessions: SessionRecord[], input: IngestInput): void {
  let session = sessions.find((item) => item.id === input.body.sessionId);
  if (!session) {
    session = {
      id: input.body.sessionId,
      visitorId: input.body.visitorId,
      startedAt: input.at,
      lastSeenAt: input.at,
      ip: input.place.ip,
      country: input.place.country,
      region: input.place.region,
      city: input.place.city,
      userAgent: input.place.userAgent,
      spans: [],
    };
    sessions.push(session);
  } else {
    session.lastSeenAt = input.at;
  }

  const identity = {
    screen: input.body.screen,
    mode: input.body.mode,
    scenarioId: input.body.scenarioId,
    sheet: input.body.sheet,
  };
  const latest = session.spans[session.spans.length - 1] ?? null;
  if (decideSpan(latest, identity) === 'extend' && latest) {
    latest.lastSeenAt = input.at;
    return;
  }
  session.spans.push({ ...identity, startedAt: input.at, lastSeenAt: input.at });
}
