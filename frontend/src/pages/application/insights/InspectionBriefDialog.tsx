import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { request } from "../../../api";
import { workspacePath } from "../../../shell/nav";
import { buttonStyles, Callout, Dialog, SeverityIndicator, Skeleton } from "../../../ui2";
import type { Severity } from "../../../types";

// Mirrors backend/pramana/insights/inspection.py

interface BriefFinding {
  id: string;
  code: string;
  title: string;
  severity: Severity;
  category: string;
}

interface GeoPoint {
  lat: number;
  lon: number;
  distance_km?: number | null;
}

export interface InspectionBrief {
  application_id: string;
  institution: string;
  aicte_id: string;
  category: string;
  academic_year: string;
  round: number;
  address: string;
  run_id: string | null;
  prepared_at: string;
  summary: string;
  note: string;
  footer: string;
  originals: { document_id: string; label: string; filename: string; severity: Severity; ask: string; findings: BriefFinding[] }[];
  count: { what: string; declared: string; evidence: string; how: string; document_id: string | null }[];
  retake: { document_id: string; filename: string; facility: string | null; why: string[] }[];
  questions: { question: string; finding: BriefFinding }[];
  gps: {
    record: GeoPoint | null;
    declared: GeoPoint | null;
    threshold_km: number | null;
    photos: { document_id: string; filename: string; gps: [number, number] | null; distance_km: number | null; geotag: string }[];
  };
}

const enc = encodeURIComponent;

/** Where to go: the campus on record at the centre, rings at the geotag threshold, photos by bearing. Far points sit on the outer ring with their real distance. */
function GeoPlot({ gps }: { gps: InspectionBrief["gps"] }) {
  const rec = gps.record;
  if (!rec) return <p className="text-sm text-ink-3">No campus point is on record, so there is no point to plot.</p>;
  const size = 240;
  const c = size / 2;
  const thr = gps.threshold_km ?? 2;
  const reach = thr * 2;
  const scale = (size / 2 - 22) / reach;
  const place = (lat: number, lon: number) => {
    const dx = (lon - rec.lon) * 111.32 * Math.cos((rec.lat * Math.PI) / 180);
    const dy = (lat - rec.lat) * 110.57;
    const d = Math.hypot(dx, dy);
    if (d <= reach || d === 0) return { x: c + dx * scale, y: c - dy * scale, off: false };
    return { x: c + (dx / d) * reach * scale, y: c - (dy / d) * reach * scale, off: true };
  };
  const dec = gps.declared ? place(gps.declared.lat, gps.declared.lon) : null;
  const photos = gps.photos.filter((p) => p.gps);
  const desc = [
    `Campus point on record at ${rec.lat.toFixed(5)}, ${rec.lon.toFixed(5)}.`,
    gps.declared ? `Declared map point ${gps.declared.distance_km ?? "?"} km away.` : "",
    ...photos.map((p) => `${p.filename}: ${p.distance_km ?? "?"} km from the campus${p.geotag === "outside" ? ", outside the threshold" : ""}.`),
  ].join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={desc} className="h-auto w-full max-w-[240px] shrink-0">
      <circle cx={c} cy={c} r={reach * scale} className="fill-surface-2 stroke-line-2" strokeDasharray="3 3" />
      <circle cx={c} cy={c} r={thr * scale} className="fill-surface stroke-line-2" />
      <text x={c + thr * scale * 0.72 + 3} y={c - thr * scale * 0.72 - 3} className="fill-ink-3 text-xs">
        {thr} km
      </text>
      <text x={c + reach * scale * 0.72 + 2} y={c - reach * scale * 0.72 - 2} className="fill-ink-3 text-xs">
        {reach} km
      </text>
      <text x={c} y={12} textAnchor="middle" className="fill-ink-4 text-xs">
        N
      </text>
      {dec && <path d={`M${dec.x} ${dec.y - 6}l6 6-6 6-6-6z`} className="fill-surface stroke-ink-2" strokeWidth="1.5" />}
      {photos.map((p) => {
        const pt = place(p.gps![0], p.gps![1]);
        const far = p.geotag === "outside";
        return (
          <g key={p.document_id}>
            <circle cx={pt.x} cy={pt.y} r={5} className={far ? "fill-mismatch-dot stroke-surface" : "fill-ink-3 stroke-surface"} strokeWidth="1.5" />
            {pt.off && (
              <text x={pt.x + (pt.x < c ? -8 : 8)} y={pt.y + 4} textAnchor={pt.x < c ? "end" : "start"} className="fill-mismatch-fg text-xs font-medium">
                {Math.round(p.distance_km ?? 0)} km
              </text>
            )}
          </g>
        );
      })}
      <rect x={c - 5} y={c - 5} width={10} height={10} rx={1.5} className="fill-ink stroke-surface" strokeWidth="1.5" />
    </svg>
  );
}

function H({ children }: { children: string }) {
  return <h3 className="mt-6 mb-2 text-sm font-semibold text-ink first:mt-0">{children}</h3>;
}

