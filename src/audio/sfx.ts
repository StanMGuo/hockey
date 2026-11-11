/* Tiny Web Audio blips (no audio files), ported from the baseline SFX object. */

type Note = [freq: number, start: number, dur: number, type?: OscillatorType, vol?: number];

let soundEnabled: () => boolean = () => true;
let actx: AudioContext | null = null;

/** Wire the on/off switch (e.g. `() => prog.sound`). */
export function setSoundEnabledGetter(fn: () => boolean): void {
  soundEnabled = fn;
}

function beep(notes: Note[]): void {
  if (!soundEnabled()) return;
  try {
    if (!actx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      actx = new Ctor();
    }
    const ctx = actx;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const [f, t, d, type = 'sine', vol = 0.14] of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + t);
      g.gain.exponentialRampToValueAtTime(vol, t0 + t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + d);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0 + t);
      o.stop(t0 + t + d + 0.05);
    }
  } catch {
    /* audio is optional */
  }
}

export const SFX = {
  pop: () => beep([[560, 0, 0.07, 'triangle', 0.1]]),
  good: () =>
    beep([
      [660, 0, 0.12],
      [990, 0.09, 0.22],
    ]),
  great: () =>
    beep([
      [523, 0, 0.14],
      [659, 0.1, 0.14],
      [784, 0.2, 0.14],
      [1047, 0.3, 0.4],
    ]),
  oops: () =>
    beep([
      [392, 0, 0.16, 'triangle'],
      [330, 0.13, 0.24, 'triangle'],
    ]),
  alarm: () =>
    beep([
      [880, 0, 0.12, 'square', 0.05],
      [660, 0.15, 0.16, 'square', 0.05],
    ]),
  whoosh: () =>
    beep([
      [300, 0, 0.3, 'sawtooth', 0.03],
      [180, 0.05, 0.3, 'sawtooth', 0.02],
    ]),
};
