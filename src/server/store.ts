import type { SpanIdentity, VisitBody } from '../visit/types';

export type Place = {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  userAgent: string | null;
};

export type IngestInput = {
  body: VisitBody;
  at: Date;
  place: Place;
};

export type SpanRecord = SpanIdentity & {
  startedAt: Date;
  lastSeenAt: Date;
};

export type SessionRecord = {
  id: string;
  visitorId: string;
  startedAt: Date;
  lastSeenAt: Date;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  userAgent: string | null;
  spans: SpanRecord[];
};

export type VisitStore = {
  ingest(input: IngestInput): Promise<'ok' | 'limited'>;
  listRecent(limit: number): Promise<SessionRecord[]>;
};

export const TEN_MINUTES_MS = 10 * 60 * 1000;
export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