/** A printable site-visit brief for the Expert Visit Committee, prepared on demand and audited. Officers only. */
export function InspectionBriefDialog({ appId, open, onClose }: { appId: string; open: boolean; onClose: () => void }) {
  const m = useMutation({ mutationFn: () => request<InspectionBrief>("POST", `/applications/${enc(appId)}/inspection-brief`, {}) });
  const { mutate, reset } = m;
  useEffect(() => {
    if (open) mutate();
    else reset();
  }, [open, mutate, reset]);
  const b = m.data;
  const docLink = (id: string) => workspacePath(appId, "documents", { doc: id });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="Inspection brief"
      description="For the Expert Visit Committee: what to see, count and ask on site, drawn from the open findings. A brief, not a decision."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-ink-3">Preparing a brief is recorded in the audit log.</span>
          <a href={`/api/applications/${enc(appId)}/inspection-brief.pdf`} download className={buttonStyles("primary", "md")} aria-disabled={!b}>
            <Download aria-hidden className="size-4" />
            Download PDF
          </a>
        </div>
      }
    >
      {m.isPending && (
        <div role="status" className="space-y-3">
          <span className="sr-only">Preparing the brief</span>
          <Skeleton className="h-16" />
          <Skeleton className="h-48" />
        </div>
      )}
      {m.isError && <Callout tone="danger" title="Could not prepare the brief">{String((m.error as Error).message)}</Callout>}
      {b && (
        <div className="text-sm text-ink-2">
          <p className="text-xs text-ink-3">
            {b.institution} ({b.aicte_id}), {b.address}. Application {b.application_id}, round {b.round}, from run {b.run_id}.
          </p>
          <p className="mt-2 text-base text-ink text-pretty">{b.summary}</p>

          <H>Original documents to ask for</H>
          {b.originals.length === 0 ? (
            <p className="text-ink-3">No document needs its original on the evidence so far.</p>
          ) : (
            <ul className="divide-y divide-line rounded-card border border-line">
              {b.originals.map((o) => (
                <li key={o.document_id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityIndicator severity={o.severity} />
                    <Link to={docLink(o.document_id)} onClick={onClose} className="font-medium text-ink hover:underline">
                      {o.label}
                    </Link>
                    <span className="font-mono text-xs text-ink-3">{o.filename}</span>
                  </div>
                  <p className="text-pretty">{o.ask}</p>
                  <p className="text-xs text-ink-3 text-pretty">Because: {o.findings.map((f) => f.title).join("; ")}.</p>
                </li>
              ))}
            </ul>
          )}

          <H>What to count or see on site</H>
          <div className="overflow-x-auto rounded-card border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">Items to count or see on site, with what was declared</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th scope="col" className="h-9 px-4 font-medium">
                    Item
                  </th>
                  <th scope="col" className="px-3 font-medium">
                    Declared
                  </th>
                  <th scope="col" className="px-3 font-medium">
                    Evidence so far
                  </th>
                  <th scope="col" className="px-4 font-medium">
                    On site
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {b.count.map((c) => (
                  <tr key={c.what} className="align-top">
                    <td className="px-4 py-2 font-medium text-ink">{c.what}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{c.declared}</td>
                    <td className="px-3 py-2 text-pretty">{c.evidence}</td>
                    <td className="px-4 py-2 text-ink-3 text-pretty">{c.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <H>Where to go</H>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <GeoPlot gps={b.gps} />
            <ul className="space-y-1.5 text-pretty">
              {b.gps.record && (
                <li>
                  <span className="font-medium text-ink">Campus point on record</span>{" "}
                  <span className="font-mono text-xs">
                    {b.gps.record.lat.toFixed(5)}, {b.gps.record.lon.toFixed(5)}
                  </span>
                </li>
              )}
              {b.gps.declared && (
                <li>
                  Declared on the satellite map{" "}
                  <span className="font-mono text-xs">
                    {b.gps.declared.lat.toFixed(5)}, {b.gps.declared.lon.toFixed(5)}
                  </span>
                  {b.gps.declared.distance_km != null && `, ${b.gps.declared.distance_km} km from the record`}
                </li>
              )}
              {b.gps.photos.map((p) => (
                <li key={p.document_id} className={p.geotag === "outside" ? "text-mismatch-fg" : undefined}>
                  {p.filename}: {p.gps ? `${p.distance_km} km from the campus` : "no geotag"}
                </li>
              ))}
              <li className="text-xs text-ink-3">
                Square: campus on record. Diamond: declared map point. Dots: photo geotags, red past {b.gps.threshold_km} km. Points beyond the outer ring sit on its edge
                with their real distance.
              </li>
            </ul>
          </div>

          <H>Photos to retake</H>
          {b.retake.length === 0 ? (
            <p className="text-ink-3">No photo needs retaking on the evidence so far.</p>
          ) : (
            <ul className="space-y-1.5">
              {b.retake.map((r) => (
                <li key={r.document_id} className="text-pretty">
                  <Link to={docLink(r.document_id)} onClick={onClose} className="font-medium text-ink hover:underline">
                    {r.filename}
                  </Link>
                  {r.facility && <span className="text-ink-3"> ({r.facility})</span>}: {r.why.join("; ")}
                </li>
              ))}
            </ul>
          )}

          <H>Questions to ask</H>
          <ol className="list-decimal space-y-1.5 pl-5 text-pretty">
            {b.questions.map((q) => (
              <li key={q.question}>{q.question}</li>
            ))}
          </ol>
          <p className="mt-6 border-t border-line pt-3 text-xs text-ink-3">
            {b.note} {b.footer}
          </p>
        </div>
      )}
    </Dialog>
  );
}
