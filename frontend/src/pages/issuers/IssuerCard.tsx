import { Clock3, Lock, Mail, Zap } from "lucide-react";
import { motion } from "motion/react";
import { humanize } from "../../lib/labels";
import type { SimIssuer } from "../../types";
import { Tag } from "../../ui/Badge";
import { StatusCube } from "../../ui/Blocks";
import { Card } from "../../ui/Card";
import { cn } from "../../ui/cn";
import { Switch } from "../../ui/Field";
import { spring } from "../../ui/motion";
import { Tooltip } from "../../ui/Tooltip";
import { Cable } from "./Cable";

export function issuerName(i: SimIssuer): string {
  return i.name.replace(/\s*\(SIMULATED\)\s*$/i, "");
}

export function isOnline(i: SimIssuer): boolean {
  return i.available !== false;
}

export interface IssuerCardProps {
  issuer: SimIssuer;
  selected: boolean;
  busy: boolean;
  canToggle: boolean;
  toggling: boolean;
  onSelect: () => void;
  onToggle: (available: boolean) => void;
}

export function IssuerCard({ issuer, selected, busy, canToggle, toggling, onSelect, onToggle }: IssuerCardProps) {
  const online = isOnline(issuer);
  const name = issuerName(issuer);
  const fields = issuer.compare_fields ?? [];
  const asyncMode = issuer.mode === "async";
  return (
    <Card interactive className={cn("flex h-full flex-col p-5", selected && "border-brand-300")}>
      {selected && (
        <motion.span
          layoutId="issuer-selected"
          transition={spring.snappy}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-brand-400/70"
        />
      )}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Use ${name} for a manual lookup`}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
      />
      <div className="pointer-events-none relative z-[1] mb-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-[17px] leading-snug font-semibold tracking-title text-ink text-balance">{name}</h3>
              <Tag variant="demo">Simulated</Tag>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
              <Tag variant="mono">{issuer.code}</Tag>
              <span className="inline-flex items-center gap-1">
                {asyncMode ? <Mail className="size-3.5" aria-hidden /> : <Zap className="size-3.5" aria-hidden />}
                {asyncMode ? "Asynchronous confirmation" : "Synchronous lookup"}
              </span>
              {issuer.latency_ms !== undefined && (
                <span className="inline-flex items-center gap-1 tabular">
                  <Clock3 className="size-3.5" aria-hidden /> {issuer.latency_ms} ms latency
                </span>
              )}
            </div>
          </div>
          {selected && <span className="eyebrow mt-1 hidden text-brand-ink xl:max-2xl:inline">Lookup target</span>}
        </div>

        <Cable online={online} busy={busy} code={issuer.code} />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-ink-3">{fields.length ? "Compares" : "Confirms"}</span>
            {fields.length ? (
              fields.map((f) => (
                <span key={f} className="inline-flex h-6 items-center rounded-full border border-line bg-surface-2/60 px-2.5 text-xs text-ink-2">
                  {humanize(f)}
                </span>
              ))
            ) : (
              <span className="text-xs text-ink-2">that the reference exists; there are no fields to compare</span>
            )}
          </div>
          {typeof issuer.models === "string" && <p className="text-xs text-ink-3 text-pretty">Models: {issuer.models}</p>}
        </div>
      </div>

      <div className="relative z-[1] mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <span className={cn("inline-flex min-w-0 items-center gap-2 text-sm font-medium", online ? "text-verified-fg" : "text-unavail-fg")} aria-live="polite">
          <StatusCube tone={online ? "verified" : "unavail"} size={13} />
          {online ? "Responding" : "Not responding: runs record source unavailable"}
        </span>
        {canToggle ? (
          <Switch checked={online} onChange={onToggle} disabled={toggling} label={online ? "Online" : "Offline"} />
        ) : (
          <Tooltip content="Only an administrator can switch a simulated source on or off.">
            <span tabIndex={0} className="inline-flex items-center gap-2 rounded-control px-1 text-xs font-medium text-ink-3">
              <Lock className="size-3.5" aria-hidden />
              <Switch checked={online} onChange={() => undefined} disabled label={online ? "Online" : "Offline"} />
            </span>
          </Tooltip>
        )}
      </div>
    </Card>
  );
}
