import { useState } from "react";
import { humanize } from "../../lib/labels";
import { Callout, DescriptionList, EvidenceClassLabel, EvidenceFrame, MetaList, StatusBadge, Switch, VerificationBadge, cn } from "../../ui2";
import { credentialState } from "../application/campus/PhotoCard";
import { fmtExifTime, fmtIsoLocal } from "../application/campus/geo";
import { analyseApi, type Analysis, type AnalysedPhoto } from "./analyseApi";
import { Quiet, ReportPanel } from "./parts";

// Same colours as the Campus view; people are counted but never boxed
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
  const [boxes, setBoxes] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const r = ph.room;
  const analysed = r.status === "analysed";
  const boxed = (r.detections ?? []).filter((d) => d.group !== "person");
  const dets = boxed.filter((d) => !hidden.has(d.group));
  const aspect = r.image ? `${r.image[0]} / ${r.image[1]}` : ph.width && ph.height ? `${ph.width} / ${ph.height}` : "4 / 3";
  const toggle = (g: string) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  return (
    <EvidenceFrame
      title={<span className="font-mono">{a.filename}</span>}
      meta={<MetaList items={[ph.width && ph.height ? `${ph.width} x ${ph.height} px` : null, analysed ? `${boxed.length} objects boxed` : "Not analysed by the detector"]} />}
      toolbar={analysed ? <Switch checked={boxes} onChange={setBoxes} label="Boxes" /> : undefined}
      footer={
        analysed ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Detected objects; press to hide or show their boxes">
            {GROUP_ORDER.filter((g) => r.counts?.[g]).map((g) => {
              const canBox = g !== "person";
              const off = hidden.has(g);
              return canBox ? (
                <button
                  key={g}
                  type="button"
                  aria-pressed={!off}
                  onClick={() => toggle(g)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-control border px-2 text-xs transition-colors duration-150",
                    off ? "border-line text-ink-3" : "border-line-2 bg-surface text-ink-2 hover:bg-surface-2",
                  )}
                >
                  <span aria-hidden className="size-2 rounded-[2px]" style={{ background: off ? "var(--line-2)" : GROUP_COLOR[g] }} />
                  <span className="font-medium text-ink">{r.counts?.[g]}</span> {GROUP_LABEL[g] ?? g}
                </button>
              ) : (
                <span key={g} className="inline-flex h-7 items-center gap-1 px-2 text-xs text-ink-3">
                  <span className="font-medium text-ink">{r.counts?.[g]}</span> {GROUP_LABEL[g]}, counted, never boxed
                </span>
              );
            })}
          </div>
        ) : undefined
      }
    >
      <div className="relative mx-auto overflow-hidden rounded-control bg-surface-3" style={{ aspectRatio: aspect }}>
        {failed ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-3">The preview is no longer held. Drop the file again to see it.</div>
        ) : (
          <img
            src={analyseApi.photoUrl(a.token)}
            alt={`Analysed photo ${a.filename}`}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn("absolute inset-0 size-full object-cover", loaded ? "visible" : "invisible")}
          />
        )}
        {analysed && boxes && loaded && (
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
            {dets.map((d, i) => {
              const [x0, y0, x1, y1] = d.box;
              return (
                <rect
                  key={`${d.group}-${i}`}
                  x={x0 * 1000}
                  y={y0 * 1000}
                  width={(x1 - x0) * 1000}
                  height={(y1 - y0) * 1000}
                  rx="4"
                  vectorEffect="non-scaling-stroke"
                  style={{ fill: "none", stroke: GROUP_COLOR[d.group] ?? "var(--ink-3)" }}
                  strokeWidth="2"
                />
              );
            })}
          </svg>
        )}
      </div>
    </EvidenceFrame>
  );
}

