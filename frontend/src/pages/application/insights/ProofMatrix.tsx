import { X } from "lucide-react";
import { useCallback, useMemo, useRef, type KeyboardEvent } from "react";
import { cn, EmptyState, Panel, SimulatedTag, Skeleton } from "../../../ui2";
import { useWorkspace } from "../context";
import { useParam } from "../data";
import { STATE_LABEL, useProofInsights, type ProofLevel, type ProofMatrix as Matrix, type ProofRow, type Rung } from "./api";
import { ProofDrawer } from "./ProofDrawer";

/** Height of each rung, rising with the strength of proof: a staircase per requirement. */
const RUNG_H = [6, 10, 14, 18, 22, 26];

function rungClass(r: Rung, row: ProofRow): string {
  switch (r.state) {
    case "supports":
      // The strongest rung carries the strong tone, unless something contradicts the requirement
      if (r.level !== row.strongest || row.verdict.kind === "contradicted") return "bg-ink-4/45";
      return row.verdict.kind === "proven" ? "bg-verified-dot" : "bg-ink-2";
    case "against":
      return "bg-mismatch-dot";
    case "inconclusive":
      return "border border-manual-dot bg-manual-bg";
    case "not_checked":
      return "border border-dashed border-ink-4/70";
    default:
      return "";
  }
}

/** Small signal-strength glyph in each level header: the rung's place on the ladder. */
function LevelGlyph({ level }: { level: number }) {
  return (
    <svg aria-hidden width="26" height="12" viewBox="0 0 26 12" className="shrink-0">
      {RUNG_H.map((_, i) => {
        const h = 2 + i * 2;
        return <rect key={i} x={i * 4.4} y={12 - h} width="3" height={h} rx="0.5" className={i <= level ? "fill-ink-3" : "fill-line-2"} />;
      })}
    </svg>
  );
}

function cellLabel(row: ProofRow, r: Rung, lv: ProofLevel): string {
  const lead = r.items.find((x) => x.effect === r.state);
  const why = lead
    ? lead.kind === "rule"
      ? lead.title
      : lead.kind === "attempt"
        ? (lead.detail ?? lead.source)
        : lead.kind === "finding"
          ? lead.title
          : lead.kind === "registry_check"
            ? lead.text
            : lead.kind === "document" || lead.kind === "fields"
              ? lead.label
              : null
    : null;
  return `${row.label}, ${lv.label}${lv.simulated ? " (simulated)" : ""}: ${STATE_LABEL[r.state]}${r.partial ? ", in part" : ""}${why ? `. ${why}` : ""}`;
}

function Legend() {
  const sw = "inline-block w-3.5 shrink-0 rounded-[2px]";
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-3" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(sw, "h-3 bg-verified-dot")} />
        Proven: the strongest level reached
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(sw, "h-2.5 bg-ink-4/45")} />
        Supports
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(sw, "relative h-3 bg-mismatch-dot")} />
        Contradicts
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(sw, "h-3 border border-manual-dot bg-manual-bg")} />
        Inconclusive or awaiting
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(sw, "h-3 border border-dashed border-ink-4/70")} />
        Not checked
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(sw, "h-0.5 bg-line-2")} />
        No source at this level
      </li>
      <li className="flex items-center gap-1.5">
        Issuer registry answers are <SimulatedTag />
      </li>
    </ul>
  );
}

function verdictTone(row: ProofRow): string {
  if (row.verdict.kind === "contradicted") return "text-mismatch-fg";
  if (row.verdict.kind === "proven") return "text-ink";
  return "text-ink-3";
}

