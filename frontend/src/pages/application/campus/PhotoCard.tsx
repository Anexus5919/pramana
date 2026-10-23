import { Crosshair } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api";
import type { Tone } from "../../../lib/labels";
import { workspacePath } from "../../../shell/nav";
import type { CampusPayload, CampusPhoto, ContentCredentials, Detection } from "../../../types";
import { Button, Callout, cn, Code, DescriptionList, EvidenceClassLabel, Panel, SeverityIndicator, StatusBadge, Switch } from "../../../ui2";
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

/** Quiet marker for anything signed under the prototype's demo trust anchor. */
function DemoTag({ children = "Demo trust list" }: { children?: ReactNode }) {
  return (
    <span
      title="Signed with a demo trust anchor, not a production certificate authority"
      className="inline-flex h-5 shrink-0 items-center rounded-[4px] border border-dashed border-line-2 px-1.5 text-xs leading-none font-medium text-ink-3"
    >
      {children}
    </span>
  );
}

/** Small heading for a group inside a panel. */
function GroupHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium text-ink">{children}</h3>
      {aside}
    </div>
  );
}

function yesNo(v: boolean | null | undefined, yes: string, no: string): string {
  if (v === null || v === undefined) return "Not determined";
  return v ? yes : no;
}

/** Attribution carried in the sample photo's EXIF: "licence, file page URL". */
function Credit({ credit }: { credit: NonNullable<CampusPhoto["attribution"]> }) {
  const [licence, url] = (credit.copyright ?? "").split(/,\s*(?=https?:)/);
  return (
    <p className="mt-2 text-xs text-ink-3 text-pretty">
      Sample photo by {credit.artist ?? "unknown author"}, {licence || "licence not stated"}
      {url && (
        <>
          {" "}
          (
          <a href={url} target="_blank" rel="noopener noreferrer" className="rounded underline underline-offset-2 hover:text-ink">
            Wikimedia Commons file page
          </a>
          )
        </>
      )}
      . Capture metadata is synthetic demo data.
    </p>
  );
}

/** Content Credentials (C2PA) state and the signed manifest's details. Renders unboxed, for use inside a panel. */
export function Credentials({ c }: { c: ContentCredentials }) {
  const st = credentialState(c);
  return (
    <div className="min-w-0">
      <GroupHeading aside={c.present ? <DemoTag /> : undefined}>Content Credentials (C2PA)</GroupHeading>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
      </div>
      <p className="mt-1 text-sm text-ink-3 text-pretty">{st.detail}</p>
      {c.present && c.readable && (
        <DescriptionList
          className="mt-3"
          labelWidth={128}
          items={[
            { label: "Signature", value: yesNo(c.signature_valid, "Valid", "Does not validate") },
            { label: "Signed hash", value: yesNo(c.hash_matches, "File still matches", "File modified after capture") },
            { label: "Signer", value: [c.signer?.common_name, c.signer?.organization].filter(Boolean).join(", ") || "Not named" },
            {
              label: "Chain",
              value: (
                <ol className="space-y-0.5">
                  {(c.chain ?? []).map((x, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-1.5">
                      {i > 0 && <span className="text-ink-3">issued by</span>}
                      <span>{x.subject}</span>
                      {x.role.includes("DEMO") && <DemoTag>Demo anchor</DemoTag>}
                    </li>
                  ))}
                </ol>
              ),
            },
            { label: "Claim generator", value: c.claim_generator ?? "Not stated" },
            { label: "Capture time", value: fmtIsoLocal(c.capture_time) ?? "Not stated" },
            {
              label: "Actions",
              value:
                (c.actions ?? []).map((a) => `${(a.action ?? "").replace(/^c2pa\./, "")}${a.digital_source_type ? ` (${a.digital_source_type})` : ""}`).join(", ") ||
                "None recorded",
            },
            {
              label: "Validation",
              value: [...new Set((c.failures ?? []).map((f) => f.code))].join(", "),
              mono: true,
              hidden: !(c.failures ?? []).length,
            },
          ]}
        />
      )}
      {c.present && (
        <p className="mt-2 text-xs text-ink-3">
          Checked with {c.library ?? "c2pa-python"} against {c.trust_list ?? "no trust list"}.
        </p>
      )}
    </div>
  );
}

