import { useReducedMotion } from "motion/react";
import { lazy, type PointerEvent as RPointerEvent, type ReactNode, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import "../landing.css";
import { landingVars } from "../palette";
import { computeLayout, createEyeState, type EyeLayout, now } from "./eyeState";
import StaticEye from "./StaticEye";

const EyeScene = lazy(() => import("./EyeScene"));

// Compact voxel eye for panels (login): the iris follows the cursor and focused fields; `closed` shuts the lids
export default function MiniEye({ closed = false, children }: { closed?: boolean; children?: ReactNode }) {
  const reduced = !!useReducedMotion();
  const stateRef = useRef(createEyeState());
  const state = stateRef.current;
  const boxRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<EyeLayout | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(true);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      const l = computeLayout(r.width, r.height, Math.min(300, r.width * 0.42), Math.min(150, r.height * 0.2), { compact: false });
      state.layout = l;
      setLayout(l);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [state]);

  // the eye looks wherever the pointer is on the page, and at whichever field takes focus
  useEffect(() => {
    const look = (x: number, y: number) => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      state.pointer.x = ((x - r.left) / r.width) * 2 - 1;
      state.pointer.y = -(((y - r.top) / r.height) * 2 - 1);
      state.pointer.inside = true;
      state.pointer.lastMove = now();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch") look(e.clientX, e.clientY);
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.getBoundingClientRect) return;
      const r = t.getBoundingClientRect();
      look(r.left + r.width / 2, r.top + r.height / 2);
    };
    const onVis = () => setVisible(document.visibilityState === "visible");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("focusin", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("focusin", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [state]);

  // closing the lids confirms a successful sign-in
  useEffect(() => {
    if (!closed) {
      state.scrollClose = 0;
      return;
    }
    let raf = 0;
    const t0 = now();
    const step = () => {
      const k = Math.min(1, (now() - t0) / 0.38);
      state.scrollClose = k * k;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [closed, state]);

  useEffect(() => {
    if (ready || failed) return;
    const t = window.setTimeout(() => setFailed(true), 6000);
    return () => window.clearTimeout(t);
  }, [ready, failed]);

  const frameloop = reduced ? "demand" : visible ? "always" : "never";
  state.running = frameloop === "always";

  const onDown = (e: RPointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    state.pulses.push({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1), t0: now() });
    if (state.pulses.length > 4) state.pulses.shift();
  };

  return (
    <div ref={boxRef} className="lp-sky relative h-full w-full overflow-hidden" style={landingVars} onPointerDown={onDown}>
      {layout && failed && <StaticEye layout={layout} />}
      {layout && !failed && (
        <div className="absolute inset-0 transition-opacity duration-700" style={{ opacity: ready ? 1 : 0 }}>
          <Suspense fallback={null}>
            <EyeScene
              state={state}
              layout={layout}
              frameloop={frameloop}
              reduced={reduced}
              onReady={() => setReady(true)}
              onFail={() => setFailed(true)}
            />
          </Suspense>
        </div>
      )}
      {children && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="pointer-events-auto">{children}</div>
        </div>
      )}
    </div>
  );
}
