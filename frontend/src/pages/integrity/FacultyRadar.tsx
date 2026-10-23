import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowUpRight, FileSearch, Landmark } from "lucide-react";
import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { pluralize } from "../../lib/format";
import { workspacePath } from "../../shell/nav";
import { Callout, cn, Code, EmptyState, ErrorState, Panel, SeverityIndicator, Skeleton, Stat, StatGroup } from "../../ui2";
import type { FacultyLane, FacultyOverlapPayload, FacultyPerson } from "./types";

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fmtMonth = (iso: string | null) => {
  if (!iso) return "Not given";
  const d = new Date(toMs(iso));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const fmtDay = (iso: string | null) => {
  if (!iso) return "Not given";
  const d = new Date(toMs(iso));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export function fmtSpan(days: number): string {
  const months = Math.max(0, Math.round(days / 30.44));
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y && m) return `${pluralize(y, "year")} ${pluralize(m, "month")}`;
  if (y) return pluralize(y, "year");
  return pluralize(Math.max(1, m), "month");
}

function bboxParam(b: number[] | null | undefined): string | undefined {
  return b && b.length === 4 ? b.map((v) => Math.round(v * 100) / 100).join(",") : undefined;
}

function rosterHref(l: FacultyLane): string | null {
  if (!l.application_id || !l.document_id) return null;
  return workspacePath(l.application_id, "documents", {
    doc: l.document_id,
    page: l.page ? String(l.page) : undefined,
    hl: bboxParam(l.bbox),
    hlabel: "faculty row",
  });
}

interface Axis {
  start: number;
  end: number;
  now: number;
  years: number[];
}

function useAxis(data?: FacultyOverlapPayload): Axis | null {
  return useMemo(() => {
    if (!data?.people.length) return null;
    const now = toMs(data.as_of);
    const joins = data.people.flatMap((p) => p.lanes.map((l) => l.joined).filter((j): j is string => !!j)).map(toMs);
    const first = new Date(Math.min(...joins, now - 365 * DAY)).getUTCFullYear();
    const start = Date.UTC(first, 0, 1);
    const end = Date.UTC(new Date(now).getUTCFullYear() + 1, 0, 1);
    const years: number[] = [];
    for (let y = first; y <= new Date(end).getUTCFullYear(); y++) years.push(y);
    return { start, end, now, years };
  }, [data]);
}

const pct = (a: Axis, ms: number) => `${(((ms - a.start) / (a.end - a.start)) * 100).toFixed(3)}%`;
const span = (a: Axis, from: number, to: number) => `${(((to - from) / (a.end - a.start)) * 100).toFixed(3)}%`;

/** Year ticks for the shared time axis; every other label is dropped when the axis is long. */
function AxisRow({ axis }: { axis: Axis }) {
  const step = axis.years.length > 14 ? 2 : 1;
  return (
    <div aria-hidden className="relative h-7">
      {axis.years.map((y, i) => (
        <div key={y} className="absolute top-0 h-full" style={{ left: pct(axis, Date.UTC(y, 0, 1)) }}>
          <div className="h-2 border-l border-line-2" />
          {i % step === 0 && y < new Date(axis.end).getUTCFullYear() && <div className="ml-1 text-xs text-ink-3 tabular-nums">{y}</div>}
        </div>
      ))}
      <div className="absolute top-0 h-full" style={{ left: pct(axis, axis.now) }}>
        <div className="h-2 border-l-2 border-ink-2" />
        <div className="-translate-x-1/2 text-xs font-medium text-ink-2">Today</div>
      </div>
    </div>
  );
}

function Lane({ lane, person, axis }: { lane: FacultyLane; person: FacultyPerson; axis: Axis }) {
  const href = rosterHref(lane);
  const joined = lane.joined ? toMs(lane.joined) : null;
  const end = lane.left ? toMs(lane.left) : axis.now;
  const ov = person.overlap_start && lane.source === "roster" && joined !== null ? Math.max(toMs(person.overlap_start), joined) : null;
  const finding = lane.findings[0];
  const describe =
    lane.source === "registry"
      ? `${lane.institution}: the AICTE faculty registry records this ID here; not on its current roster.`
      : `${lane.institution} lists this ID from ${fmtDay(lane.joined)} to today${ov !== null && ov < end ? `, overlapping another institution from ${fmtDay(new Date(ov).toISOString().slice(0, 10))}` : ""}.`;

  return (
    <div className="grid grid-cols-1 items-center gap-x-4 gap-y-1.5 py-2 lg:grid-cols-[240px_minmax(0,1fr)_200px]">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink" title={lane.institution}>
            {lane.short_name}
          </span>
          {lane.registry && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-2 px-1.5 text-xs text-ink-2" title="The AICTE faculty registry records this faculty ID against this institution">
              <Landmark aria-hidden className="size-3" />
              Registry
            </span>
          )}
        </div>
        <div className="truncate text-xs text-ink-3">
          {lane.source === "registry"
            ? "Registry record only, not on a current roster"
            : `Joined ${fmtDay(lane.joined)}${lane.last_year ? ", listed last year" : ""}`}
        </div>
      </div>

      <div className="relative h-7" role="img" aria-label={describe}>
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        {lane.source === "registry" ? (
          <div
            aria-hidden
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full border border-dashed border-ink-4"
            style={{ left: 0, width: pct(axis, axis.now) }}
          />
        ) : joined !== null ? (
          <Link
            to={href ?? "#"}
            aria-label={`Show ${lane.short_name}'s roster row for ${person.faculty_id}`}
            className="group absolute top-1/2 flex h-3 -translate-y-1/2 overflow-hidden rounded-full outline-offset-2"
            style={{ left: pct(axis, joined), width: span(axis, joined, end) }}
          >
            <span className="h-full bg-ink-4 transition-colors duration-150 group-hover:bg-ink-3" style={{ width: ov !== null ? `${((ov - joined) / Math.max(1, end - joined)) * 100}%` : "100%" }} />
            {ov !== null && ov < end && <span className="h-full flex-1 bg-manual-dot" />}
          </Link>
        ) : (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-ink-3">Joining date not given</span>
        )}
        {joined !== null && lane.source === "roster" && (
          <span aria-hidden className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink-2" style={{ left: pct(axis, joined) }} />
        )}
      </div>

      <div className="flex min-w-0 items-center gap-1 lg:justify-end">
        {href && (
          <Link to={href} className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink">
            <FileSearch aria-hidden className="size-3.5" />
            Show on page
          </Link>
        )}
        {finding && lane.application_id && (
          <Link
            to={workspacePath(lane.application_id, "findings", { finding: finding.id })}
            title={finding.title}
            className="inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
          >
            <SeverityIndicator severity={finding.severity} showLabel={false} />
            Finding
            <ArrowUpRight aria-hidden className="size-3 text-ink-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

/** One neutral sentence on what the rosters and the registry say, for the official to confirm. */
function reading(p: FacultyPerson): string {
  const roster = p.lanes.filter((l) => l.source === "roster");
  const reg = roster.find((l) => l.registry);
  const parts = roster
    .filter((l) => l !== reg)
    .map((l) => `${l.short_name} lists this ID from ${fmtDay(l.joined)}`);
  if (reg) parts.unshift(`${reg.short_name}, where the AICTE registry records this ID, lists it from ${fmtDay(reg.joined)}${reg.last_year ? " and did last year" : ""}`);
  const only = p.lanes.find((l) => l.source === "registry");
  if (only) parts.push(`the registry records it at ${only.short_name}, which does not list it this year`);
  const s = parts.join("; ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

function PersonBlock({ p, axis, rank }: { p: FacultyPerson; axis: Axis; rank: number }) {
  const roster = p.lanes.filter((l) => l.source === "roster");
  const names = roster.map((l) => l.short_name);
  const reg = p.registry;
  const headline = p.overlap_start
    ? `Listed by ${p.concurrent} institutions at once since ${fmtMonth(p.overlap_start)}`
    : reg && !reg.listed_by_registry_institution
      ? `Listed by ${names.join(", ")}; the registry records ${reg.institution ?? "another institution"}`
      : `Listed by ${pluralize(p.claimed_by, "institution")}`;
  const ovLeft = p.overlap_start ? toMs(p.overlap_start) : null;

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-xs text-ink-3 tabular-nums">{rank}</span>
          <h3 className="text-base font-semibold text-ink">{p.name ?? "Name not given"}</h3>
          <Code className="text-xs">{p.faculty_id}</Code>
          {p.designation && <span className="text-sm text-ink-3">{p.designation}</span>}
          {p.names_differ && <span className="text-xs text-ink-3">(names differ between rosters)</span>}
        </div>
        <div className="text-sm text-ink-2">
          <span className="font-medium text-ink">{headline}</span>
          {p.overlap_days > 0 && <span className="text-ink-3">, {fmtSpan(p.overlap_days)}</span>}
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-3">{reading(p)}</p>
      <div className="relative mt-1">
        {ovLeft !== null && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden lg:grid lg:grid-cols-[240px_minmax(0,1fr)_200px] lg:gap-x-4">
            <div />
            <div className="relative">
              <div
                className="absolute inset-y-1 rounded-sm border-x border-dashed border-manual-dot/60 bg-manual-bg/60"
                style={{ left: pct(axis, ovLeft), width: span(axis, ovLeft, axis.now) }}
              />
            </div>
          </div>
        )}
        <div className="relative divide-y divide-line/60">
          {p.lanes.map((l) => (
            <Lane key={`${l.institution_id}-${l.source}`} lane={l} person={p} axis={axis} />
          ))}
        </div>
      </div>
    </li>
  );
}

export function FacultyRadar({ query }: { query: UseQueryResult<FacultyOverlapPayload> }) {
  const data = query.data;
  const axis = useAxis(data);

  if (query.isPending)
    return (
      <div role="status" className="space-y-6">
        <span className="sr-only">Loading faculty overlaps</span>
        <Skeleton className="h-24" rounded="lg" />
        <Skeleton className="h-[420px]" rounded="lg" />
      </div>
    );
  if (!data) return <ErrorState error={query.error} title="Could not load faculty overlaps" onRetry={() => void query.refetch()} retrying={query.isFetching} />;

  const s = data.stats;
  const longest = data.people[0]?.overlap_days ?? 0;
  const title = `${pluralize(s.faculty_ids, "faculty ID")} claimed by 2 or more institutions across ${pluralize(s.applications_involved, "application")}`;

  return (
    <div className="space-y-6">
      <StatGroup label="Faculty overlap summary">
        <Stat label="Faculty IDs on more than one roster" value={s.claimed_by_two_or_more} hint={`Of ${s.rows_checked} roster rows checked`} />
        <Stat label="Applications involved" value={`${s.applications_involved} of ${s.applications_checked}`} hint={`AY ${data.academic_year ?? ""}`} />
        <Stat label="Registered with another institution" value={s.registered_elsewhere} hint="Listed only where the registry does not record them" />
        <Stat label="Longest overlap" value={longest ? fmtSpan(longest) : "None"} hint="Listed by two institutions at once" />
      </StatGroup>

      <Callout tone="info" title="A shared faculty ID needs confirmation">
        Visiting and adjunct arrangements exist, and rosters can lag a move. Confirm appointment letters, salary records and the registry before recording a deficiency. All names are synthetic.
      </Callout>

      <Panel
        title={title}
        description="One lane per institution, from the joining date on its roster to today. The amber stretch is the time two rosters list the same person at once. Ranked by overlap length, then by the number of institutions."
        padding="none"
        footer={
          <ul className="flex w-full flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-3" aria-label="Legend">
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-6 rounded-full bg-ink-4" />
              Listed on the roster
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-6 rounded-full bg-manual-dot" />
              Listed by two institutions at once
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-6 rounded-full border border-dashed border-ink-4" />
              Registry record only
            </li>
            <li className="flex items-center gap-1.5">
              <Landmark aria-hidden className="size-3.5" />
              Institution the AICTE registry records
            </li>
          </ul>
        }
      >
        {!data.people.length || !axis ? (
          <div className="border-t border-line">
            <EmptyState size="sm" title="No overlapping faculty" description="Every faculty ID on this year's rosters is claimed by one institution, the one the registry records." />
          </div>
        ) : (
          <div className="border-t border-line">
            <div className="sticky top-14 z-[1] hidden border-b border-line bg-surface px-5 pt-2 lg:grid lg:grid-cols-[240px_minmax(0,1fr)_200px] lg:gap-x-4">
              <div className="text-xs text-ink-3">Institution</div>
              <AxisRow axis={axis} />
              <div className="text-right text-xs text-ink-3">Evidence</div>
            </div>
            <ol className="divide-y divide-line">
              {data.people.map((p, i) => (
                <Fragment key={p.faculty_id}>
                  <PersonBlock p={p} axis={axis} rank={i + 1} />
                </Fragment>
              ))}
            </ol>
          </div>
        )}
      </Panel>
      <p className={cn("text-xs text-ink-3")}>
        As of {fmtDay(data.as_of)}. Joining dates are as each institution entered them on its roster; no leaving date is recorded, so a lane runs to today.
      </p>
    </div>
  );
}
