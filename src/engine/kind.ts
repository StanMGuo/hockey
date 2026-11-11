import type { Kind, Scenario } from '../types';

export function kindOf(st: Scenario): Kind {
  if (st.has === 'us') return 'own';
  if (st.threat === 'rim') return 'rim';
  const px = st.puck[0];
  if (px > 45) return 'deep';
  if (px > 8) return 'carry';
  return 'out';
}

export function carrierIdx(st: Scenario): number {
  const team = st.has === 'us' ? st.us : st.them;
  let best = 0;
  let bd = 1e9;
  team.forEach((p, i) => {
    const d = Math.hypot(p[0] - st.puck[0], p[1] - st.puck[1]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}
