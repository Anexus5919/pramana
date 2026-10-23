import { cn } from "../../ui2";
import { kindColor, KIND_META, useGraphTheme, type NodeKind } from "./graphTheme";

export function KindDot({ kind, className }: { kind: NodeKind; className?: string }) {
  const t = useGraphTheme();
  if (kind === "application") return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full border-[1.5px] border-ink-3", className)} />;
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: kindColor(kind, t) }} />;
}

/** Legend chip: the node glyph in its colour, plus the line style its links use. */
export function LegendItem({ kind, count }: { kind: NodeKind; count?: number }) {
  const t = useGraphTheme();
  const color = kindColor(kind, t);
  const meta = KIND_META[kind];
  return (
    <li className="flex items-center gap-2 text-xs text-ink-3" title={meta.meaning}>
      {kind === "application" ? (
        <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] border-ink-3 bg-surface" />
      ) : (
        <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: color }} />
      )}
      {kind !== "application" && (
        <svg aria-hidden width="22" height="6" className="shrink-0">
          <line
            x1="1"
            y1="3"
            x2="21"
            y2="3"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={meta.line === "dashed" ? "5 3" : meta.line === "dotted" ? "1 3" : undefined}
          />
        </svg>
      )}
      <span>
        {meta.label}
        {count !== undefined && <span className="text-ink-4"> {count}</span>}
      </span>
    </li>
  );
}
