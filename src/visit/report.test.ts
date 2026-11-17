import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VisitSnapshot } from './types';

const HOME: VisitSnapshot = { screen: 'home', mode: null, scenarioId: null, sheet: null };
const PLAY: VisitSnapshot = { screen: 'play', mode: 'game', scenarioId: 'wall', sheet: null };

function blockedStorage(): Storage {
  const fail = () => {
    throw new DOMException('blocked');
  };
  return {
    get length() {
      return 0;
    },
    clear: fail,
    getItem: fail,
    key: () => null,
    removeItem: fail,
    setItem: fail,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.useRealTimers();
});

async function loadReport() {
  vi.resetModules();
  return import('./report');
}

describe('visit report', () => {
  it('posts a play beat when site data is blocked', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', blockedStorage());
    vi.stubGlobal('sessionStorage', blockedStorage());
    vi.stubGlobal('document', { visibilityState: 'hidden', addEventListener: () => {} });
    vi.stubGlobal('window', undefined);
    const { noteVisit } = await loadReport();
    noteVisit(PLAY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls as unknown[][])[0]?.[1] as RequestInit;
    expect(init.keepalive).toBe(false);
    expect(String(init.headers && (init.headers as Record<string, string>)['content-type'])).toContain('text/plain');
    const body = JSON.parse(String(init.body)) as { screen: string; kind: string; scenarioId: string };
    expect(body.kind).toBe('beat');
    expect(body.screen).toBe('play');
    expect(body.scenarioId).toBe('wall');
    await fetchMock.mock.results[0]?.value;
  });

  it('keeps a screen change that happens while the first post is in flight', async () => {
    vi.useFakeTimers();
    let release: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', blockedStorage());
    vi.stubGlobal('sessionStorage', blockedStorage());
    vi.stubGlobal('document', { visibilityState: 'hidden', addEventListener: () => {} });
    vi.stubGlobal('window', undefined);
    const { noteVisit } = await loadReport();
    noteVisit(HOME);
    noteVisit(PLAY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release?.(new Response(null, { status: 204 }));
    await fetchMock.mock.results[0]?.value;
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse(String(((fetchMock.mock.calls as unknown[][])[1]?.[1] as RequestInit | undefined)?.body)) as { screen: string };
    expect(second.screen).toBe('play');
    release?.(new Response(null, { status: 204 }));
    await fetchMock.mock.results[1]?.value;
  });

  it('ends a hidden page with a plain-text beacon', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const sendBeacon = vi.fn(() => true);
    let onVisibility: (() => void) | undefined;
    const doc = {
      visibilityState: 'visible',
      addEventListener: (name: string, fn: () => void) => {
        if (name === 'visibilitychange') onVisibility = fn;
      },
    };
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', blockedStorage());
    vi.stubGlobal('sessionStorage', blockedStorage());
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', { sendBeacon });
    vi.stubGlobal('window', { addEventListener: () => {} });
    const { noteVisit } = await loadReport();
    noteVisit(PLAY);
    await fetchMock.mock.results[0]?.value;
    doc.visibilityState = 'hidden';
    onVisibility?.();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const payload = (sendBeacon.mock.calls as unknown[][])[0]?.[1];
    expect(typeof payload).toBe('string');
    expect(JSON.parse(String(payload)).kind).toBe('end');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
