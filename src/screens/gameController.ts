/* Imperative game controller: a TypeScript port of the baseline script.
   React renders the DOM shell (#home, #play, #sheet); everything below runs
   against those elements, scoped to the given root. */
import { SFX, setSoundEnabledGetter } from '../audio/sfx';
import { evaluate } from '../engine/evaluate';
import { clamp } from '../engine/geometry';
import { kindOf } from '../engine/kind';
import { sideOf } from '../engine/geometry';
import { ROLE_NAME, ROLE_TXT, pick } from '../engine/messages';
import { zonesFor } from '../engine/zones';
import { BASE, LEARN_ORDER, SCN, THEM_NUM, US_NUM, getScn } from '../data/scenarios';
import { SEQS, randomSequence } from '../data/sequences';
import {
  C,
  D_START,
  E,
  GL,
  H,
  LX,
  clampToIce,
  isPortrait,
  landscapeViewBox,
  portraitViewBox,
} from '../rink/coords';
import { UNLOCK, defaultProg, unlocked as unlockedFor } from '../state/progress';
import type { ProgressStore } from '../state/ProgressStore';
import type { DefPos, EvalResult, Grade, Kind, Progress, Role, Scenario, Zone } from '../types';

const NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };
type Pos = { us: Pt[]; them: Pt[]; goalie: Pt; puck: Pt };
type Mode = 'learn' | 'help' | 'test' | 'game';
type ZoneStyle = 'none' | 'show' | 'subtle' | 'reveal';
type PlayerType = 'us' | 'them' | 'd' | 'goalie';
type Row = { cls: string; head: string; msg: string };
type Btn = { cls: string; label: string; fn: () => void; disabled?: boolean };
type Attrs = Record<string, string | number>;

type PlayerNode = {
  g: SVGGElement;
  body: SVGGElement;
  lab: SVGGElement;
  mark?: SVGGElement;
  markText?: SVGTextElement;
};

