import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { FlaskConical, Search, Server, ServerOff } from "lucide-react";
import { type FormEvent, useState } from "react";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { Pill, SimulatedBadge, Tag } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Callout, ErrorBanner, PageLoading } from "../../components/ui/Feedback";
import { Input, Label, Select } from "../../components/ui/Field";
import { fmtValue } from "../../lib/format";
import { humanize } from "../../lib/labels";
import type { SimIssuer } from "../../types";
import { PageHeader } from "../shared/Summaries";

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-verified-dot" : "bg-line-strong",
      )}
    >
      <span
        aria-hidden
        className={clsx("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")}
      />
    </button>
  );
}

function IssuerRow({ issuer, canToggle }: { issuer: SimIssuer; canToggle: boolean }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (available: boolean) => api.setIssuerAvailability(issuer.code, available),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.issuers }),
  });
  const available = issuer.available !== false;
  const optimistic = mut.isPending ? (mut.variables ?? available) : available;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {optimistic ? (
              <Server aria-hidden className="size-4 text-verified-dot" />
            ) : (
              <ServerOff aria-hidden className="size-4 text-unavail-dot" />
            )}
            <span className="text-sm font-semibold text-fg">{issuer.name}</span>
            {!/simulated/i.test(issuer.name) && <SimulatedBadge />}
          </div>
          <p className="mt-0.5 text-xs text-muted">{typeof issuer.models === "string" ? issuer.models : ""}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <Tag className="font-mono">{issuer.code}</Tag>
            <Tag>{issuer.mode === "async" ? "Asynchronous: answers later" : "Synchronous lookup"}</Tag>
            {issuer.latency_ms != null && <Tag>{issuer.latency_ms} ms simulated latency</Tag>}
            {(issuer.compare_fields ?? []).length > 0 && (
              <span className="text-subtle-fg">compares {(issuer.compare_fields ?? []).map((f) => humanize(f).toLowerCase()).join(", ")}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Pill tone={optimistic ? "verified" : "unavail"}>{optimistic ? "Available" : "Unavailable"}</Pill>
          {canToggle && (
            <Switch
              checked={optimistic}
              disabled={mut.isPending}
              onChange={(v) => mut.mutate(v)}
              label={`${issuer.name} availability`}
            />
          )}
        </div>
      </div>
      {!!mut.error && <ErrorBanner error={mut.error} title="Could not change availability" className="mt-2" />}
    </li>
  );
}

function LookupTool({ issuers }: { issuers: SimIssuer[] }) {
  const [code, setCode] = useState(issuers[0]?.code ?? "");
  const [ref, setRef] = useState("");
  const mut = useMutation({ mutationFn: () => api.simLookup(code, ref.trim()) });
  function submit(e: FormEvent) {
    e.preventDefault();
    mut.mutate();
  }
  const rec = mut.data?.record as { fields?: Record<string, unknown>; status?: string; ref_no?: string } | null | undefined;
  return (
    <Card aria-labelledby="lookup-title">
      <CardHeader
        id="lookup-title"
        icon={<Search className="size-4" />}
        title="Manual lookup"
        subtitle="The simulated issuer's own reference-number lookup, as a verifier would use it by hand"
      />
      <form onSubmit={submit} className="space-y-3 p-4">
        <div>
          <Label htmlFor="lookup-issuer">Issuer</Label>
          <Select id="lookup-issuer" value={code} onChange={(e) => setCode(e.target.value)}>
            {issuers.map((i) => (
              <option key={i.code} value={i.code}>
                {i.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="lookup-ref">Reference number</Label>
          <Input id="lookup-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="For example FES/KOL/2025/04519" />
        </div>
        <Button type="submit" variant="primary" loading={mut.isPending} disabled={!ref.trim() || !code}>
          Look up
        </Button>
        {!!mut.error && <ErrorBanner error={mut.error} title="Lookup failed" />}
        {mut.data && (
          <div className="animate-fade-in rounded-md border border-dashed border-unavail-dot/60 p-3 text-sm">
            <div className="flex items-center gap-2">
              <SimulatedBadge />
              <span className={clsx("font-semibold", mut.data.found ? "text-verified-fg" : "text-mismatch-fg")}>
                {mut.data.found ? "Record found" : "No record for this reference"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">{mut.data.issuer}</p>
            {rec && (
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                {rec.ref_no && (
                  <>
                    <dt className="text-subtle-fg">Reference</dt>
                    <dd className="font-mono text-fg">{rec.ref_no}</dd>
                  </>
                )}
                {rec.status && (
                  <>
                    <dt className="text-subtle-fg">Status</dt>
                    <dd className="text-fg">{humanize(rec.status)}</dd>
                  </>
                )}
                {Object.entries(rec.fields ?? {}).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-subtle-fg">{humanize(k)}</dt>
                    <dd className="break-words text-fg">{fmtValue(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}

export function IssuerSimulatorPage() {
  const { is } = useAuth();
  const q = useQuery({ queryKey: qk.issuers, queryFn: api.simIssuers });
  if (q.isPending) return <PageLoading label="Loading simulated issuers" />;
  if (q.error) return <ErrorBanner error={q.error} title="Could not load simulated issuers" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Issuer simulator"
        eyebrow={<SimulatedBadge />}
        subtitle="Stand-ins for the registries of issuing authorities such as fire services, municipal bodies, e-stamp and audit verification portals."
      />
      <Callout tone="simulated" title="SIMULATED: no real issuer is contacted" icon={<FlaskConical className="size-4" />}>
        These registries run inside the prototype with synthetic records. They exist to demonstrate how Pramana reports
        each verification state: verified, mismatch detected, expired, verification pending and source unavailable.
        Every result from them carries a SIMULATED label. A real deployment would replace each one with an authorised
        integration behind the same adapter interface.
      </Callout>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card aria-labelledby="issuers-title">
          <CardHeader
            id="issuers-title"
            title={`Simulated registries (${q.data.length})`}
            subtitle={
              is("admin")
                ? "Switch a registry off to demonstrate the source-unavailable path. The change applies to the next validation run."
                : "Only an administrator can change availability."
            }
          />
          <ul className="divide-y divide-line">
            {q.data.map((i) => (
              <IssuerRow key={i.code} issuer={i} canToggle={is("admin")} />
            ))}
          </ul>
        </Card>
        <LookupTool issuers={q.data} />
      </div>
    </div>
  );
}
