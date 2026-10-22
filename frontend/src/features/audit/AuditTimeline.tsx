import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, CircleAlert, CircleCheck, Link2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api } from "../../api";
import { Button } from "../../components/ui/Button";
import { ErrorBanner } from "../../components/ui/Feedback";
import { fmtDateTime, fmtValue, shortHash } from "../../lib/format";
import { humanize, roleLabel } from "../../lib/labels";
import type { AuditEvent } from "../../types";

function actionTone(action: string): string {
  if (action.includes("failed") || action.includes("rejected")) return "bg-mismatch-dot";
  if (action.startsWith("validation") || action.startsWith("verification")) return "bg-verified-dot";
  if (action.startsWith("finding") || action.startsWith("rectification")) return "bg-manual-dot";
  if (action.startsWith("document")) return "bg-pending-dot";
  if (action.startsWith("auth")) return "bg-unchecked-dot";
  return "bg-primary";
}

function Details({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!entries.length) return null;
  return (
    <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
      {entries.map(([k, v]) => {
        const s = fmtValue(v);
        const hashy = typeof v === "string" && /^[0-9a-f]{40,}$/.test(v);
        return (
          <div key={k} className="contents">
            <dt className="text-subtle-fg">{humanize(k)}</dt>
            <dd className={clsx("truncate text-fg", hashy && "font-mono")} title={s}>
              {hashy ? shortHash(s, 16) : s}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function AuditTimeline({ events, showApplication = false }: { events: AuditEvent[]; showApplication?: boolean }) {
  return (
    <ol className="relative">
      {events.map((e, i) => (
        <li key={e.seq} className="relative grid grid-cols-[52px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
          <div className="relative flex justify-end pt-0.5">
            <span className="font-mono text-[11px] text-subtle-fg">#{e.seq}</span>
          </div>
          <div className="relative border-l border-line pl-5">
            <span
              aria-hidden
              className={clsx("absolute top-1.5 -left-[5px] size-2.5 rounded-full ring-4 ring-surface", actionTone(e.action))}
            />
            {i === events.length - 1 && <span aria-hidden className="absolute top-4 bottom-0 -left-px w-px bg-surface" />}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-sm text-fg">
                <span className="font-semibold">{humanize(e.action)}</span>
                <span className="text-muted">
                  {" "}
                  by {e.actor} ({roleLabel[e.actor_role] ?? humanize(e.actor_role)})
                </span>
              </p>
              <time className="text-xs text-subtle-fg tabular-nums" dateTime={e.ts}>
                {fmtDateTime(e.ts)}
              </time>
            </div>
            <p className="mt-0.5 text-xs text-subtle-fg">
              {humanize(e.object_type)}
              {e.object_id && <span className="font-mono"> {e.object_id}</span>}
              {showApplication && e.application_id && (
                <span>
                  {" "}
                  in <span className="font-mono">{e.application_id}</span>
                </span>
              )}
            </p>
            <Details details={e.details} />
            <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-subtle-fg" title={`prev ${e.prev_hash}\nhash ${e.hash}`}>
              <Link2 aria-hidden className="size-3" />
              <span>{shortHash(e.prev_hash, 8)}</span>
              <ArrowRight aria-hidden className="size-3" />
              <span className="text-fg">{shortHash(e.hash, 8)}</span>
              <span className="sr-only">
                Previous hash {e.prev_hash}, event hash {e.hash}
              </span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function VerifyChain({ className }: { className?: string }) {
  const mut = useMutation({ mutationFn: api.verifyAudit });
  const [at, setAt] = useState<Date | null>(null);
  const r = mut.data;
  return (
    <div className={className}>
      <Button
        icon={<ShieldCheck className="size-4" />}
        onClick={() => mut.mutate(undefined, { onSuccess: () => setAt(new Date()) })}
        loading={mut.isPending}
      >
        Verify chain integrity
      </Button>
      {!!mut.error && <ErrorBanner error={mut.error} title="Verification failed to run" className="mt-2" />}
      {r && (
        <div
          role="status"
          className={clsx(
            "mt-3 animate-fade-in rounded-md border p-3 text-sm",
            r.intact ? "border-verified-dot/40 bg-verified-bg text-verified-fg" : "border-mismatch-dot/40 bg-mismatch-bg text-mismatch-fg",
          )}
        >
          <p className="flex items-center gap-2 font-semibold">
            {r.intact ? <CircleCheck aria-hidden className="size-4" /> : <CircleAlert aria-hidden className="size-4" />}
            {r.intact ? "Chain intact" : `Chain broken at event #${r.first_broken_seq ?? "?"}`}
          </p>
          <p className="mt-1 text-xs">
            {r.events_checked} events re-hashed from the genesis value. Head{" "}
            <span className="font-mono" title={r.head_hash}>
              {shortHash(r.head_hash, 16)}
            </span>
            .{" "}
            {r.checkpoints.length
              ? `${r.checkpoints.filter((c) => c.signature_valid && c.matches_chain).length} of ${r.checkpoints.length} signed checkpoints valid and on the chain.`
              : "No signed checkpoints yet."}
            {at && ` Checked ${at.toLocaleTimeString("en-IN", { hour12: false })}.`}
          </p>
        </div>
      )}
    </div>
  );
}
