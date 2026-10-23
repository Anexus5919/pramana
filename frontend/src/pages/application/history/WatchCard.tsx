import { ArrowUpRight, Eye, Gavel, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../api";
import { useAuth } from "../../../auth/session";
import { fmtDate, fmtDateTime, fmtRelative, pluralize } from "../../../lib/format";
import { SeverityMeter, StatusCube } from "../../../ui/Blocks";
import { Button } from "../../../ui/Button";
import { SectionCard } from "../../../ui/Card";
import { cn } from "../../../ui/cn";
import { Dialog } from "../../../ui/Dialog";
import { Field, Textarea } from "../../../ui/Field";
import { dur, ease, fadeUp, stagger } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { ErrorState } from "../../../ui/States";
import { useToast } from "../../../ui/Toast";
import { Tooltip } from "../../../ui/Tooltip";
import { useWorkspace } from "../context";
import { appPath, useVerifications } from "../data";
import { SimTag } from "../parts";
import { useRecordOutcome, useRunWatch, useWatch, type ApplicationWatch, type WatchItem } from "./api";

const STATE: Record<string, { status: string; label: string }> = {
  ok: { status: "verified", label: "Confirmed by the issuer" },
  revoked: { status: "mismatch_detected", label: "Revoked by the issuer" },
  suspended: { status: "mismatch_detected", label: "Suspended by the issuer" },
  not_found: { status: "mismatch_detected", label: "No longer in the issuer registry" },
  record_changed: { status: "mismatch_detected", label: "Issuer record now differs" },
  expired: { status: "expired", label: "Expired since the outcome" },
  source_unavailable: { status: "source_unavailable", label: "Registry did not respond" },
};
const CHANGE: Record<string, string> = {
  revoked: "revoked by the issuer",
  suspended: "suspended by the issuer",
  not_found: "no longer found in the issuer registry",
  record_changed: "issuer record now differs from the document",
  expired: "validity ended since the outcome",
  source_unavailable: "issuer registry did not respond",
  restored: "confirmed by the issuer again",
};
const TRIGGER: Record<string, string> = { scheduler: "scheduled run", manual: "run on request", baseline: "baseline at the outcome" };

export function fmtIn(v: string | null | undefined): string {
  if (!v) return "not scheduled";
  const s = Math.round((new Date(v).getTime() - Date.now()) / 1000);
  if (s <= 60) return "due now";
  const m = Math.round(s / 60);
  if (m < 60) return `in ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `in ${h} h` : `in ${Math.round(h / 24)} d`;
}

function issuerName(s: string): string {
  return s.replace(/\s*\(SIMULATED\)\s*/i, "");
}

/** Twelve blocks for one watch interval: filled blocks are the time already elapsed since the last check. */
function IntervalBlocks({ last, next }: { last: string | null | undefined; next: string | null | undefined }) {
  if (!next) return null;
  const end = new Date(next).getTime();
  const start = last ? new Date(last).getTime() : end - 24 * 3600_000;
  const frac = Math.min(1, Math.max(0, (Date.now() - start) / Math.max(1, end - start)));
  const filled = Math.round(frac * 12);
  return (
    <span className="inline-flex items-end gap-[3px]" role="img" aria-label={`${Math.round(frac * 100)}% of the interval to the next check has passed`}>
      {Array.from({ length: 12 }, (_, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 + i * 0.025, duration: dur.ui, ease: ease.out }}
          className={cn("h-3 w-2 rounded-[2px] border", i < filled ? "border-brand-500 bg-brand-500" : "border-line-2 bg-transparent")}
        />
      ))}
    </span>
  );
}

function ItemRow({ i, simLink }: { i: WatchItem; simLink: boolean }) {
  const st = STATE[i.state] ?? { status: "not_checked", label: i.state };
  const changed = i.state !== "ok";
  return (
    <motion.li variants={fadeUp} layout="position" className={cn("relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-3 py-2.5", changed && "bg-mismatch-bg/40")}>
      <span className="mt-0.5">
        <StatusCube status={st.status} size={16} explain />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-ink">{i.label}</span>
          <span className="font-mono text-[12px] break-all text-ink-2">{i.ref_no}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          <span>{issuerName(i.issuer)}</span>
          <SimTag simulated />
          {i.valid_until && <span>valid until {fmtDate(i.valid_until)}</span>}
        </span>
        {changed && i.detail && <span className="mt-1 block text-xs text-mismatch-fg text-pretty">{i.detail}</span>}
      </span>
      <span className="text-right">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={i.state}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: dur.ui, ease: ease.out }}
            className={cn("block text-xs font-medium", changed ? "text-mismatch-fg" : "text-verified-fg")}
          >
            {st.label}
          </motion.span>
        </AnimatePresence>
        <span className="block text-[11px] text-ink-4">{i.last_checked_at ? `checked ${fmtRelative(i.last_checked_at)}` : "not checked yet"}</span>
        {simLink && (
          <Link
            to={`/issuers?code=${encodeURIComponent(i.issuer_code)}&ref=${encodeURIComponent(i.ref_no)}`}
            className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-brand-ink hover:underline"
          >
            Issuer simulator <ArrowUpRight aria-hidden className="size-3" />
          </Link>
        )}
      </span>
    </motion.li>
  );
}

export function OutcomeDialog({ open, onClose, watch }: { open: boolean; onClose: () => void; watch: ApplicationWatch | undefined }) {
  const { app } = useWorkspace();
  const toast = useToast();
  const m = useRecordOutcome(app.id);
  const ver = useVerifications(app.id, open);
  const name = useId();
  const options = watch?.outcomes ?? [];
  const [outcome, setOutcome] = useState("");
  const [reason, setReason] = useState("");
  const watchable = (ver.data ?? []).filter((a) => a.run_id === app.latest_run?.id && a.channel === "issuer_registry" && a.status === "verified").length;

  useEffect(() => {
    if (open) {
      setOutcome("");
      setReason("");
      m.reset();
    }
    // reset only when the dialog opens
  }, [open]);

  const short = reason.trim().length < 10;
  const submit = () =>
    m.mutate(
      { outcome, reason: reason.trim() },
      {
        onSuccess: (w) => {
          toast.success("Scrutiny outcome recorded", `Watching ${pluralize(w.items.length, "certificate")} from the issuer registries (SIMULATED) every ${w.interval_hours} h.`);
          onClose();
        },
      },
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Record scrutiny outcome"
      description="Record the outcome you have decided, with your reason. Pramana keeps it in the audit trail; it does not approve, reject or penalise."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!outcome || short} loading={m.isPending} leadingIcon={<Gavel />}>
            Record outcome
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {m.error && <ErrorState compact error={m.error} title="The outcome was not recorded" />}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-2">Outcome</legend>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
            {options.map((o) => {
              const on = outcome === o.value;
              return (
                <label
                  key={o.value}
                  className={cn(
                    "relative flex cursor-pointer rounded-[12px] border p-3 text-sm transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-400",
                    on ? "border-brand-400 bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-2 hover:border-line-2",
                  )}
                >
                  <input type="radio" name={name} value={o.value} checked={on} onChange={() => setOutcome(o.value)} className="sr-only" />
                  {o.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label="Reason" required hint={short ? "A written reason of at least 10 characters is required." : `${reason.trim().length} characters`}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why this outcome, in a sentence the next reviewer can follow." />
        </Field>
        <div className="flex items-start gap-2.5 rounded-[12px] border border-line bg-surface-2/60 p-3 text-sm text-ink-2">
          <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-500" />
          <p className="text-pretty">
            {ver.isPending
              ? "Counting the certificates that issuer registries confirmed on the latest run."
              : `After you record it, the ${pluralize(watchable, "certificate")} confirmed by an issuer registry on the latest run ${watchable === 1 ? "is" : "are"} re-checked every ${watch?.interval_hours ?? 24} h. A revocation, expiry or missing record raises an alert and a finding; it never changes the outcome you recorded.`}
          </p>
        </div>
      </div>
    </Dialog>
  );
}

export function WatchCard() {
  const { app } = useWorkspace();
  const { is } = useAuth();
  const toast = useToast();
  const q = useWatch(app.id);
  const run = useRunWatch();
  const [dialog, setDialog] = useState(false);
  const w = q.data;

  const runNow = () =>
    run.mutate(undefined, {
      onSuccess: (r) => {
        const mine = r.changes.filter((c) => c.application_id === app.id);
        if (mine.length) toast.info(`Watch found ${pluralize(mine.length, "change")} here`, mine.map((c) => `${c.label}: ${CHANGE[c.change] ?? c.change}`).join(". "));
        else toast.success("Watch run complete", `${pluralize(r.run.checked, "certificate")} checked across all watched applications${r.changes.length ? `, ${pluralize(r.changes.length, "change")} elsewhere` : ", no changes"}.`);
      },
      onError: (e) => toast.error("The watch did not run", errorMessage(e)),
    });

  return (
    <SectionCard
      eyebrow="After the scrutiny outcome"
      title="Re-verification watch"
      description="Certificates that issuer registries confirmed are asked again on a schedule. A change raises an alert and a finding for an official; it never changes a recorded outcome."
      actions={
        <>
          {w?.outcome && (
            <Button variant="ghost" size="sm" leadingIcon={<RefreshCw />} loading={run.isPending} onClick={runNow}>
              Run watch now
            </Button>
          )}
          {is("officer") && (
            <Button variant={w?.outcome ? "secondary" : "primary"} size="sm" leadingIcon={<Gavel />} onClick={() => setDialog(true)} disabled={!app.latest_run}>
              {w?.outcome ? "Record new outcome" : "Record scrutiny outcome"}
            </Button>
          )}
        </>
      }
    >
      {q.isPending ? (
        <Skeleton className="h-40" rounded="lg" />
      ) : q.error || !w ? (
        <ErrorState compact error={q.error} title="Could not load the watch" onRetry={() => void q.refetch()} />
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="min-w-0 space-y-4">
            {w.outcome ? (
              <div className="rounded-[12px] border border-line bg-surface-2/50 p-3">
                <div className="eyebrow mb-1">Scrutiny outcome recorded</div>
                <div className="flex items-start gap-2">
                  <Gavel aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-500" />
                  <span className="text-sm font-semibold text-ink">{w.outcome.label}</span>
                </div>
                <blockquote className="mt-2 border-l-2 border-brand-300 pl-3 text-sm text-ink-2 text-pretty">{w.outcome.reason}</blockquote>
                <p className="mt-2 text-xs text-ink-3">
                  Recorded by {w.outcome.recorded_by ?? "an official"} on {fmtDateTime(w.outcome.created_at)}, round {w.outcome.round}. Pramana recorded this decision; it did not make it.
                </p>
              </div>
            ) : (
              <div className="rounded-[12px] border border-dashed border-line-2 p-4 text-sm text-ink-3 text-pretty">
                No scrutiny outcome has been recorded, so nothing is watched yet. {is("officer") ? "Record one when scrutiny is complete." : "A scrutiny officer records it."}
              </div>
            )}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
              <dt className="text-ink-3">Last checked</dt>
              <dd className="text-ink-2">{w.last_run ? `${fmtRelative(w.last_run.finished_at)} (${TRIGGER[w.last_run.trigger] ?? w.last_run.trigger})` : "never"}</dd>
              <dt className="text-ink-3">Next check</dt>
              <dd className="flex flex-wrap items-center gap-2 text-ink-2">
                <Tooltip content={w.next_check ? fmtDateTime(w.next_check) : "Starts when an outcome is recorded"}>
                  <span tabIndex={0}>{w.scheduler_enabled ? fmtIn(w.next_check) : "scheduler off; run on request"}</span>
                </Tooltip>
                <IntervalBlocks last={w.last_run?.finished_at} next={w.next_check} />
              </dd>
              <dt className="text-ink-3">Schedule</dt>
              <dd className="text-ink-2">every {w.interval_hours} h, {pluralize(w.active_items, "certificate")} watched in all</dd>
            </dl>
          </div>

          <div className="min-w-0 space-y-4">
            <div>
              <div className="eyebrow mb-2">Watched here ({w.items.length})</div>
              {w.items.length === 0 ? (
                <p className="rounded-[12px] border border-dashed border-line-2 p-4 text-sm text-ink-3">
                  {w.outcome ? "No certificate was confirmed by an issuer registry on the run the outcome was recorded against." : "Nothing yet."}
                </p>
              ) : (
                <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
                  {w.items.map((i) => (
                    <ItemRow key={i.id} i={i} simLink={is("officer", "admin")} />
                  ))}
                </motion.ul>
              )}
            </div>
            {w.events.length > 0 && (
              <div>
                <div className="eyebrow mb-2">Changes the watch has seen</div>
                <ul className="space-y-1.5">
                  <AnimatePresence initial={false}>
                    {w.events.map((e) => (
                      <motion.li
                        key={e.id}
                        layout="position"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0, transition: { duration: dur.panel, ease: ease.out } }}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm"
                      >
                        <SeverityMeter severity={e.severity} />
                        <span className={cn("min-w-0 flex-1", e.change === "restored" ? "text-ink-3" : "text-ink")}>
                          {e.label}: {CHANGE[e.change] ?? e.change}
                          <span className="ml-2 text-xs text-ink-4">{fmtDateTime(e.created_at)}</span>
                        </span>
                        {e.finding_id && (
                          <Link to={appPath(app.id, "findings", { finding: e.finding_id })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline">
                            Open finding <ArrowUpRight aria-hidden className="size-3" />
                          </Link>
                        )}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      <OutcomeDialog open={dialog} onClose={() => setDialog(false)} watch={w} />
    </SectionCard>
  );
}
