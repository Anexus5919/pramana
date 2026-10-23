import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Link2, Link2Off, ShieldCheck, ShieldX } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { api, errorMessage, qk } from "../../../api";
import { fmtDateTime, fmtRelative, fmtValue, pluralize } from "../../../lib/format";
import { humanize, reviewActionLabel, roleLabel } from "../../../lib/labels";
import type { AuditEvent, ChainVerification } from "../../../types";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { Digest } from "../../../ui/Digest";
import { dur, ease, fadeUp, stagger } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../../ui/States";
import { useWorkspace } from "../context";

const STEP_MS = 90;

function actionText(action: string): string {
  const [obj, verb] = action.includes(".") ? [action.slice(0, action.indexOf(".")), action.slice(action.indexOf(".") + 1)] : ["", action];
  if (obj === "finding" && reviewActionLabel[verb]) return `Finding: ${reviewActionLabel[verb]}`;
  if (action === "verification.manual_recorded") return "Manual verification recorded";
  return humanize(`${obj} ${verb}`.trim());
}

type LinkState = "idle" | "ok" | "broken" | "after";

function linkState(seq: number, walked: boolean, v: ChainVerification | null): LinkState {
  if (!v || !walked) return "idle";
  if (v.first_broken_seq === null || seq < v.first_broken_seq) return "ok";
  return seq === v.first_broken_seq ? "broken" : "after";
}

const BLOCK: Record<LinkState, string> = {
  idle: "bg-brand-500",
  ok: "bg-verified-dot",
  broken: "bg-mismatch-dot",
  after: "bg-unavail-dot",
};
const RAIL: Record<LinkState, string> = {
  idle: "bg-line-2",
  ok: "bg-verified-dot",
  broken: "bg-mismatch-dot",
  after: "bg-line-2",
};

