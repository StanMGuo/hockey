import type { Scenario } from '../types';

export const US_NUM = [11, 19, 27];
export const THEM_NUM = [9, 17, 22, 44, 88];

export const BASE: Scenario[] = [
  {
    id: 'wall',
    name: 'Puck on the boards',
    has: 'us',
    puck: [24, -37],
    us: [
      [26.8, -38.2],
      [55, 2],
      [40, 22],
    ],
    them: [
      [31, -32],
      [50, -14],
      [57, 8],
      [14, -18],
      [20, 16],
    ],
    why: "We have the puck on the boards. The D on that side guards the boards by the blue line so the puck can't get out. The other D slides to the middle to help.",
  },
  {
    id: 'corner',
    name: 'Puck in the corner',
    has: 'us',
    puck: [63, -33],
    us: [
      [60.8, -35],
      [52, 4],
      [36, 18],
    ],
    them: [
      [64.5, -29.5],
      [57, -6],
      [44, -20],
      [20, -26],
      [24, 12],
    ],
    why: 'The puck is deep in the corner. The puck-side D still stays up by the blue line. If you go into the corner too, nobody guards the boards!',
  },
  {
    id: 'behindnet',
    name: 'Behind their net',
    has: 'us',
    puck: [69, 7],
    side: 1,
    us: [
      [67.5, 9.6],
      [55, -6],
      [46, 24],
    ],
    them: [
      [65, 13.5],
      [60, -3],
      [42, 2],
      [22, 28],
      [18, -16],
    ],
    why: "We took the puck behind their net and it's heading to one side. The D on THAT side takes the boards now. The other D covers the middle.",
  },
  {
    id: 'lowboards',
    name: 'Low on the boards',
    has: 'us',
    puck: [47, 38],
    us: [
      [44.8, 36],
      [56, -2],
      [32, -14],
    ],
    them: [
      [50.5, 33.5],
      [58, 6],
      [38, 26],
      [19, 27],
      [22, -8],
    ],
    why: 'The puck is low on the boards. The puck-side D waits by the blue line, ready to keep the puck in. The partner is in the middle for a pass or a shot.',
  },
  {
    id: 'highcircle',
    name: 'Top of the circle',
    has: 'us',
    puck: [30, -24],
    us: [
      [32, -26.3],
      [55, 0],
      [45, 18],
    ],
    them: [
      [35.5, -19.5],
      [52, -6],
      [56, 12],
      [12, -6],
      [26, 22],
    ],
    why: 'Our player has the puck up high. Stay near the boards and the blue line. Your partner is in the middle, ready for a pass!',
  },
  {
    id: 'stolen',
    name: 'They stole it in the corner',
    has: 'them',
    puck: [64, -33],
    them: [
      [62, -35.2],
      [58, 4],
      [46, -26],
      [28, -10],
      [26, 18],
    ],
    us: [
      [60, -28],
      [50, 6],
      [40, 22],
    ],
    why: "They have the puck deep. Don't chase into the corner! The puck-side D holds the boards. The other D gets back to the middle so there's no breakaway.",
  },
  {
    id: 'rim',
    name: 'They want to shoot it around',
    has: 'them',
    puck: [70, 5],
    side: 1,
    threat: 'rim',
    them: [
      [68.6, 2.5],
      [59, 31],
      [52, -20],
      [36, 10],
      [28, -22],
    ],
    us: [
      [63, -9],
      [56, 15],
      [40, -6],
    ],
    why: 'They want to shoot the puck around the boards and out. The puck-side D stands on the boards to stop it. The other D gets back to the middle.',
  },
  {
    id: 'carry',
    name: "They're skating it out",
    has: 'them',
    puck: [32, -36.5],
    them: [
      [34.6, -37.2],
      [50, -12],
      [55, 10],
      [40, 6],
      [24, 14],
    ],
    us: [
      [40, -31],
      [52, 4],
      [30, 20],
    ],
    why: "They're skating up the boards. The puck-side D steps into their way, between the puck and the blue line. The other D skates back to protect the middle.",
  },
  {
    id: 'sneak',
    name: 'Watch the sneaky player',
    has: 'them',
    puck: [28, 36.5],
    them: [
      [30.6, 37.3],
      [8, -20],
      [48, -8],
      [56, 14],
      [38, 18],
    ],
    us: [
      [36, 30],
      [50, -4],
      [32, -12],
    ],
    why: 'A player is sneaking behind us on the other side! The puck-side D blocks the boards. The other D stays between the sneaky player and our net.',
  },
  {
    id: 'out',
    name: 'They got it out',
    has: 'them',
    puck: [-9, -28],
    them: [
      [-6.4, -29.4],
      [6, -6],
      [14, 18],
      [45, -6],
      [52, 10],
    ],
    us: [
      [4, -31],
      [20, 6],
      [30, -14],
    ],
    why: 'The puck is out of the zone. Both D skate back! Stay between the puck and our net. No breakaways!',
  },
  {
    id: 'theirnet',
    name: 'They have it behind the net',
    has: 'them',
    puck: [69, -6],
    side: -1,
    them: [
      [69.6, -3.4],
      [55, -36],
      [50, 30],
      [30, 0],
      [22, -20],
    ],
    us: [
      [62, -14],
      [52, 12],
      [38, -6],
    ],
    why: "They have the puck behind their net. Don't chase back there! Hold the boards on the puck side and get your partner back to the middle.",
  },
];

export function mirror(sc: Scenario): Scenario {
  const f = (p: [number, number]): [number, number] => [p[0], -p[1]];
  return {
    ...sc,
    id: sc.id + '_m',
    puck: f(sc.puck),
    us: sc.us.map(f),
    them: sc.them.map(f),
    side: sc.side ? ((-sc.side) as 1 | -1) : undefined,
  };
}

export const SCN: Record<string, Scenario> = {};
BASE.forEach((b) => {
  SCN[b.id] = b;
  SCN[b.id + '_m'] = mirror(b);
});

export const getScn = (id: string): Scenario => JSON.parse(JSON.stringify(SCN[id])) as Scenario;
export const POOL = Object.keys(SCN);
export const LEARN_ORDER = [
  'wall',
  'wall_m',
  'corner_m',
  'behindnet',
  'stolen',
  'carry_m',
  'rim',
  'out',
  'lowboards',
  'theirnet',
  'sneak',
  'highcircle',
];
