import { ArrowUpRight, ScanSearch } from "lucide-react";
import { Link } from "react-router-dom";
import { fmtValue } from "../../../lib/format";
import { channelMeta, humanize, pathLabel } from "../../../lib/labels";
import { workspacePath } from "../../../shell/nav";
import type { Tone } from "../../../lib/labels";
import { Button, buttonStyles, Code, Drawer, RuleOutcomeBadge, SeverityIndicator, SimulatedTag, StatusBadge } from "../../../ui2";
import { useWorkspace } from "../context";
import { AttemptBadge, CitationCard, ComparisonTable, EvidenceList, SimTag } from "../parts";
import { STATE_LABEL, type ItemEffect, type ProofItem, type ProofLevel, type ProofRow, type Rung } from "./api";

const STATE_TONE: Record<Rung["state"], Tone> = {
  supports: "verified",
  against: "mismatch",
  inconclusive: "manual",
  not_checked: "unchecked",
  none: "unchecked",
};

const EFFECT: Record<ItemEffect, { label: string; tone: Tone }> = {
  supports: { label: "Supports", tone: "verified" },
  against: { label: "Contradicts", tone: "mismatch" },
  inconclusive: { label: "Inconclusive", tone: "manual" },
  not_checked: { label: "Not checked", tone: "unchecked" },
  info: { label: "Context", tone: "unchecked" },
};

const EMPTY_TEXT: Record<string, string> = {
  none: "No source exists at this level for this requirement in the active ruleset.",
  not_checked: "This level applies to the requirement, but no check produced a result in the latest run.",
};

const link = buttonStyles("ghost", "sm");

