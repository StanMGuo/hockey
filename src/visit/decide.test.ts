import { describe, expect, it } from 'vitest';
import { decideSpan, durationMs, rateLimited, trimQueue, validateBody } from './decide';
import type { VisitBody } from './types';

const VISITOR = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';

function body(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    visitorId: VISITOR,
    sessionId: SESSION,
    kind: 'beat',
    screen: 'home',
    mode: null,
    scenarioId: null,
    sheet: null,
    ...extra,
  };
}

describe('T-LOG-01 validate visit body', () => {
  it('accepts a legal body and ignores extra fields', () => {
    const parsed = validateBody(body({ password: 'nope', duration: 99 }));
    expect(parsed).toEqual<VisitBody>({
      visitorId: VISITOR,
      sessionId: SESSION,
      kind: 'beat',
      screen: 'home',
      mode: null,
      scenarioId: null,
      sheet: null,
    });
  });

  it('rejects a missing field, a bad uuid, and an unknown screen', () => {
    const missing = body();
    delete missing.screen;
    expect(validateBody(missing)).toBeNull();
    expect(validateBody(body({ visitorId: 'not-a-uuid' }))).toBeNull();
    expect(validateBody(body({ screen: 'rink' }))).toBeNull();
    expect(validateBody(null)).toBeNull();
  });
});

describe('T-LOG-02 span decision', () => {
  const home = { screen: 'home' as const, mode: null, scenarioId: null, sheet: null };

  it('extends when the second heartbeat is the same picture', () => {
    expect(decideSpan(home, { ...home })).toBe('extend');
  });

  it('opens a new span when the mode or scenario changes', () => {
    expect(decideSpan(home, { screen: 'play', mode: 'learn', scenarioId: 'wall', sheet: null })).toBe('open');
    expect(
      decideSpan(
        { screen: 'play', mode: 'learn', scenarioId: 'wall', sheet: null },
        { screen: 'play', mode: 'learn', scenarioId: 'corner', sheet: null },
      ),
    ).toBe('open');
  });
});

describe('T-LOG-03 duration', () => {
  it('subtracts server timestamps and clamps a backwards end to zero', () => {
    const start = new Date('2026-11-15T23:00:00.000Z');
    const end = new Date('2026-11-15T23:00:50.000Z');
    expect(durationMs(start, end)).toBe(50_000);
    expect(durationMs(end, start)).toBe(0);
  });
});

describe('T-LOG-04 rate limit', () => {
  it('rejects the 31st event in the window', () => {
    expect(rateLimited(29)).toBe(false);
    expect(rateLimited(30)).toBe(true);
  });
});

describe('T-LOG-05 queue cap', () => {
  it('drops the oldest items past 50', () => {
    const items = Array.from({ length: 51 }, (_, i) => i);
    expect(trimQueue(items)).toEqual(items.slice(1));
  });
});
