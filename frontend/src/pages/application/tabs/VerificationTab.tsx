import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowUpRight, Check, FileText, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "../../../api";
import { fmtDateTime, pluralize } from "../../../lib/format";
import { CHANNELS, channelMeta, humanize, VERIFICATION_STATUSES, verificationMeta } from "../../../lib/labels";
import type { VerificationAttempt } from "../../../types";
import { Tag } from "../../../ui/Badge";
import { StatusCube } from "../../../ui/Blocks";
import { Button, IconButton } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { Field, Select, Textarea } from "../../../ui/Field";
import { dur, ease, spring } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../../ui/States";
import { useToast } from "../../../ui/Toast";
import { Tooltip } from "../../../ui/Tooltip";
import { useDocTypeLabel, useWorkspace } from "../context";
import { appPath, useManualVerification, useWidth } from "../data";
import { CautionNote, ComparisonTable, PaneLabel, SimTag } from "../parts";

const NEEDS_MANUAL = new Set(["source_unavailable", "verification_pending", "manual_review_required"]);
const MANUAL_STATUSES = ["verified", "mismatch_detected", "expired", "manual_review_required"] as const;
const SHORT: Record<string, string> = {
  issuer_signature: "Issuer sig.",
  applicant_signature: "Applicant sig.",
  signed_qr: "Signed QR",
  issuer_registry: "Registry",
  content_credentials: "C2PA",
  manual_confirmation: "Manual",
};
const SPLIT_AT = 900;
const MIN_NOTE = 8;

const when = (a: VerificationAttempt) => a.completed_at ?? a.started_at ?? "";

interface Recorded {
  docId: string;
  fromChannel: string;
  attemptId: string;
}

function useParam() {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (id: string | null) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (id) n.set("attempt", id);
          else n.delete("attempt");
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [params.get("attempt"), set] as const;
}

/* ---------- Manual confirmation form ---------- */

