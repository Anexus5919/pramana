import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, CirclePause, RefreshCw, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "../../api";
import { useAuth } from "../../auth/session";
import { pluralize } from "../../lib/format";
import type { SimIssuer } from "../../types";
import { historyApi, useRunWatch } from "../application/history/api";
import { Tag } from "../../ui/Badge";
import { StatusCube } from "../../ui/Blocks";
import { Button } from "../../ui/Button";
import { Field, Input, Select } from "../../ui/Field";
import { dur, ease } from "../../ui/motion";
import { useToast } from "../../ui/Toast";
import { issuerName } from "./IssuerCard";

const ACTIONS = [
  { status: "revoked", label: "Revoke", icon: <Ban />, done: "revoked" },
  { status: "suspended", label: "Suspend", icon: <CirclePause />, done: "suspended" },
  { status: "valid", label: "Restore", icon: <RotateCcw />, done: "restored to valid" },
] as const;

interface Changed {
  code: string;
  ref: string;
  status: string;
}

/** Play the issuer: change a certificate's status in the simulated registry, then let the watch notice. */
export function IssuerActions({ issuers }: { issuers: SimIssuer[] }) {
  const { is } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "FIRE-SERVICES");
  const [ref, setRef] = useState(params.get("ref") ?? "");
  const [note, setNote] = useState("");
  const [changed, setChanged] = useState<Changed | null>(null);
  const run = useRunWatch();
  const m = useMutation({
    mutationFn: (status: string) => historyApi.setRecordStatus(code, ref.trim(), status, note.trim() || null),
    onSuccess: (r, status) => {
      setChanged({ code, ref: String(r.record.ref_no ?? ref), status });
      void qc.invalidateQueries({ queryKey: ["audit"] });
      const a = ACTIONS.find((x) => x.status === status);
      toast.success(`Certificate ${a?.done ?? status} in the simulated registry`, "Validation runs and the re-verification watch will see the new status.");
    },
    onError: (e) => toast.error("The registry was not changed", errorMessage(e)),
  });
  if (!is("officer", "admin")) return null;

  const submit = (e: FormEvent) => e.preventDefault();
  const runNow = () =>
    run.mutate(undefined, {
      onSuccess: (r) =>
        r.changes.length
          ? toast.info(`Watch found ${pluralize(r.changes.length, "change")}`, r.changes.map((c) => `${c.institution}: ${c.label} ${c.change.replace("_", " ")}`).join(". "))
          : toast.success("Watch run complete", `${pluralize(r.run.checked, "certificate")} checked, no changes.`),
      onError: (e) => toast.error("The watch did not run", errorMessage(e)),
    });
  const lastChange = run.data?.changes[0];

  return (
    <section aria-labelledby="issuer-actions-title" className="mb-6 rounded-panel border border-line bg-surface p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="eyebrow mb-1">Issuer actions</div>
          <h2 id="issuer-actions-title" className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold tracking-title text-ink">
            Change a certificate's status <Tag variant="demo">Simulated</Tag>
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-3 text-pretty">
            Act as the issuing authority would in its own register: revoke, suspend or restore a reference. Certificates under re-verification watch report the change on the next check.
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_minmax(0,1fr)] md:items-end">
        <Field label="Source">
          <Select value={code} onChange={(e) => setCode(e.target.value)}>
            {issuers.map((i) => (
              <option key={i.code} value={i.code}>
                {issuerName(i)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference number">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="FES/KAR/2025/04502" className="font-mono" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Note from the issuer" hint="Optional, shown with the status">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Inspection found the hydrant system not working" autoComplete="off" />
        </Field>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ACTIONS.map((a) => (
          <Button
            key={a.status}
            variant={a.status === "revoked" ? "danger" : a.status === "valid" ? "ghost" : "secondary"}
            size="sm"
            leadingIcon={a.icon}
            disabled={!ref.trim()}
            loading={m.isPending && m.variables === a.status}
            onClick={() => m.mutate(a.status)}
          >
            {a.label}
          </Button>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
        <Button variant="soft" size="sm" leadingIcon={<RefreshCw />} loading={run.isPending} onClick={runNow}>
          Run re-verification watch now
        </Button>
      </div>
      <div aria-live="polite">
        <AnimatePresence initial={false}>
          {changed && (
            <motion.p
              key={`${changed.ref}-${changed.status}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.panel, ease: ease.out }}
              className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2"
            >
              <StatusCube status={changed.status === "valid" ? "verified" : "mismatch_detected"} size={14} />
              <span className="font-mono text-[13px] text-ink">{changed.ref}</span>
              <span>is now {changed.status} in the simulated registry.</span>
            </motion.p>
          )}
          {lastChange && (
            <motion.p
              key={lastChange.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: dur.panel, ease: ease.out }}
              className="mt-2 text-sm text-ink-2"
            >
              The watch raised an alert for {lastChange.institution}.{" "}
              <Link to={`/applications/${encodeURIComponent(lastChange.application_id)}`} className="font-medium text-brand-ink hover:underline">
                Open the application
              </Link>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
