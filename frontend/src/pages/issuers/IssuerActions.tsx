import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, CirclePause, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../api";
import { pluralize } from "../../lib/format";
import type { SimIssuer } from "../../types";
import { workspacePath } from "../../shell/nav";
import { historyApi, type WatchRunResult } from "../application/history/api";
import { Button, Callout, DescriptionList, Field, Input, Panel, SimulatedTag, useToast } from "../../ui2";
import { issuerName } from "./issuer";

const ACTIONS = [
  { status: "revoked", label: "Revoke", icon: <Ban />, done: "revoked" },
  { status: "suspended", label: "Suspend", icon: <CirclePause />, done: "suspended" },
  { status: "valid", label: "Restore", icon: <RotateCcw />, done: "restored to valid" },
] as const;

/** Revoking is decisive, so the issuer's note doubles as the reason. */
const MIN_REASON = 10;

interface Changed {
  ref: string;
  status: string;
}

export interface IssuerActionsProps {
  issuer: SimIssuer | undefined;
  reference: string;
  /** The page-level re-verification watch, shared with the header menu */
  watch: { isPending: boolean; data?: WatchRunResult; reset: () => void };
  onRunWatch: () => void;
}

/** Play the issuer: change a certificate's status in the simulated registry, then let the watch notice. */
export function IssuerActions({ issuer, reference, watch, onRunWatch }: IssuerActionsProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [changed, setChanged] = useState<Changed | null>(null);
  const code = issuer?.code ?? "";
  const ref = reference.trim();
  const reasonOk = note.trim().length >= MIN_REASON;

  const m = useMutation({
    mutationFn: (status: string) => historyApi.setRecordStatus(code, ref, status, note.trim() || null),
    onSuccess: (r, status) => {
      watch.reset();
      setChanged({ ref: String(r.record.ref_no ?? ref), status });
      void qc.invalidateQueries({ queryKey: ["audit"] });
      const a = ACTIONS.find((x) => x.status === status);
      toast.success(`Certificate ${a?.done ?? status} in the simulated registry`, "Validation runs and the re-verification watch will see the new status.");
    },
    onError: (e) => toast.error("The registry was not changed", errorMessage(e)),
  });

  const submit = (e: FormEvent) => e.preventDefault();
  const done = changed ? (ACTIONS.find((a) => a.status === changed.status)?.done ?? changed.status) : null;
  const changes = watch.data?.changes ?? [];

  const watchLine = watch.isPending ? (
    "Running the re-verification watch."
  ) : watch.data ? (
    changes.length ? (
      <span>
        The watch raised {pluralize(changes.length, "alert")}:{" "}
        {changes.slice(0, 3).map((c, i) => (
          <span key={c.id}>
            {i > 0 && ", "}
            <Link
              to={c.finding_id ? workspacePath(c.application_id, "findings", { finding: c.finding_id }) : workspacePath(c.application_id)}
              className="font-medium text-ink underline-offset-2 hover:underline"
            >
              {c.institution ?? c.application_id}
            </Link>
          </span>
        ))}
        {changes.length > 3 ? ` and ${changes.length - 3} more` : ""}.
      </span>
    ) : (
      `The watch checked ${pluralize(watch.data.run.checked, "certificate")} and found no change.`
    )
  ) : (
    "Certificates under the re-verification watch report the change on the next check."
  );

  return (
    <Panel
      title="Change a record"
      description="Act as the issuing authority would in its own register. The record is the issuer and reference selected above."
    >
      <form onSubmit={submit} className="grid gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <DescriptionList
          labelWidth={112}
          items={[
            {
              label: "Issuer",
              value: issuer ? (
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  {issuerName(issuer)} <code className="font-mono text-xs text-ink-2">{issuer.code}</code>
                </span>
              ) : null,
            },
            {
              label: "Reference",
              value: ref ? <span className="font-mono">{ref}</span> : <span className="text-ink-3">Enter a reference number under Look up a record</span>,
            },
          ]}
        />
        <div className="min-w-0 space-y-3">
          <Field label="Note from the issuer" hint={`Required to revoke, as the reason. At least ${MIN_REASON} characters.`}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Inspection found the hydrant system not working" autoComplete="off" />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            {ACTIONS.map((a) => (
              <Button
                key={a.status}
                variant={a.status === "revoked" ? "danger" : "secondary"}
                leadingIcon={a.icon}
                disabled={!ref || !code || (a.status === "revoked" && !reasonOk)}
                loading={m.isPending && m.variables === a.status}
                onClick={() => m.mutate(a.status)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      </form>
      <div aria-live="polite">
        {(changed || watch.data || watch.isPending) && (
          <Callout
            className="mt-5"
            tone={changed && changed.status !== "valid" ? "warning" : "success"}
            title={
              changed ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>
                    <span className="font-mono">{changed.ref}</span> is now {done}
                  </span>
                  <SimulatedTag />
                </span>
              ) : (
                "Re-verification watch"
              )
            }
            action={
              changed && !watch.data ? (
                <Button size="sm" loading={watch.isPending} onClick={onRunWatch}>
                  Run watch now
                </Button>
              ) : undefined
            }
          >
            {watchLine}
          </Callout>
        )}
      </div>
    </Panel>
  );
}
