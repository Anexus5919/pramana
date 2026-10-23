// One mutable engine drives the ground, the hands, the eyes and the story cards; React only reads discrete beats
import { CUT, type Hue, PALM_EYE, PIVOT, RING, tapAngle } from "./hands";

export const FOV = 50;
export const CAM_H = 1.2;
export const G0 = 0.13; // world height of the resting block tops

export type HandSpot = { x: number; tilt: number };
export type HoldSpot = HandSpot & { lift: number };

export type Layout = {
  w: number;
  h: number;
  wide: boolean;
  shift: number; // projection y shift; the horizon sits at ndc -shift
  horizonY: number;
  groundY: number; // screen y of the hand cut line on the ground
  clipY: number; // screen y of the slot the certificate rises from
  s: number; // px per hand unit
  hero: [HandSpot, HandSpot];
  hold: [HoldSpot, HoldSpot];
  card: { x: number; y: number; w: number; h: number };
  caption: { x: number; y: number; w: number };
  copy: { x: number; w: number };
};

export const HANDS: { hue: Hue; mirror: boolean }[] = [
  { hue: "rose", mirror: true },
  { hue: "violet", mirror: false },
];

// Scroll timeline in viewport heights from the top of the hero section
export const T = {
  copyOut: [0.04, 0.24],
  move: [0.08, 0.52],
  card1Up: [0.2, 0.56],
  captionIn: [0.28, 0.46],
  scan1: [0.6, 0.8],
  read1: [0.8, 1.7],
  confirm: 1.74,
  card1Down: [2.0, 2.18],
  card2Up: [2.16, 2.4],
  step2: 2.16,
  scan2: [2.44, 2.64],
  flag: 2.8,
  palm: 3.02,
  captionOut: [3.44, 3.62],
  card2Down: [3.4, 3.6],
  handsDown: [3.56, 4.02],
  fade: [3.9, 4.24],
  end: 4.24,
} as const;

export const FIELDS1 = ["signature", "qr", "number"] as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const seg = (u: number, r: readonly [number, number]) => clamp((u - r[0]) / (r[1] - r[0]), 0, 1);
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rad = (d: number) => (d * Math.PI) / 180;

// Screen position of a hand-local point for a hand rooted at wristX with a vertical offset and a lean
export function handPoint(s: number, groundY: number, wristX: number, yOff: number, tilt: number, mirror: boolean, hx: number, hy: number) {
  const pvx = wristX;
  const pvy = groundY + (PIVOT.y - CUT) * s - yOff * s;
  const lx = (mirror ? -(hx - PIVOT.x) : hx - PIVOT.x) * s;
  const ly = (hy - PIVOT.y) * s;
  const a = rad(tilt);
  return { x: pvx + lx * Math.cos(a) - ly * Math.sin(a), y: pvy + lx * Math.sin(a) + ly * Math.cos(a) };
}

function solveHold(s: number, groundY: number, ring: { x: number; y: number }, tilt: number, mirror: boolean): HoldSpot {
  const lx = (mirror ? -(RING.x - PIVOT.x) : RING.x - PIVOT.x) * s;
  const ly = (RING.y - PIVOT.y) * s;
  const a = rad(tilt);
  const x = ring.x - (lx * Math.cos(a) - ly * Math.sin(a));
  const pvy = ring.y - (lx * Math.sin(a) + ly * Math.cos(a));
  const lift = (groundY + (PIVOT.y - CUT) * s - pvy) / s;
  return { x, tilt, lift };
}