export function CaptureSection({ a }: { a: Analysis }) {
  const ph = a.photo as AnalysedPhoto;
  const e = ph.exif;
  return (
    <ReportPanel
      id="capture"
      title="Capture metadata"
      description="EXIF as written by the camera or app. It is easy to strip or edit, so it prompts questions rather than answering them."
    >
      <DescriptionList
        labelWidth={112}
        items={[
          {
            label: "Capture time",
            value: fmtExifTime(e.captured_original) ?? (e.captured ? `${fmtExifTime(e.captured)} (file time, not capture time)` : "Not recorded"),
          },
          { label: "Camera", value: e.camera ?? "Not recorded" },
          { label: "Software", value: e.software ?? "Not recorded" },
          {
            label: "Geotag",
            value: e.gps ? e.gps.map((v) => v.toFixed(5)).join(", ") : "No GPS position in the file",
            mono: !!e.gps,
            hint: e.gps ? "The distance from the campus is measured only inside an application." : undefined,
          },
          { label: "Image", value: ph.width && ph.height ? `${ph.width} x ${ph.height} px` : "Not read" },
          {
            label: "Attribution",
            hidden: !ph.attribution,
            value: [ph.attribution?.artist, ph.attribution?.copyright].filter(Boolean).join(", "),
          },
        ]}
      />
    </ReportPanel>
  );
}

function yesNo(v: boolean | null | undefined, yes: string, no: string) {
  if (v === true) return yes;
  if (v === false) return <span className="font-medium text-mismatch-fg">{no}</span>;
  return "Not determined";
}

export function CredentialsSection({ a }: { a: Analysis }) {
  const ph = a.photo as AnalysedPhoto;
  const c = ph.c2pa;
  const st = credentialState(c);
  return (
    <ReportPanel
      id="photo"
      title="Content Credentials"
      description="C2PA provenance signed into the file, checked against the DEMO trust list."
      actions={ph.c2pa_status ? <VerificationBadge status={ph.c2pa_status.status} /> : <StatusBadge tone={st.tone}>{st.label}</StatusBadge>}
    >
      <p className="text-sm font-medium text-ink">{st.label}</p>
      <p className="mt-0.5 text-sm text-ink-3 text-pretty">{ph.c2pa_status?.detail ?? st.detail}</p>
      {c.present && c.readable && (
        <DescriptionList
          className="mt-4"
          labelWidth={128}
          items={[
            { label: "Signature", value: yesNo(c.signature_valid, "Valid", "Does not validate") },
            { label: "Signed hash", value: yesNo(c.hash_matches, "File still matches", "File modified after capture") },
            { label: "Signer", value: [c.signer?.common_name, c.signer?.organization].filter(Boolean).join(", ") || "Not named" },
            {
              label: "Chain",
              value: (c.chain ?? [])
                .map((x) => `${x.subject}${x.role.includes("DEMO") ? " (DEMO anchor)" : ""}`)
                .join(", issued by "),
            },
            { label: "Claim generator", value: c.claim_generator ?? "Not stated" },
            { label: "Capture time", value: fmtIsoLocal(c.capture_time) ?? "Not stated" },
            {
              label: "Actions",
              value:
                (c.actions ?? []).map((x) => `${(x.action ?? "").replace(/^c2pa\./, "")}${x.digital_source_type ? ` (${x.digital_source_type})` : ""}`).join(", ") ||
                "None recorded",
            },
            {
              label: "Validation",
              hidden: (c.failures ?? []).length === 0,
              value: [...new Set((c.failures ?? []).map((f) => f.code))].join(", "),
            },
          ]}
        />
      )}
      {c.present && (
        <p className="mt-3 text-xs text-ink-3">
          Checked with {c.library ?? "c2pa-python"} against {c.trust_list ?? "no trust list"}.
        </p>
      )}
    </ReportPanel>
  );
}

export function RoomSection({ a }: { a: Analysis }) {
  const r = (a.photo as AnalysedPhoto).room;
  return (
    <ReportPanel
      id="room"
      title="Room detection"
      description={r.status === "analysed" ? `Reads as ${humanize(r.room_type ?? "unclear").toLowerCase()}` : "Not analysed"}
      actions={<EvidenceClassLabel cls="model" />}
    >
      {r.status !== "analysed" ? (
        <Quiet>{r.reason}</Quiet>
      ) : (
        <>
          <p className="text-sm text-ink-2 text-pretty">
            From {r.room_basis}. Counted {r.counts?.workstation ?? 0} visible workstations. Inside an application these counts are compared with the declared
            facility; here there is nothing to compare with.
          </p>
          <p className="mt-1.5 text-xs text-ink-3">
            {r.model?.name} ({r.model?.classes} classes, {r.model?.licence}) on {r.model?.runtime}, {r.latency_ms} ms.
          </p>
          <Callout tone="neutral" className="mt-4">
            Counts come from an object detector and never decide anything. Furniture can be hidden or misread, and one photo rarely shows a whole room.
          </Callout>
        </>
      )}
    </ReportPanel>
  );
}
