import type { Screen, VisitMode, VisitSheet } from '../visit/types';

export type SpanView = {
  screen: Screen;
  mode: VisitMode;
  scenarioId: string | null;
  sheet: VisitSheet | null;
  durationMs: number;
};

export type SessionView = {
  visitorId: string;
  startedAt: string;
  durationMs: number;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  spans: SpanView[];
};

export type FormattedSession = {
  when: string;
  visitor: string;
  place: string;
  ip: string;
  duration: string;
  path: string;
};

export function formatDuration(ms: number): string {
  const safe = ms < 0 ? 0 : ms;
  const total = Math.floor(safe / 1000);
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (seconds === 0) return `${minutes} 分`;
  return `${minutes} 分 ${seconds} 秒`;
}

export function formatPlace(city: string | null, region: string | null, country: string | null): string {
  const parts = [city, region, country].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length > 0 ? parts.join(', ') : '未知';
}

export function formatWhen(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

function spanLabel(span: SpanView): string {
  if (span.screen === 'home') return '首页';
  if (span.screen === 'gate') return '密码门';
  if (span.screen === 'sheet') {
    if (span.sheet === 'how') return 'How to play';
    if (span.sheet === 'settings') return 'Settings';
    if (span.sheet === 'practice-pick') return '练习选关';
    if (span.sheet === 'game-pick') return '比赛选关';
    return '弹层';
  }
  const mode = span.mode === 'learn' ? 'Learn' : span.mode === 'help' || span.mode === 'test' ? 'Practice' : span.mode === 'game' ? 'Game' : '对局';
  return span.scenarioId ? `${mode} / ${span.scenarioId}` : mode;
}

export function formatSession(session: SessionView, timeZone: string): FormattedSession {
  return {
    when: formatWhen(session.startedAt, timeZone),
    visitor: session.visitorId.slice(0, 8),
    place: formatPlace(session.city, session.region, session.country),
    ip: session.ip && session.ip.trim() ? session.ip : '未知',
    duration: formatDuration(session.durationMs),
    path: session.spans.map((span) => `${spanLabel(span)} ${formatDuration(span.durationMs)}`).join(' → '),
  };
}
