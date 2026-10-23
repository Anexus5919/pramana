import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowUpRight, FileSearch, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { pluralize } from "../../lib/format";
import { workspacePath } from "../../shell/nav";
import {
  ButtonLink,
  Code,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Panel,
  PanelDivider,
  SegmentedControl,
  SeverityIndicator,
  Skeleton,
  Stat,
  StatGroup,
  type Column,
} from "../../ui2";
import { GraphCanvas } from "./GraphCanvas";
import { ITEM_KINDS, KIND_META } from "./graphTheme";
import { KindDot, LegendItem } from "./legend";
import { layoutNetwork } from "./layout";
import type { FindingBrief, ItemKind, NetworkApplication, NetworkEdge, NetworkItem, NetworkPayload } from "./types";

function bboxParam(b: number[] | null | undefined): string | undefined {
  return b && b.length === 4 ? b.map((v) => Math.round(v * 100) / 100).join(",") : undefined;
}

function kindCount(k: ItemKind, n: number): string {
  if (k === "details") return n === 1 ? "1 set of certificate details" : `${n} sets of certificate details`;
  const word = n === 1 ? KIND_META[k].label : KIND_META[k].plural;
  return `${n} ${word.charAt(0).toLowerCase()}${word.slice(1)}`;
}

export function FindingLink({ appId, f }: { appId: string; f: FindingBrief }) {
  return (
    <Link
      to={workspacePath(appId, "findings", { finding: f.id })}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
    >
      <SeverityIndicator severity={f.severity} showLabel={false} />
      <span className="min-w-0 flex-1 truncate">{f.title}</span>
      <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-ink-4" />
    </Link>
  );
}

export function ShowOnPage({ appId, docId, page, bbox, label }: { appId: string; docId: string | null; page: number | null; bbox: number[] | null; label: string }) {
  if (!docId) return null;
  return (
    <Link
      to={workspacePath(appId, "documents", { doc: docId, page: page ? String(page) : undefined, hl: bboxParam(bbox), hlabel: label })}
      className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
    >
      <FileSearch aria-hidden className="size-3.5" />
      Show on page{page ? ` ${page}` : ""}
    </Link>
  );
}

function ItemDetail({ item, data, apps }: { item: NetworkItem; data: NetworkPayload; apps: Map<string, NetworkApplication> }) {
  const edges = data.edges.filter((e) => e.target === item.id);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
        <KindDot kind={item.kind} />
        {KIND_META[item.kind].label}
        {item.detail && <span className="text-ink-2">{item.detail}</span>}
      </div>
      <p className="text-sm text-ink-2">
        Appears in {pluralize(edges.length, "application")}. {KIND_META[item.kind].meaning} Needs confirmation with the documents.
      </p>
      {edges.map((e) => (
        <AppEvidence key={e.source} edge={e} app={apps.get(e.source)} item={item} />
      ))}
    </div>
  );
}

function AppEvidence({ edge, app, item }: { edge: NetworkEdge; app?: NetworkApplication; item: NetworkItem }) {
  return (
    <section aria-label={app?.institution ?? edge.source} className="rounded-card border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <Link to={workspacePath(edge.source, "comparisons", { view: "related" })} className="min-w-0 truncate text-sm font-medium text-ink hover:underline">
          {app?.institution ?? edge.source}
        </Link>
        <ShowOnPage appId={edge.source} docId={edge.document_id} page={edge.page} bbox={edge.bbox} label={KIND_META[item.kind].label} />
      </div>
      <div className="p-1">
        {edge.findings.length ? (
          edge.findings.map((f) => <FindingLink key={f.id} appId={edge.source} f={f} />)
        ) : (
          <p className="px-2 py-1.5 text-xs text-ink-3">Recorded on the other application only.</p>
        )}
      </div>
    </section>
  );
}