function ManualForm({ attempt, onRecorded }: { attempt: VerificationAttempt; onRecorded: (a: VerificationAttempt) => void }) {
  const { app } = useWorkspace();
  const toast = useToast();
  const m = useManualVerification(app.id);
  const [status, setStatus] = useState<string>("verified");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const short = note.trim().length < MIN_NOTE;

  useEffect(() => {
    setStatus("verified");
    setNote("");
    setTouched(false);
    m.reset();
  }, [attempt.id]);

  const submit = () => {
    setTouched(true);
    if (short) return;
    m.mutate(
      { attemptId: attempt.id, status, note: note.trim() },
      {
        onSuccess: (a) => {
          toast.success(`Manual confirmation recorded: ${verificationMeta[a.status]?.label ?? humanize(a.status)}`, `${channelMeta[attempt.channel]?.label ?? humanize(attempt.channel)} was ${verificationMeta[attempt.status]?.label.toLowerCase() ?? attempt.status}. Your note is in the audit trail.`);
          onRecorded(a);
        },
      },
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="rounded-[12px] border border-brand-200 bg-brand-soft/50 p-3"
    >
      <PaneLabel>Record a manual confirmation</PaneLabel>
      <p className="mb-3 text-xs text-ink-3 text-pretty">
        Use this after an offline check with the issuer, such as a letter, an email or a portal lookup. It adds a new attempt and keeps this one unchanged.
      </p>
      <div className="grid gap-3">
        <Field label="Outcome">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} selectSize="sm">
            {MANUAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {verificationMeta[s]?.label ?? humanize(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="How it was confirmed" error={touched && short ? `Write at least ${MIN_NOTE} characters.` : undefined} required>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Letter ref. no., who confirmed, date" invalid={touched && short} />
        </Field>
      </div>
      {m.error && <p className="mt-2 text-sm text-mismatch-fg">{errorMessage(m.error)}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs text-ink-3">
          Will record <StatusCube status={status} label size={12} />
        </span>
        <Button type="submit" size="sm" loading={m.isPending} leadingIcon={<Check />}>
          Record
        </Button>
      </div>
    </form>
  );
}

/* ---------- Attempt detail ---------- */

function AttemptDetail({
  a,
  all,
  canManual,
  onClose,
  onRecorded,
}: {
  a: VerificationAttempt;
  all: VerificationAttempt[];
  canManual: boolean;
  onClose?: () => void;
  onRecorded: (n: VerificationAttempt) => void;
}) {
  const { app, docs, openDoc } = useWorkspace();
  const docLabel = useDocTypeLabel();
  const r = a.response as { signer?: string; signer_role?: string; trust_anchor?: string; coverage?: string; revocation_checked?: boolean; time_source?: string; note?: string };
  const follows = typeof a.request?.follows === "string" ? (a.request.follows as string) : null;
  const followedBy = all.filter((x) => x.request?.follows === a.id).sort((x, y) => when(y).localeCompare(when(x)));
  const doc = a.document_id ? docs[a.document_id] : undefined;
  const meta = verificationMeta[a.status];

  return (
    <motion.div
      key={a.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.ui, ease: ease.out }}
      className="space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow mb-1 flex items-center gap-1.5">
            {channelMeta[a.channel]?.label ?? humanize(a.channel)}
            <SimTag channel={a.channel} simulated={a.simulated} />
          </div>
          <h3 className="font-display text-md font-semibold tracking-title text-ink">
            <StatusCube status={a.status} size={16} label />
          </h3>
          {meta && <p className="mt-0.5 text-sm text-ink-3">{meta.meaning}</p>}
        </div>
        {onClose && <IconButton size="sm" variant="ghost" label="Close attempt detail" icon={<X />} onClick={onClose} />}
      </div>

      {doc && (
        <button
          type="button"
          onClick={() => openDoc({ docId: doc.id })}
          className="flex w-full items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
        >
          <FileText aria-hidden className="size-4 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate text-ink">{docLabel(doc.declared_type)}</span>
          <span className="truncate text-xs text-ink-3">{doc.original_filename}</span>
        </button>
      )}

      <p className="text-xs text-ink-3">{channelMeta[a.channel]?.meaning}</p>

      {a.channel === "applicant_signature" && (
        <CautionNote title="Applicant signature">Proves who uploaded the file, not who issued it.</CautionNote>
      )}

      {(r.signer || r.signer_role || r.trust_anchor) && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-[10px] border border-line bg-surface-2/50 p-3 text-xs">
          {r.signer && (
            <>
              <dt className="text-ink-3">Signer</dt>
              <dd className="text-ink">{r.signer}</dd>
            </>
          )}
          {r.signer_role && (
            <>
              <dt className="text-ink-3">Signer role</dt>
              <dd className="font-medium text-ink">{humanize(r.signer_role)}</dd>
            </>
          )}
          {r.trust_anchor && (
            <>
              <dt className="text-ink-3">Trust anchor</dt>
              <dd className="text-ink">{r.trust_anchor}</dd>
            </>
          )}
          {r.coverage && (
            <>
              <dt className="text-ink-3">Coverage</dt>
              <dd className="text-ink">{humanize(r.coverage.toLowerCase())}</dd>
            </>
          )}
          {typeof r.revocation_checked === "boolean" && (
            <>
              <dt className="text-ink-3">Revocation</dt>
              <dd className="text-ink">{r.revocation_checked ? "Checked" : "Not checked (offline)"}</dd>
            </>
          )}
        </dl>
      )}

      {a.detail && <p className="text-sm text-ink-2 text-pretty">{a.detail}</p>}
      {a.comparison.length > 0 && (
        <div>
          <PaneLabel>Submitted against the source</PaneLabel>
          <ComparisonTable comparisons={a.comparison} />
        </div>
      )}

      <p className="text-[11px] text-ink-4">{[a.source_name, a.actor ? `by ${a.actor}` : null, when(a) ? fmtDateTime(when(a)) : null].filter(Boolean).join(", ")}</p>

      {follows && (
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <Info aria-hidden className="size-3.5" /> Follows an earlier attempt, which stays on record unchanged.
        </p>
      )}

      {followedBy.length > 0 && (
        <div className="rounded-[10px] border border-verified-dot/30 bg-verified-bg/40 p-3 text-sm">
          <span className="font-medium text-ink">Manually confirmed since:</span>{" "}
          <StatusCube status={followedBy[0].status} label size={12} className="align-middle" />
          {followedBy[0].detail && <p className="mt-1 text-xs text-ink-3">"{followedBy[0].detail}"</p>}
        </div>
      )}

      {NEEDS_MANUAL.has(a.status) && a.channel !== "manual_confirmation" && canManual && <ManualForm attempt={a} onRecorded={onRecorded} />}
      {NEEDS_MANUAL.has(a.status) && !canManual && (
        <p className="text-xs text-ink-3">The verification cell or a scrutiny officer can record a manual confirmation for this attempt.</p>
      )}

      {a.document_id && (
        <Link to={appPath(app.id, "documents", { doc: a.document_id, panel: "verification" })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline">
          Open the document with its verification panel <ArrowUpRight aria-hidden className="size-3" />
        </Link>
      )}
    </motion.div>
  );
}

/* ---------- Matrix ---------- */

interface RowData {
  docId: string;
  cells: Record<string, { latest: VerificationAttempt; count: number } | undefined>;
}

function MatrixRow({
  row,
  selected,
  onPick,
  recorded,
  inline,
}: {
  row: RowData;
  selected: string | null;
  onPick: (id: string) => void;
  recorded: Recorded | null;
  inline?: React.ReactNode;
}) {
  const { docs } = useWorkspace();
  const label = useDocTypeLabel();
  const d = docs[row.docId];
  const bar = recorded && recorded.docId === row.docId ? recorded : null;
  const fromIdx = bar ? CHANNELS.indexOf(bar.fromChannel as (typeof CHANNELS)[number]) : -1;
  const manualIdx = CHANNELS.indexOf("manual_confirmation");
  const any = CHANNELS.some((c) => row.cells[c]);
  return (
    <div role="rowgroup" className="border-t border-line first:border-t-0">
      <div role="row" className="grid grid-cols-[minmax(0,1fr)_repeat(5,minmax(52px,72px))] items-center px-3 transition-colors hover:bg-surface-2/50">
        <div role="rowheader" className="min-w-0 py-2.5 pr-3" style={{ gridColumn: 1, gridRow: 1 }}>
          <div className="truncate text-sm font-medium text-ink">{d ? label(d.declared_type) : row.docId}</div>
          <div className="truncate text-[11.5px] text-ink-3">{any ? d?.original_filename : "No channel applied"}</div>
        </div>
        {bar && fromIdx >= 0 && (
          <motion.span
            aria-hidden
            className="pointer-events-none mx-[36px] h-[2px] self-center rounded-full bg-gradient-to-r from-unavail-dot via-brand-400 to-verified-dot"
            style={{ gridColumn: `${fromIdx + 2} / ${manualIdx + 3}`, gridRow: 1, transformOrigin: "left" }}
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 1, opacity: [1, 1, 0.35] }}
            transition={{ duration: dur.story, ease: ease.inOut, opacity: { duration: 2.4, times: [0, 0.6, 1] } }}
          />
        )}
        {CHANNELS.map((c, i) => {
          const cell = row.cells[c];
          const isNew = !!bar && c === "manual_confirmation" && cell?.latest.id === bar.attemptId;
          return (
            <div role="cell" key={c} className="flex justify-center py-2" style={{ gridColumn: i + 2, gridRow: 1 }}>
              {cell ? (
                <Tooltip
                  content={
                    <>
                      <b className="font-semibold">{channelMeta[c]?.label}:</b> {verificationMeta[cell.latest.status]?.label ?? humanize(cell.latest.status)}
                      {cell.latest.simulated ? " (simulated source)" : ""}
                      {cell.count > 1 ? `, latest of ${cell.count}` : ""}
                    </>
                  }
                >
                  <motion.button
                    type="button"
                    onClick={() => onPick(cell.latest.id)}
                    aria-pressed={selected === cell.latest.id}
                    aria-label={`${channelMeta[c]?.label}: ${verificationMeta[cell.latest.status]?.label ?? cell.latest.status}`}
                    initial={isNew ? { scale: 0, rotate: -30 } : false}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={isNew ? { ...spring.snappy, delay: dur.story * 0.8 } : undefined}
                    whileTap={{ scale: 0.9 }}
                    className={cn(
                      "relative grid size-10 place-items-center rounded-[10px] bg-surface transition-[box-shadow,background-color] duration-200 hover:bg-surface-2",
                      selected === cell.latest.id ? "shadow-sm ring-2 ring-brand-400" : "ring-1 ring-transparent hover:ring-line-2",
                      NEEDS_MANUAL.has(cell.latest.status) && !row.cells.manual_confirmation && "after:absolute after:-top-0.5 after:-right-0.5 after:size-2 after:rounded-full after:bg-manual-dot",
                    )}
                  >
                    <StatusCube status={cell.latest.status} size={20} />
                    {cell.count > 1 && <span className="absolute -right-1 -bottom-1 rounded-full bg-ink px-1 text-[9.5px] font-semibold text-canvas tabular">{cell.count}</span>}
                  </motion.button>
                </Tooltip>
              ) : (
                <span aria-label="Not applied" className="h-px w-3 bg-line-2" />
              )}
            </div>
          );
        })}
      </div>
      {inline}
    </div>
  );
}

export function VerificationTab({ query }: { query: UseQueryResult<VerificationAttempt[]> }) {
  const { app, role } = useWorkspace();
  const [selected, select] = useParam();
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const split = width >= SPLIT_AT;
  const canManual = role === "officer" || role === "verifier";
  const latestRun = app.latest_run?.id;

  const all = useMemo(() => query.data ?? [], [query.data]);
  const current = useMemo(() => all.filter((a) => !latestRun || a.run_id === latestRun || a.channel === "manual_confirmation"), [all, latestRun]);

  const rows: RowData[] = useMemo(() => {
    const order = app.documents.filter((d) => !d.superseded).map((d) => d.id);
    for (const a of current) if (a.document_id && !order.includes(a.document_id)) order.push(a.document_id);
    return order.map((docId) => {
      const cells: RowData["cells"] = {};
      for (const c of CHANNELS) {
        const xs = current.filter((a) => a.document_id === docId && a.channel === c).sort((x, y) => when(y).localeCompare(when(x)));
        if (xs.length) cells[c] = { latest: xs[0], count: xs.length };
      }
      return { docId, cells };
    });
  }, [app.documents, current]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) for (const ch of CHANNELS) {
      const cell = r.cells[ch];
      if (cell) c[cell.latest.status] = (c[cell.latest.status] ?? 0) + 1;
    }
    return c;
  }, [rows]);
  const waiting = rows.filter((r) => !r.cells.manual_confirmation && CHANNELS.some((c) => r.cells[c] && NEEDS_MANUAL.has(r.cells[c]!.latest.status))).length;

  const sel = all.find((a) => a.id === selected) ?? null;

  useEffect(() => {
    if (!recorded) return;
    const t = window.setTimeout(() => setRecorded(null), 4000);
    return () => window.clearTimeout(t);
  }, [recorded]);

  if (query.isPending)
    return (
      <div className="space-y-2" role="status">
        <span className="sr-only">Loading verification attempts</span>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  if (query.error) return <ErrorState error={query.error} title="Could not load verification attempts" onRetry={() => void query.refetch()} />;
  if (!current.length) return <EmptyState sky title="No verification attempts" description={app.latest_run ? "No verification channel applied on the latest run." : "Run validation to verify the documents."} />;

  const onRecorded = (from: VerificationAttempt) => (n: VerificationAttempt) => {
    if (from.document_id) setRecorded({ docId: from.document_id, fromChannel: from.channel, attemptId: n.id });
    select(n.id);
  };

  const detail = (a: VerificationAttempt, closable: boolean) => (
    <AttemptDetail a={a} all={all} canManual={canManual} onClose={closable ? () => select(null) : undefined} onRecorded={onRecorded(a)} />
  );

  return (
    <div ref={wrap} className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-card border border-line bg-surface px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {VERIFICATION_STATUSES.filter((s) => counts[s]).map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-sm text-ink-2">
              <StatusCube status={s} size={14} explain />
              {verificationMeta[s]?.label}
              <span className="font-semibold text-ink tabular">{counts[s]}</span>
            </span>
          ))}
        </div>
        {waiting > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-manual-bg px-2.5 py-1 text-xs font-medium text-manual-fg">
            <span aria-hidden className="size-1.5 rounded-full bg-manual-dot" />
            {pluralize(waiting, "document")} waiting for a manual confirmation
          </span>
        )}
      </section>

      <div className={cn("grid items-start gap-4", split && "grid-cols-[minmax(0,1fr)_minmax(320px,400px)]")}>
        <div role="table" aria-label="Verification by document and channel" className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-xs">
          <div role="rowgroup">
            <div role="row" className="grid grid-cols-[minmax(0,1fr)_repeat(5,minmax(52px,72px))] items-end border-b border-line bg-surface-2/60 px-3 py-2">
              <div role="columnheader" className="eyebrow">Document</div>
              {CHANNELS.map((c) => (
                <Tooltip key={c} content={channelMeta[c]?.meaning}>
                  <div role="columnheader" tabIndex={0} className="text-center text-[10.5px] leading-tight font-semibold tracking-[0.04em] text-ink-3 uppercase">
                    {SHORT[c]}
                  </div>
                </Tooltip>
              ))}
            </div>
          </div>
          {rows.map((r) => {
            const inlineSel = !split && sel && sel.document_id === r.docId ? sel : null;
            return (
              <MatrixRow
                key={r.docId}
                row={r}
                selected={selected}
                onPick={(id) => select(selected === id ? null : id)}
                recorded={recorded}
                inline={
                  <AnimatePresence initial={false}>
                    {inlineSel && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: dur.panel, ease: ease.out }}
                        className="overflow-hidden border-t border-line bg-canvas/50"
                      >
                        <div className="p-4">{detail(inlineSel, true)}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                }
              />
            );
          })}
        </div>

        {split && (
          <aside aria-label="Attempt detail" className="sticky top-32 rounded-card border border-line bg-surface p-4 shadow-sm">
            <AnimatePresence mode="wait" initial={false}>
              {sel ? (
                <div key={sel.id}>{detail(sel, true)}</div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 text-center">
                  <div className="mx-auto mb-3 flex w-fit gap-1">
                    {["verified", "mismatch_detected", "source_unavailable"].map((s) => (
                      <StatusCube key={s} status={s} size={18} />
                    ))}
                  </div>
                  <p className="text-sm font-medium text-ink">Select a cube</p>
                  <p className="mt-1 text-xs text-ink-3">Each cube is the latest attempt for a document on one channel. Amber dots are waiting for a manual confirmation.</p>
                  {waiting > 0 && (
                    <Tag variant="neutral" className="mt-3">
                      {pluralize(waiting, "waiting item")}
                    </Tag>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </aside>
        )}
      </div>
    </div>
  );
}
