import { Camera, Copy, Crosshair, MapPin } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api";
import type { CampusPayload, CampusPhoto, ContentCredentials, Detection } from "../../../types";
import { Tag } from "../../../ui/Badge";
import { EvidenceClassChip, SeverityMeter, StatusCube } from "../../../ui/Blocks";
import { cn } from "../../../ui/cn";
import { Switch } from "../../../ui/Field";
import { dur, ease } from "../../../ui/motion";
import type { Tone } from "../../../ui/tone";
import { appPath } from "../data";
import { CautionNote, PaneLabel } from "../parts";
import { fmtExifTime, fmtIsoLocal, fmtKm } from "./geo";

// Overlay colours per detection group; people are counted but never boxed
const GROUP_COLOR: Record<string, string> = {
  screen: "var(--brand-500)",
  keyboard: "var(--ev-3)",
  seat: "var(--ev-6)",
  table: "var(--ev-5)",
  book: "var(--ev-2)",
};
const GROUP_ORDER = ["screen", "keyboard", "seat", "table", "book", "person"];

export function credentialState(c: ContentCredentials): { tone: Tone; label: string; detail: string } {
  if (c.present === null) return { tone: "unchecked", label: "Not checked", detail: "Content Credentials were not read for this photo." };
  if (!c.present) return { tone: "unchecked", label: "No content credentials", detail: "Most cameras and apps do not add them yet, so this is not an indicator." };
  if (!c.readable) return { tone: "manual", label: "Could not be validated", detail: c.error ?? "The manifest is present but unreadable." };
  if (!c.signature_valid) return { tone: "mismatch", label: "Signature does not validate", detail: "The manifest signature fails." };
  if (c.hash_matches === false) return { tone: "mismatch", label: "Modified after capture", detail: "The signed manifest is intact, but the file no longer matches the hash it signed." };
  if (!c.trusted) return { tone: "manual", label: "Signer not on the demo list", detail: "Intact and matching, but the signer does not chain to the demo capture CA." };
  return { tone: "verified", label: "Intact, demo trust list", detail: "Unchanged since the capture device signed it. The trust list is a DEMO list." };
}

/** Attribution carried in the sample photo's EXIF: "licence, file page URL". */
function Credit({ credit }: { credit: NonNullable<CampusPhoto["attribution"]> }) {
  const [licence, url] = (credit.copyright ?? "").split(/,\s*(?=https?:)/);
  return (
    <p className="mt-2 text-[11px] text-ink-4 text-pretty">
      Sample photo by {credit.artist ?? "unknown author"}, {licence || "licence not stated"}
      {url && (
        <>
          {" "}
          (
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink-2">
            Wikimedia Commons file page
          </a>
          )
        </>
      )}
      . Capture metadata is synthetic demo data.
    </p>
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

function YesNo({ v, yes, no }: { v: boolean | null | undefined; yes: string; no: string }) {
  if (v === null || v === undefined) return <span className="text-ink-3">Not determined</span>;
  return <span className={v ? "text-verified-fg" : "text-mismatch-fg"}>{v ? yes : no}</span>;
}

function Credentials({ c }: { c: ContentCredentials }) {
  const st = credentialState(c);
  return (
    <div>
      <PaneLabel aside={c.present ? <Tag variant="demo">Demo trust list</Tag> : undefined}>Content Credentials (C2PA)</PaneLabel>
      <div className="flex items-start gap-2">
        <StatusCube tone={st.tone} size={16} className="mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{st.label}</p>
          <p className="text-xs text-ink-3 text-pretty">{st.detail}</p>
        </div>
      </div>
      {c.present && c.readable && (
        <dl className="mt-2.5 grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 gap-y-1 text-xs">
          <Row k="Signature">
            <YesNo v={c.signature_valid} yes="Valid" no="Does not validate" />
          </Row>
          <Row k="Signed hash">
            <YesNo v={c.hash_matches} yes="File still matches" no="File modified after capture" />
          </Row>
          <Row k="Signer">{[c.signer?.common_name, c.signer?.organization].filter(Boolean).join(", ") || "Not named"}</Row>
          <Row k="Chain">
            <ol className="space-y-0.5">
              {(c.chain ?? []).map((x, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1">
                  {i > 0 && <span className="text-ink-4">issued by</span>}
                  <span>{x.subject}</span>
                  {x.role.includes("DEMO") && <Tag variant="demo">Demo anchor</Tag>}
                </li>
              ))}
            </ol>
          </Row>
          <Row k="Claim generator">{c.claim_generator ?? "Not stated"}</Row>
          <Row k="Capture time">{fmtIsoLocal(c.capture_time) ?? "Not stated"}</Row>
          <Row k="Actions">{(c.actions ?? []).map((a) => `${(a.action ?? "").replace(/^c2pa\./, "")}${a.digital_source_type ? ` (${a.digital_source_type})` : ""}`).join(", ") || "None recorded"}</Row>
          {(c.failures ?? []).length > 0 && <Row k="Validation">{[...new Set((c.failures ?? []).map((f) => f.code))].join(", ")}</Row>}
        </dl>
      )}
      {c.present && <p className="mt-2 text-[11px] text-ink-4">Checked with {c.library ?? "c2pa-python"} against {c.trust_list ?? "no trust list"}.</p>}
    </div>
  );
}

function Detections({ photo, show, hidden }: { photo: CampusPhoto; show: boolean; hidden: Set<string> }) {
  const dets = (photo.room.detections ?? []).filter((d) => d.group !== "person" && !hidden.has(d.group));
  if (!show) return null;
  return (
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      {dets.map((d: Detection, i) => {
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
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: dur.panel, ease: ease.out, delay: Math.min(i * 0.025, 0.5) }}
          />
        );
      })}
    </svg>
  );
}

