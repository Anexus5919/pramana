import { ArrowRight, MapPin } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fmtMs, fmtValue, pluralize } from "../../../lib/format";
import { EVIDENCE_CLASSES, evidenceClassMeta, humanize, outcomeMeta, stageLabel } from "../../../lib/labels";
import type { Programme, Stage } from "../../../types";
import { Tag } from "../../../ui/Badge";
import { CubeStrip, EvidenceClassChip, StatusCube } from "../../../ui/Blocks";
import { SectionCard } from "../../../ui/Card";
import { cn } from "../../../ui/cn";
import { Counter } from "../../../ui/Counter";
import { KeyValue } from "../../../ui/Layout";
import { dur, ease, fadeUp, stagger } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { EmptyState } from "../../../ui/States";
import { Tooltip } from "../../../ui/Tooltip";
import { useWorkspace } from "../context";
import { appPath } from "../data";
import { WatchCard } from "../history/WatchCard";

const EV_BG = ["bg-ev-1", "bg-ev-2", "bg-ev-3", "bg-ev-4", "bg-ev-5", "bg-ev-6", "bg-ev-7"];
const EV_BORDER = ["border-ev-1", "border-ev-2", "border-ev-3", "border-ev-4", "border-ev-5", "border-ev-6", "border-ev-7"];
const OPEN = new Set(["open", "acknowledged", "evidence_requested"]);

