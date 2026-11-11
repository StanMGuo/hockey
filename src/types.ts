export type Possession = 'us' | 'them';
export type Kind = 'own' | 'rim' | 'deep' | 'carry' | 'out';
export type Grade = 'good' | 'close' | 'off' | 'danger';
export type Role = 'S' | 'W';
export type Point2 = [number, number];

export type Scenario = {
  id: string;
  name: string;
  has: Possession;
  puck: Point2;
  us: Point2[];
  them: Point2[];
  why: string;
  side?: 1 | -1;
  threat?: 'rim';
};

export type Zone = { cx: number; cy: number; rx: number; ry: number };

export type DefPos = { x: number; y: number; moved?: boolean };

export type Lurker = { x: number; y: number; i: number };

export type ZonesResult = {
  S: Zone;
  W: Zone;
  s: number;
  kind: Kind;
  lurker: Lurker | null;
};

export type EvalPlayer = {
  i: number;
  role: Role;
  d: number;
  g: Grade;
  danger: string | null;
  head: string;
  msg: string;
};

export type EvalResult = {
  res: EvalPlayer[];
  si: number;
  wi: number;
  Z: ZonesResult;
  team: string[];
  allGood: boolean;
  overall: string;
  demo: 'stop' | 'breakaway' | 'clear' | null;
  pass: boolean;
};

export type Progress = {
  passes: Record<number, number>;
  completed: number;
  learnIdx: number;
  game: Record<string, { best: number; stars: number }>;
  unlockAll: boolean;
  sound: boolean;
  seenHow: boolean;
};

export type SequenceDef = {
  id: string;
  icon: string;
  name: string;
  desc: string;
  steps: string[] | null;
};