function Detections({ photo, hidden }: { photo: CampusPhoto; hidden: Set<string> }) {
  const dets = (photo.room.detections ?? []).filter((d) => d.group !== "person" && !hidden.has(d.group));
  return (
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      {dets.map((d: Detection, i) => {
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
  );
}

function Room({
  photo,
  labels,
  groupLabels,
  hidden,
  onToggle,
}: {
  photo: CampusPhoto;
  labels: Record<string, string>;
  groupLabels: Record<string, string>;
  hidden: Set<string>;
  onToggle: (g: string) => void;
}) {
  const r = photo.room;
  const fac = photo.declared_facility;
  return (
    <div className="min-w-0">
      <GroupHeading aside={<EvidenceClassLabel cls="model" />}>Room check</GroupHeading>
      {r.status !== "analysed" ? (
        <p className="text-sm text-ink-2">
          Not analysed. <span className="text-ink-3">{r.reason}</span>
        </p>
      ) : (
        <>
          <p className="text-sm text-ink">
            Reads as <span className="font-medium">{labels[r.room_type ?? "unclear"] ?? r.room_type}</span>
            <span className="text-ink-3">, from {r.room_basis}.</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Detected objects. Press one to hide or show its boxes.">
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
                    "inline-flex h-7 items-center gap-1.5 rounded-control border px-2 text-xs transition-colors duration-150",
                    off ? "border-line text-ink-3" : "border-line-2 bg-surface text-ink-2 hover:bg-surface-2",
                    !boxed && "cursor-default",
                  )}
                >
                  {boxed && <span aria-hidden className="size-2 rounded-[2px]" style={{ background: off ? "var(--line-2)" : GROUP_COLOR[g] }} />}
                  <span className="font-medium text-ink tabular-nums">{r.counts?.[g]}</span> {groupLabels[g] ?? g}
                </button>
              );
            })}
          </div>
          {fac ? (
            <p className="mt-2 text-sm text-ink-2 text-pretty">
              Declared as <span className="font-medium text-ink">{fac.name ?? "a facility"}</span>
              {fac.room_type ? ` (${(labels[fac.room_type] ?? fac.room_type).toLowerCase()})` : ""}
              {fac.workstations ? `, ${fac.workstations} workstations` : ""}. Counted {r.counts?.workstation ?? 0} visible workstations. A photo may not show the whole
              room.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-3">No declared facility points at this photo, so nothing is compared.</p>
          )}
          <p className="mt-1.5 text-xs text-ink-3">
            {r.model?.name} ({r.model?.classes} classes, {r.model?.licence}) on {r.model?.runtime}, {r.latency_ms} ms. Partitions can read as chairs; the detector has no desk or
            monitor class.
          </p>
        </>
      )}
    </div>
  );
}