function AppDetail({ app, data, items, onSelect }: { app: NetworkApplication; data: NetworkPayload; items: Map<string, NetworkItem>; onSelect: (id: string) => void }) {
  const mine = data.edges.filter((e) => e.source === app.id);
  const cluster = data.clusters.find((c) => c.id === app.cluster);
  return (
    <div className="space-y-3">
      <div className="text-sm text-ink-3">
        <Code className="text-xs">{app.id}</Code> <span>{app.district}</span>
      </div>
      <ButtonLink size="sm" variant="secondary" to={workspacePath(app.id, "comparisons", { view: "related" })}>
        Open the application
      </ButtonLink>
      {cluster ? (
        <>
          <p className="text-sm text-ink-2">{cluster.summary}.</p>
          <PanelDivider label={`Shared items (${mine.length})`} />
          <ul className="-mx-2 space-y-0.5">
            {mine.map((e) => {
              const it = items.get(e.target);
              if (!it) return null;
              const others = it.applications.filter((a) => a !== app.id);
              return (
                <li key={e.target}>
                  <button
                    type="button"
                    onClick={() => onSelect(it.id)}
                    className="flex w-full items-start gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2"
                  >
                    <KindDot kind={it.kind} className="mt-1.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm text-ink">{it.label}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {KIND_META[it.kind].label}, also in {data.applications.filter((a) => others.includes(a.id)).map((a) => a.short_name).join(", ")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-sm text-ink-3">No faculty ID, certificate number, file, photo or seal in this application was found in another application this year.</p>
      )}
    </div>
  );
}

export function NetworkView({ query }: { query: UseQueryResult<NetworkPayload> }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get("node");
  const [mode, setMode] = useState<"evidence" | "applications">("evidence");
  const [hover, setHover] = useState<string | null>(null);
  const select = useCallback(
    (id: string | null) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (id) n.set("node", id);
          else n.delete("node");
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );
  const data = query.data;
  const layout = useMemo(() => (data ? layoutNetwork(data, mode) : null), [data, mode]);
  const apps = useMemo(() => new Map((data?.applications ?? []).map((a) => [a.id, a])), [data]);
  const items = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data]);

  const columns = useMemo<Column<NetworkItem>[]>(
    () => [
      {
        id: "item",
        header: "Shared item",
        sortValue: (r) => r.label,
        cell: (r) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <KindDot kind={r.kind} />
            <span className="min-w-0">
              <span className="block truncate font-mono text-sm">{r.label}</span>
              {r.detail && <span className="block truncate text-xs font-normal text-ink-3">{r.detail}</span>}
            </span>
          </span>
        ),
      },
      { id: "kind", header: "Kind", sortValue: (r) => ITEM_KINDS.indexOf(r.kind), cell: (r) => <span className="text-ink-2">{KIND_META[r.kind].label}</span> },
      {
        id: "apps",
        header: "Appears in",
        cell: (r) => <span className="text-ink-2">{r.applications.map((a) => apps.get(a)?.short_name ?? a).join(", ")}</span>,
      },
      {
        id: "cluster",
        header: "Cluster",
        hideBelow: "md",
        sortValue: (r) => apps.get(r.applications[0])?.cluster ?? "",
        cell: (r) => <span className="text-ink-3">{(apps.get(r.applications[0])?.cluster ?? "").replace("C", "Cluster ")}</span>,
      },
      {
        id: "findings",
        header: "Findings",
        align: "right",
        sortValue: (r) => data?.edges.filter((e) => e.target === r.id).reduce((s, e) => s + e.findings.length, 0) ?? 0,
        cell: (r) => <span className="tabular-nums">{data?.edges.filter((e) => e.target === r.id).reduce((s, e) => s + e.findings.length, 0) ?? 0}</span>,
      },
    ],
    [apps, data],
  );

  if (query.isPending)
    return (
      <div role="status" className="space-y-6">
        <span className="sr-only">Loading the integrity network</span>
        <Skeleton className="h-24" rounded="lg" />
        <Skeleton className="h-[560px]" rounded="lg" />
      </div>
    );
  if (!data || !layout)
    return <ErrorState error={query.error} title="Could not load the integrity network" onRetry={() => void query.refetch()} retrying={query.isFetching} />;

  const s = data.stats;
  const selApp = selected ? apps.get(selected) : undefined;
  const selItem = selected ? items.get(selected) : undefined;
  const kinds = ITEM_KINDS.filter((k) => s.by_kind[k] > 0);
  const totalFindings = data.clusters.reduce((t, c) => t + c.findings, 0);
  const height = Math.round(Math.min(880, Math.max(420, layout.height + 40)));
  const summary = data.clusters.length
    ? `${pluralize(data.clusters.length, "linked cluster")} across ${pluralize(s.linked_applications, "application")}: ${data.clusters.map((c) => c.summary).join("; ")}.`
    : "No applications share evidence.";

  return (
    <div className="space-y-6">
      <StatGroup label="Network summary">
        <Stat label="Linked clusters" value={s.clusters} hint={`Groups of applications joined by shared evidence`} />
        <Stat label="Applications linked" value={`${s.linked_applications} of ${s.applications}`} hint={`${s.applications - s.linked_applications} share nothing with another application`} />
        <Stat label="Shared items" value={s.shared_items} hint={kinds.map((k) => kindCount(k, s.by_kind[k])).join(", ")} />
        <Stat label="Findings behind the links" value={totalFindings} hint="Each opens with its evidence" />
      </StatGroup>

      <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel
          title="Network of shared evidence"
          description={
            mode === "evidence"
              ? "Applications and the items they share. Hover or select a node to trace its links."
              : "Applications only; line weight is the number of items two applications share."
          }
          padding="none"
          actions={
            <SegmentedControl
              size="sm"
              label="Network view"
              value={mode}
              onChange={(v) => setMode(v as "evidence" | "applications")}
              options={[
                { value: "evidence", label: "Evidence" },
                { value: "applications", label: "Applications only" },
              ]}
            />
          }
          footer={
            <ul className="flex w-full flex-wrap items-center gap-x-5 gap-y-1.5" aria-label="Legend">
              <LegendItem kind="application" />
              {mode === "evidence" && kinds.map((k) => <LegendItem key={k} kind={k} count={s.by_kind[k]} />)}
              {mode === "evidence" && (
                <li className="ml-auto text-xs text-ink-3">Solid: same identifier. Dashed: image match. Dotted: matching values.</li>
              )}
            </ul>
          }
        >
          <div className="border-t border-line">
            <GraphCanvas
              nodes={layout.nodes}
              edges={layout.edges}
              frames={layout.frames}
              selected={selected}
              onSelect={select}
              hovered={hover}
              height={height}
              label={`Integrity network. ${summary} The table below lists every shared item.`}
            />
          </div>
        </Panel>

        <Panel
          as="aside"
          className="2xl:sticky 2xl:top-20"
          title={selApp ? selApp.institution : selItem ? selItem.label : "Clusters"}
          description={
            selApp
              ? "Application"
              : selItem
                ? `${KIND_META[selItem.kind].label}${selItem.doc_label ? `, ${selItem.doc_label}` : ""}`
                : "Applications joined by shared evidence, largest first. Select one to trace it."
          }
          actions={selected ? <IconButton size="sm" label="Clear the selection" icon={<X />} onClick={() => select(null)} /> : undefined}
        >
          {selApp ? (
            <AppDetail app={selApp} data={data} items={items} onSelect={select} />
          ) : selItem ? (
            <ItemDetail item={selItem} data={data} apps={apps} />
          ) : data.clusters.length === 0 ? (
            <EmptyState size="sm" title="No linked applications" description="No two applications this year share a faculty ID, certificate number, file, photo or seal." />
          ) : (
            <ol className="space-y-4">
              {data.clusters.map((c, i) => (
                <li key={c.id} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink">Cluster {i + 1}</h3>
                    <span className="text-xs text-ink-3">
                      {pluralize(c.findings, "finding")}
                      {c.high_findings ? `, ${c.high_findings} high` : ""}
                    </span>
                  </div>
                  <p className="text-sm text-ink-2">{c.summary}.</p>
                  <ul className="-mx-2 space-y-0.5">
                    {c.applications.map((a) => (
                      <li key={a}>
                        <button
                          type="button"
                          onClick={() => select(a)}
                          onMouseEnter={() => setHover(a)}
                          onMouseLeave={() => setHover(null)}
                          onFocus={() => setHover(a)}
                          onBlur={() => setHover(null)}
                          className="flex w-full items-center gap-2.5 rounded-control px-2 py-1 text-left text-sm text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
                        >
                          <KindDot kind="application" />
                          <span className="min-w-0 flex-1 truncate">{apps.get(a)?.institution}</span>
                          <span className="shrink-0 font-mono text-xs text-ink-3">{a}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {c.pairs.length > 1 && (
                    <ul className="space-y-0.5 border-l border-line pl-3 text-xs text-ink-3">
                      {c.pairs.map((p) => (
                        <li key={`${p.a}-${p.b}`}>{p.summary}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Panel
        title="Shared items"
        description="The same evidence as the network, as a table. Select a row to find it in the network; each finding opens with its evidence."
        padding="none"
      >
        <div className="border-t border-line">
          <DataTable
            label="Items shared between applications"
            rows={data.items}
            columns={columns}
            rowKey={(r) => r.id}
            onRowClick={(r) => {
              select(r.id);
              window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
            }}
            selectedKey={selected ?? undefined}
            density="compact"
            empty="No items are shared between applications."
          />
        </div>
      </Panel>
    </div>
  );
}