function MatrixTable({ matrix, selected, onSelect }: { matrix: Matrix; selected: string | null; onSelect: (key: string) => void }) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const order = useMemo(() => matrix.rows.map((r) => r.id), [matrix.rows]);
  const focusCell = useCallback((row: number, col: number) => {
    const r = Math.max(0, Math.min(order.length - 1, row));
    const c = Math.max(0, Math.min(5, col));
    refs.current.get(`${order[r]}:${c}`)?.focus();
  }, [order]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, row: number, col: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [row, col + 1],
      ArrowLeft: [row, col - 1],
      ArrowDown: [row + 1, col],
      ArrowUp: [row - 1, col],
      Home: [row, 0],
      End: [row, 5],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    focusCell(m[0], m[1]);
  };
  // One tab stop for the whole grid: the selected cell, else the first row's strongest rung
  const tabKey = selected && refs.current.has(selected) ? selected : `${order[0]}:${Math.max(0, matrix.rows[0]?.strongest ?? 0)}`;
  const groups = matrix.groups.filter((g) => matrix.rows.some((r) => r.group === g.id));

  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">
          Proof strength for each requirement. Columns run from the weakest proof, declared by the institution, to the strongest, the issuer's signature or
          signed QR. Each cell says whether that level supports or contradicts the requirement. Use the arrow keys to move between cells and Enter to open the
          evidence.
        </caption>
        <colgroup>
          <col className="w-[28%]" />
          {matrix.levels.map((l) => (
            <col key={l.id} className="w-[7.5%]" />
          ))}
          <col />
        </colgroup>
        <thead>
          <tr className="text-left text-xs text-ink-3">
            <th scope="col" className="h-11 border-b border-line pr-3 pl-5 align-bottom font-medium">
              Requirement
            </th>
            {matrix.levels.map((l, i) => (
              <th key={l.id} scope="col" title={l.description} className="h-11 border-b border-line px-1 pb-2 align-bottom font-medium">
                <span className="flex flex-col items-start gap-1.5">
                  <span className="leading-4 text-ink-2">{l.label}</span>
                  <LevelGlyph level={i} />
                </span>
              </th>
            ))}
            <th scope="col" className="h-11 border-b border-line pr-5 pb-2 pl-4 align-bottom font-medium">
              Strongest proof
            </th>
          </tr>
          <tr>
            <td aria-hidden className="h-6 border-b border-line" />
            <td colSpan={6} className="border-b border-line px-1">
              <span className="flex items-center gap-2 text-xs text-ink-3">
                <span>Weaker</span>
                <span aria-hidden className="relative h-px flex-1 bg-line-2">
                  <span className="absolute -top-[3px] right-0 size-0 border-y-[3.5px] border-l-[6px] border-y-transparent border-l-line-2" />
                </span>
                <span>Stronger</span>
              </span>
            </td>
            <td aria-hidden className="border-b border-line" />
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.id}>
            <tr>
              <th scope="colgroup" colSpan={8} className="bg-surface-2/60 py-1.5 pl-5 text-left text-xs font-medium text-ink-3">
                {g.label}
              </th>
            </tr>
            {matrix.rows
              .filter((r) => r.group === g.id)
              .map((row) => {
                const ri = order.indexOf(row.id);
                const docs = row.documents.map((d) => d.label.replace(/\s*\(.*\)$/, ""));
                return (
                  <tr key={row.id} className="group/row">
                    <th scope="row" className="border-b border-line py-2.5 pr-3 pl-5 text-left align-middle font-normal">
                      <span className="block text-sm font-medium text-ink">{row.label}</span>
                      <span className="mt-0.5 block truncate text-xs text-ink-3" title={docs.join(", ")}>
                        {[docs.length ? docs.join(", ") : "No document", `${row.rule_count} ${row.rule_count === 1 ? "rule" : "rules"}`].join(" · ")}
                      </span>
                    </th>
                    {row.levels.map((r, ci) => {
                      const key = `${row.id}:${ci}`;
                      const lv = matrix.levels[ci];
                      const isSel = selected === key;
                      return (
                        <td key={ci} className="border-b border-line px-0.5 align-bottom">
                          <button
                            ref={(el) => {
                              if (el) refs.current.set(key, el);
                              else refs.current.delete(key);
                            }}
                            type="button"
                            tabIndex={key === tabKey ? 0 : -1}
                            aria-label={cellLabel(row, r, lv)}
                            aria-pressed={isSel}
                            onClick={() => onSelect(key)}
                            onKeyDown={(e) => onKey(e, ri, ci)}
                            className={cn(
                              "relative flex h-12 w-full items-end rounded-[4px] px-1 pb-2 outline-none transition-colors duration-150 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand-500 motion-reduce:transition-none",
                              isSel && "bg-brand-soft hover:bg-brand-soft",
                            )}
                          >
                            {r.state === "none" ? (
                              <span aria-hidden className="block h-0.5 w-full rounded-full bg-line-2" />
                            ) : (
                              <span aria-hidden className={cn("relative block w-full rounded-[2px]", rungClass(r, row))} style={{ height: RUNG_H[ci] }}>
                                {r.partial && (
                                  <span
                                    className={cn(
                                      "absolute inset-x-0 bottom-0 h-1/2 rounded-b-[2px]",
                                      r.level === row.strongest && row.verdict.kind === "proven" ? "bg-verified-dot" : "bg-ink-4/45",
                                    )}
                                  />
                                )}
                              </span>
                            )}
                            {r.state === "against" && (
                              <X aria-hidden strokeWidth={3} className="absolute left-1/2 size-3 -translate-x-1/2 text-mismatch-fg" style={{ bottom: RUNG_H[ci] + 11 }} />
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="border-b border-line py-2.5 pr-5 pl-4 align-middle">
                      <span className={cn("block text-sm", verdictTone(row), row.verdict.kind === "contradicted" && "font-medium")}>{row.verdict.text}</span>
                      {row.notes.map((n) => (
                        <span key={n} className={cn("mt-0.5 block text-xs", /session/.test(n) ? "font-medium text-expired-fg" : "text-ink-3")}>
                          {n}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** How strongly each requirement is proven, from the institution's word to the issuer's signature. */
export function ProofMatrix() {
  const { app } = useWorkspace();
  const latest = app.latest_run;
  const q = useProofInsights(app.id, latest?.id);
  const [sel, setSel] = useParam("proof");
  const matrix = q.data?.matrix ?? null;
  const [rowId, lvl] = (sel ?? "").split(":");
  const row = matrix?.rows.find((r) => r.id === rowId) ?? null;
  const level = row ? Number(lvl) : NaN;

  return (
    <Panel
      title="Proof strength"
      description="How strongly the latest run proves each requirement, from the institution's word to the issuer's signature. Select a cell for its evidence."
    >
      {!latest ? (
        <EmptyState size="sm" title="Not validated yet" description="Proof strength appears after the first validation run." />
      ) : q.isPending ? (
        <div role="status" className="space-y-2">
          <span className="sr-only">Loading proof strength</span>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-64" />
        </div>
      ) : !matrix ? (
        <EmptyState size="sm" title="No completed run" description="Proof strength appears once a validation run completes." />
      ) : (
        <div className="space-y-4">
          <p className="text-base text-pretty text-ink">{matrix.summary.text}</p>
          <MatrixTable matrix={matrix} selected={sel} onSelect={setSel} />
          <Legend />
        </div>
      )}
      {matrix && row && Number.isInteger(level) && level >= 0 && level < 6 && (
        <ProofDrawer row={row} level={matrix.levels[level]} rung={row.levels[level]} onClose={() => setSel(null)} />
      )}
    </Panel>
  );
}