export function computeLayout(w: number, h: number, cardRatio: number): Layout {
  const wide = w >= 900;
  if (wide) {
    const shift = 0.2;
    const horizonY = ((1 + shift) / 2) * h;
    const left = Math.max(28, (w - 1152) / 2 + 24);
    // the copy column is as wide as the headline, which scales like the h1 clamp in HeroStory
    const fs = clamp(Math.min(w * 0.046, h * 0.082), 40, 92);
    const copyW = Math.max(470, fs * 7.3);
    const groundY = h * 0.82;
    let s = clamp(h / 1040, 0.54, 0.98);
    const cx = Math.min(w * 0.72, w - 360 * s - 40);
    // the pair must clear the copy column
    if (cx - 360 * s < left + copyW + 16) s = Math.max(0.5, (cx - left - copyW - 16) / 360);
    const pair = 226 * s;
    const hero: [HandSpot, HandSpot] = [
      { x: cx - pair, tilt: -5 },
      { x: cx + pair, tilt: 6 },
    ];
    const cw = clamp(w * 0.22, 330, 440);
    const ch = cw * cardRatio;
    // the certificate rises from a row in front of the hands, so they only lift a little to hold it
    const clipY = groundY + h * 0.115;
    const bottom = groundY + h * 0.095;
    const card = { x: cx - cw / 2, y: bottom - ch, w: cw, h: ch };
    const ringY = card.y - 26 * s;
    const hold: [HoldSpot, HoldSpot] = [
      solveHold(s, groundY, { x: card.x + 8, y: ringY }, 6, true),
      solveHold(s, groundY, { x: card.x + cw - 8, y: ringY }, -6, false),
    ];
    const capW = Math.min(500, card.x - 250 * s - left - 48);
    return {
      w,
      h,
      wide,
      shift,
      horizonY,
      groundY,
      clipY,
      s,
      hero,
      hold,
      card,
      caption: { x: left, y: Math.max(108, h * 0.2), w: capW },
      copy: { x: left, w: copyW },
    };
  }
  const shift = 0.26;
  const horizonY = ((1 + shift) / 2) * h;
  const s = clamp(w / 390, 0.82, 1.5) * 0.5;
  const groundY = h * 0.86;
  const cx = w / 2;
  const pair = 226 * s;
  const hero: [HandSpot, HandSpot] = [
    { x: cx - pair, tilt: -5 },
    { x: cx + pair, tilt: 6 },
  ];
  const cw = Math.min(w - 120, 300);
  const ch = cw * cardRatio;
  const clipY = groundY + h * 0.115;
  const bottom = groundY + h * 0.095;
  const card = { x: cx - cw / 2, y: bottom - ch, w: cw, h: ch };
  const ringY = card.y - 22 * s;
  const hold: [HoldSpot, HoldSpot] = [
    solveHold(s, groundY, { x: card.x + 46, y: ringY }, 7, true),
    solveHold(s, groundY, { x: card.x + cw - 46, y: ringY }, -7, false),
  ];
  return {
    w,
    h,
    wide,
    shift,
    horizonY,
    groundY,
    clipY,
    s,
    hero,
    hold,
    card,
    caption: { x: 20, y: Math.max(96, h * 0.15), w: w - 40 },
    copy: { x: 20, w: w - 40 },
  };
}

// Projection shared with the WebGL camera: level camera at CAM_H looking down -z with a vertical lens shift
export function projection(l: Layout) {
  const p5 = 1 / Math.tan(rad(FOV / 2));
  const p0 = p5 / (l.w / l.h);
  return {
    p5,
    p0,
    // ground point under a screen pixel on the plane y = planeY
    ground(sx: number, sy: number, planeY = G0) {
      const ny = 1 - (2 * sy) / l.h;
      const den = -ny - l.shift;
      if (den <= 1e-4) return null;
      const d = (p5 * (CAM_H - planeY)) / den;
      const nx = (2 * sx) / l.w - 1;
      return { x: (nx * d) / p0, z: -d, d };
    },
    pxPerWorld(d: number) {
      return (p5 * (l.h / 2)) / d;
    },
  };
}

type Spring = { x: number; v: number };
const springTo = (s: Spring, target: number, dt: number, k: number, c: number) => {
  s.v += (k * (target - s.x) - c * s.v) * dt;
  s.x += s.v * dt;
};
const sp = (x = 0): Spring => ({ x, v: 0 });

export type Look = { kind: "auto" } | { kind: "ahead" } | { kind: "point"; x: number; y: number };

export type HandFrame = {
  wristX: number;
  yOff: number; // hand units above the resting cut; negative sinks into the ground
  tilt: number;
  pose: number;
  tapDeg: number;
  eye: { px: number; py: number; open: number; scale: number };
  visible: number; // 0 fully underground, 1 up
};

export type HoleFrame = { x: number; z: number; rx: number; rz: number; disturb: number; sink: number; glow: number };

export type Beats = { step: number; checked: number; confirmed: boolean; flagged: boolean; palm: boolean };

type HandRt = {
  pose: { from: number; to: number; t0: number };
  tapT0: number;
  palmLift: Spring;
  palmTilt: Spring;
  lean: Spring;
  px: Spring;
  py: Spring;
  open: Spring;
  prevX: number;
  prevY: number;
};

const MODE_OPEN = { open: 1, narrow: 0.42 } as const;

