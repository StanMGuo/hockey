import type { Grade, Scenario, Zone } from '../types';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const sideOf = (st: Pick<Scenario, 'side' | 'puck'>) =>
  st.side || (st.puck[1] >= 0 ? 1 : -1);

export const ellD = (p: { x: number; y: number }, z: Zone) =>
  Math.hypot((p.x - z.cx) / z.rx, (p.y - z.cy) / z.ry);

export const grade = (d: number): Grade => (d <= 1 ? 'good' : d <= 1.8 ? 'close' : 'off');
