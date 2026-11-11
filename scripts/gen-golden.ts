import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, SCN, getScn } from '../src/data/scenarios';
import { kindOf } from '../src/engine/kind';
import { zonesFor } from '../src/engine/zones';
import { evaluate } from '../src/engine/evaluate';
import { D_START } from '../src/rink/coords';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src/engine/__fixtures__');
mkdirSync(root, { recursive: true });

const kinds: Record<string, string> = {};
const zones: Record<string, ReturnType<typeof zonesFor>> = {};
const evaluateCases: Record<
  string,
  {
    good: { allGood: boolean; pass: boolean; si: number; grades: string[]; dangers: (string | null)[] };
    bad: { allGood: boolean; pass: boolean; grades: string[] };
  }
> = {};

for (const id of Object.keys(SCN)) {
  const st = getScn(id);
  kinds[id] = kindOf(st);
  zones[id] = zonesFor(st);
  const Z = zones[id]!;
  const goodD = [
    { x: Z.S.cx, y: Z.S.cy, moved: true },
    { x: Z.W.cx, y: Z.W.cy, moved: true },
  ];
  const badD = [
    { x: D_START[0].x, y: D_START[0].y, moved: true },
    { x: D_START[1].x, y: D_START[1].y, moved: true },
  ];
  const g = evaluate(st, goodD);
  const b = evaluate(st, badD);
  evaluateCases[id] = {
    good: {
      allGood: g.allGood,
      pass: g.pass,
      si: g.si,
      grades: g.res.map((r) => r.g),
      dangers: g.res.map((r) => r.danger),
    },
    bad: {
      allGood: b.allGood,
      pass: b.pass,
      grades: b.res.map((r) => r.g),
    },
  };
}

writeFileSync(join(root, 'kinds.golden.json'), JSON.stringify(kinds, null, 2));
writeFileSync(join(root, 'zones.golden.json'), JSON.stringify(zones, null, 2));
writeFileSync(join(root, 'evaluate.golden.json'), JSON.stringify(evaluateCases, null, 2));
writeFileSync(join(root, 'base-ids.json'), JSON.stringify(BASE.map((b) => b.id), null, 2));
console.log('Wrote golden fixtures for', Object.keys(SCN).length, 'scenarios');