function TrustLadder() {
  const { app, findings } = useWorkspace();
  const navigate = useNavigate();
  const rows = useMemo(
    () =>
      EVIDENCE_CLASSES.map((cls) => {
        const fs = (findings ?? []).filter((f) => f.evidence_class === cls);
        return { cls, total: fs.length, open: fs.filter((f) => OPEN.has(f.review_status)).length };
      }),
    [findings],
  );
  const max = Math.max(1, ...rows.map((r) => r.total));
  const cap = Math.min(max, 14);

  return (
    <SectionCard
      eyebrow="Trust ladder"
      title="Where the findings stand"
      description="Each rung is a class of evidence, strongest first. Blocks are findings: solid is open, outlined has been reviewed. Select a rung to filter the findings."
    >
      {!findings ? (
        <div className="space-y-2.5">
          {EVIDENCE_CLASSES.map((c) => (
            <Skeleton key={c} className="h-8" />
          ))}
        </div>
      ) : (
        <motion.ol variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-1">
          {rows.map((r, i) => {
            const level = evidenceClassMeta[r.cls].level;
            const blocks = Array.from({ length: Math.min(r.total, cap) }, (_, k) => k < Math.min(r.open, cap));
            return (
              <motion.li key={r.cls} variants={fadeUp}>
                {i === 2 && (
                  <div className="my-2 flex items-center gap-2 text-[11px] text-ink-3" aria-hidden>
                    <span className="h-px flex-1 border-t border-dashed border-verified-dot/50" />
                    <span>Above this line evidence may say verified</span>
                    <span className="h-px flex-1 border-t border-dashed border-verified-dot/50" />
                  </div>
                )}
                <button
                  type="button"
                  disabled={!r.total}
                  onClick={() => navigate(appPath(app.id, "findings", { ev: r.cls }))}
                  aria-label={`E${level} ${evidenceClassMeta[r.cls].label}: ${pluralize(r.total, "finding")}, ${r.open} open. Show these findings.`}
                  className="group grid w-full grid-cols-[148px_minmax(0,1fr)_56px] items-center gap-3 rounded-[10px] px-2 py-1.5 text-left transition-colors duration-200 enabled:hover:bg-surface-2 disabled:cursor-default"
                >
                  <span className={cn(!r.total && "opacity-55")}>
                    <EvidenceClassChip cls={r.cls} />
                  </span>
                  <span className="flex min-w-0 items-center gap-[3px]" aria-hidden>
                    {blocks.map((solid, k) => (
                      <motion.span
                        key={k}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.05 + k * 0.03, duration: dur.ui, ease: ease.out }}
                        className={cn("relative h-5 w-3.5 shrink-0 rounded-[3px] border-[1.5px]", EV_BORDER[level - 1], solid ? EV_BG[level - 1] : "bg-transparent")}
                      >
                        {solid && <span className="absolute inset-x-0 top-0 h-[3px] rounded-t-[2px] bg-white/30" />}
                      </motion.span>
                    ))}
                    {r.total > cap && <span className="ml-1 text-xs text-ink-3">+{r.total - cap}</span>}
                    {!r.total && <span className="h-px w-8 bg-line-2" />}
                  </span>
                  <span className="flex items-center justify-end gap-1 text-sm font-semibold text-ink tabular">
                    {r.total || <span className="font-normal text-ink-4">0</span>}
                    {r.total > 0 && <ArrowRight className="size-3.5 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </motion.ol>
      )}
    </SectionCard>
  );
}

function stageNote(s: Stage): string | null {
  const bits: string[] = [];
  if (typeof s.documents === "number") bits.push(pluralize(s.documents, "document"));
  if (typeof s.newly_processed === "number" && s.newly_processed) bits.push(`${s.newly_processed} newly processed`);
  if (typeof s.evaluated === "number") bits.push(`${s.evaluated} rules evaluated`);
  if (typeof s.facts === "number") bits.push(`${s.facts} facts`);
  if (typeof s.links === "number") bits.push(pluralize(s.links, "link"));
  return bits.length ? bits.join(", ") : null;
}

function PipelineTimeline() {
  const { run, runLoading, app } = useWorkspace();
  if (!app.latest_run) return <SectionCard eyebrow="Pipeline" title="Stage timings"><EmptyState compact title="Not validated yet" description="Run validation to see each stage." /></SectionCard>;
  const stages = run?.stages ?? [];
  const max = Math.max(1, ...stages.map((s) => s.ms));
  const total = stages.reduce((t, s) => t + s.ms, 0);
  return (
    <SectionCard
      eyebrow="Pipeline"
      title="Stage timings of the latest run"
      description="Real durations recorded by the server. Bars are proportional to the slowest stage."
      actions={run ? <Tag variant="mono">{fmtMs(total)} total</Tag> : undefined}
    >
      {runLoading || !run ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-7" />
          ))}
        </div>
      ) : (
        <ol className="space-y-3">
          {stages.map((s, i) => (
            <li key={s.stage} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_64px] items-center gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{stageLabel[s.stage] ?? humanize(s.stage)}</div>
                {stageNote(s) && <div className="truncate text-[11px] text-ink-3">{stageNote(s)}</div>}
              </div>
              <div className="relative h-3 overflow-hidden rounded-[4px] bg-surface-2">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: s.ms ? Math.max(0.015, s.ms / max) : 0.006 }}
                  transition={{ delay: 0.1 + i * 0.06, duration: dur.story, ease: ease.out }}
                  className="absolute inset-y-0 left-0 w-full origin-left rounded-[4px] bg-brand-500"
                />
              </div>
              <div className="text-right font-mono text-xs text-ink-2">{s.ms ? fmtMs(s.ms) : "<1 ms"}</div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function Resolved() {
  const { run } = useWorkspace();
  const items = run?.resolved_since_previous ?? [];
  return (
    <SectionCard
      eyebrow="Since the previous run"
      title="Resolved"
      description={run?.previous_run ? "Findings present in the previous run that this run no longer raises." : "This is the first run of the application, so nothing could be resolved yet."}
    >
      {!run ? (
        <Skeleton className="h-16" />
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-3">{run.previous_run ? "Nothing was resolved between the two runs." : "No earlier run to compare with."}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r, i) => (
            <motion.li key={`${r.code}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="flex items-start gap-2.5">
              <StatusCube tone="verified" size={13} className="mt-1" />
              <span className="min-w-0">
                <span className="relative block text-sm text-ink-3">
                  {r.title}
                  <motion.span
                    aria-hidden
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.25 + i * 0.08, duration: dur.panel, ease: ease.out }}
                    className="absolute top-1/2 left-0 h-[1.5px] w-full origin-left bg-verified-dot"
                  />
                </span>
                <span className="font-mono text-[11px] text-ink-4">{r.code}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// Rough bounds of India for the location dot
const LAT = [6, 37];
const LON = [68, 98];

function InstitutionCard() {
  const { app } = useWorkspace();
  const i = app.institution;
  const hasGeo = i.latitude != null && i.longitude != null;
  const x = hasGeo ? ((i.longitude! - LON[0]) / (LON[1] - LON[0])) * 100 : 50;
  const y = hasGeo ? (1 - (i.latitude! - LAT[0]) / (LAT[1] - LAT[0])) * 100 : 50;
  return (
    <SectionCard eyebrow="Institution" title={i.name}>
      <div className="flex gap-4">
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <p className="text-ink-2">{i.address}</p>
          <p className="text-ink-3">
            {i.district}, {i.state}
            {i.pincode ? ` ${i.pincode}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Tag variant="mono">{i.aicte_id}</Tag>
            {i.aishe_code && <Tag variant="mono">AISHE {i.aishe_code}</Tag>}
            <Tag>{humanize(i.institution_type)}</Tag>
            {i.women_only && <Tag variant="brand">Women only</Tag>}
          </div>
          {i.society_name && <p className="pt-1 text-xs text-ink-3">Run by {i.society_name}{i.established_year ? `, established ${i.established_year}` : ""}</p>}
        </div>
        {hasGeo && (
          <Tooltip content="Location on record, used to check photo geotags">
            <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-[12px] border border-line bg-surface-2" tabIndex={0} aria-label={`Campus at ${i.latitude}, ${i.longitude}`}>
              <svg aria-hidden className="absolute inset-0 size-full text-line-2" viewBox="0 0 96 112" preserveAspectRatio="none">
                {[1, 2, 3].map((k) => (
                  <line key={`v${k}`} x1={k * 24} y1={0} x2={k * 24} y2={112} stroke="currentColor" strokeDasharray="2 3" />
                ))}
                {[1, 2, 3].map((k) => (
                  <line key={`h${k}`} x1={0} y1={k * 28} x2={96} y2={k * 28} stroke="currentColor" strokeDasharray="2 3" />
                ))}
              </svg>
              <span className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-brand-500 shadow-glow" style={{ left: `${x}%`, top: `${y}%` }} />
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-surface/80 px-1.5 py-1 font-mono text-[9.5px] text-ink-2 backdrop-blur">
                <MapPin aria-hidden className="size-2.5 shrink-0" />
                {i.latitude!.toFixed(3)}, {i.longitude!.toFixed(3)}
              </span>
            </div>
          </Tooltip>
        )}
      </div>
    </SectionCard>
  );
}

const UNITS: Record<string, string> = { sqm: "sq m", acres: "acres", mbps: "Mbps" };

function declaredLabel(k: string): { label: string; unit?: string } {
  const m = k.match(/_(sqm|acres|mbps)$/);
  return { label: humanize(m ? k.slice(0, -m[0].length) : k), unit: m ? UNITS[m[1]] : undefined };
}

function Declared() {
  const { app } = useWorkspace();
  const { programmes = [], ...rest } = app.declared;
  const items = Object.entries(rest).map(([k, v]) => {
    const { label, unit } = declaredLabel(k);
    const mono = /number|_id$|transaction/.test(k);
    return { label, value: `${fmtValue(v)}${unit && v != null ? ` ${unit}` : ""}`, mono };
  });
  const progs = programmes as Programme[];
  return (
    <SectionCard eyebrow="Declared by the institution" title="Application data" description="What the institution typed into the form. Rules compare these values with the documents and reference records.">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <KeyValue items={items} labelWidth={170} />
        <div className="min-w-0">
          <div className="eyebrow mb-2">Programmes ({progs.length})</div>
          {progs.length ? (
            <div className="overflow-x-auto rounded-[12px] border border-line">
              <table className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left text-[11px] tracking-[0.08em] text-ink-3 uppercase">
                    <th scope="col" className="px-3 py-2 font-semibold">Programme</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Level</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Approved</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Proposed</th>
                    <th scope="col" className="px-3 py-2 font-semibold">NBA</th>
                  </tr>
                </thead>
                <tbody>
                  {progs.map((p) => {
                    const up = p.proposed_intake > p.approved_intake;
                    return (
                      <tr key={p.code} className="border-t border-line">
                        <td className="px-3 py-2">
                          <span className="font-medium text-ink">{p.name}</span>
                          <span className="ml-1.5 font-mono text-[11px] text-ink-3">{p.code}</span>
                        </td>
                        <td className="px-3 py-2 text-ink-2">{humanize(p.level)}</td>
                        <td className="px-3 py-2 text-right tabular text-ink-2">{p.approved_intake}</td>
                        <td className={cn("px-3 py-2 text-right font-medium tabular", up ? "text-expired-fg" : "text-ink")}>
                          {p.proposed_intake}
                          {up && <span className="ml-1 text-[11px]">+{p.proposed_intake - p.approved_intake}</span>}
                        </td>
                        <td className="px-3 py-2 text-ink-2">{p.nba_accredited ? "Yes" : "No"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ink-3">No programmes declared.</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function Glance() {
  const { app, run, findings } = useWorkspace();
  const lr = app.latest_run;
  const open = (findings ?? []).filter((f) => OPEN.has(f.review_status)).length;
  const outcomes: Record<string, number> = {};
  for (const c of run?.checklist ?? []) outcomes[c.outcome] = (outcomes[c.outcome] ?? 0) + 1;
  const statuses = Object.values(lr?.document_status ?? {});
  const tiles = [
    {
      label: "Open findings",
      value: findings ? <Counter value={open} /> : <Skeleton className="h-8 w-10" />,
      foot: findings ? `of ${pluralize(findings.length, "finding")} on the latest run` : "",
      to: appPath(app.id, "findings"),
    },
    {
      label: "Rules",
      value: run ? <Counter value={run.checklist.length} /> : <Skeleton className="h-8 w-10" />,
      foot: run
        ? Object.entries(outcomes)
            .map(([o, n]) => `${n} ${outcomeMeta[o]?.label.toLowerCase() ?? o}`)
            .join(", ")
        : "",
      to: appPath(app.id, "checklist"),
    },
    {
      label: "Documents",
      value: <Counter value={app.documents.filter((d) => !d.superseded).length} />,
      foot: <CubeStrip statuses={statuses} size={11} />,
      to: appPath(app.id, "documents"),
    },
    {
      label: "Review sort key",
      value: lr?.review_priority != null ? <Counter value={lr.review_priority} /> : <span className="text-ink-4">none</span>,
      foot: "Ranks the queue for attention and decides nothing",
      to: null,
    },
  ];
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => {
        const body = (
          <>
            <div className="eyebrow">{t.label}</div>
            <div className="mt-2 font-display text-3xl leading-none font-semibold tracking-title text-ink">{t.value}</div>
            <div className="mt-2 min-h-5 truncate text-xs text-ink-3">{t.foot}</div>
          </>
        );
        return (
          <motion.div key={t.label} variants={fadeUp}>
            {t.to ? (
              <Link to={t.to} className="block rounded-card border border-line bg-surface p-4 shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-brand-200 hover:shadow-sm">
                {body}
              </Link>
            ) : (
              <div className="rounded-card border border-line bg-surface p-4 shadow-xs">{body}</div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export function OverviewTab() {
  return (
    <div className="space-y-5">
      <Glance />
      <WatchCard />
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <TrustLadder />
        <PipelineTimeline />
      </div>
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Resolved />
        <InstitutionCard />
      </div>
      <Declared />
    </div>
  );
}
