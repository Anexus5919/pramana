import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useId, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { fmtDate } from "../../../lib/format";
import { workspacePath } from "../../../shell/nav";
import { cn, EmptyState, Panel, SimulatedTag, Skeleton } from "../../../ui2";
import { useWorkspace } from "../context";
import { useProofInsights, type Coverage, type CoverageAlternative, type CoverageCert, type CoverageStatus } from "./api";

const DAY = 86_400_000;
const ROW_H = 72;
const HEAD_H = 44;
const FOOT_H = 28;

function ms(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function addMonths(t: number, n: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
}

/** Time window: from a little before the earliest date that matters to six months past the session. */
function domain(c: Coverage): [number, number] {
  const asOf = ms(c.as_of);
  const early = c.certificates
    .flatMap((x) => [x.end.date, ...x.alternatives.map((a) => a.date)])
    .filter((d): d is string => !!d)
    .map(ms)
    .filter((t) => t < asOf);
  const lo = Math.max(Math.min(asOf, ...early) - 90 * DAY, asOf - 730 * DAY);
  const hi = ms(c.session.end) + 183 * DAY;
  return [addMonths(lo, 0), addMonths(hi, 1)];
}

const HEADLINE_TONE: Record<CoverageStatus, string> = {
  covers_session: "text-ink-3",
  expires_in_session: "text-expired-fg",
  lapses_before_session: "text-mismatch-fg",
  expired_at_submission: "text-mismatch-fg",
  unknown: "text-manual-fg",
};

const GAP_TONE: Partial<Record<CoverageStatus, string>> = {
  expires_in_session: "text-expired-dot border-expired-dot bg-expired-bg",
  lapses_before_session: "text-mismatch-dot border-mismatch-dot bg-mismatch-bg",
  expired_at_submission: "text-mismatch-dot border-mismatch-dot bg-mismatch-bg",
};

const CAP_TONE: Record<CoverageStatus, string> = {
  covers_session: "bg-verified-dot",
  expires_in_session: "bg-expired-dot",
  lapses_before_session: "bg-mismatch-dot",
  expired_at_submission: "bg-mismatch-dot",
  unknown: "bg-manual-dot",
};

function monthsBetween(a: number, b: number): number {
  return Math.max(0, Math.round((b - a) / (30.44 * DAY)));
}

function Hatch({ id }: { id: string }) {
  return (
    <svg aria-hidden className="absolute inset-0 size-full">
      <defs>
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="2" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} opacity="0.55" />
    </svg>
  );
}

/** A label pinned to an x position that stays inside the track. */
function pinStyle(pct: number): CSSProperties {
  if (pct < 12) return { left: `${pct}%` };
  if (pct > 88) return { right: `${100 - pct}%` };
  return { left: `${pct}%`, transform: "translateX(-50%)" };
}

function altLabel(a: CoverageAlternative): string {
  return a.kind === "page_overlay" ? `Page shows ${fmtDate(a.date)}` : `${a.source} ${fmtDate(a.date)}`;
}

