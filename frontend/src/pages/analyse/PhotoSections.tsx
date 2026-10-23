import { Camera, MapPin } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { humanize } from "../../lib/labels";
import { EvidenceClassChip, StatusPill } from "../../ui/Blocks";
import { cn } from "../../ui/cn";
import { Switch } from "../../ui/Field";
import { dur, ease } from "../../ui/motion";
import { Credentials } from "../application/campus/PhotoCard";
import { fmtExifTime } from "../application/campus/geo";
import { CautionNote } from "../application/parts";
import { analyseApi, type Analysis, type AnalysedPhoto } from "./analyseApi";
import { Quiet, Section } from "./parts";

// Same colours as the Campus tab; people are counted but never boxed
const GROUP_COLOR: Record<string, string> = {
  screen: "var(--brand-500)",
  keyboard: "var(--ev-3)",
  seat: "var(--ev-6)",
  table: "var(--ev-5)",
  book: "var(--ev-2)",
};
const GROUP_LABEL: Record<string, string> = {
  screen: "screens",
  keyboard: "keyboards",
  seat: "chairs or benches",
  table: "tables or desks",
  book: "books",
  person: "people",
};
const GROUP_ORDER = ["screen", "keyboard", "seat", "table", "book", "person"];

/** The photo upright, as the detector saw it, with a box per counted object. */
export function PhotoStage({ a }: { a: Analysis }) {
  const ph = a.photo as AnalysedPhoto;
  const reduce = useReducedMotion();
  const [boxes, setBoxes] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const r = ph.room;
  const analysed = r.status === "analysed";
  const dets = (r.detections ?? []).filter((d) => d.group !== "person" && !hidden.has(d.group));
  const aspect = r.image ? `${r.image[0]} / ${r.image[1]}` : ph.width && ph.height ? `${ph.width} / ${ph.height}` : "4 / 3";
  const toggle = (g: string) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
          <Camera aria-hidden className="size-4 shrink-0 text-ink-3" />
          <span className="truncate font-mono text-[13px]">{a.filename}</span>
        </span>
        {analysed ? <Switch checked={boxes} onChange={setBoxes} label={`Detection boxes (${(r.detections ?? []).filter((d) => d.group !== "person").length})`} /> : <span className="text-xs text-ink-3">Not analysed by the detector</span>}
      </div>
      <div className="bg-surface-3/60 p-4">
        <div className="relative mx-auto overflow-hidden rounded-[10px] bg-surface-2 shadow-md ring-1 ring-black/5" style={{ aspectRatio: aspect }}>
          {failed ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-3">The preview is no longer held. Drop the file again to see it.</div>
          ) : (
            <img
              src={analyseApi.photoUrl(a.token)}
              alt={`Analysed photo ${a.filename}`}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
            />
          )}
          {analysed && boxes && loaded && (
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
              {dets.map((d, i) => {
                const [x0, y0, x1, y1] = d.box;
                return (
                  <motion.rect
                    key={`${d.group}-${i}`}
                    x={x0 * 1000}
                    y={y0 * 1000}
                    width={(x1 - x0) * 1000}
                    height={(y1 - y0) * 1000}
                    rx="4"
                    vectorEffect="non-scaling-stroke"
                    style={{ fill: "none", stroke: GROUP_COLOR[d.group] ?? "var(--ink-3)" }}
                    strokeWidth="2"
                    initial={{ pathLength: reduce ? 1 : 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: reduce ? 0 : dur.panel, ease: ease.out, delay: reduce ? 0 : Math.min(i * 0.025, 0.5) }}
                  />
                );
              })}
            </svg>
          )}
        </div>
        {analysed && (
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Detected objects; press to hide or show their boxes">
            {GROUP_ORDER.filter((g) => r.counts?.[g]).map((g) => {
              const boxed = g !== "person";
              const off = hidden.has(g);
              return (
                <button
                  key={g}
                  type="button"
                  disabled={!boxed}
                  aria-pressed={boxed ? !off : undefined}
                  onClick={() => toggle(g)}
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs transition-colors",
                    off ? "border-line text-ink-4" : "border-line-2 bg-surface text-ink-2 hover:border-brand-200",
                    !boxed && "cursor-default",
                  )}
                >
                  {boxed && <span aria-hidden className="size-2 rounded-[2px]" style={{ background: off ? "var(--line-2)" : GROUP_COLOR[g] }} />}
                  <span className="tabular font-semibold text-ink">{r.counts?.[g]}</span> {GROUP_LABEL[g] ?? g}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{k}</dt>
      <dd className="min-w-0 text-ink [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

export function CaptureSection({ a }: { a: Analysis }) {
  const ph = a.photo as AnalysedPhoto;
  const e = ph.exif;
  return (
    <Section id="capture" eyebrow="Photo: capture metadata" title={e.captured ? `Captured ${fmtExifTime(e.captured)}` : "No capture time recorded"} description="EXIF as written by the camera or app. It is easy to strip or edit, so it prompts questions rather than answering them.">
      <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-3 gap-y-1.5 text-sm">
        <Row k="Capture time">{fmtExifTime(e.captured_original) ?? (e.captured ? `${fmtExifTime(e.captured)} (file time, not capture time)` : "Not recorded")}</Row>
        <Row k="Camera">{e.camera ?? "Not recorded"}</Row>
        <Row k="Software">{e.software ?? "Not recorded"}</Row>
        <Row k="Geotag">
          {e.gps ? (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <MapPin aria-hidden className="size-3.5 text-ink-3" />
              <span className="font-mono">{e.gps.map((v) => v.toFixed(5)).join(", ")}</span>
            </span>
          ) : (
            "No GPS position in the file"
          )}
        </Row>
        <Row k="Image">{ph.width && ph.height ? `${ph.width} x ${ph.height} px` : "Not read"}</Row>
      </dl>
      {e.gps && <p className="mt-2 text-xs text-ink-3">The distance from the campus is measured only inside an application, against the campus on record.</p>}
      {ph.attribution && (
        <p className="mt-2 text-[11px] text-ink-4 text-pretty">
          Attribution carried in the file: {[ph.attribution.artist, ph.attribution.copyright].filter(Boolean).join(", ")}.
        </p>
      )}
    </Section>
  );
}

export function CredentialsSection({ a }: { a: Analysis }) {
  const ph = a.photo as AnalysedPhoto;
  return (
    <Section id="photo" eyebrow="Photo: Content Credentials" title="Content Credentials (C2PA)" aside={ph.c2pa_status ? <StatusPill status={ph.c2pa_status.status} /> : undefined}>
      <Credentials c={ph.c2pa} />
      {ph.c2pa_status && <p className="mt-2 text-sm text-ink-2 text-pretty">{ph.c2pa_status.detail}</p>}
    </Section>
  );
}

export function RoomSection({ a }: { a: Analysis }) {
  const r = (a.photo as AnalysedPhoto).room;
  return (
    <Section id="room" eyebrow="Photo: room detection" title={r.status === "analysed" ? `Reads as ${humanize(r.room_type ?? "unclear").toLowerCase()}` : "Not analysed"} aside={<EvidenceClassChip cls="model" />}>
      {r.status !== "analysed" ? (
        <Quiet>{r.reason}</Quiet>
      ) : (
        <>
          <p className="text-sm text-ink-2 text-pretty">
            From {r.room_basis}. Counted {r.counts?.workstation ?? 0} visible workstations. Inside an application these counts are compared with the declared facility; here
            there is nothing to compare with.
          </p>
          <p className="mt-1.5 text-[11px] text-ink-4">
            {r.model?.name} ({r.model?.classes} classes, {r.model?.licence}) on {r.model?.runtime}, {r.latency_ms} ms.
          </p>
          <CautionNote className="mt-3" title="Detector indicator">
            Counts come from an object detector and never decide anything. Furniture can be hidden or misread, and one photo rarely shows a whole room.
          </CautionNote>
        </>
      )}
    </Section>
  );
}