/** One photo as a panel: the image with detection boxes, then EXIF, reuse, Content Credentials and the room check. */
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
  const credit = photo.attribution;
  const toggle = (g: string) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  const counts = useMemo(() => (photo.room.detections ?? []).filter((d) => d.group !== "person").length, [photo.room.detections]);
  const gps = photo.exif.gps;

  return (
    <Panel
      id={`photo-${photo.document_id}`}
      className={cn("scroll-mt-24", selected && "ring-2 ring-brand-300")}
      title={<Code className="text-base font-semibold text-ink">{photo.filename}</Code>}
      actions={
        onLocate && gps ? (
          <Button size="sm" variant="ghost" leadingIcon={<Crosshair />} onClick={onLocate}>
            Locate on map
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-control border border-line bg-surface-2" style={{ aspectRatio: aspect }}>
            <img src={api.photoUrl(photo.document_id, "preview")} alt={`Photo ${photo.filename}`} loading="lazy" className="absolute inset-0 size-full object-cover" />
            {analysed && boxes && <Detections photo={photo} hidden={hidden} />}
          </div>
          <div className="mt-3">
            {analysed ? (
              <Switch checked={boxes} onChange={setBoxes} label={`Detection boxes (${counts})`} />
            ) : (
              <span className="text-sm text-ink-3">No detection boxes: the photo was not analysed.</span>
            )}
          </div>
          {credit && <Credit credit={credit} />}
        </div>

        <div className="min-w-0 space-y-6">
          {photo.findings.length > 0 && (
            <div>
              <GroupHeading>Findings on this photo</GroupHeading>
              <ul className="-mx-2 divide-y divide-line">
                {photo.findings.map((f) => (
                  <li key={f.id}>
                    <Link
                      to={workspacePath(appId, "findings", { finding: f.id })}
                      className="flex items-center gap-2 rounded px-2 py-2 text-sm transition-colors duration-150 hover:bg-surface-2"
                    >
                      <SeverityIndicator severity={f.severity} showLabel={false} />
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">{f.title}</span>
                      <Code className="shrink-0 text-xs">{f.code}</Code>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <GroupHeading>Capture metadata (EXIF)</GroupHeading>
            <DescriptionList
              labelWidth={128}
              items={[
                { label: "Captured", value: fmtExifTime(photo.exif.captured) ?? "Not recorded" },
                { label: "Camera", value: photo.exif.camera ?? "Not recorded" },
                { label: "Software", value: photo.exif.software, hidden: !photo.exif.software },
                {
                  label: "Geotag",
                  value: gps ? (
                    <span className="block">
                      <Code className="text-sm">{gps.map((v) => v.toFixed(5)).join(", ")}</Code>
                      <span className="block">
                        {fmtKm(photo.distance_km)} from the campus on record
                        {photo.geotag === "outside" ? `, beyond the ${data.threshold_km} km threshold` : ""}
                      </span>
                      {photo.distance_declared_km !== null && (
                        <span className="block text-ink-3">{fmtKm(photo.distance_declared_km)} from the declared map point</span>
                      )}
                    </span>
                  ) : (
                    "No GPS position in the file"
                  ),
                },
              ]}
            />
          </div>

          <div>
            <GroupHeading>Reuse across applications</GroupHeading>
            {photo.reuse.length === 0 ? (
              <p className="text-sm text-ink-3">No near-identical photo in other applications this year.</p>
            ) : (
              <ul className="divide-y divide-line">
                {photo.reuse.map((r) => (
                  <li key={r.finding_id} className="flex gap-3 py-2 first:pt-0 last:pb-0">
                    {r.peer_document_id && (
                      <img
                        src={api.photoUrl(r.peer_document_id)}
                        alt={`Matching photo in ${r.other_application ?? "another application"}`}
                        className="h-12 w-16 shrink-0 rounded-[4px] border border-line object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0 text-sm">
                      <p className="text-ink">
                        {r.direction === "later" ? "Also submitted later by" : "Matches an earlier submission by"} {r.other_institution}
                      </p>
                      {r.other_application && (
                        <Link to={workspacePath(r.other_application, "comparisons", { view: "campus" })} className="rounded text-ink-2 underline-offset-2 hover:underline">
                          <Code className="text-xs">{r.other_application}</Code>
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
          {analysed && photo.room.room_type && (
            <Callout tone="neutral" title="Detector indicator">
              Counts come from an object detector and never decide anything. Furniture can be hidden or misread, and one photo rarely shows a whole room. Confirm during
              inspection.
            </Callout>
          )}
        </div>
      </div>
    </Panel>
  );
}
