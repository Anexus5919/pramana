import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, ChevronDown, Minus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { fmtDate, fmtValue, pluralize } from "../../../lib/format";
import { EvidenceClassChip, SeverityMeter } from "../../../ui/Blocks";
import { Tag } from "../../../ui/Badge";
import { SectionCard } from "../../../ui/Card";
import { cn } from "../../../ui/cn";
import { dur, ease, fadeUp, stagger } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../../ui/States";
import { Tooltip } from "../../../ui/Tooltip";
import { useDocTypeLabel, useWorkspace } from "../context";
import { appPath, bboxParam } from "../data";
import { CautionNote, CitationCard } from "../parts";
import { useSinceLastYear, type CertificateChange, type ProgrammeChange, type ScalarChange, type SinceLastYear, type YoyIndicator } from "./api";

const CERT_STATUS: Record<CertificateChange["status"], { label: string; cls: string; tip: string }> = {
  unchanged: { label: "Same certificate", cls: "bg-surface-2 text-ink-2", tip: "Same number and validity as last year." },
  new_number: { label: "New number", cls: "bg-verified-bg text-verified-fg", tip: "A different number from last year, as a renewal or a new document would have." },
  reused_new_validity: { label: "Same number, new validity", cls: "bg-mismatch-bg text-mismatch-fg", tip: "The number is last year's, but the validity date differs." },
  not_read: { label: "Not read this year", cls: "bg-manual-bg text-manual-fg", tip: "The number could not be read from this year's document, so it was not compared." },
  new: { label: "New this year", cls: "bg-pending-bg text-pending-fg", tip: "Not part of last year's application." },
  missing: { label: "Not submitted this year", cls: "bg-unchecked-bg text-unchecked-fg", tip: "Part of last year's application but not this one." },
};

function fmtNum(v: unknown, unit: string | null): string {
  if (v === null || v === undefined || v === "") return "Not declared";
  return `${fmtValue(v)}${unit ? ` ${unit}` : ""}`;
}

function Delta({ s, flagged }: { s: ScalarChange; flagged: boolean }) {
  if (s.delta === null) return <span className="text-xs text-ink-4">Not comparable</span>;
  if (s.delta === 0) return <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Minus aria-hidden className="size-3.5" /> No change</span>;
  const up = s.delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium tabular", flagged ? "text-mismatch-fg" : up ? "text-verified-fg" : "text-ink-2")}>
      <Icon aria-hidden className="size-3.5" />
      {up ? "+" : ""}
      {fmtValue(s.delta)}
      {s.unit ? ` ${s.unit}` : ""}
      {s.pct !== null && <span className="font-normal text-ink-3">({up ? "+" : ""}{s.pct}%)</span>}
    </span>
  );
}

