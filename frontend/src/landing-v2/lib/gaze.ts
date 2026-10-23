// One shared loop drives every eye and every leaning hand on the page
export type Pt = { x: number; y: number };
export type EyeMode = "open" | "narrow" | "closed";
// "auto" looks at a hovered or focused [data-look] element, else the pointer, else straight ahead
export type LookSource = "auto" | "ahead" | (() => Pt | null);

type Spring = { x: number; v: number };

export interface EyeRig {
  origin: SVGGraphicsElement;
  axis: SVGGraphicsElement;
  pupil: SVGGraphicsElement;
  lids: SVGGraphicsElement[];
  lash: SVGGraphicsElement | null;
  maxX: number;
  maxY: number;
  look: { current: LookSource };
  mode: { current: EyeMode };
  px: Spring;
  py: Spring;
  open: Spring;
  visible: boolean;
  last: string;
}

export interface LeanRig {
  el: SVGGraphicsElement;
  pivot: () => Pt;
  pivotLocal: Pt;
  sign: 1 | -1;
  max: number;
  extra: { current: number };
  enabled: { current: boolean };
  r: Spring;
  visible: boolean;
  last: string;
}

const pointer = { x: 0, y: 0, has: false };
let focusEl: Element | null = null;
let blinkStart = -1;
const BLINK_MS = 190;
const eyes = new Set<EyeRig>();
const leans = new Set<LeanRig>();
let raf = 0;
let lastT = 0;
let started = false;
let idleTimer = 0;
let reduced = false;

const springTo = (s: Spring, target: number, dt: number, k: number, c: number) => {
  s.v += (k * (target - s.x) - c * s.v) * dt;
  s.x += s.v * dt;
};

const center = (el: Element): Pt => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

function autoTarget(): Pt | null {
  if (focusEl && focusEl.isConnected) return center(focusEl);
  if (pointer.has) return { x: pointer.x, y: pointer.y };
  return null;
}

function resolve(src: LookSource): Pt | null {
  if (src === "auto") return autoTarget();
  if (src === "ahead") return null;
  return src();
}

const MODE_OPEN: Record<EyeMode, number> = { open: 1, narrow: 0.42, closed: 0.06 };

function tick(t: number) {
  raf = 0;
  const dt = Math.min(1 / 30, lastT ? (t - lastT) / 1000 : 1 / 60);
  lastT = t;
  let blink = 1;
  if (blinkStart >= 0) {
    const u = (t - blinkStart) / BLINK_MS;
    if (u >= 1) blinkStart = -1;
    else blink = 1 - Math.sin(Math.PI * u) * 0.94;
  }
  let busy = blinkStart >= 0 || t < busyUntil;
  for (const e of eyes) {
    if (!e.visible) continue;
    const o = center(e.origin);
    const a = center(e.axis);
    const target = resolve(e.look.current);
    let tx = 0;
    let ty = 0;
    if (target) {
      // local axes of the eye on screen, so rotated or mirrored hands still look the right way
      const ux = { x: a.x - o.x, y: a.y - o.y };
      const len = Math.hypot(ux.x, ux.y) || 1;
      const ex = { x: ux.x / len, y: ux.y / len };
      const ey = { x: -ex.y, y: ex.x };
      const dx = target.x - o.x;
      const dy = target.y - o.y;
      const lx = dx * ex.x + dy * ex.y;
      const ly = dx * ey.x + dy * ey.y;
      const d = Math.hypot(lx, ly);
      if (d > 0.5) {
        const f = Math.min(1, d / 240);
        tx = (lx / d) * f * e.maxX;
        ty = (ly / d) * f * e.maxY;
      }
    }
    springTo(e.px, tx, dt, 170, 22);
    springTo(e.py, ty, dt, 170, 22);
    springTo(e.open, MODE_OPEN[e.mode.current], dt, 120, 20);
    const open = Math.max(0.05, e.open.x * blink);
    const key = `${e.px.x.toFixed(2)},${e.py.x.toFixed(2)},${open.toFixed(3)}`;
    if (key !== e.last) {
      e.last = key;
      e.pupil.setAttribute("transform", `translate(${e.px.x.toFixed(2)} ${e.py.x.toFixed(2)})`);
      for (const l of e.lids) l.setAttribute("transform", `scale(1 ${open.toFixed(3)})`);
      if (e.lash) e.lash.setAttribute("opacity", String(Math.max(0, Math.min(1, (0.32 - open) / 0.2))));
    }
    if (Math.abs(e.px.v) + Math.abs(e.py.v) + Math.abs(e.open.v) > 0.02) busy = true;
    if (Math.abs(e.px.x - tx) + Math.abs(e.py.x - ty) > 0.05) busy = true;
  }
  for (const l of leans) {
    if (!l.visible) continue;
    let target = l.extra.current;
    if (l.enabled.current) {
      const p = autoTarget();
      if (p) {
        const pv = l.pivot();
        const dx = (p.x - pv.x) / Math.max(320, window.innerWidth * 0.5);
        const dy = (pv.y - p.y) / Math.max(320, window.innerHeight);
        target += Math.max(-l.max, Math.min(l.max, dx * l.max * (0.7 + Math.max(0, dy) * 0.6)));
      }
    }
    springTo(l.r, target, dt, 60, 11);
    const key = l.r.x.toFixed(2);
    if (key !== l.last) {
      l.last = key;
      l.el.setAttribute("transform", `rotate(${(l.r.x * l.sign).toFixed(2)} ${l.pivotLocal.x} ${l.pivotLocal.y})`);
    }
    if (Math.abs(l.r.v) > 0.01 || Math.abs(l.r.x - target) > 0.02) busy = true;
  }
  if (busy || pointerDirty) {
    pointerDirty = false;
    schedule();
  }
}