function Block({ effect, title, children, actions }: { effect: ItemEffect; title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  const e = EFFECT[effect];
  return (
    <li className="space-y-2 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1 text-sm font-medium text-ink">{title}</div>
        <StatusBadge tone={e.tone}>{e.label}</StatusBadge>
      </div>
      {children}
      {actions && <div className="-ml-2 flex flex-wrap items-center gap-1">{actions}</div>}
    </li>
  );
}

function FindingLink({ id }: { id: string | null | undefined }) {
  const { app } = useWorkspace();
  if (!id) return null;
  return (
    <Link className={link} to={workspacePath(app.id, "findings", { finding: id })}>
      Open finding
      <ArrowUpRight aria-hidden className="size-3.5" />
    </Link>
  );
}

function Item({ item }: { item: ProofItem }) {
  const { app, openDoc } = useWorkspace();
  switch (item.kind) {
    case "rule":
      return (
        <Block
          effect={item.effect}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <RuleOutcomeBadge outcome={item.outcome} />
              {item.title}
            </span>
          }
          actions={
            <>
              <FindingLink id={item.finding_id} />
              <Link className={link} to={workspacePath(app.id, "findings", { view: "checklist", rule: item.rule_id })}>
                Open in checklist
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </>
          }
        >
          {item.message && <p className="text-sm text-ink-2">{item.message}</p>}
          <CitationCard citation={item.citation} ruleId={item.rule_id} />
          {item.evidence.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-medium text-ink-2 hover:text-ink">Inputs ({item.evidence.length})</summary>
              <div className="mt-2">
                <EvidenceList evidence={item.evidence} fallbackDocId={null} />
              </div>
            </details>
          )}
        </Block>
      );
    case "attempt":
      return (
        <Block
          effect={item.effect}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <AttemptBadge status={item.status} />
              {channelMeta[item.channel]?.label ?? humanize(item.channel)}
              <span className="font-normal text-ink-3">{item.source}</span>
              <SimTag channel={item.channel} simulated={item.simulated} />
            </span>
          }
          actions={
            <>
              <Link className={link} to={workspacePath(app.id, "documents", { view: "verification", attempt: item.attempt_id })}>
                Open verification attempt
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
              <FindingLink id={item.finding_id} />
            </>
          }
        >
          {item.detail && <p className="text-sm text-ink-2">{item.detail}</p>}
          {item.note && <p className="text-xs text-ink-3">{item.note}</p>}
          {item.comparisons.length > 0 && <ComparisonTable comparisons={item.comparisons} />}
        </Block>
      );
    case "finding":
      return (
        <Block
          effect={item.effect}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <SeverityIndicator severity={item.severity} showLabel={false} />
              {item.title}
            </span>
          }
          actions={<FindingLink id={item.finding_id} />}
        >
          <p className="text-sm text-ink-2">{item.message}</p>
        </Block>
      );
    case "fields": {
      const shown = item.fields.slice(0, 8);
      return (
        <Block
          effect={item.effect}
          title={`${item.label}: ${item.rows ? `${item.rows} table rows, ` : ""}${item.fields.length} ${item.fields.length === 1 ? "field" : "fields"} read`}
          actions={
            <Button size="sm" variant="ghost" onClick={() => openDoc({ docId: item.document_id })}>
              Open document
            </Button>
          }
        >
          {item.note && <p className="text-sm text-ink-2">{item.note}</p>}
          {shown.length > 0 && (
            <ul className="divide-y divide-line rounded-control border border-line">
              {shown.map((f) => (
                <li key={f.name} className="flex min-w-0 items-center gap-3 px-3 py-1.5">
                  <span className="w-36 shrink-0 text-xs text-ink-3">{pathLabel(f.name)}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{fmtValue(f.value ?? f.raw)}</span>
                  {f.page && f.bbox && (
                    <Button size="sm" variant="ghost" leadingIcon={<ScanSearch />} onClick={() => openDoc({ docId: item.document_id, page: f.page, bbox: f.bbox, label: pathLabel(f.name) })}>
                      Show on page
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Block>
      );
    }
    case "document":
      return (
        <Block
          effect={item.effect}
          title={item.label}
          actions={
            <Button size="sm" variant="ghost" onClick={() => openDoc({ docId: item.document_id })}>
              Open document
            </Button>
          }
        >
          <p className="font-mono text-xs text-ink-3">{item.filename}</p>
        </Block>
      );
    case "declared":
      return (
        <Block effect={item.effect} title={`Declared ${pathLabel(item.field.replace(/^app\./, ""))}`}>
          <p className="font-mono text-sm text-ink">{fmtValue(item.value)}</p>
        </Block>
      );
    case "claim":
      return (
        <Block effect={item.effect} title="Claimed by the institution">
          <p className="text-sm text-ink-2">{item.text}</p>
        </Block>
      );
    case "registry_check":
      return (
        <Block effect={item.effect} title={item.source}>
          <p className="text-sm text-ink-2">{item.text}</p>
          {item.elsewhere.length > 0 && (
            <p className="text-xs text-ink-3">
              Registered elsewhere:{" "}
              {item.elsewhere.map((id) => (
                <Code key={id} className="mr-1 text-xs">
                  {id}
                </Code>
              ))}
            </p>
          )}
        </Block>
      );
    default:
      return null;
  }
}

const ORDER: ItemEffect[] = ["against", "inconclusive", "supports", "not_checked", "info"];

/** The exact evidence behind one rung of one requirement. */
export function ProofDrawer({ row, level, rung, onClose }: { row: ProofRow; level: ProofLevel; rung: Rung; onClose: () => void }) {
  const items = [...rung.items].sort((a, b) => ORDER.indexOf(a.effect) - ORDER.indexOf(b.effect));
  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title={`${row.label}: ${level.label}`}
      description={level.description}
    >
      <div className="space-y-5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={STATE_TONE[rung.state]}>
            {STATE_LABEL[rung.state]}
            {rung.partial ? ", in part" : ""}
          </StatusBadge>
          {level.simulated && <SimulatedTag />}
          {rung.level === row.strongest && <span className="text-xs text-ink-3">Strongest level reached for this requirement</span>}
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-ink-2">{EMPTY_TEXT[rung.state] ?? "Nothing recorded at this level."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((it, i) => (
              <Item key={i} item={it} />
            ))}
          </ul>
        )}
        <p className="border-t border-line pt-4 text-xs text-ink-3">
          Overall: <span className={row.verdict.kind === "contradicted" ? "font-medium text-mismatch-fg" : "text-ink-2"}>{row.verdict.text}</span>. Pramana shows
          the evidence; the decision stays with the official.
        </p>
      </div>
    </Drawer>
  );
}
