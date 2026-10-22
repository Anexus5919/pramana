import type { UseQueryResult } from "@tanstack/react-query";
import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../auth/session";
import { SimulatedBadge, StatusPill } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardHeader, SectionTitle } from "../../../components/ui/Card";
import { Callout, EmptyState, ErrorBanner, Skeleton } from "../../../components/ui/Feedback";
import { Label, Select, Textarea } from "../../../components/ui/Field";
import { fmtDateTime } from "../../../lib/format";
import { CHANNELS, channelMeta, humanize, isSignatureChannel, verificationMeta } from "../../../lib/labels";
import type { ApplicationDetail, VerificationAttempt } from "../../../types";
import { useLabels } from "../../shared/useRuleset";
import { ComparisonTable } from "../evidence/ComparisonTable";
import { docLink } from "../links";
import { useManualVerification } from "../useWorkspace";

const MANUAL_ELIGIBLE = new Set(["source_unavailable", "verification_pending", "manual_review_required"]);
const MANUAL_OUTCOMES = ["verified", "mismatch_detected", "expired", "manual_review_required"] as const;

function isDemo(a: VerificationAttempt) {
  return isSignatureChannel(a.channel) && (a.response?.demo_anchor === true || a.simulated);
}

function ManualForm({ appId, attempt }: { appId: string; attempt: VerificationAttempt }) {
  const [status, setStatus] = useState<string>("verified");
  const [note, setNote] = useState("");
  const mut = useManualVerification(appId);

  function submit(e: FormEvent) {
    e.preventDefault();
    mut.mutate({ attemptId: attempt.id, status, note: note.trim() }, { onSuccess: () => setNote("") });
  }

  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-md border border-line bg-subtle/50 p-3">
      <p className="text-sm font-medium text-fg">Record manual confirmation</p>
      <p className="text-xs text-muted">
        Use after confirming offline with the issuer (letter, email or the issuer's portal). It is recorded as a new
        verification attempt and in the audit log.
      </p>
      <div>
        <Label htmlFor="manual-status">Outcome</Label>
        <Select id="manual-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {MANUAL_OUTCOMES.map((s) => (
            <option key={s} value={s}>
              {verificationMeta[s].label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="manual-note" required hint="(how it was confirmed)">
          Note
        </Label>
        <Textarea
          id="manual-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For example: Confirmed by email from the issuing office, reference and validity match."
        />
      </div>
      {!!mut.error && <ErrorBanner error={mut.error} title="Could not record the confirmation" />}
      {mut.isSuccess && (
        <p role="status" className="text-xs font-medium text-verified-fg">
          Recorded as {verificationMeta[mut.data.status]?.label ?? mut.data.status}.
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" loading={mut.isPending} disabled={!note.trim()}>
          Record confirmation
        </Button>
      </div>
    </form>
  );
}

function AttemptDetail({ appId, attempt, canRecord }: { appId: string; attempt: VerificationAttempt; canRecord: boolean }) {
  const follows = typeof attempt.request?.follows === "string" ? attempt.request.follows : null;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={attempt.status} />
          {attempt.simulated && <SimulatedBadge label={isDemo(attempt) ? "DEMO" : "SIMULATED"} />}
        </div>
        <h3 className="mt-2 text-base font-semibold text-fg">{channelMeta[attempt.channel]?.label ?? humanize(attempt.channel)}</h3>
        <p className="text-xs text-subtle-fg">{attempt.source_name}</p>
        {attempt.detail && <p className="mt-2 text-sm leading-relaxed text-fg">{attempt.detail}</p>}
        <p className="mt-2 text-xs text-muted">{verificationMeta[attempt.status]?.meaning}</p>
      </div>
      {attempt.simulated && (
        <Callout tone="simulated" title={isDemo(attempt) ? "DEMO trust anchor" : "SIMULATED source"}>
          {isDemo(attempt)
            ? "The signature chains to a prototype DEMO root certificate, not India PKI. It demonstrates the check, not a real-world confirmation."
            : "This response came from a simulated issuer registry. No real issuing authority was contacted."}
        </Callout>
      )}
      {attempt.comparison?.length > 0 && (
        <div>
          <SectionTitle className="mb-1.5">Field comparison</SectionTitle>
          <ComparisonTable comparisons={attempt.comparison} authoritativeLabel={attempt.channel === "signed_qr" ? "Signed QR" : "Issuer record"} />
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-subtle-fg">Attempt</dt>
          <dd className="font-mono text-fg">{attempt.id}</dd>
        </div>
        <div>
          <dt className="text-subtle-fg">Completed</dt>
          <dd className="text-fg">{fmtDateTime(attempt.completed_at ?? attempt.started_at)}</dd>
        </div>
        <div>
          <dt className="text-subtle-fg">Actor</dt>
          <dd className="text-fg">{attempt.actor ?? "system"}</dd>
        </div>
        {follows && (
          <div>
            <dt className="text-subtle-fg">Follows attempt</dt>
            <dd className="font-mono text-fg">{follows}</dd>
          </div>
        )}
      </dl>
      {canRecord && MANUAL_ELIGIBLE.has(attempt.status) && <ManualForm key={attempt.id} appId={appId} attempt={attempt} />}
    </div>
  );
}

export function VerificationTab({ app, attemptsQuery }: { app: ApplicationDetail; attemptsQuery: UseQueryResult<VerificationAttempt[]> }) {
  const { is } = useAuth();
  const { docType } = useLabels();
  const [params, setParams] = useSearchParams();
  const attempts = attemptsQuery.data ?? [];
  const selectedId = params.get("attempt");
  const selected = attempts.find((a) => a.id === selectedId) ?? null;

  const docs = app.documents.filter((d) => !d.superseded || attempts.some((a) => a.document_id === d.id));
  const byCell = useMemo(() => {
    const m = new Map<string, VerificationAttempt[]>();
    for (const a of attempts) {
      const k = `${a.document_id}|${a.channel}`;
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [attempts]);
  const channels = [...CHANNELS, ...new Set(attempts.map((a) => a.channel).filter((c) => !(CHANNELS as readonly string[]).includes(c)))];

  function select(id: string) {
    const p = new URLSearchParams(params);
    p.set("attempt", id);
    setParams(p, { replace: true });
  }

  if (attemptsQuery.isPending) return <Skeleton className="h-80" />;
  if (attemptsQuery.error) return <ErrorBanner error={attemptsQuery.error} title="Could not load verification attempts" />;
  if (!attempts.length) {
    return (
      <Card>
        <EmptyState icon={<ShieldCheck className="size-6" />} title="No verification attempts">
          {app.latest_run ? "The latest run made no verification attempts." : "Run a validation to verify documents."}
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Card aria-labelledby="matrix-title">
        <CardHeader
          id="matrix-title"
          title="Verification matrix"
          subtitle="Documents against verification channels for the latest run. Select a cell to see the attempt."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle/60 text-left text-[11px] tracking-wider text-subtle-fg uppercase">
                <th scope="col" className="px-4 py-2 font-semibold">Document</th>
                {channels.map((c) => (
                  <th key={c} scope="col" className="px-2 py-2 font-semibold" title={channelMeta[c]?.meaning}>
                    {channelMeta[c]?.label ?? humanize(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-line align-top last:border-0">
                  <th scope="row" className="max-w-[220px] px-4 py-2.5 text-left font-normal">
                    <a href={docLink(app.id, d.id)} className="block text-sm font-medium text-fg hover:text-primary-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                      {docType(d.declared_type)}
                    </a>
                    <span className="block truncate text-[11px] text-subtle-fg">{d.original_filename}</span>
                  </th>
                  {channels.map((c) => {
                    const cell = byCell.get(`${d.id}|${c}`) ?? [];
                    return (
                      <td key={c} className="px-2 py-2.5">
                        {cell.length === 0 ? (
                          <span className="text-xs text-subtle-fg" aria-label="No attempt">
                            None
                          </span>
                        ) : (
                          <ul className="flex flex-col items-start gap-1">
                            {cell.map((a) => (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  onClick={() => select(a.id)}
                                  aria-pressed={a.id === selectedId}
                                  className={clsx(
                                    "flex flex-wrap items-center gap-1 rounded-md p-0.5 text-left",
                                    a.id === selectedId ? "ring-2 ring-ring" : "hover:bg-subtle",
                                  )}
                                >
                                  <StatusPill status={a.status} />
                                  {a.simulated && <SimulatedBadge label={isDemo(a) ? "DEMO" : "SIMULATED"} />}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-4 py-3">
          <Callout tone="simulated">
            SIMULATED marks responses from the prototype's simulated issuer registries; no real issuer is contacted. DEMO
            marks signatures that chain to the prototype demo root rather than India PKI.
          </Callout>
        </div>
      </Card>

      <div className="xl:sticky xl:top-20">
        <Card>
          <div className="p-4">
            {selected ? (
              <AttemptDetail appId={app.id} attempt={selected} canRecord={is("verifier", "officer")} />
            ) : (
              <EmptyState title="Select an attempt" className="py-12">
                Choose a status in the matrix. Attempts that are pending, unavailable or need manual review can be
                confirmed by the verification cell.
              </EmptyState>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
