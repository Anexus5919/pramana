import { useEffect, useRef, useState } from "react";

export type Viewport = { w: number; h: number };

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => ({
    w: typeof window === "undefined" ? 1440 : window.innerWidth,
    h: typeof window === "undefined" ? 900 : window.innerHeight,
  }));
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVp({ w: window.innerWidth, h: window.innerHeight }));
    };
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", on);
    };
  }, []);
  return vp;
}

export function useReducedMotionPref(): boolean {
  const [r, setR] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

// Plays timed beats once while active; later visits jump straight to the end state
export function useSequence(active: boolean, beats: number[], instant = false): number {
  const [i, setI] = useState(-1);
  const done = useRef(false);
  useEffect(() => {
    if (!active) {
      setI(-1);
      return;
    }
    if (instant || done.current) {
      setI(beats.length - 1);
      return;
    }
    const ids = beats.map((ms, k) =>
      window.setTimeout(() => {
        setI(k);
        if (k === beats.length - 1) done.current = true;
      }, ms),
    );
    return () => ids.forEach((id) => window.clearTimeout(id));
    // beats are static per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, instant]);
  return i;
}

export function useCountUp(target: number, run: boolean, decimals = 0, ms = 1300, instant = false): string {
  const [v, setV] = useState(instant ? target : 0);
  useEffect(() => {
    if (instant) {
      setV(target);
      return;
    }
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const u = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - u, 3);
      setV(target * e);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, target, ms, instant]);
  return v.toFixed(decimals);
}
