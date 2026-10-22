import { useState } from "react";
import { sum } from "../../lib/format";
import { humanize, VERIFICATION_STATUSES, verificationMeta } from "../../lib/labels";
import { StatusCube } from "../../ui/Blocks";
import { cn } from "../../ui/cn";
import { Counter } from "../../ui/Counter";
import { toneClass, verificationTone } from "../../ui/tone";
import { IsoCube } from "./iso";

const S = 13;
const MAX_LEVELS = 9;

/** Verification outcomes as isometric columns of status-coloured blocks. */
export function VerificationBlocks({ counts }: { counts: Record<string, number> }) {
  const [hover, setHover] = useState<string | null>(null);
  const keys = [...VERIFICATION_STATUSES, ...Object.keys(counts).filter((k) => !(k in verificationMeta))].filter((k) => counts[k]);
  const total = sum(keys.map((k) => counts[k]));
  const max = Math.max(1, ...keys.map((k) => counts[k]));
  const unit = Math.max(1, Math.ceil(max / MAX_LEVELS));
  const levels = keys.map((k) => Math.max(1, Math.ceil(counts[k] / unit)));
  const gap = S * 2 + 10;
  const width = keys.length * gap + 8;
  const height = MAX_LEVELS * S + S * 2 + 8;

  return (
    <section aria-labelledby="ver-title" className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-5 shadow-sm">
      <h2 id="ver-title" className="font-display text-lg font-semibold tracking-title">
        Verification outcomes
      </h2>
      <p className="mt-0.5 text-sm text-ink-3">
        <Counter value={total} /> checks on the latest runs{unit > 1 ? `, one block per ${unit}` : ""}.
      </p>
      {keys.length === 0 ? (
        <p className="mt-6 text-sm text-ink-3">No verification checks have run yet.</p>
      ) : (
        <>
          <div className="mt-4 flex justify-center rounded-[12px] bg-sky-soft px-3 pt-4 pb-2">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[420px] overflow-visible" role="img" aria-label="Verification outcomes chart">
              {keys.map((k, i) => {
                const x = 4 + S + i * gap;
                const base = height - S * 2 - 4;
                const dim = hover && hover !== k;
                return (
                  <g key={k} opacity={dim ? 0.35 : 1} style={{ transition: "opacity 0.2s" }}>
                    {Array.from({ length: levels[i] }, (_, l) => (
                      <IsoCube key={l} x={x} y={base - l * S} s={S} color={toneClass[verificationTone(k)].color} delay={0.25 + i * 0.07 + l * 0.035} />
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>
          <ul className="mt-4 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {keys.map((k) => (
              <li
                key={k}
                onPointerEnter={() => setHover(k)}
                onPointerLeave={() => setHover(null)}
                className={cn("flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors", hover === k && "bg-surface-2")}
              >
                <StatusCube status={k} size={12} />
                <span className="min-w-0 flex-1 truncate text-ink-2">{verificationMeta[k]?.label ?? humanize(k)}</span>
                <span className="font-medium text-ink tabular">{counts[k]}</span>
                <span className="w-9 text-right text-xs text-ink-3 tabular">{Math.round((counts[k] / Math.max(1, total)) * 100)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