function Room({ photo, labels, groupLabels, hidden, onToggle }: {
  photo: CampusPhoto;
  labels: Record<string, string>;
  groupLabels: Record<string, string>;
  hidden: Set<string>;
  onToggle: (g: string) => void;
}) {
  const r = photo.room;
  const fac = photo.declared_facility;
  return (
    <div>
      <PaneLabel aside={<EvidenceClassChip cls="model" />}>Room and seats (detector indicator)</PaneLabel>
      {r.status !== "analysed" ? (
        <p className="text-sm text-ink-2">
          <span className="font-semibold">Not analysed.</span> <span className="text-ink-3">{r.reason}</span>
        </p>
      ) : (
        <>
          <p className="text-sm text-ink">
            Reads as <span className="font-semibold">{labels[r.room_type ?? "unclear"] ?? r.room_type}</span>
            <span className="text-ink-3">, from {r.room_basis}.</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Detected objects; press to hide or show their boxes">
            {GROUP_ORDER.filter((g) => r.counts?.[g]).map((g) => {
              const boxed = g !== "person";
              const off = hidden.has(g);
              return (
                <button
                  key={g}
                  type="button"
                  disabled={!boxed}
                  aria-pressed={boxed ? !off : undefined}
                  onClick={() => onToggle(g)}
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs transition-colors",
                    off ? "border-line text-ink-4" : "border-line-2 bg-surface text-ink-2 hover:border-brand-200",
                    !boxed && "cursor-default",
                  )}
                >
                  {boxed && <span aria-hidden className="size-2 rounded-[2px]" style={{ background: off ? "var(--line-2)" : GROUP_COLOR[g] }} />}
                  <span className="tabular font-semibold text-ink">{r.counts?.[g]}</span> {groupLabels[g] ?? g}
                </button>
              );
            })}
          </div>
          {fac ? (
            <p className="mt-2 text-sm text-ink-2 text-pretty">
              Declared as <span className="font-semibold text-ink">{fac.name ?? "a facility"}</span>
              {fac.room_type ? ` (${(labels[fac.room_type] ?? fac.room_type).toLowerCase()})` : ""}
              {fac.workstations ? `, ${fac.workstations} workstations` : ""}. Counted {r.counts?.workstation ?? 0} visible workstations. A photo may not show the
              whole room.
            </p>
          ) : (
            <p className="mt-2 text-xs text-ink-3">No declared facility points at this photo, so nothing is compared.</p>
          )}
          <p className="mt-1.5 text-[11px] text-ink-4">
            {r.model?.name} ({r.model?.classes} classes, {r.model?.licence}) on {r.model?.runtime}, {r.latency_ms} ms. Partitions can read as chairs; the detector has no desk or
            monitor class.
          </p>
        </>
      )}
    </div>
  );
}