function YearBand({ d }: { d: SinceLastYear }) {
  const { app } = useWorkspace();
  const p = d.previous!;
  return (
    <motion.div variants={fadeUp} className="grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="eyebrow">Last year</div>
        <div className="mt-1 font-display text-xl font-semibold tracking-title text-ink">AY {p.academic_year}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          {p.application_id && <Tag variant="mono">{p.application_id}</Tag>}
          {p.submitted_on && <span>submitted {fmtDate(p.submitted_on)}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          <span>{p.source}</span>
          {p.provenance === "synthetic" && <Tag variant="demo">Synthetic record</Tag>}
        </div>
      </div>
      <div className="hidden items-center justify-center sm:flex" aria-hidden>
        <ArrowRight className="size-5 text-ink-4" />
      </div>
      <div className="rounded-card border border-brand-200 bg-brand-soft/60 p-4">
        <div className="eyebrow">This application</div>
        <div className="mt-1 font-display text-xl font-semibold tracking-title text-ink">AY {d.academic_year}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          <Tag variant="mono">{app.id}</Tag>
          {app.submitted_at && <span>submitted {fmtDate(app.submitted_at)}</span>}
        </div>
        <div className="mt-2 text-xs text-ink-3">Declared values, the faculty roster and the certificates read from the uploaded documents</div>
      </div>
    </motion.div>
  );
}

function IndicatorCard({ i }: { i: YoyIndicator }) {
  const { app, findings } = useWorkspace();
  const f = (findings ?? []).find((x) => x.code === i.code && x.fingerprint === i.fingerprint) ?? (findings ?? []).find((x) => x.code === i.code);
  const region = i.evidence.find((e) => e.kind === "region");
  return (
    <motion.article variants={fadeUp} className="rounded-card border border-mismatch-dot/25 bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityMeter severity={i.severity} label />
            <EvidenceClassChip cls={i.evidence_class} />
            <Tag variant="mono">{i.code}</Tag>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-ink text-balance">{i.title}</h3>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {region && region.kind === "region" && region.document_id && (
            <Link
              to={appPath(app.id, "documents", { doc: region.document_id, page: region.page, hl: bboxParam(region.bbox), hlabel: region.label })}
              className="inline-flex h-7 items-center gap-1 rounded-[7px] bg-brand-soft px-2 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-100"
            >
              Show on the page <ArrowUpRight aria-hidden className="size-3" />
            </Link>
          )}
          {f && (
            <Link
              to={appPath(app.id, "findings", { finding: f.id })}
              className="inline-flex h-7 items-center gap-1 rounded-[7px] bg-surface-2 px-2 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-3"
            >
              Open finding <ArrowUpRight aria-hidden className="size-3" />
            </Link>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-2 text-pretty">{i.message}</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <CitationCard citation={i.rule.citation} ruleId={i.rule.citation.related_rule ?? undefined} />
        {i.limitation && <CautionNote className="self-start">{i.limitation}</CautionNote>}
      </div>
    </motion.article>
  );
}

function ScalarTable({ rows, flagged }: { rows: ScalarChange[]; flagged: Set<string> }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line">
      <table className="w-full min-w-[460px] text-sm">
        <thead>
          <tr className="bg-surface-2 text-left text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            <th scope="col" className="px-3 py-2 font-semibold">Declared</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Last year</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">This year</th>
            <th scope="col" className="px-3 py-2 font-semibold">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const hit = flagged.has(s.key);
            return (
              <tr key={s.key} className={cn("border-t border-line", hit && "bg-mismatch-bg/50")}>
                <th scope="row" className="px-3 py-2 text-left font-medium text-ink">{s.label}</th>
                <td className="px-3 py-2 text-right tabular text-ink-3">{fmtNum(s.before, s.unit)}</td>
                <td className="px-3 py-2 text-right font-medium tabular text-ink">{fmtNum(s.after, s.unit)}</td>
                <td className="px-3 py-2">
                  <Delta s={s} flagged={hit} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProgrammeTable({ rows, jump }: { rows: ProgrammeChange[]; jump: boolean }) {
  const { app } = useWorkspace();
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line">
      <table className="w-full min-w-[460px] text-sm">
        <thead>
          <tr className="bg-surface-2 text-left text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            <th scope="col" className="px-3 py-2 font-semibold">Programme</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Approved last year</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Proposed now</th>
            <th scope="col" className="px-3 py-2 font-semibold">NBA claim</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const up = p.delta_proposed !== null && p.delta_proposed > 0;
            const hit = up && jump && app.category === "EOA";
            return (
              <tr key={p.code} className={cn("border-t border-line", hit && "bg-mismatch-bg/50")}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="font-medium text-ink">{p.name}</span>
                  <span className="ml-1.5 font-mono text-[11px] text-ink-3">{p.code}</span>
                  {p.status === "added" && <Tag className="ml-1.5">New</Tag>}
                  {p.status === "removed" && <Tag className="ml-1.5">Dropped</Tag>}
                </th>
                <td className="px-3 py-2 text-right tabular text-ink-3">{p.before_approved ?? "None"}</td>
                <td className={cn("px-3 py-2 text-right font-medium tabular", hit ? "text-mismatch-fg" : up ? "text-expired-fg" : "text-ink")}>
                  {p.after_proposed ?? "None"}
                  {up && <span className="ml-1 text-[11px]">+{p.delta_proposed}</span>}
                </td>
                <td className="px-3 py-2 text-xs text-ink-2">
                  {p.before_nba === p.after_nba ? (p.after_nba ? "Claimed both years" : "No") : p.after_nba ? <span className="font-medium text-expired-fg">New claim this year</span> : "Dropped this year"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One block per faculty ID: last year's roster above, this year's below. Hollow blocks left; green blocks joined. */
function Roster({ f, flagged, docId }: { f: NonNullable<SinceLastYear["faculty"]>; flagged: boolean; docId: string | null | undefined }) {
  const { app } = useWorkspace();
  const [open, setOpen] = useState(false);
  const share = f.replaced_share ?? 0;
  const lastYear = [...Array(f.retained).fill("kept"), ...f.removed.map(() => "left")];
  const thisYear = [...Array(f.retained).fill("kept"), ...f.added.map(() => "joined")];
  const cls: Record<string, string> = {
    kept: "border-brand-500 bg-brand-500",
    left: "border-mismatch-dot bg-transparent",
    joined: "border-verified-dot bg-verified-dot",
  };
  const row = (blocks: string[], delay: number, label: string) => (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
      <span className="text-xs text-ink-3">{label}</span>
      <span className="flex flex-wrap gap-[3px]" aria-hidden>
        {blocks.map((b, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay + i * 0.012, duration: dur.ui, ease: ease.out }}
            className={cn("relative h-4 w-3 rounded-[3px] border-[1.5px]", cls[b])}
          >
            {b !== "left" && <span className="absolute inset-x-0 top-0 h-[3px] rounded-t-[2px] bg-white/30" />}
          </motion.span>
        ))}
      </span>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="space-y-2" role="img" aria-label={`Last year ${f.before} faculty IDs, this year ${f.after}. ${f.retained} on both rosters, ${f.removed.length} left, ${f.added.length} joined.`}>
        {row(lastYear, 0.1, `${f.before} last year`)}
        {row(thisYear, 0.3, `${f.after} this year`)}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-[2px] border", cls.kept)} /> On both rosters ({f.retained})</span>
        <span className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-[2px] border-[1.5px]", cls.left)} /> Gone this year ({f.removed.length})</span>
        <span className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-[2px] border", cls.joined)} /> New this year ({f.added.length})</span>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className={cn("font-medium", flagged ? "text-mismatch-fg" : "text-ink-2")}>{Math.round(share * 100)}% of last year's roster replaced</span>
          <span className="text-ink-4">indicator above 50% (configuration)</span>
        </div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className={cn("absolute inset-y-0 left-0 w-full origin-left rounded-full", flagged ? "bg-mismatch-dot" : "bg-brand-400")}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: share }}
            transition={{ delay: 0.4, duration: dur.story, ease: ease.out }}
          />
          <span aria-hidden className="absolute inset-y-0 left-1/2 w-[2px] bg-ink-3" />
        </div>
      </div>
      {(f.removed.length > 0 || f.added.length > 0) && (
        <div>
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline">
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: dur.ui }}>
              <ChevronDown aria-hidden className="size-3.5" />
            </motion.span>
            {open ? "Hide" : "Show"} the faculty IDs that changed
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: dur.panel, ease: ease.out }} className="overflow-hidden">
                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  {[
                    { t: "Gone this year", ids: f.removed, c: "text-mismatch-fg line-through" },
                    { t: "New this year", ids: f.added, c: "text-verified-fg" },
                  ].map((g) => (
                    <div key={g.t}>
                      <div className="eyebrow mb-1">{g.t}</div>
                      <div className="flex flex-wrap gap-1">
                        {g.ids.map((id) => (
                          <span key={id} className={cn("rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]", g.c)}>
                            {id}
                          </span>
                        ))}
                        {!g.ids.length && <span className="text-xs text-ink-4">None</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {docId && (
                  <Link to={appPath(app.id, "documents", { doc: docId })} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline">
                    Open this year's faculty list <ArrowUpRight aria-hidden className="size-3" />
                  </Link>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function Certificates({ rows }: { rows: CertificateChange[] }) {
  const { app } = useWorkspace();
  const label = useDocTypeLabel();
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="bg-surface-2 text-left text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            <th scope="col" className="px-3 py-2 font-semibold">Document</th>
            <th scope="col" className="px-3 py-2 font-semibold">Last year</th>
            <th scope="col" className="px-3 py-2 font-semibold">This year</th>
            <th scope="col" className="px-3 py-2 font-semibold">Comparison</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const st = CERT_STATUS[c.status];
            return (
              <tr key={c.type} className={cn("border-t border-line align-top", c.status === "reused_new_validity" && "bg-mismatch-bg/50")}>
                <th scope="row" className="px-3 py-2 text-left font-medium text-ink">
                  {c.document_id ? (
                    <Link to={appPath(app.id, "documents", { doc: c.document_id })} className="hover:text-brand-ink hover:underline">
                      {label(c.type)}
                    </Link>
                  ) : (
                    label(c.type)
                  )}
                </th>
                <td className="px-3 py-2">
                  <span className="block font-mono text-[12px] break-all text-ink-3">{c.before_number ?? "None"}</span>
                  {c.before_valid_until && <span className="block text-[11px] text-ink-4">valid until {fmtDate(c.before_valid_until)}</span>}
                </td>
                <td className="px-3 py-2">
                  <span className="block font-mono text-[12px] break-all text-ink">{c.after_number ?? "Not read"}</span>
                  {c.after_valid_until && <span className="block text-[11px] text-ink-3">valid until {fmtDate(c.after_valid_until)}</span>}
                </td>
                <td className="px-3 py-2">
                  <Tooltip content={st.tip}>
                    <span tabIndex={0} className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap", st.cls)}>
                      {st.label}
                    </span>
                  </Tooltip>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SinceLastYearTab() {
  const { app } = useWorkspace();
  const q = useSinceLastYear(app.id);
  const d = q.data;
  if (q.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-32" rounded="lg" />
        <Skeleton className="h-64" rounded="lg" />
      </div>
    );
  }
  if (q.error || !d) return <ErrorState error={q.error} title="Could not load the comparison" onRetry={() => void q.refetch()} />;
  if (!d.available) {
    return <EmptyState sky icon={<CalendarClock />} title="No previous application on record" description="AICTE records hold no earlier application for this institution, so there is nothing to compare with." />;
  }
  const indicators = d.indicators ?? [];
  const codes = new Set(indicators.map((i) => i.code));
  const flaggedScalars = new Set([...(codes.has("YOY-LAND-AREA-DECREASED") ? ["land_area_acres"] : []), ...(codes.has("YOY-BUILT-UP-AREA-DECREASED") ? ["built_up_area_sqm"] : [])]);
  const changed = (d.scalars ?? []).filter((s) => s.status !== "same").length;
  const labs = d.labs;

  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="space-y-5">
      <YearBand d={d} />

      <motion.section variants={fadeUp} aria-labelledby="yoy-indicators" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="yoy-indicators" className="font-display text-lg font-semibold tracking-title text-ink">
            {indicators.length ? `${pluralize(indicators.length, "change")} to explain` : "Nothing implausible between the two years"}
          </h2>
          <span className="text-xs text-ink-3">Indicators from AICTE records, for an official to review. Ordinary changes are listed below without findings.</span>
        </div>
        {indicators.length > 0 ? (
          <motion.div variants={stagger(0.06)} className="space-y-3">
            {indicators.map((i) => (
              <IndicatorCard key={i.fingerprint} i={i} />
            ))}
          </motion.div>
        ) : (
          <p className="rounded-card border border-verified-dot/30 bg-verified-bg/60 px-4 py-3 text-sm text-verified-fg">
            Every difference from last year falls within ordinary change: faculty moving, upgrades, renewals under new numbers.
          </p>
        )}
      </motion.section>

      <motion.div variants={fadeUp} className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
        <SectionCard eyebrow="Declared values" title="Campus and facilities" description={`${pluralize(changed, "value")} changed since AY ${d.previous?.academic_year}.`}>
          <ScalarTable rows={d.scalars ?? []} flagged={flaggedScalars} />
        </SectionCard>
        <SectionCard eyebrow="Programmes" title="Intake and NBA claims" description="Proposed intake against the intake approved last year.">
          <ProgrammeTable rows={d.programmes ?? []} jump={codes.has("YOY-INTAKE-JUMP")} />
        </SectionCard>
      </motion.div>

      <motion.div variants={fadeUp} className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <SectionCard eyebrow="Faculty roster" title="Who stayed, who left, who joined" description="Compared by faculty ID between last year's roster and this year's faculty list.">
          {d.faculty ? <Roster f={d.faculty} flagged={codes.has("YOY-FACULTY-TURNOVER")} docId={d.roster_document_id} /> : <p className="text-sm text-ink-3">No faculty list was uploaded this year, so the roster was not compared.</p>}
        </SectionCard>
        <SectionCard eyebrow="Laboratories" title="Labs declared" description={labs ? `${labs.before} last year, ${labs.after} this year.` : undefined}>
          {labs ? (
            <div className="space-y-3">
              {labs.added.length === 0 && labs.removed.length === 0 && <p className="text-sm text-ink-3">The same labs as last year.</p>}
              {labs.added.length > 0 && (
                <div>
                  <div className="eyebrow mb-1.5">Added</div>
                  <div className="flex flex-wrap gap-1.5">
                    {labs.added.map((l) => (
                      <span key={l} className="rounded-full bg-verified-bg px-2.5 py-1 text-xs font-medium text-verified-fg">+ {l}</span>
                    ))}
                  </div>
                </div>
              )}
              {labs.removed.length > 0 && (
                <div>
                  <div className="eyebrow mb-1.5">No longer declared</div>
                  <div className="flex flex-wrap gap-1.5">
                    {labs.removed.map((l) => (
                      <span key={l} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink-3 line-through">{l}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-3">No labs were declared this year.</p>
          )}
        </SectionCard>
      </motion.div>

      <motion.div variants={fadeUp}>
        <SectionCard eyebrow="Key certificates" title="Certificate numbers, last year and now" description="Numbers read from this year's documents against the numbers in last year's application.">
          <Certificates rows={d.certificates ?? []} />
        </SectionCard>
      </motion.div>
    </motion.div>
  );
}