export class Engine {
  layout: Layout;
  proj: ReturnType<typeof projection>;
  reduced: boolean;
  sectionTop = 0;
  pointer = { x: 0, y: 0, has: false };
  focus: Element | null = null;
  cards: [HTMLElement | null, HTMLElement | null] = [null, null];
  uRaw = 0;
  u = 0;
  introStart = -1;
  lastT = 0;
  stamp = -1;
  blinkStart = -1;
  nextIdle = 0;
  hands: HandRt[];
  holeRt: { d: Spring; prev: number }[];
  frame: {
    hands: [HandFrame, HandFrame];
    holes: HoleFrame[];
    cardY: [number, number];
    scan: { card: 0 | 1; p: number } | null;
    copy: number;
    caption: number;
    fade: number;
    cursor: { x: number; z: number; on: number };
  };
  beats: Beats = { step: 0, checked: 0, confirmed: false, flagged: false, palm: false };
  onBeats: ((b: Beats) => void) | null = null;

  constructor(layout: Layout, reduced: boolean) {
    this.layout = layout;
    this.proj = projection(layout);
    this.reduced = reduced;
    const now = performance.now();
    this.nextIdle = now + 8000 + Math.random() * 7000;
    this.hands = HANDS.map(() => ({
      pose: { from: 0, to: 0, t0: -1e9 },
      tapT0: -1e9,
      palmLift: sp(),
      palmTilt: sp(),
      lean: sp(),
      px: sp(),
      py: sp(),
      open: sp(1),
      prevX: 0,
      prevY: 0,
    }));
    this.holeRt = [0, 1, 2].map(() => ({ d: sp(), prev: 0 }));
    const hand = (): HandFrame => ({ wristX: 0, yOff: -600, tilt: 0, pose: 0, tapDeg: 0, eye: { px: 0, py: 0, open: 1, scale: 1 }, visible: 0 });
    this.frame = {
      hands: [hand(), hand()],
      holes: [0, 1, 2].map(() => ({ x: 0, z: -6, rx: 0.4, rz: 0.3, disturb: 0, sink: 0, glow: 0 })),
      cardY: [layout.clipY + 40, layout.clipY + 40],
      scan: null,
      copy: 1,
      caption: 0,
      fade: 0,
      cursor: { x: 0, z: -6, on: 0 },
    };
    if (reduced) this.introStart = -1e9;
  }

  setLayout(l: Layout) {
    this.layout = l;
    this.proj = projection(l);
  }

  startIntro() {
    if (this.introStart < 0) this.introStart = performance.now() + 250;
  }

  blink() {
    if (this.reduced || this.blinkStart >= 0) return;
    this.blinkStart = performance.now();
    this.nextIdle = this.blinkStart + 8000 + Math.random() * 7000;
  }

