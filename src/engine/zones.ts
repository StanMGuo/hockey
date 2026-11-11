import type { Scenario, ZonesResult } from '../types';
import { clamp, sideOf } from './geometry';
import { carrierIdx, kindOf } from './kind';

export function zonesFor(st: Scenario): ZonesResult {
  const [px, py] = st.puck;
  const s = sideOf(st);
  const kind = kindOf(st);
  let S;
  let W;
  if (kind === 'own') {
    const deep = clamp((px - 20) / 45, 0, 1);
    S = { cx: 6 + 4 * deep, cy: s * 31, rx: 7, ry: 9 };
    W = { cx: 12 + 5 * deep, cy: -s * 4, rx: 9, ry: 11 };
  } else if (kind === 'deep' || kind === 'rim') {
    S = { cx: 9, cy: s * 32, rx: 7, ry: 8 };
    if (kind === 'rim') {
      S.cy = s * 35;
      S.ry = 7;
    }
    W = { cx: -1, cy: -s * 3, rx: 7, ry: 12 };
  } else if (kind === 'carry') {
    S = {
      cx: clamp(px - 13, 1, 26),
      cy: s * clamp(Math.abs(py) - 6, 18, 32),
      rx: 7,
      ry: 8,
    };
    W = { cx: -6, cy: -s * 4, rx: 7, ry: 12 };
  } else {
    S = {
      cx: clamp(px - 10, -20, -8),
      cy: s * clamp(Math.abs(py) - 10, 8, 24),
      rx: 5.5,
      ry: 8,
    };
    W = { cx: -19.5, cy: -s * 3, rx: 5, ry: 11 };
  }

  let lurker = null as ZonesResult['lurker'];
  const ci = st.has === 'them' ? carrierIdx(st) : -1;
  st.them.forEach((o, i) => {
    if (i === ci) return;
    if (o[1] * s < 4 && o[0] < (kind === 'own' ? 14 : 24)) {
      if (!lurker || o[0] < lurker.x) lurker = { x: o[0], y: o[1], i };
    }
  });
  if (lurker) {
    if (kind === 'own') W.cx = Math.min(W.cx, lurker.x + 3);
    else {
      W.cx = Math.min(W.cx, lurker.x - 6);
      W.cy += (lurker.y - W.cy) * 0.4;
    }
  }
  return { S, W, s, kind, lurker };
}