type GameState = {
  mode: Mode | null;
  level: number;
  list: Scenario[];
  idx: number;
  st: Scenario | null;
  prev: Scenario | null;
  D: DefPos[];
  pos: Pos | null;
  checks: number;
  done: boolean;
  busy: boolean;
  hint: boolean;
  zoneStyle: ZoneStyle;
  ghostMode: boolean | 'arrows';
  ghostAssign: { si: number; wi: number } | null;
  lastEval: EvalResult | null;
  score: number;
  max: number;
  prevStrong: number | null;
  seqId: string | null;
  steps: { pts: number; max: number }[];
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const lin = (k: number) => k;
const lerpP = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const clonePos = (p: Pos): Pos => structuredClone(p);

const MODE_NAME: Record<Mode, string> = {
  learn: 'LEARN · SHOW ME',
  help: 'PRACTICE · HELP ME',
  test: 'PRACTICE · TEST ME',
  game: 'GAME CHALLENGE',
};
const LEVEL_NAME: Record<number, string> = { 1: 'SHOW ME', 2: 'HELP ME', 3: 'TEST ME', 4: 'GAME CHALLENGE' };

const PAL: Record<PlayerType, { jersey: string; dark: string; helmet: string; num: string }> = {
  us: { jersey: '#3a86ff', dark: '#0b3a99', helmet: '#0b3a99', num: '#fff' },
  d: { jersey: '#1556d6', dark: '#061f5c', helmet: '#ffffff', num: '#0a2d7a' },
  them: { jersey: '#e5383b', dark: '#8c1414', helmet: '#8c1414', num: '#fff' },
  goalie: { jersey: '#e5383b', dark: '#8c1414', helmet: '#f1f1f1', num: '#fff' },
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  if (attrs) for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}

function rinkPath(inset: number): string {
  const h = H - inset;
  const e = E - inset;
  const c = C - inset;
  return `M${LX},${-h} H${E - C} A${c},${c} 0 0 1 ${e},${-H + C} V${H - C} A${c},${c} 0 0 1 ${E - C},${h} H${LX} Z`;
}
function boardsPath(inset: number): string {
  const h = H - inset;
  const e = E - inset;
  const c = C - inset;
  return `M${LX},${-h} H${E - C} A${c},${c} 0 0 1 ${e},${-H + C} V${H - C} A${c},${c} 0 0 1 ${E - C},${h} H${LX}`;
}

function posFromSt(st: Scenario): Pos {
  return {
    us: st.us.map((p) => ({ x: p[0], y: p[1] })),
    them: st.them.map((p) => ({ x: p[0], y: p[1] })),
    goalie: { x: 61.3, y: clamp(st.puck[1] * 0.1, -2.6, 2.6) },
    puck: { x: st.puck[0], y: st.puck[1] },
  };
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
function practiceList(): Scenario[] {
  return shuffle(BASE.map((b) => getScn(Math.random() < 0.5 ? b.id : b.id + '_m')));
}
function starsFor(score: number, max: number): number {
  const r = max ? score / max : 0;
  return r >= 0.85 ? 3 : r >= 0.6 ? 2 : 1;
}
function roleOf(Z: { kind: Kind }, role: Role): string {
  return ROLE_TXT[Z.kind][role];
}

export function createGame(root: HTMLElement, store: ProgressStore): () => void {
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => root.querySelector<T>(s)!;
  const svg = root.querySelector<SVGSVGElement>('#rink')!;

  let prog: Progress = store.load();
  const saveProg = () => store.save(prog);
  const unlocked = (level: number) => unlockedFor(prog, level);
  setSoundEnabledGetter(() => prog.sound);

  let destroyed = false;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!destroyed) fn();
    }, ms);
    timers.add(id);
  };

  /* ---------------- tween ---------------- */
  function tween(ms: number, fn: (k: number) => void, ease: (k: number) => number = easeInOut): Promise<void> {
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (t: number) => {
        if (destroyed) return res();
        const k = clamp((t - t0) / ms, 0, 1);
        fn(ease(k));
        if (k < 1) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------------- rink state ---------------- */
  let LAB = 0; // counter-rotation for labels (portrait view rotates the rink)
  let portrait = false;
  let rinkG!: SVGGElement;
  let zonesL!: SVGGElement;
  let arrowsL!: SVGGElement;
  let ghostsL!: SVGGElement;
  let playersL!: SVGGElement;
  let dL!: SVGGElement;
  let puckL!: SVGGElement;
  let fxL!: SVGGElement;
  let puckG!: SVGGElement;
  let haloEl!: SVGCircleElement;
  let goalie!: PlayerNode;
  let iceText!: { g: SVGGElement; text: SVGTextElement; x: number; y: number };
  const usG: PlayerNode[] = [];
  const themG: PlayerNode[] = [];
  const dG: PlayerNode[] = [];

  const G: GameState = {
    mode: null,
    level: 1,
    list: [],
    idx: 0,
    st: null,
    prev: null,
    D: [],
    pos: null,
    checks: 0,
    done: false,
    busy: false,
    hint: false,
    zoneStyle: 'none',
    ghostMode: false,
    ghostAssign: null,
    lastEval: null,
    score: 0,
    max: 0,
    prevStrong: null,
    seqId: null,
    steps: [],
  };
  const cur = (): Scenario => G.st!;
  const curPos = (): Pos => G.pos!;

  function makePlayer(type: PlayerType, num: number | null, ghost = false): PlayerNode {
    const pal = PAL[type];
    const g = el('g', { class: 'pl pl-' + type + (ghost ? ' ghost' : '') });
    if (type === 'd' && !ghost) el('circle', { r: 4.4, class: 'ring' }, g);
    el('ellipse', { cx: 0.6, cy: 0.8, rx: 3.3, ry: 3.5, fill: 'rgba(10,30,60,.18)' }, g);
    const bw = el('g', { class: 'bodyw' }, g);
    const b = el('g', null, bw);
    if (type === 'goalie') {
      el('rect', { x: -1.2, y: -4.4, width: 2.6, height: 2.6, rx: 0.8, fill: '#fff', stroke: pal.dark, 'stroke-width': 0.3 }, b);
      el('rect', { x: -1.2, y: 1.8, width: 2.6, height: 2.6, rx: 0.8, fill: '#fff', stroke: pal.dark, 'stroke-width': 0.3 }, b);
      el('path', { d: 'M1.2,2.2 L3.6,2.2', stroke: '#3b2a1a', 'stroke-width': 0.5, 'stroke-linecap': 'round' }, b);
    } else {
      el('path', { d: 'M0.4,2 L4.6,2.6', stroke: '#5a3b1c', 'stroke-width': 0.45, 'stroke-linecap': 'round' }, b);
      el('path', { d: 'M4.4,2.6 L5.8,1.6', stroke: '#111', 'stroke-width': 0.75, 'stroke-linecap': 'round' }, b);
    }
    el('ellipse', { cx: -0.5, cy: 0, rx: 2.1, ry: 3.15, fill: pal.jersey, stroke: pal.dark, 'stroke-width': 0.35 }, b);
    if (type === 'd') el('path', { d: 'M-1.6,-2.6 Q-2.5,0 -1.6,2.6', fill: 'none', stroke: '#fff', 'stroke-width': 0.5 }, b);
    el('circle', { cx: 0, cy: 0, r: 1.6, fill: pal.helmet, stroke: pal.dark, 'stroke-width': 0.3 }, b);
    el('path', { d: 'M1,-1.15 A1.5,1.5 0 0 1 1,1.15', fill: 'none', stroke: '#1b1b1b', 'stroke-width': 0.5 }, b);
    const lab = el('g', null, g);
    const node: PlayerNode = { g, body: b, lab };
    if (num != null) {
      const t = el('text', { y: 0.62, 'text-anchor': 'middle', 'font-size': 1.75, 'font-weight': 900, fill: pal.num, class: 'num' }, lab);
      t.textContent = String(num);
    }
    if (type === 'd') {
      const pill = el('g', { class: 'dlabel', transform: 'translate(0,-6.4)' }, lab);
      el('rect', { x: -3.3, y: -1.8, width: 6.6, height: 3.6, rx: 1.8, fill: '#fff', stroke: '#061f5c', 'stroke-width': 0.35 }, pill);
      const t = el('text', { y: 1, 'text-anchor': 'middle', 'font-size': 2.7, 'font-weight': 900, fill: '#0a2d7a' }, pill);
      t.textContent = 'D' + num;
      if (!ghost) {
        const m = el('g', { class: 'mark', style: 'display:none' }, lab);
        node.mark = m;
        el('circle', { r: 4.3, class: 'mr' }, m);
        el('circle', { cx: 3.5, cy: -3.3, r: 1.6, class: 'badge' }, m);
        node.markText = el('text', { x: 3.5, y: -2.55, 'text-anchor': 'middle' }, m);
        el('circle', { r: 7.5, class: 'hit' }, g);
      }
    }
    return node;
  }

  function buildRink(): void {
    svg.innerHTML = '';
    const defs = el('defs', null, svg);
    const cp = el('clipPath', { id: 'iceClip' }, defs);
    el('path', { d: rinkPath(0) }, cp);
    const ig = el('linearGradient', { id: 'iceGrad', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    el('stop', { offset: 0, 'stop-color': '#dfeaf5' }, ig);
    el('stop', { offset: 0.25, 'stop-color': '#f4f8fc' }, ig);
    el('stop', { offset: 1, 'stop-color': '#ffffff' }, ig);
    const mk = el('marker', { id: 'ah', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 3.2, markerHeight: 3.2, orient: 'auto' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#16a34a' }, mk);
    const fade = el('linearGradient', { id: 'fadeL', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    el('stop', { offset: 0, 'stop-color': '#0b1633', 'stop-opacity': 0.95 }, fade);
    el('stop', { offset: 1, 'stop-color': '#0b1633', 'stop-opacity': 0 }, fade);

    rinkG = el('g', { id: 'rinkG' }, svg);
    // boards shadow + ice
    el('path', { d: rinkPath(-1.6), fill: '#0a1430', opacity: 0.5 }, rinkG);
    el('path', { d: rinkPath(0), fill: 'url(#iceGrad)' }, rinkG);
    const ice = el('g', { 'clip-path': 'url(#iceClip)' }, rinkG);
    // skate scratches
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 46; i++) {
      const x = -30 + rnd() * 104;
      const y = -40 + rnd() * 80;
      const l = 6 + rnd() * 14;
      const a = rnd() * Math.PI;
      el('path', {
        d: `M${x},${y} q${(Math.cos(a) * l) / 2},${(Math.sin(a) * l) / 2 + 2} ${Math.cos(a) * l},${Math.sin(a) * l}`,
        stroke: 'rgba(120,150,190,.18)',
        'stroke-width': 0.18,
        fill: 'none',
      }, ice);
    }
    // centre line + centre circle (partly visible)
    el('rect', { x: -25.8, y: -H, width: 1.6, height: 2 * H, fill: '#dc2626', opacity: 0.85 }, ice);
    el('circle', { cx: -25, cy: 0, r: 15, fill: 'none', stroke: '#2563eb', 'stroke-width': 0.35 }, ice);
    // neutral zone dots
    [-22, 22].forEach((y) => el('circle', { cx: -5, cy: y, r: 1, fill: '#dc2626' }, ice));
    // our blue line (x=0)
    el('rect', { x: -0.8, y: -H, width: 1.6, height: 2 * H, fill: '#1d5fe0' }, ice);
    // goal line
    el('rect', { x: GL - 0.25, y: -H, width: 0.5, height: 2 * H, fill: '#dc2626' }, ice);
    // faceoff circles
    [-22, 22].forEach((y) => {
      el('circle', { cx: 44, cy: y, r: 15, fill: 'none', stroke: '#dc2626', 'stroke-width': 0.35 }, ice);
      el('circle', { cx: 44, cy: y, r: 1, fill: '#dc2626' }, ice);
      [-1, 1].forEach((sx) =>
        [-1, 1].forEach((sy) => {
          el('path', { d: `M${44 + sx * 2.9},${y + sy * 14.7} v${sy * 2}`, stroke: '#dc2626', 'stroke-width': 0.35 }, ice);
          el('path', {
            d: `M${44 + sx * 0.9},${y + sy * 0.9} h${sx * 2.5} M${44 + sx * 0.9},${y + sy * 0.9} v${sy * 2}`,
            stroke: '#dc2626',
            'stroke-width': 0.25,
            fill: 'none',
          }, ice);
        }),
      );
    });
    // trapezoid
    el('path', { d: `M${GL},-11 L${E},-14 M${GL},11 L${E},14`, stroke: '#dc2626', 'stroke-width': 0.3 }, ice);
    // crease
    el('path', {
      d: `M${GL},-4 H${GL - 4.5} A4.5,4.5 0 0 0 ${GL - 4.5},4 H${GL} Z`,
      fill: 'rgba(80,150,240,.45)',
      stroke: '#dc2626',
      'stroke-width': 0.3,
    }, ice);
    // ice text
    const t1 = el('g', { class: 'icetextg' }, ice);
    const t1text = el('text', { class: 'icetext', 'text-anchor': 'middle' }, t1);
    t1text.textContent = '◀ OUR NET';
    iceText = { g: t1, text: t1text, x: -15, y: 0 };
    // fade on the open neutral-zone edge
    el('rect', { x: LX, y: -H - 3, width: 8, height: 2 * H + 6, fill: 'url(#fadeL)' }, rinkG);
    // boards
    el('path', { d: boardsPath(0), fill: 'none', stroke: '#f7f9fc', 'stroke-width': 1.8 }, rinkG);
    el('path', { d: boardsPath(1.1), fill: 'none', stroke: '#e8b828', 'stroke-width': 0.5 }, rinkG);
    el('path', { d: boardsPath(-0.9), fill: 'none', stroke: '#9fb1cc', 'stroke-width': 0.4 }, rinkG);
    // goal net
    const net = el('g', null, rinkG);
    el('rect', { x: GL, y: -3, width: 3.4, height: 6, rx: 1.3, fill: '#fff', stroke: '#c81e1e', 'stroke-width': 0.5 }, net);
    for (let i = 1; i < 6; i++)
      el('line', { x1: GL + 0.3, x2: GL + 3.1, y1: -3 + i, y2: -3 + i, stroke: '#c9d3e0', 'stroke-width': 0.12 }, net);
    for (let i = 1; i < 4; i++)
      el('line', { x1: GL + i * 0.85, x2: GL + i * 0.85, y1: -2.8, y2: 2.8, stroke: '#c9d3e0', 'stroke-width': 0.12 }, net);
    el('line', { x1: GL, x2: GL, y1: -3, y2: 3, stroke: '#c81e1e', 'stroke-width': 0.6 }, net);

    zonesL = el('g', { class: 'zones', 'clip-path': 'url(#iceClip)' }, rinkG);
    arrowsL = el('g', null, rinkG);
    ghostsL = el('g', null, rinkG);
    playersL = el('g', null, rinkG);
    puckL = el('g', null, rinkG);
    dL = el('g', null, rinkG);
    fxL = el('g', null, rinkG);

    usG.length = themG.length = dG.length = 0;
    US_NUM.forEach((n) => {
      const p = makePlayer('us', n);
      playersL.appendChild(p.g);
      usG.push(p);
    });
    THEM_NUM.forEach((n) => {
      const p = makePlayer('them', n);
      playersL.appendChild(p.g);
      themG.push(p);
    });
    goalie = makePlayer('goalie', null);
    playersL.appendChild(goalie.g);
    puckG = el('g', null, puckL);
    haloEl = el('circle', { r: 2.6, class: 'halo us' }, puckG);
    el('circle', { r: 1.1, fill: '#0d0d0d', stroke: '#4a4a4a', 'stroke-width': 0.25 }, puckG);
    el('ellipse', { cx: -0.3, cy: -0.35, rx: 0.45, ry: 0.25, fill: 'rgba(255,255,255,.5)' }, puckG);
    [0, 1].forEach((i) => {
      const p = makePlayer('d', i + 1);
      dL.appendChild(p.g);
      dG.push(p);
      attachDrag(p, i);
    });
  }

  function face(x: number, y: number): number {
    if (!G.pos) return 0;
    const p = G.pos.puck;
    return (Math.atan2(p.y - y, p.x - x) * 180) / Math.PI;
  }
  function place(n: PlayerNode, x: number, y: number, ang?: number): void {
    n.g.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)})`);
    n.body.setAttribute('transform', `rotate(${(ang == null ? face(x, y) : ang).toFixed(1)})`);
    n.lab.setAttribute('transform', `rotate(${LAB})`);
  }
  function renderPlayers(): void {
    const P = curPos();
    P.us.forEach((p, i) => place(usG[i]!, p.x, p.y));
    P.them.forEach((p, i) => place(themG[i]!, p.x, p.y));
    place(goalie, P.goalie.x, P.goalie.y);
    puckG.setAttribute('transform', `translate(${P.puck.x.toFixed(2)},${P.puck.y.toFixed(2)})`);
    G.D.forEach((d, i) => {
      place(dG[i]!, d.x, d.y);
      dG[i]!.g.classList.toggle('moved', !!d.moved);
    });
    iceText.g.setAttribute('transform', `translate(${iceText.x},${iceText.y}) rotate(${LAB})`);
  }

  /* ---------------- overlays ---------------- */
  function learnAssign(Z: { s: number }): { si: number; wi: number } {
    const si = D_START[0].y * Z.s > 0 ? 0 : 1;
    return { si, wi: 1 - si };
  }
  function renderZones(style: ZoneStyle): void {
    G.zoneStyle = style;
    zonesL.innerHTML = '';
    if (style === 'none') return;
    const Z = zonesFor(cur());
    const pairs: [Zone, Role][] = [
      [Z.S, 'S'],
      [Z.W, 'W'],
    ];
    for (const [z, role] of pairs) {
      const g = el('g', { class: 'zone z-' + style }, zonesL);
      el('ellipse', { cx: z.cx, cy: z.cy, rx: z.rx, ry: z.ry }, g);
      if (style !== 'subtle') {
        const lg = el('g', { transform: `translate(${z.cx},${z.cy}) rotate(${LAB}) translate(0,5.9)` }, g);
        const t = el('text', { class: 'zlab', 'text-anchor': 'middle' }, lg);
        t.textContent =
          role === 'S'
            ? Z.kind === 'own' || Z.kind === 'rim' || Z.kind === 'deep'
              ? 'BOARDS'
              : Z.kind === 'carry'
                ? 'BLOCK'
                : 'GET BACK'
            : Z.kind === 'own'
              ? 'MIDDLE'
              : 'GET BACK';
      }
    }
  }
  function drawArrow(a: Pt, b: Pt): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 9) return;
    const ux = dx / L;
    const uy = dy / L;
    el('line', {
      x1: a.x + ux * 5,
      y1: a.y + uy * 5,
      x2: b.x - ux * 4.5,
      y2: b.y - uy * 4.5,
      class: 'arrow',
      'marker-end': 'url(#ah)',
    }, arrowsL);
  }
  function renderGhosts(show: boolean | 'arrows', animate: boolean): void {
    ghostsL.innerHTML = '';
    arrowsL.innerHTML = '';
    if (!show) return;
    const Z = zonesFor(cur());
    const as = G.ghostAssign || learnAssign(Z);
    const targets: Zone[] = [];
    targets[as.si] = Z.S;
    targets[as.wi] = Z.W;
    [0, 1].forEach((i) => {
      const gn = makePlayer('d', i + 1, true);
      ghostsL.appendChild(gn.g);
      const z = targets[i]!;
      const from = { x: G.D[i]!.x, y: G.D[i]!.y };
      if (show === 'arrows' || show === true) drawArrow(from, { x: z.cx, y: z.cy });
      if (animate) {
        place(gn, from.x, from.y);
        void tween(900, (k) => place(gn, from.x + (z.cx - from.x) * k, from.y + (z.cy - from.y) * k), easeInOut);
      } else place(gn, z.cx, z.cy);
    });
  }
  function renderArrowsOnly(): void {
    arrowsL.innerHTML = '';
    const Z = zonesFor(cur());
    const as = G.ghostAssign || learnAssign(Z);
    const t: Zone[] = [];
    t[as.si] = Z.S;
    t[as.wi] = Z.W;
    [0, 1].forEach((i) => drawArrow(G.D[i]!, { x: t[i]!.cx, y: t[i]!.cy }));
  }
  function setMark(i: number, g: 'good' | 'close' | 'danger' | null): void {
    const n = dG[i]!;
    const m = n.mark!;
    if (!g) {
      m.style.display = 'none';
      return;
    }
    m.style.display = '';
    m.setAttribute('class', 'mark ' + g);
    n.markText!.textContent = g === 'good' ? '✓' : g === 'danger' ? '!' : '?';
  }
  const clearMarks = () => {
    setMark(0, null);
    setMark(1, null);
  };
  const markFor = (g: Grade): 'good' | 'close' | 'danger' => (g === 'good' ? 'good' : g === 'danger' ? 'danger' : 'close');

  function floatText(x: number, y: number, txt: string): void {
    const g = el('g', { transform: `translate(${x},${y}) rotate(${LAB}) translate(0,-9)` }, fxL);
    const t = el('text', { class: 'floatpts', 'text-anchor': 'middle' }, g);
    t.textContent = txt;
    later(() => g.remove(), 1400);
  }
  function demoLabel(x: number, y: number, txt: string, good?: boolean): SVGGElement {
    const g = el('g', { transform: `translate(${x},${y}) rotate(${LAB})` }, fxL);
    const t = el('text', { class: 'demolab' + (good ? ' good' : ''), 'text-anchor': 'middle' }, g);
    t.textContent = txt;
    return g;
  }
  function flash(text: string, cls: string): void {
    const f = $('#flash .fl');
    f.className = 'fl ' + cls;
    void f.offsetWidth;
    f.textContent = text;
    f.classList.add('show');
  }
  function confetti(): void {
    const box = $('#confetti');
    box.innerHTML = '';
    const cols = ['#ffd23f', '#3f8cff', '#22c55e', '#ff5a5d', '#ffffff', '#f97316'];
    for (let i = 0; i < 44; i++) {
      const c = document.createElement('span');
      c.className = 'cf';
      c.style.left = Math.random() * 100 + '%';
      c.style.background = pick(cols);
      c.style.animationDelay = Math.random() * 0.35 + 's';
      c.style.animationDuration = 1.2 + Math.random() * 0.9 + 's';
      box.appendChild(c);
    }
    later(() => (box.innerHTML = ''), 2600);
  }

  /* ---------------- orientation ---------------- */
  function applyOrientation(): void {
    portrait = isPortrait(window.innerHeight, window.innerWidth);
    if (portrait) {
      svg.setAttribute('viewBox', portraitViewBox());
      rinkG.setAttribute('transform', 'rotate(-90)');
    } else {
      svg.setAttribute('viewBox', landscapeViewBox());
      rinkG.removeAttribute('transform');
    }
    LAB = portrait ? 90 : 0;
    iceText.text.textContent = portrait ? '▼ OUR NET' : '◀ OUR NET';
    if (G.st && G.pos) {
      renderPlayers();
      renderZones(G.zoneStyle);
      if (G.ghostMode) renderGhosts(G.ghostMode, false);
    }
  }

  /* ---------------- dragging D1 / D2 ---------------- */
  type DragState = { i: number; n: PlayerNode; id: number; ox: number; oy: number; sx: number; sy: number };
  let drag: DragState | null = null;

  function toRink(e: PointerEvent): Pt {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const q = pt.matrixTransform(rinkG.getScreenCTM()!.inverse());
    return { x: q.x, y: q.y };
  }
  const canDrag = () => !!G.st && !G.busy && !G.done && $('#play').classList.contains('on');

  function attachDrag(n: PlayerNode, i: number): void {
    n.g.addEventListener('pointerdown', (e: PointerEvent) => {
      if (!canDrag()) return;
      e.preventDefault();
      const p = toRink(e);
      if (drag) return;
      dL.appendChild(n.g); // on top (before capturing: moving a node drops its capture)
      drag = { i, n, id: e.pointerId, ox: G.D[i]!.x - p.x, oy: G.D[i]!.y - p.y, sx: G.D[i]!.x, sy: G.D[i]!.y };
      try {
        n.g.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      n.g.classList.add('drag');
      setMark(i, null);
    });
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    const p = toRink(e);
    const i = drag.i;
    const q = clampToIce({ x: p.x + drag.ox, y: p.y + drag.oy });
    G.D[i]!.x = q.x;
    G.D[i]!.y = q.y;
    place(drag.n, q.x, q.y);
    if (G.ghostMode === true) renderArrowsOnly();
  };
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { i, n } = drag;
    n.g.classList.remove('drag');
    const d = G.D[i]!;
    const moved = Math.hypot(d.x - drag.sx, d.y - drag.sy);
    drag = null;
    if (moved > 1.5) {
      d.moved = true;
      d.x = Math.round(d.x * 10) / 10;
      d.y = Math.round(d.y * 10) / 10;
    }
    renderPlayers();
    SFX.pop();
    onDrop(i);
  };

  /* ---------------- panel helpers ---------------- */
  function show(id: string): void {
    root.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
  }
  function resetD(): void {
    G.D = D_START.map((p) => ({ x: p.x, y: p.y, moved: false }));
  }
  function bannerFor(st: Scenario): { txt: string; cls: string } {
    const k = kindOf(st);
    const txt: Record<Kind, string> = {
      own: 'WE HAVE THE PUCK!',
      deep: 'THEY HAVE THE PUCK!',
      rim: 'THEY HAVE THE PUCK!',
      carry: "THEY'RE SKATING IT OUT!",
      out: 'THEY GOT IT OUT!',
    };
    return { txt: txt[k], cls: st.has === 'us' ? 'us' : 'them' };
  }
  function setPanelInfo(): void {
    $('#pMode').textContent = MODE_NAME[G.mode!];
    let info = '';
    if (G.mode === 'game') info = `Step ${G.idx + 1} of ${G.list.length} · ⭐ ${G.score} pts`;
    else {
      const lvl = G.level;
      const p = Math.min(prog.passes[lvl] || 0, UNLOCK);
      info = `${cur().name}` + (lvl <= 3 && !unlocked(lvl + 1) ? ` · ${p}/${UNLOCK} to next level` : '');
    }
    $('#pInfo').textContent = info;
  }
  function rowHTML(i: number, cls: string, head: string, msg: string): string {
    return `<div class="row ${cls}" id="row${i}"><div class="chip">D${i + 1}</div><div class="rtext"><div class="rhead">${head}</div><div class="rmsg">${msg}</div></div></div>`;
  }
  function setRows(rows: Row[], compact?: boolean): void {
    const box = $('#rows');
    box.classList.toggle('compact', !!compact);
    box.innerHTML = rows.map((r, i) => (r ? rowHTML(i, r.cls, r.head, r.msg) : '')).join('');
  }
  function setOverall(html: string, shake?: boolean): void {
    const o = $('#overall');
    o.innerHTML = html || '';
    if (shake) {
      o.classList.remove('shake');
      void o.offsetWidth;
      o.classList.add('shake');
    }
  }
  function setActions(btns: Btn[]): void {
    const a = $('#actions');
    a.innerHTML = '';
    btns.forEach((b) => {
      const e = document.createElement('button');
      e.className = 'btn ' + b.cls;
      e.innerHTML = b.label;
      if (b.disabled) e.disabled = true;
      e.addEventListener('click', () => {
        if (!G.busy) b.fn();
      });
      a.appendChild(e);
    });
  }
  function roleRows(Z: { kind: Kind }, as: { si: number; wi: number }): Row[] {
    const r: Row[] = [];
    r[as.si] = { cls: 'g-info', head: ROLE_NAME.S, msg: roleOf(Z, 'S') };
    r[as.wi] = { cls: 'g-info', head: ROLE_NAME.W, msg: roleOf(Z, 'W') };
    return r;
  }

  /* ---------------- game flow ---------------- */
  async function loadScenario(st: Scenario, opts: { resetD?: boolean; animate?: boolean } = {}): Promise<void> {
    G.prev = G.st;
    G.st = st;
    G.checks = 0;
    G.done = false;
    G.hint = false;
    G.lastEval = null;
    G.ghostAssign = null;
    clearMarks();
    fxL.innerHTML = '';
    if (opts.resetD) resetD();
    const target = posFromSt(st);
    renderZones('none');
    renderGhosts(false, false);
    G.ghostMode = false;
    if (opts.animate && G.pos) {
      G.busy = true;
      const from = clonePos(G.pos);
      haloEl.setAttribute('class', 'halo ' + st.has);
      SFX.whoosh();
      await tween(1150, (k) => {
        G.pos = {
          us: from.us.map((p, i) => lerpP(p, target.us[i]!, k)),
          them: from.them.map((p, i) => lerpP(p, target.them[i]!, k)),
          goalie: lerpP(from.goalie, target.goalie, k),
          puck: lerpP(from.puck, target.puck, Math.min(1, k * 1.25)),
        };
        renderPlayers();
      });
      G.busy = false;
    }
    G.pos = target;
    haloEl.setAttribute('class', 'halo ' + st.has);
    renderPlayers();
    const bn = bannerFor(st);
    $('#banner').className = 'banner ' + bn.cls;
    $('#bText').textContent = bn.txt;
    // big call on the rink
    if (G.mode === 'game' && G.prev && opts.animate) {
      const call =
        G.prev.has !== st.has
          ? st.has === 'them'
            ? 'TURNOVER! THEY HAVE IT!'
            : 'WE GOT IT BACK!'
          : sideOf(G.prev) !== sideOf(st)
            ? 'PUCK SWITCHED SIDES!'
            : 'THE PUCK MOVED!';
      flash(call, st.has === 'us' ? 'us' : 'them');
      if (st.has === 'them' && G.prev.has !== 'them') SFX.alarm();
    } else flash(bn.txt, bn.cls);
    setPanelInfo();
    const Z = zonesFor(st);
    $('#prompt').style.display = '';
    $('#prompt').textContent = G.mode === 'game' && G.idx > 0 ? 'Where should D1 and D2 go NOW?' : 'Where should D1 and D2 go?';
    setOverall('');
    if (G.mode === 'learn') {
      const as = learnAssign(Z);
      renderZones('show');
      G.ghostMode = true;
      renderGhosts(true, true);
      setRows(roleRows(Z, as));
      setOverall('Drag each D to its green spot!');
      setActions([
        { cls: 'alt', label: '👀 Again', fn: () => renderGhosts(true, true) },
        { cls: 'go', label: 'Drag D1 &amp; D2', disabled: true, fn: () => {} },
      ]);
    } else if (G.mode === 'help') {
      renderZones('subtle');
      setRows([
        { cls: 'g-info', head: 'D1', msg: 'Drag me!' },
        { cls: 'g-info', head: 'D2', msg: 'Drag me too!' },
      ]);
      setActions([
        { cls: 'hint', label: '💡 HINT', fn: doHint },
        { cls: 'go', label: 'CHECK!', fn: () => void doCheck() },
      ]);
    } else if (G.mode === 'test') {
      setRows([
        { cls: 'g-info', head: 'D1', msg: 'Where do I go?' },
        { cls: 'g-info', head: 'D2', msg: 'Where do I go?' },
      ]);
      setActions([{ cls: 'go', label: 'CHECK!', fn: () => void doCheck() }]);
    } else {
      const m = G.idx === 0 ? 'Drag me onto the ice!' : 'Stay or move?';
      setRows([
        { cls: 'g-info', head: 'D1', msg: m },
        { cls: 'g-info', head: 'D2', msg: m },
      ]);
      setActions([
        { cls: 'hint', label: '💡', fn: doHint },
        { cls: 'go', label: 'READY!', fn: () => void doCheck() },
      ]);
    }
  }

  function onDrop(i: number): void {
    if (G.mode === 'learn') {
      const ev = evaluate(cur(), G.D);
      G.lastEval = ev;
      const rows: Row[] = [];
      ev.res.forEach((r) => {
        const moved = G.D[r.i]!.moved;
        if (moved) {
          setMark(r.i, markFor(r.g));
          const k = markFor(r.g);
          rows[r.i] = {
            cls: 'g-' + k,
            head: (r.g === 'good' ? r.head : 'KEEP GOING!') + ' · ' + ROLE_NAME[r.role],
            msg: r.g === 'good' ? r.msg : 'Drag me onto the green spot!',
          };
        } else rows[r.i] = { cls: 'g-info', head: ROLE_NAME[r.role], msg: roleOf(ev.Z, r.role) };
      });
      setRows(rows);
      if (G.D[i]!.moved && ev.res[i]!.g === 'good') SFX.good();
      if (ev.allGood && G.D.every((d) => d.moved)) success(ev);
      else {
        const left = G.D.findIndex((d) => !d.moved);
        setOverall(left >= 0 && ev.res[i]!.g === 'good' ? `Now drag D${left + 1}!` : 'Drag each D to its green spot!');
      }
    } else if (G.mode === 'help' || G.mode === 'test') {
      // after a check, moving a player clears the old feedback for that row
      const r = root.querySelector<HTMLElement>('#row' + i);
      if (r && G.checks > 0) {
        r.className = 'row g-info';
        r.querySelector('.rhead')!.textContent = 'D' + (i + 1);
        r.querySelector('.rmsg')!.textContent = 'Moved! Tap CHECK when ready.';
      }
    }
  }

  function doHint(): void {
    if (G.done) return;
    const st = cur();
    const Z = zonesFor(st);
    const ev = evaluate(st, G.D);
    const rows: Row[] = [];
    ev.res.forEach((r) => {
      const tip =
        G.D[r.i]!.moved || G.mode === 'game' ? (r.g === 'good' ? 'You are in a good spot!' : r.msg) : roleOf(Z, r.role);
      rows[r.i] = { cls: 'g-info', head: '💡 ' + ROLE_NAME[r.role] + ': ' + roleOf(Z, r.role), msg: tip };
    });
    setRows(rows);
    if (G.mode === 'game') {
      G.hint = true;
      renderZones('subtle');
      setOverall('Hint used: this step is worth half points.');
    } else {
      renderZones('subtle');
      zonesL.classList.remove('pulse');
      void zonesL.getBBox();
      zonesL.classList.add('pulse');
      later(() => zonesL.classList.remove('pulse'), 3000);
      if (Z.lurker && st.has === 'them') setOverall(`Look out for #${THEM_NUM[Z.lurker.i]} sneaking up high!`);
      else
        setOverall(
          st.has === 'us'
            ? 'We have the puck: one D guards the boards, one helps in the middle.'
            : "They have the puck: don't chase! Protect the boards and get back.",
        );
    }
    SFX.pop();
  }

  async function doCheck(): Promise<void> {
    if (G.busy || G.done) return;
    if (G.mode !== 'game' || G.idx === 0) {
      const u = G.D.findIndex((d) => !d.moved);
      if (u >= 0) {
        setOverall(`Drag D${u + 1} onto the ice first!`, true);
        SFX.oops();
        dG[u]!.g.classList.remove('moved');
        return;
      }
    }
    G.checks++;
    if (window.innerHeight < 520) $('#prompt').style.display = 'none';
    const st = cur();
    const ev = evaluate(st, G.D);
    G.lastEval = ev;
    ev.res.forEach((r) => setMark(r.i, markFor(r.g)));
    const rows: Row[] = [];
    ev.res.forEach((r) => {
      rows[r.i] = { cls: 'g-' + (r.g === 'off' ? 'close' : r.g), head: r.head + ' · ' + ROLE_NAME[r.role], msg: r.msg };
    });
    setRows(rows);

    if (G.mode === 'game') {
      gameStepDone(ev);
      return;
    }

    if (G.mode === 'test') {
      if (G.checks === 1 && ev.pass) {
        prog.passes[3] = (prog.passes[3] || 0) + 1;
        saveProg();
        checkUnlock(3);
      }
      renderZones('reveal');
      G.ghostAssign = { si: ev.si, wi: ev.wi };
    }
    if (!ev.allGood) {
      SFX.oops();
      setOverall(ev.overall, true);
      if (ev.demo) await runDemo(ev);
      if (G.mode === 'test') {
        setOverall(
          window.innerHeight < 520
            ? `<span class="why"><b>Why?</b> ${st.why}</span>`
            : `${ev.overall}<span class="why"><b>Why?</b> ${st.why}</span>`,
        );
        setActions([
          { cls: 'alt', label: 'Skip ➜', fn: next },
          { cls: 'go', label: 'TRY AGAIN', fn: () => void doCheck() },
        ]);
      }
      return;
    }
    if (ev.demo) await runDemo(ev);
    success(ev);
  }

  function success(ev: EvalResult): void {
    G.done = true;
    SFX.great();
    confetti();
    flash(pick(['PERFECT!', 'GREAT TEAMWORK!', 'AWESOME!', 'YOU GOT IT!']), 'good');
    prog.completed++;
    if (G.mode === 'learn') {
      prog.passes[1] = (prog.passes[1] || 0) + 1;
      prog.learnIdx = (G.idx + 1) % G.list.length;
    }
    if (G.mode === 'help' && G.checks <= 3) prog.passes[2] = (prog.passes[2] || 0) + 1;
    saveProg();
    ev.res.forEach((r) => setMark(r.i, 'good'));
    const rows: Row[] = [];
    ev.res.forEach((r) => {
      rows[r.i] = { cls: 'g-good', head: r.head + ' · ' + ROLE_NAME[r.role], msg: r.msg };
    });
    setRows(rows, window.innerHeight < 520);
    renderZones('reveal');
    setOverall(`${ev.overall}<span class="why"><b>Why?</b> ${cur().why}</span>`);
    setActions([{ cls: 'next', label: 'NEXT ➜', fn: next }]);
    setPanelInfo();
    if (G.mode === 'learn') checkUnlock(1);
    if (G.mode === 'help') checkUnlock(2);
  }

  function next(): void {
    if (G.mode === 'game') {
      if (G.idx < G.list.length - 1) {
        G.idx++;
        void loadScenario(G.list[G.idx]!, { animate: true });
      } else finishGame();
      return;
    }
    G.idx++;
    if (G.idx >= G.list.length) {
      G.idx = 0;
      if (G.mode !== 'learn') G.list = practiceList();
    }
    void loadScenario(G.list[G.idx]!, { resetD: true });
  }

  /* ---------------- demonstrations of what goes wrong ---------------- */
  async function animPuck(points: Pt[], speed: number): Promise<void> {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      await tween(
        Math.max(120, (L / speed) * 1000),
        (k) => {
          curPos().puck = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
          renderPlayers();
        },
        lin,
      );
    }
  }
  async function runDemo(ev: EvalResult): Promise<void> {
    G.busy = true;
    const st = cur();
    const s = ev.Z.s;
    const base = clonePos(curPos());
    const P = curPos();
    let lab: SVGGElement | null = null;
    if (ev.demo === 'clear') {
      const p0 = { x: P.puck.x, y: P.puck.y };
      SFX.whoosh();
      await animPuck([p0, { x: Math.min(p0.x, 52), y: s * 39.5 }, { x: -24, y: s * 39.5 }], 70);
      lab = demoLabel(-8, s * 30, 'THE PUCK GOT OUT!');
      SFX.oops();
    } else if (ev.demo === 'breakaway') {
      let hi = 0;
      P.them.forEach((p, i) => {
        if (p.x < P.them[hi]!.x) hi = i;
      });
      const runner = P.them[hi]!;
      if (st.has === 'us') lab = demoLabel(P.puck.x, P.puck.y - 6, 'STOLEN!');
      await animPuck([{ x: P.puck.x, y: P.puck.y }, { x: runner.x + 1.5, y: runner.y }], 75);
      const r0 = { x: runner.x, y: runner.y };
      const end = { x: -24, y: r0.y * 0.3 };
      haloEl.setAttribute('class', 'halo them');
      SFX.whoosh();
      await tween(
        1100,
        (k) => {
          P.them[hi] = { x: r0.x + (end.x - r0.x) * k, y: r0.y + (end.y - r0.y) * k };
          P.puck = { x: P.them[hi]!.x - 2, y: P.them[hi]!.y };
          renderPlayers();
        },
        lin,
      );
      if (lab) lab.remove();
      lab = demoLabel(-10, end.y > 0 ? end.y - 8 : end.y + 10, 'BREAKAWAY!');
      SFX.oops();
    } else if (ev.demo === 'stop') {
      const d = G.D[ev.si]!;
      await animPuck(
        [
          { x: P.puck.x, y: P.puck.y },
          { x: 69, y: s * 30 },
          { x: Math.max(d.x + 6, 30), y: s * 39.5 },
          { x: d.x + 1.8, y: d.y + 0.5 * s },
        ],
        65,
      );
      lab = demoLabel(d.x + 6, d.y - s * 8, 'STOPPED IT!', true);
      SFX.good();
    }
    await wait(1100);
    if (lab) lab.remove();
    const from = clonePos(curPos());
    await tween(450, (k) => {
      G.pos = {
        us: from.us.map((p, i) => lerpP(p, base.us[i]!, k)),
        them: from.them.map((p, i) => lerpP(p, base.them[i]!, k)),
        goalie: lerpP(from.goalie, base.goalie, k),
        puck: lerpP(from.puck, base.puck, k),
      };
      renderPlayers();
    });
    haloEl.setAttribute('class', 'halo ' + st.has);
    G.pos = base;
    renderPlayers();
    G.busy = false;
  }

  /* ---------------- game challenge scoring ---------------- */
  function gameStepDone(ev: EvalResult): void {
    G.done = true;
    const st = cur();
    const prev = G.prev && G.idx > 0 ? G.list[G.idx - 1]! : null;
    const sR = ev.res[ev.si]!;
    const wR = ev.res[ev.wi]!;
    const val = (g: Grade) => (g === 'good' ? 100 : g === 'close' ? 50 : 0);
    let pts = val(sR.g) + val(wR.g);
    let max = 200;
    const notes: string[] = [];
    if (prev && prev.has !== st.has) {
      max += 50;
      if (ev.pass && !ev.res.some((r) => r.g === 'danger')) {
        pts += 50;
        notes.push('Saw the change! +50');
      }
    }
    if (prev && sideOf(prev) !== sideOf(st)) {
      max += 50;
      if (G.prevStrong != null && ev.si !== G.prevStrong && (sR.g === 'good' || sR.g === 'close')) {
        pts += 50;
        notes.push('Switched jobs! +50');
      }
    }
    max += 50;
    if (ev.team.length === 0 && !ev.res.some((r) => r.g === 'danger' || r.g === 'off')) {
      pts += 50;
      notes.push('Teamwork +50');
    }
    if (G.hint) pts = Math.round(pts / 2);
    G.score += pts;
    G.max += max;
    G.prevStrong = ev.si;
    G.steps.push({ pts, max });
    ev.res.forEach((r) => {
      const v = val(r.g);
      if (v) floatText(G.D[r.i]!.x, G.D[r.i]!.y, '+' + (G.hint ? v / 2 : v));
    });
    renderZones('reveal');
    setPanelInfo();
    const msg =
      (ev.allGood ? '🎉 ' : '') + ev.overall + (notes.length ? `<span class="why"><b>Bonus:</b> ${notes.join(' · ')}</span>` : '');
    if (ev.allGood) {
      SFX.great();
      flash('+' + pts, 'good');
    } else SFX.oops();
    setOverall(msg, !ev.allGood);
    const last = G.idx >= G.list.length - 1;
    const go = () => setActions([{ cls: 'next', label: last ? 'FINISH 🏁' : 'NEXT ➜', fn: next }]);
    setActions([{ cls: 'next', label: '...', disabled: true, fn: () => {} }]);
    if (ev.demo) void runDemo(ev).then(go);
    else go();
  }

  function finishGame(): void {
    const stars = starsFor(G.score, G.max);
    const seqId = G.seqId!;
    const rec = prog.game[seqId] || { best: 0, stars: 0 };
    const newBest = G.score > rec.best;
    prog.game[seqId] = { best: Math.max(rec.best, G.score), stars: Math.max(rec.stars, stars) };
    prog.completed += G.list.length;
    saveProg();
    SFX.great();
    confetti();
    const st = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">⭐</span>`).join('');
    const words = stars === 3 ? 'SUPERSTAR DEFENCE!' : stars === 2 ? 'GREAT GAME!' : 'GOOD EFFORT! KEEP PRACTISING!';
    openSheet(
      `<h2>${words}</h2><div class="stars">${st}</div><div class="bigscore">${G.score} pts</div>
    <p>${newBest ? '🏆 New best score!' : 'Best: ' + prog.game[seqId]!.best + ' pts'}</p>
    <p>Remember: watch the puck. Who has it? Which side is it on?</p>`,
      [
        {
          cls: 'alt',
          label: '⌂ Home',
          fn: () => {
            closeSheet();
            goHome();
          },
        },
        {
          cls: 'go',
          label: 'PLAY AGAIN',
          fn: () => {
            closeSheet();
            startGame(seqId);
          },
        },
      ],
    );
  }

  /* ---------------- starting modes ---------------- */
  function enterPlay(): void {
    show('play');
    clearMarks();
    applyOrientation();
  }
  function startLearn(): void {
    G.mode = 'learn';
    G.level = 1;
    G.list = LEARN_ORDER.map(getScn);
    G.idx = (prog.learnIdx || 0) % G.list.length;
    G.pos = null;
    enterPlay();
    void loadScenario(G.list[G.idx]!, { resetD: true });
  }
  function startPractice(level: number): void {
    G.mode = level === 2 ? 'help' : 'test';
    G.level = level;
    G.list = practiceList();
    G.idx = 0;
    G.pos = null;
    enterPlay();
    void loadScenario(G.list[0]!, { resetD: true });
  }
  function startGame(seqId: string): void {
    const seq = SEQS.find((s) => s.id === seqId)!;
    G.mode = 'game';
    G.level = 4;
    G.seqId = seqId;
    G.list = (seq.steps || randomSequence()).map(getScn);
    G.idx = 0;
    G.score = 0;
    G.max = 0;
    G.steps = [];
    G.prevStrong = null;
    G.pos = null;
    G.st = null;
    enterPlay();
    void loadScenario(G.list[0]!, { resetD: true });
  }
  function goHome(): void {
    G.busy = false;
    renderHome();
    show('home');
  }
  function restart(): void {
    if (G.mode === 'game') {
      startGame(G.seqId!);
      return;
    }
    G.st = G.list[G.idx]!;
    G.prev = null;
    void loadScenario(G.list[G.idx]!, { resetD: true });
  }

  /* ---------------- unlocks ---------------- */
  function checkUnlock(level: number): void {
    if (prog.unlockAll) return;
    if ((prog.passes[level] || 0) === UNLOCK) {
      const nl = level + 1;
      later(
        () =>
          openSheet(
            `<h2>🎉 NEW LEVEL!</h2><p style="font-size:18px"><b>${LEVEL_NAME[nl]}</b> is unlocked!</p>
      <p>${nl === 2 ? 'Now the green spots are harder to see. You can ask for a hint!' : nl === 3 ? 'No help this time. Can you find the spots all by yourself?' : 'The puck keeps moving and they can steal it. React fast!'}</p>`,
            [
              { cls: 'alt', label: 'Keep going', fn: closeSheet },
              {
                cls: 'go',
                label: "Let's try!",
                fn: () => {
                  closeSheet();
                  if (nl === 4) gamePicker();
                  else startPractice(nl);
                },
              },
            ],
          ),
        1400,
      );
    }
  }

  /* ---------------- home + sheets ---------------- */
  function openSheet(html: string, btns?: Btn[]): void {
    const c = $('#card');
    c.innerHTML = html;
    if (btns && btns.length) {
      const row = document.createElement('div');
      row.className = 'btns';
      btns.forEach((b) => {
        const e = document.createElement('button');
        e.className = 'btn ' + b.cls;
        e.innerHTML = b.label;
        e.onclick = b.fn;
        row.appendChild(e);
      });
      c.appendChild(row);
    }
    $('#sheet').classList.add('on');
  }
  function closeSheet(): void {
    $('#sheet').classList.remove('on');
  }

  function renderHome(): void {
    const steps = [1, 2, 3, 4]
      .map((l) => {
        const lock = !unlocked(l);
        let dots = '';
        if (l <= 3) {
          const n = Math.min(prog.passes[l] || 0, UNLOCK);
          for (let i = 0; i < UNLOCK; i++) dots += `<span class="dot ${i < n ? 'on' : ''}"></span>`;
        } else {
          const best = Math.max(0, ...Object.values(prog.game).map((g) => g.stars || 0));
          dots = [1, 2, 3]
            .map((i) => `<span style="font-size:11px;${i <= best ? '' : 'filter:grayscale(1) brightness(.6)'}">⭐</span>`)
            .join('');
        }
        const done = l <= 3 && (prog.passes[l] || 0) >= UNLOCK;
        return `<div class="step ${lock ? 'locked' : ''} ${done ? 'done' : ''}"><div class="sn">LEVEL ${l}${lock ? ' 🔒' : done ? ' ✓' : ''}</div><div class="st">${LEVEL_NAME[l] === 'GAME CHALLENGE' ? 'GAME' : LEVEL_NAME[l]}</div><div class="dots">${dots}</div></div>`;
      })
      .join('');
    $('#ladder').innerHTML = steps;
    $('#doneCount').textContent = prog.completed
      ? `🏒 ${prog.completed} situation${prog.completed === 1 ? '' : 's'} played`
      : '🏒 Start with LEARN!';
    const pr = $('#hPractice');
    const gm = $('#hGame');
    pr.classList.toggle('locked', !unlocked(2));
    gm.classList.toggle('locked', !unlocked(4));
    pr.querySelectorAll('.lock').forEach((x) => x.remove());
    gm.querySelectorAll('.lock').forEach((x) => x.remove());
    if (!unlocked(2))
      pr.insertAdjacentHTML('beforeend', `<span class="lock">🔒 ${Math.min(prog.passes[1] || 0, UNLOCK)}/${UNLOCK}</span>`);
    if (!unlocked(4)) gm.insertAdjacentHTML('beforeend', `<span class="lock">🔒</span>`);
  }

  function practicePicker(): void {
    if (!unlocked(2)) {
      openSheet(
        `<h2>🔒 PRACTICE</h2><p>Finish ${UNLOCK} situations in <b>LEARN</b> to open Practice.</p><p style="font-size:22px">${Math.min(prog.passes[1] || 0, UNLOCK)} / ${UNLOCK} done</p>`,
        [
          { cls: 'alt', label: 'Close', fn: closeSheet },
          {
            cls: 'go',
            label: 'Go to LEARN',
            fn: () => {
              closeSheet();
              startLearn();
            },
          },
        ],
      );
      return;
    }
    const l3 = unlocked(3);
    openSheet(
      `<h2>PRACTICE</h2><div class="choices">
    <button class="big practice" id="pHelp"><span class="bi">💡</span><span><span class="bt">HELP ME</span><span class="bs">Light green spots + hints</span></span></button>
    <button class="big game ${l3 ? '' : 'locked'}" id="pTest"><span class="bi">🎯</span><span><span class="bt">TEST ME</span><span class="bs">${l3 ? 'No help. Can you do it?' : `Finish ${UNLOCK} in HELP ME (${Math.min(prog.passes[2] || 0, UNLOCK)}/${UNLOCK})`}</span></span>${l3 ? '' : '<span class="lock">🔒</span>'}</button>
    </div>`,
      [{ cls: 'alt', label: 'Close', fn: closeSheet }],
    );
    $('#pHelp').onclick = () => {
      closeSheet();
      startPractice(2);
    };
    $('#pTest').onclick = () => {
      if (!l3) return;
      closeSheet();
      startPractice(3);
    };
  }

  function gamePicker(): void {
    if (!unlocked(4)) {
      openSheet(
        `<h2>🔒 GAME CHALLENGE</h2><p>Get ${UNLOCK} right in <b>TEST ME</b> to open the Game Challenge.</p><p style="font-size:22px">${Math.min(prog.passes[3] || 0, UNLOCK)} / ${UNLOCK} done</p>`,
        [
          { cls: 'alt', label: 'Close', fn: closeSheet },
          {
            cls: 'go',
            label: 'Practice',
            fn: () => {
              closeSheet();
              practicePicker();
            },
          },
        ],
      );
      return;
    }
    const cards = SEQS.map((s) => {
      const r = prog.game[s.id];
      const stars = r ? [1, 2, 3].map((i) => (i <= r.stars ? '⭐' : '☆')).join('') : '';
      return `<button class="seqcard" data-id="${s.id}"><span class="si">${s.icon}</span><span>${s.name}<span class="ss">${s.desc}</span></span><span class="sb">${stars}${r ? `<span class="ss" style="text-align:right">${r.best} pts</span>` : ''}</span></button>`;
    }).join('');
    openSheet(
      `<h2>GAME CHALLENGE</h2><p>The puck moves. They might steal it! Move D1 and D2 every time.</p><div class="choices">${cards}</div>`,
      [{ cls: 'alt', label: 'Close', fn: closeSheet }],
    );
    root.querySelectorAll<HTMLElement>('.seqcard').forEach((b) => {
      b.onclick = () => {
        closeSheet();
        startGame(b.dataset.id!);
      };
    });
  }

  function howTo(): void {
    openSheet(
      `<h2>HOW TO PLAY</h2>
    <div class="legend"><span><i class="sw" style="background:#1556d6"></i>Your D</span><span><i class="sw" style="background:#3a86ff"></i>Our team</span><span><i class="sw" style="background:#e5383b"></i>Other team</span><span><i class="sw" style="background:#111"></i>Puck</span></div>
    <div class="howrow"><span class="hn">1</span><span>Look at the puck. <b>Who has it?</b> Blue = us. Red = them.</span></div>
    <div class="howrow"><span class="hn">2</span><span><b>Drag D1 and D2</b> with your finger to where they should be.</span></div>
    <div class="howrow"><span class="hn">3</span><span>Tap <b>CHECK!</b> Green = great. Yellow = almost. Red = watch out!</span></div>
    <p>Our net is to the <b>${portrait ? 'bottom' : 'left'}</b>. Their net is to the <b>${portrait ? 'top' : 'right'}</b>.</p>
    ${portrait ? '<p class="rotate-tip">Tip: turn your phone sideways for a bigger rink.</p>' : ''}`,
      [
        {
          cls: 'go',
          label: "LET'S PLAY!",
          fn: () => {
            closeSheet();
            prog.seenHow = true;
            saveProg();
          },
        },
      ],
    );
  }

  function settings(): void {
    const draw = (): void => {
      openSheet(
        `<h2>SETTINGS</h2>
      <div class="setrow"><span>🔊 Sounds</span><button class="tog ${prog.sound ? 'on' : ''}" id="tSound" aria-label="Sounds"></button></div>
      <div class="setrow"><span>🔓 Unlock every level<br><span style="font-size:12px;color:var(--muted)">For grown-ups and coaches</span></span><button class="tog ${prog.unlockAll ? 'on' : ''}" id="tUnlock" aria-label="Unlock all"></button></div>
      <div class="setrow"><span>🗑️ Start over<br><span style="font-size:12px;color:var(--muted)">Erase all progress on this phone</span></span><button class="small" id="tReset">Reset</button></div>
      <p style="font-size:12px;color:var(--muted)">Progress is saved on this phone only. No account needed.</p>`,
        [
          {
            cls: 'go',
            label: 'Done',
            fn: () => {
              closeSheet();
              renderHome();
            },
          },
        ],
      );
      $('#tSound').onclick = () => {
        prog.sound = !prog.sound;
        saveProg();
        draw();
        if (prog.sound) SFX.good();
      };
      $('#tUnlock').onclick = () => {
        prog.unlockAll = !prog.unlockAll;
        saveProg();
        draw();
      };
      $('#tReset').onclick = (e) => {
        const b = e.currentTarget as HTMLElement;
        if (!b.dataset.armed) {
          b.dataset.armed = '1';
          b.textContent = 'Tap again to erase';
          later(() => {
            if (b.isConnected) {
              delete b.dataset.armed;
              b.textContent = 'Reset';
            }
          }, 4000);
          return;
        }
        const s = prog.sound;
        prog = defaultProg();
        prog.sound = s;
        prog.seenHow = true;
        saveProg();
        draw();
      };
    };
    draw();
  }

  /* ---------------- wire up ---------------- */
  $('#hLearn').onclick = () => {
    SFX.pop();
    startLearn();
  };
  $('#hPractice').onclick = () => {
    SFX.pop();
    practicePicker();
  };
  $('#hGame').onclick = () => {
    SFX.pop();
    gamePicker();
  };
  $('#hHow').onclick = howTo;
  $('#hSet').onclick = settings;
  $('#bHome').onclick = () => {
    if (!G.busy) goHome();
  };
  $('#bReset').onclick = () => {
    if (!G.busy) restart();
  };
  const sheet = $('#sheet');
  sheet.onclick = (e) => {
    if (e.target === sheet) closeSheet();
  };

  const prevent = (e: Event) => e.preventDefault();
  let rzT = 0;
  const onResize = () => {
    clearTimeout(rzT);
    rzT = window.setTimeout(applyOrientation, 80);
  };
  const onOrient = () => later(applyOrientation, 250);

  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  document.addEventListener('gesturestart', prevent);
  document.addEventListener('dblclick', prevent);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onOrient);

  /* ---------------- boot ---------------- */
  closeSheet();
  show('home');
  buildRink();
  G.pos = posFromSt(SCN.wall!);
  resetD();
  applyOrientation();
  renderHome();
  if (!prog.seenHow) later(howTo, 300);

  return () => {
    destroyed = true;
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    clearTimeout(rzT);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    document.removeEventListener('gesturestart', prevent);
    document.removeEventListener('dblclick', prevent);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onOrient);
  };
}