export function PhotoCard({
  photo,
  data,
  appId,
  selected,
  onLocate,
}: {
  photo: CampusPhoto;
  data: CampusPayload;
  appId: string;
  selected: boolean;
  onLocate?: () => void;
}) {
  const [boxes, setBoxes] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const analysed = photo.room.status === "analysed";
  const aspect = photo.room.image ? `${photo.room.image[0]} / ${photo.room.image[1]}` : photo.width && photo.height ? `${photo.width} / ${photo.height}` : "4 / 3";
  const geoTone = photo.geotag === "outside" ? "text-mismatch-fg" : photo.geotag === "within" ? "text-verified-fg" : "text-ink-3";
  const credit = photo.attribution;
  const toggle = (g: string) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  const counts = useMemo(() => (photo.room.detections ?? []).filter((d) => d.group !== "person").length, [photo.room.detections]);

  return (
    <article
      id={`photo-${photo.document_id}`}
      aria-label={`Photo ${photo.filename}`}
      className={cn(
        "scroll-mt-32 rounded-card border bg-surface shadow-sm transition-[border-color,box-shadow] duration-300",
        selected ? "border-brand-300 shadow-md ring-2 ring-brand-200/60" : "border-line",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Camera aria-hidden className="size-4 shrink-0 text-ink-3" />
          <h3 className="truncate font-mono text-sm font-semibold text-ink">{photo.filename}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {photo.findings.map((f) => (
            <Link
              key={f.id}
              to={appPath(appId, "findings", { finding: f.id })}
              className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 text-xs font-medium text-ink-2 hover:border-brand-200 hover:text-ink"
            >
              <SeverityMeter severity={f.severity} />
              {f.code}
            </Link>
          ))}
        </div>
      </header>
      <div className="grid gap-5 px-5 pb-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-[12px] border border-line bg-surface-2" style={{ aspectRatio: aspect }}>
            <img src={api.photoUrl(photo.document_id, "preview")} alt={`Photo ${photo.filename}`} loading="lazy" className="absolute inset-0 size-full object-cover" />
            {analysed && <Detections photo={photo} show={boxes} hidden={hidden} />}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {analysed ? (
              <Switch checked={boxes} onChange={setBoxes} label={`Detection boxes (${counts})`} />
            ) : (
              <span className="text-xs text-ink-3">No detection boxes: photo not analysed</span>
            )}
            {onLocate && photo.exif.gps && (
              <button type="button" onClick={onLocate} className="inline-flex h-7 items-center gap-1 rounded-[7px] bg-brand-soft px-2 text-xs font-medium text-brand-ink hover:bg-brand-100">
                <Crosshair aria-hidden className="size-3.5" /> Locate on map
              </button>
            )}
          </div>
          {credit && <Credit credit={credit} />}
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <PaneLabel>Capture metadata (EXIF)</PaneLabel>
            <dl className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 gap-y-1 text-xs">
              <Row k="Captured">{fmtExifTime(photo.exif.captured) ?? "Not recorded"}</Row>
              <Row k="Camera">{photo.exif.camera ?? "Not recorded"}</Row>
              {photo.exif.software && <Row k="Software">{photo.exif.software}</Row>}
              <Row k="Geotag">
                {photo.exif.gps ? (
                  <span className="inline-flex flex-wrap items-center gap-x-2">
                    <span className="font-mono">{photo.exif.gps.map((v) => v.toFixed(5)).join(", ")}</span>
                    <span className={cn("inline-flex items-center gap-1 font-semibold", geoTone)}>
                      <MapPin aria-hidden className="size-3" />
                      {fmtKm(photo.distance_km)} from campus on record
                      {photo.geotag === "outside" ? `, beyond ${data.threshold_km} km` : ""}
                    </span>
                    {photo.distance_declared_km !== null && <span className="text-ink-3">({fmtKm(photo.distance_declared_km)} from the declared map point)</span>}
                  </span>
                ) : (
                  "No GPS position in the file"
                )}
              </Row>
            </dl>
          </div>

          <div>
            <PaneLabel>Reuse across applications</PaneLabel>
            {photo.reuse.length === 0 ? (
              <p className="text-xs text-ink-3">No near-identical photo in other applications this year.</p>
            ) : (
              <ul className="space-y-2">
                {photo.reuse.map((r) => (
                  <li key={r.finding_id} className="flex gap-2.5 rounded-[10px] border border-line bg-surface-2/60 p-2">
                    {r.peer_document_id && (
                      <img src={api.photoUrl(r.peer_document_id)} alt={`Matching photo in ${r.other_application}`} className="h-12 w-16 shrink-0 rounded-[6px] object-cover" loading="lazy" />
                    )}
                    <div className="min-w-0 text-xs">
                      <p className="flex items-center gap-1 font-semibold text-ink">
                        <Copy aria-hidden className="size-3.5 text-ink-3" />
                        {r.direction === "later" ? "Also submitted later by" : "Matches an earlier submission by"} {r.other_institution}
                      </p>
                      {r.other_application && (
                        <Link to={appPath(r.other_application, "campus")} className="font-mono text-brand-ink underline-offset-2 hover:underline">
                          {r.other_application}
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Credentials c={photo.c2pa} />
          <Room photo={photo} labels={data.room_labels} groupLabels={data.group_labels} hidden={hidden} onToggle={toggle} />
        </div>
      </div>
      {analysed && photo.room.room_type && (
        <div className="px-5 pb-5">
          <CautionNote title="Detector indicator">
            Counts come from an object detector and never decide anything. Furniture can be hidden or misread, and one photo rarely shows a whole room. Confirm during inspection.
          </CautionNote>
        </div>
      )}
    </article>
  );
}

