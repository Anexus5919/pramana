import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Reveal, Section, SimTag, dur, ease, spring } from "../kit";
import { palette } from "../palette";
import {
  DESKTOP,
  ENTITIES,
  type Entity,
  INSTITUTIONS,
  type InstId,
  KIND_COLOR,
  KIND_LABEL,
  type Layout,
  MOBILE,
} from "./b/graphData";

type Mode = "alone" | "cross";

const TONE = {
  mismatch: palette.status.mismatch,
  manual: palette.status.manual,
};

// Small isometric voxel used as the entity node
function Voxel({ kind, size = 30, dim = false }: { kind: Entity["kind"]; size?: number; dim?: boolean }) {
  const c = KIND_COLOR[kind];
  const s = size / 2;
  const h = s * 0.58;
  return (
    <g opacity={dim ? 0.55 : 1}>
      <path d={`M0 ${-s} L${s} ${-s + h} L0 ${-s + 2 * h} L${-s} ${-s + h} Z`} fill={c.top} />
      <path d={`M${-s} ${-s + h} L0 ${-s + 2 * h} L0 ${s} L${-s} ${s - h} Z`} fill={c.left} />
      <path d={`M${s} ${-s + h} L0 ${-s + 2 * h} L0 ${s} L${s} ${s - h} Z`} fill={c.right} />
    </g>
  );
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

function Graph({
  L,
  mode,
  active,
  pinned,
  setHover,
  togglePin,
}: {
  L: Layout;
  mode: Mode;
  active: Entity | null;
  pinned: string | null;
  setHover: (id: string | null) => void;
  togglePin: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const cross = mode === "cross";
  const t = reduced ? { duration: 0 } : { duration: dur.story, ease: ease.inOut };
  const linked = (i: InstId) => !!active && active.links.includes(i);
  const narrow = L.w < 600;

  function onKey(e: KeyboardEvent<SVGGElement>, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      togglePin(id);
    }
  }

  return (
    <svg viewBox={`0 0 ${L.w} ${L.h}`} className="h-auto w-full" role="group" aria-label="Cross-application graph">
      <defs>
        <pattern id="net-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.1" fill={palette.line2} />
        </pattern>
      </defs>
      <rect width={L.w} height={L.h} fill="url(#net-dots)" opacity="0.7" />

      {/* Edges: application to entity */}
      {ENTITIES.flatMap((e) =>
        e.links.map((i) => {
          const a = L.inst[i];
          const b = cross ? L.merged[e.id] : L.alone[`${e.id}:${i}`];
          const on = active?.id === e.id;
          const tone = TONE[e.tone];
          return (
            <motion.line
              key={`${e.id}-${i}`}
              initial={false}
              animate={{
                x1: a.x,
                y1: a.y,
                x2: b.x,
                y2: b.y,
                stroke: cross ? (on ? tone.dot : palette.brand[300]) : palette.line2,
                strokeWidth: on ? 2.6 : cross ? 1.6 : 1.2,
                opacity: active && !on ? 0.18 : 1,
              }}
              transition={t}
              strokeDasharray={cross ? undefined : "3 4"}
              strokeLinecap="round"
            />
          );
        }),
      )}

      {/* Institutions */}
      {INSTITUTIONS.map((i) => {
        const p = L.inst[i.id];
        const on = linked(i.id);
        const count = ENTITIES.filter((e) => e.links.includes(i.id)).length;
        const tone = on && active ? TONE[active.tone] : null;
        return (
          <motion.g
            key={i.id}
            initial={false}
            animate={{ x: p.x, y: p.y, scale: on ? 1.04 : 1, opacity: active && !on ? 0.5 : 1 }}
            transition={reduced ? { duration: 0 } : spring.soft}
          >
            <foreignObject x={-L.card.w / 2} y={-L.card.h / 2} width={L.card.w} height={L.card.h} style={{ overflow: "visible" }}>
              <div
                className="flex h-full items-center gap-2.5 rounded-[14px] border bg-white px-3 transition-[border-color,box-shadow] duration-200"
                style={{
                  borderColor: tone ? tone.dot : "var(--lp-line-2)",
                  boxShadow: tone
                    ? `0 0 0 3px ${tone.bg}, 0 14px 30px -14px rgb(60 20 110 / 0.35)`
                    : "0 10px 26px -14px rgb(60 20 110 / 0.28)",
                }}
              >
                {!narrow && (
                  <span
                    aria-hidden
                    className="lp-mono grid size-8 shrink-0 place-items-center rounded-[8px] text-[11px] font-bold text-white"
                    style={{ background: palette.brand[700], boxShadow: "inset 0 -3px 0 rgb(0 0 0 / 0.22)" }}
                  >
                    {i.id.toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-[13px] leading-tight font-semibold text-(--lp-ink)">
                    {narrow ? i.short : i.name}
                  </span>
                  <span className="lp-mono block truncate text-[10.5px] text-(--lp-ink-3)">
                    {narrow ? i.city : `${i.city} · ${i.app}`}
                  </span>
                </span>
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-full text-[10.5px] font-bold"
                  style={
                    cross
                      ? { background: palette.status.mismatch.bg, color: palette.status.mismatch.fg }
                      : { background: palette.status.verified.bg, color: palette.status.verified.fg }
                  }
                  title={cross ? `${count} cross-application links` : "Passes its own checks"}
                >
                  {cross ? count : (
                    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                      <path d="M2 6.5 L5 9 L10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </div>
            </foreignObject>
          </motion.g>
        );
      })}

      {/* Per-application copies: separate when reviewed alone, merged when cross-checked */}
      {ENTITIES.flatMap((e) =>
        e.links.map((i) => {
          const p = cross ? L.merged[e.id] : L.alone[`${e.id}:${i}`];
          return (
            <motion.g key={`c-${e.id}-${i}`} initial={false} animate={{ x: p.x, y: p.y, opacity: cross ? 0 : 1 }} transition={t} aria-hidden>
              <Voxel kind={e.kind} size={narrow ? 18 : 22} />
              <text
                y={narrow ? 22 : 27}
                textAnchor="middle"
                className="lp-mono"
                fontSize={narrow ? 8.5 : 10}
                fontWeight={600}
                fill={palette.ink2}
                stroke={palette.canvas}
                strokeWidth={3}
                paintOrder="stroke"
              >
                {e.short}
              </text>
            </motion.g>
          );
        }),
      )}

      {/* Merged entities */}
      {ENTITIES.map((e) => {
        const p = L.merged[e.id];
        const on = active?.id === e.id;
        const tone = TONE[e.tone];
        return (
          <motion.g
            key={e.id}
            initial={false}
            animate={{ x: p.x, y: p.y, opacity: cross ? (active && !on ? 0.45 : 1) : 0, scale: cross ? (on ? 1.12 : 1) : 0.6 }}
            transition={reduced ? { duration: 0 } : { ...spring.soft, opacity: { duration: dur.panel, delay: cross ? 0.35 : 0 } }}
            style={{ pointerEvents: cross ? "auto" : "none", cursor: "pointer", outline: "none" }}
            role="button"
            tabIndex={cross ? 0 : -1}
            aria-pressed={pinned === e.id}
            aria-label={`${KIND_LABEL[e.kind]} ${e.label}, cited by ${e.links.length} applications. ${e.finding}`}
            onPointerEnter={() => setHover(e.id)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(e.id)}
            onBlur={() => setHover(null)}
            onClick={() => togglePin(e.id)}
            onKeyDown={(ev) => onKey(ev, e.id)}
            className="group"
          >
            <circle r={narrow ? 26 : 34} fill="white" stroke={on ? tone.dot : palette.line2} strokeWidth={on ? 2 : 1} />
            <circle
              r={narrow ? 31 : 40}
              fill="none"
              stroke={palette.brand[500]}
              strokeWidth={2}
              className="opacity-0 group-focus-visible:opacity-100"
            />
            {pinned === e.id && <circle r={narrow ? 31 : 40} fill="none" stroke={tone.dot} strokeWidth={1.5} strokeDasharray="3 3" />}
            <g transform="translate(0 -1)">
              <Voxel kind={e.kind} size={narrow ? 22 : 28} />
            </g>
            <circle cx={narrow ? 19 : 25} cy={narrow ? -19 : -25} r={narrow ? 5 : 6} fill={tone.dot} stroke="white" strokeWidth={2} />
            <text
              y={narrow ? 42 : 54}
              textAnchor="middle"
              className="lp-mono"
              fontSize={narrow ? 9 : 11}
              fontWeight={700}
              fill={palette.ink}
              stroke={palette.canvas}
              strokeWidth={4}
              paintOrder="stroke"
            >
              {narrow ? e.short : e.label}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}

function Panel({ mode, active, pinned }: { mode: Mode; active: Entity | null; pinned: string | null }) {
  if (mode === "alone") {
    return (
      <motion.div key="alone" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: dur.ui }}>
        <p className="lp-eyebrow">Reviewed one at a time</p>
        <p className="lp-display mt-3 text-[24px] leading-[1.2] font-semibold tracking-[-0.02em]">
          Each application passes its own checks.
        </p>
        <p className="mt-3 text-[14.5px] text-(--lp-ink-2)">
          Every faculty list, fire NOC and lab photo is internally consistent. Nothing inside one file contradicts
          anything else in the same file.
        </p>
      </motion.div>
    );
  }
  if (!active) {
    return (
      <motion.div key="summary" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: dur.ui }}>
        <p className="lp-eyebrow">Cross-checked</p>
        <p className="lp-display mt-3 text-[24px] leading-[1.2] font-semibold tracking-[-0.02em]">
          5 shared entities tie 3 applications together.
        </p>
        <p className="mt-3 text-[14.5px] text-(--lp-ink-2)">
          Hover, tap or tab to an entity to see the finding and both sources. Click to pin it.
        </p>
      </motion.div>
    );
  }
  const tone = TONE[active.tone];
  return (
    <motion.div key={active.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: dur.ui }}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="lp-eyebrow">{KIND_LABEL[active.kind]}</p>
        {pinned === active.id && (
          <span className="rounded-full bg-(--lp-brand-50) px-2 py-px text-[10.5px] font-semibold text-(--lp-brand-700)">
            Pinned · Esc to release
          </span>
        )}
      </div>
      <p className="lp-mono mt-2 text-[17px] font-bold break-all text-(--lp-ink)">{active.label}</p>
      <p className="text-[13px] text-(--lp-ink-3)">{active.detail}</p>
      <p className="mt-4 text-[15.5px] leading-relaxed text-(--lp-ink)">{active.finding}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className="lp-mono rounded-[6px] px-2 py-1 text-[11px] font-semibold text-white"
          style={{ background: palette.ev[active.ev - 1] }}
        >
          E{active.ev} {active.evName}
        </span>
        <span className="rounded-[6px] px-2 py-1 text-[12px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
          {active.tone === "mismatch" ? "Mismatch" : "Manual review"}
        </span>
        {active.simulated && <SimTag>SIMULATED REGISTRY</SimTag>}
      </div>
      <ul className="mt-5 space-y-1.5">
        {active.links.map((id) => {
          const i = INSTITUTIONS.find((x) => x.id === id)!;
          return (
            <li key={id} className="flex items-center justify-between gap-3 rounded-[10px] border border-(--lp-line) bg-white px-3 py-2">
              <span className="text-[13px] font-medium text-(--lp-ink)">{i.name}</span>
              <span className="lp-mono shrink-0 text-[11px] text-(--lp-ink-3)">{i.app}</span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

export default function CrossApplications() {
  const narrow = useNarrow();
  const L = narrow ? MOBILE : DESKTOP;
  const [mode, setMode] = useState<Mode>("alone");
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const touched = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { once: true, margin: "0px 0px -30% 0px" });

  // First view: show the applications alone, then cross-check them once
  useEffect(() => {
    if (!inView) return;
    const id = window.setTimeout(() => !touched.current && setMode("cross"), 1500);
    return () => window.clearTimeout(id);
  }, [inView]);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setPinned(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  const activeId = mode === "cross" ? (hover ?? pinned) : null;
  const active = ENTITIES.find((e) => e.id === activeId) ?? null;

  function choose(m: Mode) {
    touched.current = true;
    setMode(m);
    if (m === "alone") {
      setPinned(null);
      setHover(null);
    }
  }

  return (
    <Section
      id="network"
      eyebrow="Cross-application"
      title="One application looks fine. Two tell the truth."
      lede="Pramana resolves people, certificates and photos across every application in the cycle. A faculty member, a fire NOC or a lab photo that turns up twice becomes a finding, with both sources side by side."
    >
      <Reveal className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Review mode" className="inline-flex rounded-full border border-(--lp-line-2) bg-white p-1">
            {(["alone", "cross"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => choose(m)}
                className="relative rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors duration-200"
                style={{ color: mode === m ? "white" : "var(--lp-ink-2)" }}
              >
                {mode === m && (
                  <motion.span layoutId="net-mode" className="absolute inset-0 rounded-full bg-(--lp-brand-500)" transition={spring.snappy} />
                )}
                <span className="relative">{m === "alone" ? "Each application alone" : "Cross-checked"}</span>
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-(--lp-ink-3)">Synthetic applications and IDs</p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div
            ref={stageRef}
            className="overflow-hidden rounded-[28px] border border-(--lp-line) bg-[linear-gradient(180deg,var(--lp-surface),var(--lp-surface-2))]"
          >
            <Graph L={L} mode={mode} active={active} pinned={pinned} setHover={setHover} togglePin={(id) => setPinned((p) => (p === id ? null : id))} />
          </div>
          <div className="rounded-[20px] border border-(--lp-line) bg-white/70 p-6 " aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <Panel key={`${mode}-${active?.id ?? "none"}`} mode={mode} active={active} pinned={pinned} />
            </AnimatePresence>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