function CertRow({ c, x, top, cov, hatchId }: { c: CoverageCert; x: (iso: string) => number; top: number; cov: Coverage; hatchId: string }) {
  const { app, openDoc } = useWorkspace();
  const start = c.start.date ? x(c.start.date) : x(cov.as_of);
  const end = c.end.date ? x(c.end.date) : 100;
  const sStart = x(cov.session.start);
  const sEnd = x(cov.session.end);
  const gapFrom = Math.max(end, sStart);
  const gapTone = GAP_TONE[c.status];
  const clippedRight = !!c.end.date && end >= 100;
  const uncovered = c.end.date && gapTone ? monthsBetween(Math.max(ms(c.end.date), ms(cov.session.start)), ms(cov.session.end)) : 0;
  const diffs = c.alternatives.filter((a) => a.differs && a.date);
  const barLabel = `${c.label}: valid ${c.start.date ? `from ${fmtDate(c.start.date)} ` : ""}${c.end.date ? `until ${fmtDate(c.end.date)}` : "with no readable end date"}. ${c.headline}.${c.end.page ? " Show the validity date on the page." : ""}`;
  return (
    <div className="absolute inset-x-0" style={{ top, height: ROW_H }}>
      {/* Valid window */}
      {c.end.date ? (
        <button
          type="button"
          aria-label={barLabel}
          onClick={() => openDoc({ docId: c.document_id, page: c.end.page, bbox: c.end.bbox, label: c.end.basis === "rule" ? "Issue date" : "Valid until" })}
          className="group/bar absolute top-[30px] h-3 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          style={{ left: `${start}%`, width: `${Math.max(0.6, end - start)}%` }}
        >
          <span aria-hidden className="absolute inset-0 rounded-[3px] bg-ink-4/35 transition-colors duration-150 group-hover/bar:bg-ink-4/55 motion-reduce:transition-none" />
          {clippedRight && <ChevronRight aria-hidden className="absolute top-1/2 -right-1 size-3.5 -translate-y-1/2 text-ink-3" />}
        </button>
      ) : (
        <button
          type="button"
          aria-label={barLabel}
          onClick={() => openDoc({ docId: c.document_id })}
          className="absolute top-[30px] h-3 rounded-[3px] border border-dashed border-manual-dot outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          style={{ left: `${start}%`, right: 0 }}
        />
      )}
      {/* End cap and its date */}
      {c.end.date && !clippedRight && (
        <>
          <span aria-hidden className={cn("absolute top-[25px] h-[22px] w-[3px] -translate-x-1/2 rounded-full", CAP_TONE[c.status])} style={{ left: `${end}%` }} />
          <span
            aria-hidden
            className={cn("absolute top-2.5 rounded-[3px] px-1 text-xs whitespace-nowrap text-ink-2", end > sStart && end < sEnd ? "bg-surface-2" : "bg-surface")}
            // Before the submission line the date sits to the left of its cap, clear of the line
            style={c.end.date < cov.as_of && end > 12 ? { right: `${100 - end}%`, marginRight: 6 } : pinStyle(end)}
          >
            {c.end.basis === "rule" ? `${fmtDate(c.end.date)} (by rule)` : fmtDate(c.end.date)}
          </span>
        </>
      )}
      {clippedRight && (
        <span aria-hidden className="absolute top-2.5 right-0 text-xs whitespace-nowrap text-ink-3">
          until {fmtDate(c.end.date)}
        </span>
      )}
      {/* The part of the session the certificate does not cover */}
      {gapTone && c.end.date && gapFrom < sEnd && (
        <>
          <span aria-hidden className={cn("absolute top-[30px] h-3 overflow-hidden rounded-[3px] border", gapTone)} style={{ left: `${gapFrom}%`, width: `${sEnd - gapFrom}%` }}>
            <Hatch id={hatchId} />
          </span>
          <span
            aria-hidden
            className={cn("absolute top-[46px] rounded-[3px] bg-surface-2 px-1 text-xs font-medium whitespace-nowrap", HEADLINE_TONE[c.status])}
            style={pinStyle((gapFrom + sEnd) / 2)}
          >
            Session not covered for {uncovered} {uncovered === 1 ? "month" : "months"}
          </span>
        </>
      )}
      {/* Other sources that give a different date */}
      {diffs.map((a, i) => {
        const ax = x(a.date!);
        const inner = (
          <span aria-hidden className="block size-2.5 rotate-45 border-2 border-mismatch-dot bg-surface" />
        );
        const lab = altLabel(a);
        const cls = "absolute top-[23px] grid size-5 -translate-x-1/2 place-items-center rounded-full outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand-500";
        return (
          <span key={i}>
            {a.kind === "page_overlay" && c.end.date && ax > end && (
              <span aria-hidden className="absolute top-[30px] h-3 rounded-[3px] border border-dashed border-mismatch-dot/70" style={{ left: `${end}%`, width: `${ax - end}%` }} />
            )}
            {a.kind === "page_overlay" ? (
              <button
                type="button"
                className={cls}
                style={{ left: `${ax}%`, top: 26 }}
                aria-label={`${lab}, drawn over the original. Show on the page.`}
                onClick={() => openDoc({ docId: c.document_id, page: a.page, bbox: a.bbox, label: "Drawn over the validity date" })}
              >
                {inner}
              </button>
            ) : a.attempt_id ? (
              <Link className={cls} style={{ left: `${ax}%`, top: 26 }} aria-label={`${lab}. Open the verification attempt.`} to={workspacePath(app.id, "documents", { view: "verification", attempt: a.attempt_id })}>
                {inner}
              </Link>
            ) : (
              <span className={cls} style={{ left: `${ax}%`, top: 26 }}>
                {inner}
              </span>
            )}
            <span
              aria-hidden
              className={cn("absolute top-2.5 rounded-[3px] px-1 text-xs font-medium whitespace-nowrap text-mismatch-fg", ax > sStart && ax <= sEnd ? "bg-surface-2" : "bg-surface")}
              style={pinStyle(ax)}
            >
              {lab}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function Timeline({ cov }: { cov: Coverage }) {
  const { app } = useWorkspace();
  const base = useId().replace(/:/g, "");
  const [lo, hi] = domain(cov);
  const x = (iso: string) => Math.max(0, Math.min(100, ((ms(iso) - lo) / (hi - lo)) * 100));
  const sStart = x(cov.session.start);
  const sEnd = x(cov.session.end);
  const asOf = x(cov.as_of);
  const today = ms(cov.today) >= lo && ms(cov.today) <= hi ? x(cov.today) : null;
  const ticks: { t: number; label: string }[] = [];
  for (let t = lo; t <= hi; t = addMonths(t, 1)) {
    const d = new Date(t);
    if (d.getUTCMonth() % 3 === 0) ticks.push({ t, label: d.toLocaleString("en-IN", { month: "short", timeZone: "UTC" }) + (d.getUTCMonth() === 0 ? ` ${d.getUTCFullYear()}` : "") });
  }
  const pct = (t: number) => ((t - lo) / (hi - lo)) * 100;
  const height = HEAD_H + cov.certificates.length * ROW_H + FOOT_H;

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <div className="flex min-w-[720px] gap-6">
        {/* Certificate labels */}
        <ul className="w-56 shrink-0" style={{ paddingTop: HEAD_H }} aria-label="Time-bound certificates">
          {cov.certificates.map((c) => {
            const agree = c.alternatives.filter((a) => !a.differs && a.date);
            return (
              <li key={c.doc_type} className="flex flex-col justify-center" style={{ height: ROW_H }}>
                <span className="truncate text-sm font-medium text-ink" title={c.label}>
                  {c.label}
                </span>
                <span className={cn("text-xs", HEADLINE_TONE[c.status], c.status !== "covers_session" && "font-medium")}>{c.headline}</span>
                {agree.length > 0 && !c.conflict && (
                  <span className="text-xs text-ink-3">
                    {agree
                      .map((a, i) => {
                        const name = a.source.replace(/\s*\(.*\)$/, "");
                        return i === 0 ? name : name.toLowerCase().replace(/^qr/, "QR").replace(/ qr$/, " QR");
                      })
                      .join(" and ")}{" "}
                    agree
                  </span>
                )}
                {c.finding_id && (
                  <Link to={workspacePath(app.id, "findings", { finding: c.finding_id })} className="inline-flex w-fit items-center gap-0.5 rounded text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline">
                    Open finding
                    <ArrowUpRight aria-hidden className="size-3" />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        {/* Time axis */}
        <div className="relative min-w-0 flex-1" style={{ height }}>
          <div aria-hidden className="absolute rounded-[4px] border-x border-dashed border-line-2 bg-surface-2" style={{ left: `${sStart}%`, width: `${sEnd - sStart}%`, top: 20, bottom: FOOT_H }} />
          <span aria-hidden className="absolute top-0 text-xs font-medium whitespace-nowrap text-ink-2" style={pinStyle((sStart + sEnd) / 2)}>
            Assumed session {cov.session.label}
          </span>
          <span aria-hidden className="absolute w-px bg-ink-2" style={{ left: `${asOf}%`, top: 20, bottom: FOOT_H }} />
          <span aria-hidden className="absolute top-[22px] pl-1.5 text-xs whitespace-nowrap text-ink-2" style={{ left: `${asOf}%` }}>
            Submitted
          </span>
          {today !== null && (
            <>
              <span aria-hidden className="absolute border-l border-dotted border-ink-3" style={{ left: `${today}%`, top: 20, bottom: FOOT_H }} />
              <span aria-hidden className="absolute top-[22px] pl-1.5 text-xs whitespace-nowrap text-ink-3" style={{ left: `${today}%` }}>
                Today
              </span>
            </>
          )}
          {cov.certificates.map((c, i) => (
            <CertRow key={c.doc_type} c={c} x={x} cov={cov} top={HEAD_H + i * ROW_H} hatchId={`${base}-h${i}`} />
          ))}
          <div aria-hidden className="absolute inset-x-0 border-t border-line" style={{ bottom: FOOT_H }} />
          {ticks.map((tk) => (
            <span key={tk.t} aria-hidden className="absolute" style={{ left: `${pct(tk.t)}%`, bottom: 0, height: FOOT_H }}>
              <span className="absolute top-0 left-0 h-1.5 w-px bg-line-2" />
              <span
                className={cn(
                  "absolute top-2 text-xs whitespace-nowrap text-ink-3",
                  pct(tk.t) > 96 ? "right-0" : pct(tk.t) < 3 ? "left-0" : "left-0 -translate-x-1/2",
                )}
              >
                {tk.label}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<CoverageStatus, string> = {
  covers_session: "Covers the session",
  expires_in_session: "Expires during the session",
  lapses_before_session: "Lapses before the session",
  expired_at_submission: "Expired at submission",
  unknown: "No validity date read",
};

function SourcesTable({ cov }: { cov: Coverage }) {
  return (
    <details className="group border-t border-line pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-ink-3 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
        Dates by source
      </summary>
      <div className="mt-3 overflow-x-auto rounded-control border border-line">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Validity of each time-bound certificate by source, against the submission date {fmtDate(cov.as_of)} and the assumed {cov.session.label} session from{" "}
            {fmtDate(cov.session.start)} to {fmtDate(cov.session.end)}
          </caption>
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-xs text-ink-3">
              <th scope="col" className="h-8 px-3 font-medium">
                Certificate
              </th>
              <th scope="col" className="h-8 px-3 font-medium">
                Source
              </th>
              <th scope="col" className="h-8 px-3 font-medium">
                Valid from
              </th>
              <th scope="col" className="h-8 px-3 font-medium">
                Valid until
              </th>
              <th scope="col" className="h-8 px-3 font-medium">
                Against the session
              </th>
            </tr>
          </thead>
          <tbody>
            {cov.certificates.flatMap((c) => [
              <tr key={c.doc_type} className="border-b border-line align-top">
                <th scope="row" rowSpan={1 + c.alternatives.length} className="px-3 py-2 text-left font-medium text-ink">
                  {c.label}
                </th>
                <td className="px-3 py-2 text-ink-2">{c.end.basis === "rule" ? `Issue date plus rule ${c.end.rule?.id ?? ""}` : "Document text, as the checks read it"}</td>
                <td className="px-3 py-2 font-mono text-ink">{c.start.date ? fmtDate(c.start.date) : "Not read"}</td>
                <td className="px-3 py-2 font-mono text-ink">{c.end.date ? fmtDate(c.end.date) : "Not read"}</td>
                <td className={cn("px-3 py-2", HEADLINE_TONE[c.status])}>{STATUS_TEXT[c.status]}</td>
              </tr>,
              ...c.alternatives.map((a, i) => (
                <tr key={`${c.doc_type}-${i}`} className="border-b border-line align-top last:border-b-0">
                  <td className="px-3 py-2 text-ink-2">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {a.source}
                      {a.simulated && <SimulatedTag />}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-3">Not given</td>
                  <td className={cn("px-3 py-2 font-mono", a.differs ? "font-medium text-mismatch-fg" : "text-ink")}>
                    {a.date ? fmtDate(a.date) : "Not given"}
                    {a.differs && <span className="ml-1.5 font-sans text-xs">differs</span>}
                  </td>
                  <td className={cn("px-3 py-2", HEADLINE_TONE[a.status])}>{STATUS_TEXT[a.status]}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Each time-bound certificate against the submission date and the academic session being approved. */
export function CoverageCalendar() {
  const { app } = useWorkspace();
  const latest = app.latest_run;
  const q = useProofInsights(app.id, latest?.id);
  const cov = q.data?.coverage ?? null;
  if (!latest) return null;
  return (
    <Panel
      title="Certificate coverage"
      description="Validity is checked on the submission date. This shows whether each time-bound certificate also lasts through the session being approved."
    >
      {q.isPending ? (
        <div role="status" className="space-y-2">
          <span className="sr-only">Loading certificate coverage</span>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-40" />
        </div>
      ) : !cov || cov.certificates.length === 0 ? (
        <EmptyState size="sm" title="No time-bound certificate" description="None of the uploaded documents carries a validity period." />
      ) : (
        <div className="space-y-4">
          <p className="text-base text-pretty text-ink">{cov.summary}</p>
          <Timeline cov={cov} />
          {cov.open_ended.length > 0 && (
            <ul className="space-y-1 text-xs text-ink-3">
              {cov.open_ended.map((o) => (
                <li key={o.doc_type}>
                  {o.label}: issued {o.issued.date ? fmtDate(o.issued.date) : "on an unread date"}. {o.note}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-3">
            Session dates ({fmtDate(cov.session.start)} to {fmtDate(cov.session.end)}) are an assumption set in the ruleset as configuration, not handbook law. Select a
            bar to see the validity date on the page.
          </p>
          <SourcesTable cov={cov} />
        </div>
      )}
    </Panel>
  );
}
