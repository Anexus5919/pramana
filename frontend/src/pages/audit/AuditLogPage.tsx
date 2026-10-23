import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Search, ShieldCheck, Signature, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { fmtDateTime } from "../../lib/format";
import type { AuditEvent, ChainVerification, Checkpoint } from "../../types";
import { Badge } from "../../ui/Badge";
import { StatusCube } from "../../ui/Blocks";
import { Button } from "../../ui/Button";
import { SectionCard } from "../../ui/Card";
import { cn } from "../../ui/cn";
import { Digest } from "../../ui/Digest";
import { Input } from "../../ui/Field";
import { PageHeader } from "../../ui/Layout";
import { dur, ease } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../ui/States";
import { Segmented } from "../../ui/Tabs";
import { useToast } from "../../ui/Toast";
import { FAMILIES, actionLabel, family, familyColor, recompute, type LinkState, type Recomputed } from "./chain";
import { EventRow } from "./parts";

const PAGE = 60;

type Walk = { phase: "idle" } | { phase: "walking"; results: Recomputed[]; shown: number } | { phase: "done"; results: Recomputed[] };

function ChainStrip({
  asc,
  states,
  shown,
  onPick,
}: {
  asc: AuditEvent[];
  states: Map<number, LinkState>;
  shown: number;
  onPick: (seq: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-[3px]" role="list" aria-label="Event chain, oldest first">
      {asc.map((e, i) => {
        const st = i < shown ? states.get(e.seq) : undefined;
        const head = i === shown - 1 && shown < asc.length;
        return (
          <button
            key={e.seq}
            type="button"
            role="listitem"
            title={`#${e.seq} ${actionLabel(e.action)}${st ? (st === "ok" ? ", hash matches" : ", does not match") : ""}`}
            aria-label={`Event ${e.seq}, ${actionLabel(e.action)}`}
            onClick={() => onPick(e.seq)}
            className={cn(
              "relative size-[11px] rounded-[2.5px] transition-[background-color,transform,opacity] duration-200 hover:scale-150 hover:z-[1] focus-visible:scale-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-400",
              head && "scale-150",
            )}
            style={{
              background: st === "ok" ? "var(--verified-dot)" : st ? "var(--mismatch-dot)" : (familyColor[family(e.action)] ?? "var(--ink-3)"),
              opacity: st || shown === 0 ? 1 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
}

function Result({
  walk,
  server,
  serverError,
  serverPending,
  total,
}: {
  walk: Walk;
  server: ChainVerification | undefined;
  serverError: unknown;
  serverPending: boolean;
  total: number;
}) {
  if (walk.phase === "idle") return null;
  const results = walk.results;
  const bad = results.filter((r) => r.state !== "ok");
  const done = walk.phase === "done";
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: dur.panel, ease: ease.out }}
      className="overflow-hidden"
    >
      <div className="mt-5 grid gap-3 border-t border-line pt-5 md:grid-cols-2">
        <div className="rounded-card border border-line bg-surface-2/60 p-4">
          <div className="eyebrow mb-2">In your browser</div>
          {!done ? (
            <p className="text-sm text-ink-2 tabular">
              Recomputing hash {walk.phase === "walking" ? Math.min(walk.shown, total) : 0} of {total}
            </p>
          ) : bad.length === 0 ? (
            <p className="flex items-start gap-2 text-sm text-ink">
              <StatusCube tone="verified" size={14} className="mt-0.5" />
              <span>
                <b className="font-semibold">All {results.length} loaded events recompute to their stored hash</b>, and each one points at the event
                before it.
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-2 text-sm text-ink">
              <StatusCube tone="mismatch" size={14} className="mt-0.5" />
              <span>
                <b className="font-semibold text-mismatch-fg">{bad.length} events do not match</b>, first at #{bad[0].seq}. Something changed after it
                was recorded.
              </span>
            </p>
          )}
          <p className="mt-2 text-xs text-ink-3 text-pretty">SHA-256 of the previous hash plus the event's canonical JSON, computed with the Web Crypto API.</p>
        </div>
        <div className="rounded-card border border-line bg-surface-2/60 p-4">
          <div className="eyebrow mb-2">On the server</div>
          {serverPending || !done ? (
            <p className="text-sm text-ink-3">Waiting for the browser walk to finish</p>
          ) : serverError ? (
            <ErrorState error={serverError} title="Server check failed" compact />
          ) : server ? (
            <div className="space-y-2 text-sm">
              <p className="flex items-start gap-2 text-ink">
                <StatusCube tone={server.intact ? "verified" : "mismatch"} size={14} className="mt-0.5" />
                <span>
                  <b className="font-semibold">{server.intact ? "Chain intact" : "Chain broken"}</b> across {server.events_checked} events
                  {server.first_broken_seq !== null && (
                    <span className="text-mismatch-fg">, first break at #{server.first_broken_seq}</span>
                  )}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                Head hash <Digest value={server.head_hash} label="Head hash" />
              </div>
              {server.checkpoints.length > 0 && (
                <ul className="space-y-1">
                  {server.checkpoints.map((c) => (
                    <li key={`${c.seq}-${c.created_at}`} className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                      <Signature className="size-3.5" aria-hidden /> Checkpoint at #{c.seq}
                      <Badge tone={c.signature_valid ? "verified" : "mismatch"}>{c.signature_valid ? "Signature valid" : "Signature invalid"}</Badge>
                      <Badge tone={c.matches_chain ? "verified" : "mismatch"}>{c.matches_chain ? "Matches chain" : "Does not match chain"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

export default function AuditLogPage() {
  const { is, role } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: qk.audit, queryFn: () => api.audit(1000) });
  const [query, setQuery] = useState("");
  const [fam, setFam] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [hovered, setHovered] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ seq: number; n: number } | null>(null);
  const [walk, setWalk] = useState<Walk>({ phase: "idle" });
  const [cp, setCp] = useState<Checkpoint | null>(null);
  const raf = useRef<number | null>(null);

  const events = useMemo(() => q.data ?? [], [q.data]);
  const asc = useMemo(() => [...events].sort((a, b) => a.seq - b.seq), [events]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[family(e.action)] = (c[family(e.action)] ?? 0) + 1;
    return c;
  }, [events]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((e) => {
      if (fam !== "all" && family(e.action) !== fam) return false;
      if (!needle) return true;
      const hay = `${e.seq} ${e.action} ${actionLabel(e.action)} ${e.actor} ${e.actor_role} ${e.object_type} ${e.object_id ?? ""} ${e.application_id ?? ""} ${JSON.stringify(e.details)} ${e.hash}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [events, query, fam]);

  const server = useQuery({ queryKey: [...qk.audit, "verify"], queryFn: api.verifyAudit, enabled: false });

  const states = useMemo(() => {
    const m = new Map<number, LinkState>();
    if (walk.phase !== "idle") for (const r of walk.results) m.set(r.seq, r.state);
    return m;
  }, [walk]);
  const shown = walk.phase === "walking" ? walk.shown : walk.phase === "done" ? asc.length : 0;

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);

  const verify = useCallback(async () => {
    if (!asc.length) return;
    const results = await recompute(asc);
    if (reduce) {
      setWalk({ phase: "done", results });
      void server.refetch();
      return;
    }
    // Light the blocks in chain order over about two seconds, then ask the server for its own walk
    const per = Math.max(1, Math.ceil(asc.length / 120));
    let n = 0;
    const step = () => {
      n = Math.min(asc.length, n + per);
      setWalk({ phase: "walking", results, shown: n });
      if (n < asc.length) raf.current = requestAnimationFrame(step);
      else {
        setWalk({ phase: "done", results });
        void server.refetch();
      }
    };
    step();
  }, [asc, reduce, server]);

  const checkpoint = useMutation({
    mutationFn: api.checkpoint,
    onSuccess: async (res) => {
      setCp(res);
      if (walk.phase === "done") void server.refetch();
      toast.success("Signed checkpoint created", res.seq ? `The chain head at event #${res.seq} is now signed.` : "Nothing new to sign.");
      await qc.invalidateQueries({ queryKey: qk.audit });
    },
  });

  const jump = useCallback(
    (seq: number) => {
      const visible = filtered.findIndex((e) => e.seq === seq);
      if (visible < 0) {
        setQuery("");
        setFam("all");
      }
      const idx = visible < 0 ? events.findIndex((e) => e.seq === seq) : visible;
      if (idx >= limit) setLimit(Math.ceil((idx + 1) / PAGE) * PAGE);
      setFlash((f) => ({ seq, n: (f?.n ?? 0) + 1 }));
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.getElementById(`audit-${seq}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" })),
      );
    },
    [filtered, events, limit, reduce],
  );

  const famOptions = [
    { value: "all", label: "All", count: events.length },
    ...FAMILIES.filter((f) => counts[f.id]).map((f) => ({ value: f.id, label: <span className="whitespace-nowrap">{f.label}</span>, count: counts[f.id] })),
  ];
  const walking = walk.phase === "walking";
  const firstBad = walk.phase === "done" ? walk.results.find((r) => r.state !== "ok") : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Accountability"
        title="Audit log"
        description="Every sign-in, upload, check and decision is recorded in order. Each entry carries the hash of the one before it, so changing or deleting any entry breaks every link after it."
        actions={
          <>
            {is("admin") && (
              <Button variant="secondary" leadingIcon={<Signature />} loading={checkpoint.isPending} onClick={() => checkpoint.mutate()}>
                Create signed checkpoint
              </Button>
            )}
            <Button magnetic leadingIcon={<ShieldCheck />} loading={walking} disabled={!asc.length} onClick={() => void verify()}>
              Verify chain integrity
            </Button>
          </>
        }
      />

      {q.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-40" rounded="lg" />
          <Skeleton className="h-96" rounded="lg" />
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} title="Could not load the audit log" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <div className="space-y-6">
          <SectionCard
            eyebrow="Hash chain"
            title={`${asc.length} events, oldest first`}
            description="One block per event. Select a block to jump to it. Verifying turns each block green when its hash recomputes and links to the block before it."
            actions={
              asc.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-3">
                  <Link2 className="size-3.5" aria-hidden />#{asc[0].seq} to #{asc[asc.length - 1].seq}
                </span>
              ) : null
            }
          >
            <ChainStrip asc={asc} states={states} shown={shown} onPick={jump} />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
              {FAMILIES.filter((f) => counts[f.id]).map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                  <span className="size-2.5 rounded-[2px]" style={{ background: familyColor[f.id] }} />
                  {f.label}
                </span>
              ))}
              {walk.phase !== "idle" && (
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                  <span className="size-2.5 rounded-[2px] bg-verified-dot" /> Hash verified
                </span>
              )}
            </div>
            {firstBad && (
              <Button size="sm" variant="danger" className="mt-3" onClick={() => jump(firstBad.seq)}>
                Show event #{firstBad.seq}
              </Button>
            )}
            <Result walk={walk} server={server.data} serverError={server.error} serverPending={server.isFetching} total={asc.length} />
            <AnimatePresence>
              {cp && cp.seq !== undefined && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-brand-300/50 bg-brand-soft px-4 py-3 text-sm"
                >
                  <Signature className="size-4 text-brand-500" aria-hidden />
                  <span className="font-medium text-ink">Checkpoint signed at #{cp.seq}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                    head <Digest value={cp.head_hash} label="Head hash" />
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                    signature <Digest value={cp.signature} label="Signature" />
                  </span>
                  <button type="button" onClick={() => setCp(null)} aria-label="Dismiss" className="ml-auto rounded-md p-1 text-ink-3 hover:bg-surface hover:text-ink">
                    <X className="size-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </SectionCard>

          <SectionCard
            flush
            eyebrow="Timeline"
            title="Events, newest first"
            description="Hover an event to light its link: its prev value is the hash of the event below it."
            actions={<span className="text-xs text-ink-3 tabular">{filtered.length === events.length ? `${events.length} events` : `${filtered.length} of ${events.length}`}</span>}
          >
            <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-5">
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
                placeholder="Search actor, action, application or hash"
                leadingIcon={<Search />}
                inputSize="sm"
                aria-label="Search the audit log"
                className="max-w-md"
              />
              <div className="-mx-1 max-w-full overflow-x-auto px-1 scrollbar-none">
                <Segmented
                  label="Filter by kind"
                  value={fam}
                  onChange={(v) => {
                    setFam(v);
                    setLimit(PAGE);
                  }}
                  options={famOptions}
                />
              </div>
            </div>
            {filtered.length === 0 ? (
              <EmptyState compact title="No events match" description="Clear the search or choose another kind." />
            ) : (
              <ul className="divide-y divide-line">
                {filtered.slice(0, limit).map((e, i) => (
                  <EventRow
                    key={e.seq}
                    e={e}
                    index={i}
                    hovered={hovered}
                    onHover={setHovered}
                    flash={flash?.seq === e.seq ? flash.n : 0}
                    check={states.get(e.seq)}
                    official={role !== "institution"}
                  />
                ))}
              </ul>
            )}
            {filtered.length > limit && (
              <div className="border-t border-line px-5 py-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                  Show {Math.min(PAGE, filtered.length - limit)} more of {filtered.length - limit}
                </Button>
              </div>
            )}
          </SectionCard>
          {events.length > 0 && (
            <p className="text-xs text-ink-3">
              Showing the latest {events.length} events. The oldest loaded is #{asc[0].seq} from {fmtDateTime(asc[0].ts)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
