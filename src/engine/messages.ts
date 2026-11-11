import type { EvalPlayer, Scenario, ZonesResult } from '../types';

export const THEM_NUM = [9, 17, 22, 44, 88];

export const GOOD_MSG = {
  own: {
    S: "You're protecting the boards. They can't clear the puck past you!",
    W: "You're in the middle, helping the attack!",
  },
  deep: {
    S: "Smart! You're holding the boards. No chasing!",
    W: "They have the puck. You're back protecting the middle!",
  },
  rim: {
    S: "You're on the boards, ready to stop the puck!",
    W: "You're back in the middle. No breakaways!",
  },
  carry: {
    S: "You're in their way on the boards!",
    W: "You got back! You're protecting our zone.",
  },
  out: {
    S: "You're back, between the puck and our net!",
    W: "You're back in the middle. No breakaway!",
  },
} as const;

export const ROLE_TXT = {
  own: { S: 'Guard the boards by the blue line.', W: 'Slide to the middle to help.' },
  deep: { S: "Hold the boards. Don't chase!", W: 'Get back to the middle.' },
  rim: { S: 'Stand on the boards. Stop the puck!', W: 'Get back to the middle.' },
  carry: { S: 'Get in their way on the boards.', W: 'Get back! Protect the middle.' },
  out: { S: 'Skate back! Stay in front of the puck.', W: 'Skate back to the middle.' },
} as const;

export const ROLE_NAME = { S: 'PUCK SIDE', W: 'OTHER SIDE' } as const;

export const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

export function fixMsg(
  st: Scenario,
  Z: ZonesResult,
  r: Pick<EvalPlayer, 'role' | 'danger'>,
  p: { x: number; y: number },
): string {
  const { kind, s, lurker } = Z;
  const z = r.role === 'S' ? Z.S : Z.W;
  const has = st.has;
  if (r.danger === 'deep')
    return r.role === 'W'
      ? 'Careful! They have the puck. Get back to protect our goalie!'
      : "Don't chase! You're behind the play. Skate back!";
  if (r.danger === 'tooDeep') return "Too deep! If they steal it, nobody is back. Stay higher!";
  if (r.danger === 'boards')
    return has === 'us'
      ? "Try moving closer to the boards. We don't want the puck getting past you!"
      : 'Guard the boards! They can skate or shoot it out there.';
  if (r.danger === 'middle') return "Get to the middle! Don't let them pass to an open player.";
  if (has === 'us' && p.x < -1) return 'Step inside the blue line! Stay onside and keep the puck in.';
  if (r.role === 'S' && p.y * s < -12) return "Wrong side! Go to the boards on the puck's side.";
  if (r.role === 'W' && lurker && has === 'them' && p.x > lurker.x - 2)
    return `Watch #${THEM_NUM[lurker.i]}! Stay between that player and our net.`;
  const dx = (z.cx - p.x) / z.rx;
  const dy = (z.cy - p.y) / z.ry;
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (r.role === 'S') {
      const toBoards = Math.abs(p.y) < Math.abs(z.cy);
      if (toBoards)
        return has === 'us'
          ? "Try moving closer to the boards. We don't want the puck getting past you!"
          : 'Move closer to the boards. Block their way out!';
      return 'Come off the boards a little. Give yourself room to react!';
    }
    if (p.y * s > 4)
      return has === 'us'
        ? 'Can you move towards the middle to help your teammates?'
        : 'Slide across to the middle. Watch for a pass!';
    if (Math.abs(p.y) > Math.abs(z.cy))
      return has === 'us'
        ? 'Can you move towards the middle to help your teammates?'
        : 'Slide to the middle. Watch for a pass across!';
    return lurker
      ? `Watch #${THEM_NUM[lurker.i]} sneaking on the other side!`
      : 'Slide over a little. Spread out from your partner!';
  }
  if (dx < 0) {
    if (has === 'us')
      return r.role === 'S'
        ? "Back up toward the blue line. That's your spot!"
        : 'Not so deep! Stay high so nobody gets a breakaway.';
    if (kind === 'out') return 'Skate back! Stay between the puck and our net.';
    return r.role === 'S'
      ? "Back up a little! Don't chase into the corner."
      : 'Get back! Protect our goalie!';
  }
  if (has === 'us')
    return r.role === 'S' ? 'Move up a little, closer to the play!' : 'Move up a bit to help the attack!';
  if (r.role === 'S')
    return kind === 'carry'
      ? 'Step up! Get in their way on the boards.'
      : 'Not so far back! Hold the boards near the blue line.';
  return "Come up a little. You're too far back!";
}
