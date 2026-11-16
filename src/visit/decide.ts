import {
  KINDS,
  SCREENS,
  SHEETS,
  VISIT_MODES,
  type SpanIdentity,
  type VisitBody,
  type VisitKind,
  type VisitMode,
  type VisitSheet,
  type Screen,
} from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function durationMs(started: Date, last: Date): number {
  const delta = last.getTime() - started.getTime();
  return delta < 0 ? 0 : delta;
}

export function sameSpan(a: SpanIdentity, b: SpanIdentity): boolean {
  return a.screen === b.screen && a.mode === b.mode && a.scenarioId === b.scenarioId && a.sheet === b.sheet;
}

/** Same screen identity extends the open span. Anything else, including the first event, opens one. */
export function decideSpan(current: SpanIdentity | null, next: SpanIdentity): 'extend' | 'open' {
  if (!current) return 'open';
  return sameSpan(current, next) ? 'extend' : 'open';
}

/** The 31st accepted attempt in the window is rejected. `count` is how many are already stored. */
export function rateLimited(count: number): boolean {
  return count >= 30;
}

/** Keep the newest `max` items. Older ones fall off the front. */
export function trimQueue<T>(items: readonly T[], max = 50): T[] {
  if (items.length <= max) return [...items];
  return items.slice(items.length - max);
}

function isScreen(value: unknown): value is Screen {
  return typeof value === 'string' && (SCREENS as readonly string[]).includes(value);
}

function isKind(value: unknown): value is VisitKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

function isMode(value: unknown): value is VisitMode {
  return value === null || (typeof value === 'string' && (VISIT_MODES as readonly string[]).includes(value));
}

function isSheet(value: unknown): value is VisitSheet | null {
  return value === null || (typeof value === 'string' && (SHEETS as readonly string[]).includes(value));
}

function isScenario(value: unknown): value is string | null {
  if (value === null) return true;
  return typeof value === 'string' && value.length > 0;
}

export function validateBody(input: unknown): VisitBody | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const { visitorId, sessionId, kind, screen, mode, scenarioId, sheet } = raw;
  if (typeof visitorId !== 'string' || !isUuid(visitorId)) return null;
  if (typeof sessionId !== 'string' || !isUuid(sessionId)) return null;
  if (!isKind(kind) || !isScreen(screen) || !isMode(mode) || !isScenario(scenarioId) || !isSheet(sheet)) return null;
  return { visitorId, sessionId, kind, screen, mode, scenarioId, sheet };
}