  private fieldCenter(card: 0 | 1, field: string): { x: number; y: number } | null {
    const el = this.cards[card]?.querySelector(`[data-field="${field}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private autoTarget(): { x: number; y: number } | null {
    if (this.focus && this.focus.isConnected) {
      const r = this.focus.getBoundingClientRect();
      if (r.bottom > 0 && r.top < this.layout.h) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return this.pointer.has ? { x: this.pointer.x, y: this.pointer.y } : null;
  }

  // Idempotent per timestamp, so the DOM loop and the WebGL loop can both call it
  tick(t: number) {
    if (t === this.stamp) return;
    this.stamp = t;
    const dt = Math.min(1 / 30, this.lastT ? (t - this.lastT) / 1000 : 1 / 60);
    this.lastT = t;
    const L = this.layout;
    const F = this.frame;

    this.uRaw = this.reduced ? 0 : (window.scrollY - this.sectionTop) / L.h;
    if (Math.abs(this.uRaw - this.u) > 1.2 || dt <= 0) this.u = this.uRaw;
    else this.u += (this.uRaw - this.u) * (1 - Math.exp(-dt * 9));
    const u = Math.max(0, this.u);

    // beats
    const checked = u > T.read1[0] + 0.28 ? (u > T.read1[0] + 0.58 ? (u > T.read1[0] + 0.88 ? 3 : 2) : 1) : 0;
    const b: Beats = {
      step: u >= T.step2 ? 1 : 0,
      checked: u >= T.step2 ? 3 : checked,
      confirmed: u >= T.confirm,
      flagged: u >= T.flag,
      palm: u >= T.palm && u < T.handsDown[1],
    };
    const old = this.beats;
    if (b.confirmed && !old.confirmed && u < T.card1Down[0]) for (const h of this.hands) h.tapT0 = t;
    if (b.step !== old.step || b.checked !== old.checked || b.confirmed !== old.confirmed || b.flagged !== old.flagged || b.palm !== old.palm) {
      this.beats = b;
      this.onBeats?.(b);
    }

    // intro rise
    const intro = (i: number) => {
      if (this.introStart < 0) return 0;
      const e = (t - this.introStart - i * 200) / 1500;
      if (e <= 0) return 0;
      if (e >= 1) return 1;
      const c1 = 1.25;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(e - 1, 3) + c1 * Math.pow(e - 1, 2);
    };

    const kMove = ease(seg(u, T.move));
    const kSink = ease(seg(u, T.handsDown));
    const SUB = 560;

    // blink
    let blink = 1;
    if (!this.reduced && this.blinkStart < 0 && t > this.nextIdle) this.blink();
    if (this.blinkStart >= 0) {
      const e = (t - this.blinkStart) / 190;
      if (e >= 1) this.blinkStart = -1;
      else blink = 1 - Math.sin(Math.PI * e) * 0.94;
    }

    // where the eyes look
    let look: [Look, Look];
    const cardCenter = (): Look => ({ kind: "point", x: L.card.x + L.card.w / 2, y: F.cardY[0] + L.card.h / 2 });
    if (u < 0.14) look = [{ kind: "auto" }, { kind: "auto" }];
    else if (u < T.scan1[0]) look = [cardCenter(), cardCenter()];
    else if (u < T.read1[0]) {
      const p = { kind: "point" as const, x: L.card.x + L.card.w / 2, y: F.cardY[0] + L.card.h * seg(u, T.scan1) };
      look = [p, p];
    } else if (u < T.confirm) {
      const f = FIELDS1[Math.min(2, Math.floor((u - T.read1[0]) / 0.3))];
      const c = this.fieldCenter(0, f);
      const p: Look = c ? { kind: "point", ...c } : cardCenter();
      look = [p, p];
    } else if (u < T.card1Down[0]) look = [{ kind: "ahead" }, { kind: "ahead" }];
    else if (u < T.scan2[0]) {
      const p: Look = { kind: "point", x: L.card.x + L.card.w / 2, y: Math.min(F.cardY[0], F.cardY[1]) + L.card.h / 2 };
      look = [p, p];
    } else if (u < T.scan2[1]) {
      const p: Look = { kind: "point", x: L.card.x + L.card.w / 2, y: F.cardY[1] + L.card.h * seg(u, T.scan2) };
      look = [p, p];
    } else if (u < T.captionOut[0]) {
      const c = this.fieldCenter(1, "validity");
      const p: Look = c ? { kind: "point", ...c } : { kind: "ahead" };
      look = [p, b.palm ? { kind: "ahead" } : p];
    } else look = [{ kind: "ahead" }, { kind: "ahead" }];

    const leanOn = u < 0.14 && !this.reduced;
    const target = this.autoTarget();

    for (let i = 0; i < 2; i++) {
      const H = HANDS[i];
      const rt = this.hands[i];
      const out = F.hands[i];
      const hero = L.hero[i];
      const hold = L.hold[i];

      // pose tween: the violet hand opens into the wait palm
      const wantPose = i === 1 && b.palm ? 1 : 0;
      if (wantPose !== rt.pose.to) rt.pose = { from: out.pose, to: wantPose, t0: t };
      const pe = clamp((t - rt.pose.t0) / 550, 0, 1);
      out.pose = this.reduced ? wantPose : lerp(rt.pose.from, rt.pose.to, 1 - Math.pow(1 - pe, 3));
      out.tapDeg = this.reduced ? 0 : tapAngle(t - rt.tapT0);

      springTo(rt.palmLift, i === 1 && b.palm ? 34 : 0, dt, 170, 18);
      springTo(rt.palmTilt, i === 1 && b.palm ? 9 : 0, dt, 170, 18);

      // lean toward the pointer while the hero rests
      let leanT = 0;
      const wx = lerp(hero.x, hold.x, kMove);
      const pivotY = L.groundY + (PIVOT.y - CUT) * L.s;
      if (leanOn && target) {
        const dx = (target.x - wx) / Math.max(320, L.w * 0.5);
        const dy = (pivotY - target.y) / Math.max(320, L.h);
        leanT = clamp(dx * 7 * (0.7 + Math.max(0, dy) * 0.6), -7, 7);
      }
      springTo(rt.lean, leanT, dt, 60, 11);

      const rise = intro(i);
      const yUp = lerp(0, hold.lift, kMove) + rt.palmLift.x;
      let yOff = lerp(-SUB, yUp, rise);
      yOff = lerp(yOff, -SUB, kSink);
      out.wristX = wx;
      out.yOff = this.reduced ? 0 : yOff;
      out.tilt = lerp(hero.tilt, hold.tilt, kMove) + rt.lean.x + rt.palmTilt.x;
      out.visible = clamp((out.yOff + 420) / 420, 0, 1);

      // gaze
      const ex = lerp(RING.x, PALM_EYE.x, out.pose);
      const ey = lerp(RING.y, PALM_EYE.y, out.pose);
      const eye = handPoint(L.s, L.groundY, out.wristX, out.yOff, out.tilt, H.mirror, ex, ey);
      const lk = look[i];
      const pt = lk.kind === "auto" ? target : lk.kind === "point" ? lk : null;
      let tx = 0;
      let ty = 0;
      if (pt && !this.reduced) {
        const a = rad(-out.tilt);
        const dx = pt.x - eye.x;
        const dy = pt.y - eye.y;
        const lx = dx * Math.cos(a) - dy * Math.sin(a);
        const ly = dx * Math.sin(a) + dy * Math.cos(a);
        const d = Math.hypot(lx, ly);
        if (d > 0.5) {
          const f = Math.min(1, d / 240);
          tx = (lx / d) * f * 21;
          ty = (ly / d) * f * 10;
        }
      }
      springTo(rt.px, tx, dt, 170, 22);
      springTo(rt.py, ty, dt, 170, 22);
      const mode = b.flagged && !(i === 1 && b.palm) && u < T.captionOut[0] ? "narrow" : "open";
      springTo(rt.open, MODE_OPEN[mode], dt, 120, 20);
      out.eye.px = rt.px.x;
      out.eye.py = rt.py.x;
      out.eye.open = this.reduced ? 1 : Math.max(0.05, rt.open.x * blink);
      out.eye.scale = lerp(1, 1.08, out.pose);
    }

    // cards rise from and sink back into the slot
    const hidden = L.clipY + 24;
    const c1 = ease(seg(u, T.card1Up)) * (1 - ease(seg(u, T.card1Down)));
    const c2 = ease(seg(u, T.card2Up)) * (1 - ease(seg(u, T.card2Down)));
    F.cardY = [lerp(hidden, L.card.y, c1), lerp(hidden, L.card.y, c2)];
    F.scan =
      u >= T.scan1[0] && u < T.scan1[1]
        ? { card: 0, p: seg(u, T.scan1) }
        : u >= T.scan2[0] && u < T.scan2[1]
          ? { card: 1, p: seg(u, T.scan2) }
          : null;
    F.copy = 1 - seg(u, T.copyOut);
    F.caption = seg(u, T.captionIn) * (1 - seg(u, T.captionOut));
    F.fade = ease(seg(u, T.fade));

    // ground holes: hands and the certificate slot part the blocks, then the blocks settle
    const P = this.proj;
    for (let i = 0; i < 3; i++) {
      const hf = F.holes[i];
      const rt = this.holeRt[i];
      let sx: number;
      let sy: number;
      let halfPx: number;
      let speed: number;
      let vis: number;
      if (i < 2) {
        const hand = F.hands[i];
        sx = hand.wristX;
        sy = L.groundY;
        halfPx = 96 * L.s;
        const r = this.hands[i];
        speed = (Math.abs(hand.yOff - r.prevY) * L.s + Math.abs(hand.wristX - r.prevX)) / Math.max(dt, 1e-3);
        r.prevY = hand.yOff;
        r.prevX = hand.wristX;
        vis = hand.visible;
      } else {
        sx = L.card.x + L.card.w / 2;
        sy = L.clipY;
        halfPx = L.card.w / 2;
        const y = Math.min(F.cardY[0], F.cardY[1]);
        speed = Math.abs(y - rt.prev) / Math.max(dt, 1e-3);
        rt.prev = y;
        vis = clamp((hidden - y) / 60, 0, 1);
      }
      const g = P.ground(sx, sy);
      if (!g) continue;
      const ppw = P.pxPerWorld(g.d);
      hf.x = g.x;
      hf.z = g.z;
      hf.rx = halfPx / ppw;
      hf.rz = i < 2 ? Math.max(0.14, hf.rx * 0.42) : Math.max(0.16, hf.rx * 0.16);
      const rest = (i < 2 ? 0.34 : 0.12) * vis;
      const want = this.reduced ? rest : Math.min(1, speed / 1100) + rest;
      springTo(rt.d, want, dt, 70, 7);
      hf.disturb = Math.max(0, rt.d.x);
      hf.sink = vis;
      hf.glow = (i < 2 ? 0.55 : 0.3) * vis + hf.disturb * 0.5;
    }

    // blocks under the pointer rise to meet it
    let on = 0;
    if (this.pointer.has && !this.reduced) {
      const g = P.ground(this.pointer.x, this.pointer.y, 0);
      if (g && g.d < 40) {
        F.cursor.x = g.x;
        F.cursor.z = g.z;
        on = 1;
      }
    }
    F.cursor.on += (on - F.cursor.on) * Math.min(1, dt * 4);
  }
}