function Details({ d }: { d: Record<string, unknown> }) {
  const entries = Object.entries(d ?? {});
  if (!entries.length) return <p className="text-xs text-ink-4">No details recorded.</p>;
  return (
    <dl className="grid grid-cols-[minmax(90px,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {entries.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="text-ink-3">{humanize(k)}</dt>
          <dd className="font-mono text-[11.5px] break-words text-ink">{typeof v === "object" && v !== null ? JSON.stringify(v) : fmtValue(v)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function EventBlock({ e, state, last, open, onToggle }: { e: AuditEvent; state: LinkState; last: boolean; open: boolean; onToggle: () => void }) {
  return (
    <motion.li variants={fadeUp} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
      <div className="relative flex justify-center">
        {!last && (
          <span aria-hidden className="absolute top-7 -bottom-3 w-[2px] overflow-hidden rounded-full bg-line-2">
            <motion.span
              className={cn("absolute inset-0 origin-top", RAIL[state])}
              initial={false}
              animate={{ scaleY: state === "idle" || state === "after" ? 0 : 1 }}
              transition={{ duration: STEP_MS / 1000, ease: "linear" }}
            />
          </span>
        )}
        <motion.span
          aria-hidden
          className={cn("relative mt-2 size-5 rounded-[5px] shadow-xs transition-colors duration-200", BLOCK[state])}
          animate={state === "broken" ? { x: [0, -3, 3, -2, 2, 0] } : { scale: state === "ok" ? [1, 1.18, 1] : 1 }}
          transition={{ duration: state === "broken" ? 0.45 : 0.25 }}
        >
          <span className="absolute inset-x-0 top-0 h-[5px] rounded-t-[5px] bg-white/35" />
        </motion.span>
      </div>
      <div className={cn("mb-3 min-w-0 rounded-[12px] border bg-surface transition-colors duration-200", state === "broken" ? "border-mismatch-dot/60" : "border-line")}>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-[11px] text-ink-3 tabular">#{e.seq}</span>
              <span className="text-sm font-medium text-ink">{actionText(e.action)}</span>
            </div>
            <div className="mt-0.5 text-xs text-ink-3">
              {[`${e.actor}${e.actor_role ? ` (${roleLabel[e.actor_role] ?? humanize(e.actor_role)})` : ""}`, e.ts ? `${fmtDateTime(e.ts)}, ${fmtRelative(e.ts)}` : null].filter(Boolean).join(", ")}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {state === "broken" && <span className="rounded-full bg-mismatch-bg px-2 py-0.5 text-[11px] font-semibold text-mismatch-fg">Hash does not match</span>}
            <span className="hidden font-mono text-[11px] text-ink-4 sm:block">{e.hash.slice(0, 10)}</span>
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: dur.ui }} className="text-ink-3">
              <ChevronDown aria-hidden className="size-4" />
            </motion.span>
          </div>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: dur.panel, ease: ease.out }}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-t border-line px-3 py-3">
                <Details d={e.details} />
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="min-w-0">
                    <div className="eyebrow mb-0.5">Previous hash</div>
                    <Digest value={e.prev_hash} label="Previous hash" head={10} tail={8} />
                  </div>
                  <div className="min-w-0">
                    <div className="eyebrow mb-0.5">This event's hash</div>
                    <Digest value={e.hash} label="Event hash" head={10} tail={8} />
                  </div>
                </div>
                {e.object_id && (
                  <p className="text-xs text-ink-3">
                    {humanize(e.object_type)} <span className="font-mono text-ink-2">{e.object_id}</span>
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

function Gap({ n, state }: { n: number; state: LinkState }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3" aria-label={`${pluralize(n, "event")} from other applications`}>
      <div className="relative flex justify-center">
        <span aria-hidden className={cn("absolute -top-3 -bottom-3 w-0 border-l-2 border-dashed transition-colors duration-200", state === "ok" ? "border-verified-dot" : "border-line-2")} />
      </div>
      <p className="mb-3 py-1 text-xs text-ink-3">
        {pluralize(n, "event")} from other applications {n === 1 ? "sits" : "sit"} between these in the shared chain
      </p>
    </li>
  );
}

function Summary({ v }: { v: ChainVerification }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.panel, ease: ease.out }}
      className={cn("rounded-card border p-4 shadow-sm", v.intact ? "border-verified-dot/40 bg-verified-bg/50" : "border-mismatch-dot/40 bg-mismatch-bg/50")}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px] text-white", v.intact ? "bg-verified-dot" : "bg-mismatch-dot")}>
          {v.intact ? <ShieldCheck aria-hidden className="size-5" /> : <ShieldX aria-hidden className="size-5" />}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-md font-semibold tracking-title text-ink">{v.intact ? "Chain intact" : `Chain broken at event #${v.first_broken_seq}`}</h3>
          <p className="mt-0.5 text-sm text-ink-2">
            {pluralize(v.events_checked, "event")} checked across the whole system chain, not only this application.{" "}
            {v.intact ? "Every event's hash matches its contents and links to the one before it." : "Events from this point on cannot be trusted until the break is explained."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            Head hash <Digest value={v.head_hash} label="Head hash" head={10} tail={8} />
          </div>
        </div>
      </div>
      {v.checkpoints.length > 0 && (
        <div className="mt-3 border-t border-line/70 pt-3">
          <div className="eyebrow mb-1.5">Signed checkpoints</div>
          <ul className="space-y-1">
            {v.checkpoints.map((c) => (
              <li key={`${c.seq}-${c.created_at}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                <span className="font-mono tabular">#{c.seq}</span>
                <span className={cn("inline-flex items-center gap-1", c.signature_valid ? "text-verified-fg" : "text-mismatch-fg")}>
                  {c.signature_valid ? <Link2 aria-hidden className="size-3" /> : <Link2Off aria-hidden className="size-3" />}
                  Signature {c.signature_valid ? "valid" : "invalid"}
                </span>
                <span className={c.matches_chain ? "text-verified-fg" : "text-mismatch-fg"}>{c.matches_chain ? "Matches the chain" : "Does not match the chain"}</span>
                <span className="text-ink-3">{fmtDateTime(c.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.section>
  );
}

export function AuditTab() {
  const { app, role } = useWorkspace();
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: qk.appAudit(app.id), queryFn: () => api.applicationAudit(app.id) });
  const verify = useMutation({ mutationFn: api.verifyAudit });
  const [walk, setWalk] = useState(-1);
  const [open, setOpen] = useState<number | null>(null);
  const canVerify = role === "officer" || role === "admin";

  const events = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.seq - b.seq), [q.data]);
  const v = verify.data ?? null;
  const done = !!v && walk >= events.length - 1;

  // Walk the chain block by block once the verification result is in
  useEffect(() => {
    if (!v) return;
    if (reduce) {
      setWalk(events.length - 1);
      return;
    }
    setWalk(-1);
    let i = -1;
    const t = window.setInterval(() => {
      i += 1;
      setWalk(i);
      const e = events[i];
      if (i >= events.length - 1 || (e && v.first_broken_seq !== null && e.seq >= v.first_broken_seq)) {
        setWalk(events.length - 1);
        window.clearInterval(t);
      }
    }, STEP_MS);
    return () => window.clearInterval(t);
  }, [v, events, reduce]);

  if (q.isPending)
    return (
      <div className="space-y-2" role="status">
        <span className="sr-only">Loading the audit trail</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  if (q.error) return <ErrorState error={q.error} title="Could not load the audit trail" onRetry={() => void q.refetch()} />;
  if (!events.length) return <EmptyState sky title="No audit events" description="Nothing has been recorded for this application yet." />;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <section aria-label="Audit chain" className="min-w-0">
        <motion.ol variants={stagger(0.03)} initial="hidden" animate="show">
          {events.map((e, i) => {
            const prev = events[i - 1];
            const gap = prev ? e.seq - prev.seq - 1 : 0;
            const state = linkState(e.seq, i <= walk, v);
            return (
              <Fragment key={e.seq}>
                {gap > 0 && <Gap n={gap} state={i <= walk && state === "ok" ? "ok" : "idle"} />}
                <EventBlock e={e} state={state} last={i === events.length - 1} open={open === e.seq} onToggle={() => setOpen(open === e.seq ? null : e.seq)} />
              </Fragment>
            );
          })}
        </motion.ol>
      </section>

      <aside className="space-y-3 lg:sticky lg:top-32">
        <section className="rounded-card border border-line bg-surface p-4 shadow-xs">
          <div className="eyebrow mb-1">Tamper evidence</div>
          <h3 className="font-display text-md font-semibold tracking-title text-ink">{pluralize(events.length, "event")} for this application</h3>
          <p className="mt-1 text-sm text-ink-3 text-pretty">
            Every action is a block that stores the hash of the block before it. Changing any past event breaks every link after it, so the break shows exactly where.
          </p>
          {canVerify ? (
            <Button
              className="mt-3 w-full"
              leadingIcon={<ShieldCheck />}
              loading={verify.isPending || (!!v && !done)}
              onClick={() => {
                setWalk(-1);
                verify.mutate();
              }}
            >
              {v ? "Verify again" : "Verify chain integrity"}
            </Button>
          ) : (
            <p className="mt-3 text-xs text-ink-3">A scrutiny officer or an administrator can verify the chain.</p>
          )}
          {verify.error && <p className="mt-2 text-sm text-mismatch-fg">{errorMessage(verify.error)}</p>}
        </section>
        <AnimatePresence>{v && done && <Summary key={v.head_hash} v={v} />}</AnimatePresence>
      </aside>
    </div>
  );
}