let pointerDirty = false;
let busyUntil = 0;
function schedule() {
  if (!raf) raf = requestAnimationFrame(tick);
}

export function wake() {
  pointerDirty = true;
  schedule();
}

// keep tracking while hands or cards are still moving after a state change
export function wakeFor(ms: number) {
  busyUntil = Math.max(busyUntil, performance.now() + ms);
  wake();
}

export function blinkNow() {
  if (reduced) return;
  if (blinkStart >= 0) return;
  blinkStart = performance.now();
  wake();
  scheduleIdle();
}

function scheduleIdle() {
  window.clearTimeout(idleTimer);
  // idle blink somewhere between 8 and 15 seconds
  idleTimer = window.setTimeout(blinkNow, 8000 + Math.random() * 7000);
}

function start() {
  if (started) return;
  started = true;
  reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.has = true;
      wake();
    },
    { passive: true },
  );
  window.addEventListener(
    "pointerdown",
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.has = true;
      blinkNow();
      wake();
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    pointer.has = false;
    wake();
  });
  window.addEventListener("scroll", wake, { passive: true });
  window.addEventListener("resize", wake);
  document.addEventListener("pointerover", (e) => {
    const el = (e.target as Element | null)?.closest?.("[data-look]") ?? null;
    if (el !== focusEl) {
      focusEl = el;
      wake();
    }
  });
  document.addEventListener("focusin", (e) => {
    const el = (e.target as Element | null)?.closest?.("[data-look]") ?? null;
    if (el) {
      focusEl = el;
      wake();
    }
  });
  document.addEventListener("focusout", () => {
    focusEl = null;
    wake();
  });
  scheduleIdle();
}

const io =
  typeof IntersectionObserver === "undefined"
    ? null
    : new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            for (const e of eyes) if (e.origin === en.target) e.visible = en.isIntersecting;
            for (const l of leans) if (l.el === en.target) l.visible = en.isIntersecting;
          }
          wake();
        },
        { rootMargin: "120px" },
      );

export function addEye(rig: EyeRig) {
  start();
  if (reduced) return () => {};
  eyes.add(rig);
  io?.observe(rig.origin);
  wake();
  return () => {
    eyes.delete(rig);
    io?.unobserve(rig.origin);
  };
}

export function addLean(rig: LeanRig) {
  start();
  if (reduced) return () => {};
  leans.add(rig);
  io?.observe(rig.el);
  wake();
  return () => {
    leans.delete(rig);
    io?.unobserve(rig.el);
  };
}

export const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
