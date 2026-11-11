import type { DefPos, EvalPlayer, EvalResult, Scenario } from '../types';
import { ellD, grade } from './geometry';
import { fixMsg, GOOD_MSG, pick } from './messages';
import { zonesFor } from './zones';

export function evaluate(st: Scenario, D: DefPos[]): EvalResult {
  const Z = zonesFor(st);
  const { S, W, s, kind } = Z;
  const has = st.has;
  const px = st.puck[0];
  const a = ellD(D[0]!, S) + ellD(D[1]!, W);
  const b = ellD(D[1]!, S) + ellD(D[0]!, W);
  const si = a <= b ? 0 : 1;
  const wi = 1 - si;
  const res: EvalPlayer[] = [];
  res[si] = { i: si, role: 'S', d: ellD(D[si]!, S), g: 'off', danger: null, head: '', msg: '' };
  res[wi] = { i: wi, role: 'W', d: ellD(D[wi]!, W), g: 'off', danger: null, head: '', msg: '' };
  res.forEach((r) => {
    r.g = grade(r.d);
    r.danger = null;
  });

  for (const r of res) {
    const p = D[r.i]!;
    if (r.g === 'good') continue;
    if (has === 'them' && p.x > px + 3) {
      r.g = 'danger';
      r.danger = 'deep';
    } else if (has === 'them' && r.role === 'W' && p.x > 20) {
      r.g = 'danger';
      r.danger = 'deep';
    } else if (has === 'us' && r.role === 'W' && p.x > 40) {
      r.g = 'danger';
      r.danger = 'tooDeep';
    }
  }

  if (kind !== 'out') {
    const laneY = Math.min(18, Math.abs(S.cy) - S.ry);
    const maxX = kind === 'carry' ? px : 26;
    const guarded = D.some((p) => p.y * s > laneY && p.x < maxX && p.x > -6);
    const r = res[si]!;
    if (!guarded && r.g !== 'good' && !r.danger) {
      r.g = 'danger';
      r.danger = 'boards';
    }
  }

  if (has === 'them') {
    const ok = D.some((p) => Math.abs(p.y) < 24 && p.x < Math.min(px, 12));
    const r = res[wi]!;
    if (!ok && r.g !== 'good' && !r.danger) {
      r.g = 'danger';
      r.danger = 'middle';
    }
  }

  const team: string[] = [];
  const sameSide =
    (D[0]!.y * s > 12 && D[1]!.y * s > 12) || (D[0]!.y * s < -12 && D[1]!.y * s < -12);
  const gap = Math.hypot(D[0]!.x - D[1]!.x, D[0]!.y - D[1]!.y);
  if (sameSide) team.push('same');
  else if (gap < 10) team.push('close');
  if (has === 'them' && D[0]!.x > 22 && D[1]!.x > 22) team.push('bothDeep');

  for (const r of res) {
    const p = D[r.i]!;
    if (r.g === 'good') {
      r.head = pick(['GOOD!', 'GREAT JOB!', 'NICE!', 'AWESOME!']);
      r.msg = GOOD_MSG[kind][r.role];
    } else {
      r.head = r.g === 'close' ? 'ALMOST!' : r.g === 'danger' ? 'WATCH OUT!' : 'TRY AGAIN!';
      r.msg = fixMsg(st, Z, r, p);
    }
  }

  const allGood = res.every((r) => r.g === 'good');
  let overall: string;
  if (allGood)
    overall = pick([
      "Perfect! You're working together as a defensive pair!",
      'Great teamwork! You and your partner have the ice covered!',
    ]);
  else if (team.includes('same'))
    overall = "You're both on the same side! Try spreading out to protect more of the ice.";
  else if (team.includes('bothDeep'))
    overall = 'Careful! They have the puck. Someone needs to protect our goalie!';
  else if (team.includes('close'))
    overall = "You're too close together! Spread out to cover more ice.";
  else if (res.some((r) => r.g === 'danger'))
    overall =
      has === 'them'
        ? 'Watch out! They have the puck!'
        : 'Watch out! Someone has to guard the boards and someone has to stay back.';
  else if (res.some((r) => r.g === 'good')) overall = 'One is perfect! Fix the yellow one and try again.';
  else overall = 'So close! Move them a little and try again.';

  let demo: EvalResult['demo'] = null;
  if (allGood) demo = kind === 'rim' ? 'stop' : null;
  else {
    const brk =
      res.some((r) => ['deep', 'tooDeep', 'middle'].includes(r.danger || '')) ||
      team.includes('bothDeep');
    const clr = res.some((r) => r.danger === 'boards');
    demo =
      has === 'them' ? (brk ? 'breakaway' : clr ? 'clear' : null) : clr ? 'clear' : brk ? 'breakaway' : null;
  }
  const pass = res.every((r) => r.g === 'good' || r.g === 'close');
  return { res, si, wi, Z, team, allGood, overall, demo, pass };
}
