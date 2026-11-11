import type { SequenceDef } from '../types';
import { POOL, SCN } from './scenarios';

const pick = <T,>(a: T[], rng = Math.random): T => a[Math.floor(rng() * a.length)]!;

export const SEQS: SequenceDef[] = [
  {
    id: 'cycle',
    icon: '🔄',
    name: 'Cycle the Puck',
    desc: 'Around the zone, then a turnover!',
    steps: ['wall', 'corner', 'behindnet', 'lowboards', 'carry_m', 'out_m'],
  },
  {
    id: 'turnover',
    icon: '😱',
    name: 'Turnover Trouble',
    desc: 'They steal it, we get it back...',
    steps: ['wall_m', 'rim', 'lowboards', 'highcircle', 'carry', 'out'],
  },
  {
    id: 'sneaky',
    icon: '🕵️',
    name: 'Sneaky Forward',
    desc: 'Watch out behind you!',
    steps: ['corner', 'stolen', 'carry', 'wall', 'behindnet', 'sneak'],
  },
  {
    id: 'mix',
    icon: '🎲',
    name: 'Surprise Mix',
    desc: 'Different every time!',
    steps: null,
  },
];

export function randomSequence(rng: () => number = Math.random): string[] {
  for (let tries = 0; tries < 200; tries++) {
    const ids: string[] = [];
    // guard: a degenerate rng (e.g. constant) must not spin forever
    for (let guard = 0; ids.length < 6 && guard < 500; guard++) {
      const id = pick(POOL, rng);
      if (!ids.includes(id) && !ids.includes(id.replace('_m', '')) && !ids.includes(id + '_m'))
        ids.push(id);
    }
    if (ids.length < 6) continue;
    let changes = 0;
    for (let i = 1; i < ids.length; i++) {
      if (SCN[ids[i]!]!.has !== SCN[ids[i - 1]!]!.has) changes++;
    }
    if (changes >= 2 && changes <= 4 && SCN[ids[0]!]!.has === 'us') return ids;
  }
  return SEQS[0]!.steps!.slice();
}
