import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { pluralize } from "../../lib/format";
import { humanize } from "../../lib/labels";
import type { SimIssuer } from "../../types";
import { useRunWatch } from "../application/history/api";
import {
  Button,
  Callout,
  DataTable,
  EmptyState,
  ErrorState,
  Page,
  PageHeader,
  Panel,
  SimulatedTag,
  Skeleton,
  StatusBadge,
  Switch,
  useToast,
  type Column,
} from "../../ui2";
import { IssuerActions } from "./IssuerActions";
import { isOnline, issuerName, modeLabel } from "./issuer";
import { LookupPanel } from "./LookupPanel";

function SimulatorSkeleton() {
  return (
    <Page role="status" aria-live="polite">
      <span className="sr-only">Loading the issuer simulator</span>
      <Skeleton className="h-12 w-96" />
      <Skeleton className="h-12" rounded="lg" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-80" rounded="lg" />
        <Skeleton className="h-80" rounded="lg" />
      </div>
    </Page>
  );
}

export default function IssuerSimulatorPage() {
  const { is } = useAuth();
  const admin = is("admin");
  const canChange = is("officer", "admin");
  const qc = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const q = useQuery({ queryKey: qk.issuers, queryFn: api.simIssuers });
  const issuers = useMemo(() => q.data ?? [], [q.data]);
  const [selected, setSelected] = useState<string | null>(params.get("code"));
  const [reference, setReference] = useState(params.get("ref") ?? "");
  const selectRef = useRef<HTMLSelectElement>(null);
  const code = issuers.some((i) => i.code === selected) ? (selected as string) : (issuers[0]?.code ?? "");
  const issuer = issuers.find((i) => i.code === code);

  // ?code= and ?ref= prefill both forms, also when a link is followed while the page is open
  const pCode = params.get("code");
  const pRef = params.get("ref");
  useEffect(() => {
    if (pCode) setSelected(pCode);
    if (pRef) setReference(pRef);
  }, [pCode, pRef]);

  const toggle = useMutation({
    mutationFn: ({ c, available }: { c: string; available: boolean }) => api.setIssuerAvailability(c, available),
    onMutate: async ({ c, available }) => {
      await qc.cancelQueries({ queryKey: qk.issuers });
      const prev = qc.getQueryData<SimIssuer[]>(qk.issuers);
      qc.setQueryData<SimIssuer[]>(qk.issuers, (old) => old?.map((i) => (i.code === c ? { ...i, available } : i)));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.issuers, ctx.prev);
      toast.error("Availability was not changed", errorMessage(e));
    },
    onSuccess: (_d, { c, available }) => {
      const i = issuers.find((x) => x.code === c);
      const name = i ? issuerName(i) : c;
      if (available) toast.success(`${name} is responding again`, "Next validation runs will query it as usual.");
      else toast.info(`${name} stopped responding`, "Next validation runs will record source unavailable.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.issuers }),
  });

  const watch = useRunWatch();
  const runWatch = () =>
    watch.mutate(undefined, {
      onSuccess: (r) =>
        r.changes.length
          ? toast.info(
              `Watch found ${pluralize(r.changes.length, "change")}`,
              r.changes.map((c) => `${c.institution}: ${c.label} ${c.change.replace("_", " ")}`).join(". "),
            )
          : toast.success("Watch run complete", `${pluralize(r.run.checked, "certificate")} checked, no changes.`),
      onError: (e) => toast.error("The watch did not run", errorMessage(e)),
    });

  const columns = useMemo<Column<SimIssuer>[]>(() => {
    const cols: Column<SimIssuer>[] = [
      {
        id: "issuer",
        header: "Issuer",
        sortValue: (i) => issuerName(i),
        cell: (i) => (
          <span className="block min-w-0">
            <span className="block">{issuerName(i)}</span>
            <span className="block text-xs font-normal text-ink-3">
              <code className="font-mono text-xs">{i.code}</code>
              <span className="2xl:hidden">
                {" "}
                · {modeLabel(i)}
                {i.latency_ms !== undefined ? `, ${i.latency_ms} ms` : ""}
              </span>
            </span>
          </span>
        ),
      },
      { id: "mode", header: "Mode", hideBelow: "2xl", sortValue: (i) => modeLabel(i), cell: (i) => <span className="text-ink-2">{modeLabel(i)}</span> },
      {
        id: "latency",
        header: "Latency",
        align: "right",
        hideBelow: "2xl",
        sortValue: (i) => i.latency_ms ?? null,
        cell: (i) => <span className="text-ink-2">{i.latency_ms !== undefined ? `${i.latency_ms} ms` : "Not given"}</span>,
      },
      {
        id: "compares",
        header: "Compares",
        hideBelow: "2xl",
        cell: (i) =>
          i.compare_fields?.length ? (
            <span className="text-ink-2">{i.compare_fields.map(humanize).join(", ")}</span>
          ) : (
            <span className="text-ink-3">Existence only</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (i) => (isOnline(i) ? 0 : 1),
        cell: (i) =>
          isOnline(i) ? <StatusBadge tone="verified">Responding</StatusBadge> : <StatusBadge tone="unavail">Not responding</StatusBadge>,
      },
    ];
    if (admin)
      cols.push({
        id: "available",
        header: "Available",
        width: "88px",
        cell: (i) => (
          <Switch
            checked={isOnline(i)}
            hideLabel
            label={`${issuerName(i)} available`}
            disabled={toggle.isPending && toggle.variables?.c === i.code}
            onChange={(available) => toggle.mutate({ c: i.code, available })}
          />
        ),
      });
    return cols;
  }, [admin, toggle]);

  if (q.isPending) return <SimulatorSkeleton />;
  if (q.error)
    return (
      <Page>
        <PageHeader title="Issuer simulator" status={<SimulatedTag />} />
        <ErrorState error={q.error} title="Could not load the simulated sources" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      </Page>
    );

  const up = issuers.filter(isOnline).length;

  return (
    <Page>
      <PageHeader
        title="Issuer simulator"
        status={<SimulatedTag />}
        context={`Stand-in registries for the prototype. ${up} of ${issuers.length} responding.`}
        menu={
          canChange
            ? [
                {
                  id: "watch",
                  label: "Run re-verification watch now",
                  description: "Recheck every watched certificate with its issuer.",
                  icon: <RefreshCw />,
                  onSelect: runWatch,
                  disabled: watch.isPending,
                },
              ]
            : undefined
        }
        primary={
          issuers.length ? (
            <Button variant="primary" leadingIcon={<Search />} onClick={() => selectRef.current?.focus()}>
              Look up a record
            </Button>
          ) : undefined
        }
      />

      <Callout tone="neutral">
        These issuers are simulated. Changing them shows how Pramana reacts; it never edits a real registry. Real registries need formal
        authorisation before an API can be used, so each stand-in answers from a synthetic registry with the same lookup shape.
      </Callout>

      {issuers.length === 0 ? (
        <Panel>
          <EmptyState title="No simulated sources configured" description="Add issuers to the demo registry file, then reload this page." />
        </Panel>
      ) : (
        <>
          <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Panel
              title="Issuers"
              description={admin ? "Select a row to use it below. Switch a source off to see how runs record source unavailable." : "Select a row to use it below."}
              padding="none"
            >
              <div className="border-t border-line">
                <DataTable
                  label="Simulated issuers"
                  rows={issuers}
                  columns={columns}
                  rowKey={(i) => i.code}
                  onRowClick={(i) => setSelected(i.code)}
                  selectedKey={code}
                />
              </div>
            </Panel>
            <LookupPanel
              issuers={issuers}
              code={code}
              onCode={setSelected}
              reference={reference}
              onReference={setReference}
              selectRef={selectRef}
              className="xl:sticky xl:top-20"
            />
          </div>
          {canChange && <IssuerActions issuer={issuer} reference={reference} watch={watch} onRunWatch={runWatch} />}
        </>
      )}
    </Page>
  );
}
