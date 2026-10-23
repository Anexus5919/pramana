import { useMutation } from "@tanstack/react-query";
import { CircleSlash, Search, Unplug } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api } from "../../api";
import { humanize } from "../../lib/labels";
import type { SimIssuer, SimLookup } from "../../types";
import { Badge, Tag } from "../../ui/Badge";
import { StatusCube } from "../../ui/Blocks";
import { BlockLoader, Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Field, Input, Select } from "../../ui/Field";
import { dur, ease, fadeUp, stagger } from "../../ui/motion";
import { ErrorState } from "../../ui/States";
import { isOnline, issuerName } from "./IssuerCard";

/** One reference per source from the synthetic demo registry, so the lookup can be tried without a document at hand. */
const EXAMPLES: Record<string, string> = {
  "FIRE-SERVICES": "FES/PUN/2025/04417",
  "MUNICIPAL-OC": "PUN/BP/OC/2009/00913",
  "SHCIL-ESTAMP": "IN-MH37491251215259X",
  "ICAI-UDIN": "25100731840H1TP8DP",
  "SE-REGISTRY": "SE/CSMC/2012/0457",
};

interface Answer {
  code: string;
  ref: string;
  ms: number;
  data?: SimLookup;
  error?: unknown;
}

function Shell({ tone, icon, title, children }: { tone: string; icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: dur.panel, ease: ease.out }}
      className={cn("rounded-card border p-4", tone)}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{title}</div>
          {children}
        </div>
      </div>
    </motion.div>
  );
}

function Result({ a, issuer }: { a: Answer; issuer: SimIssuer | undefined }) {
  const timing = (
    <p className="mt-3 text-xs text-ink-3 tabular">
      Answered in {Math.round(a.ms)} ms{issuer?.latency_ms !== undefined ? ` (simulated latency ${issuer.latency_ms} ms)` : ""}
    </p>
  );
  if (a.error instanceof ApiError && a.error.status === 503) {
    return (
      <Shell tone="border-unavail-dot/30 bg-unavail-bg" icon={<Unplug className="size-5 text-unavail-dot" />} title="Source unavailable">
        <p className="mt-1 text-sm text-ink-2 text-pretty">{a.error.message.replace(/\s*\(SIMULATED\)/i, "")}.</p>
        <p className="mt-2 text-sm text-ink-3 text-pretty">
          A validation run in this state records source unavailable for the document and routes it for manual confirmation. Nothing is
          marked verified or mismatched on a missing answer.
        </p>
        {timing}
      </Shell>
    );
  }
  if (a.error) return <ErrorState error={a.error} title="The lookup did not complete" />;
  const d = a.data;
  if (!d) return null;
  if (!d.found || !d.record) {
    return (
      <Shell tone="border-mismatch-dot/25 bg-mismatch-bg" icon={<CircleSlash className="size-5 text-mismatch-dot" />} title="Not found in issuer registry">
        <p className="mt-1 text-sm text-ink-2 text-pretty">
          The simulated registry has no record for <span className="font-mono text-[13px] text-ink">{a.ref}</span>. Check the reference for a
          typing slip before treating this as an indicator.
        </p>
        {timing}
      </Shell>
    );
  }
  const rec = d.record as { ref_no?: string; status?: string; fields?: Record<string, unknown> };
  const fields = Object.entries(rec.fields ?? {});
  const compared = new Set(issuer?.compare_fields ?? []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: dur.panel, ease: ease.out }}
      className="overflow-hidden rounded-card border border-verified-dot/30 bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 bg-verified-bg px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-verified-fg">
          <StatusCube tone="verified" size={14} /> Record found
        </span>
        <span className="flex items-center gap-1.5">
          {rec.status && (
            <Badge tone="verified" variant="outline">
              {humanize(rec.status)}
            </Badge>
          )}
          <Tag variant="demo">Simulated</Tag>
        </span>
      </div>
      <div className="px-4 pt-3 pb-4">
        <div className="text-xs text-ink-3">Reference</div>
        <div className="font-mono text-sm break-all text-ink">{rec.ref_no ?? a.ref}</div>
        {fields.length > 0 ? (
          <motion.dl variants={stagger(0.06, 0.1)} initial="hidden" animate="show" className="mt-3 divide-y divide-line border-t border-line">
            {fields.map(([k, v]) => (
              <motion.div key={k} variants={fadeUp} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 py-2">
                <dt className="text-sm text-ink-3">{humanize(k)}</dt>
                <dd className="row-span-2 self-center text-right">
                  {compared.has(k) && (
                    <Tag variant="brand" title="Pramana compares this field with the value read from the document">
                      Compared
                    </Tag>
                  )}
                </dd>
                <dd className="min-w-0 font-mono text-[13px] break-words text-ink">{String(v)}</dd>
              </motion.div>
            ))}
          </motion.dl>
        ) : (
          <p className="mt-3 border-t border-line pt-3 text-sm text-ink-2 text-pretty">
            This source confirms existence only, by letter. In a validation run the document waits as verification pending until the
            confirmation is recorded.
          </p>
        )}
        {timing}
      </div>
    </motion.div>
  );
}

export interface LookupPanelProps {
  issuers: SimIssuer[];
  code: string;
  onCode: (code: string) => void;
  onBusy: (code: string | null) => void;
  className?: string;
}

/** The simulated issuer's own lookup page, as a verifier would use it by hand. */
export function LookupPanel({ issuers, code, onCode, onBusy, className }: LookupPanelProps) {
  const [ref, setRef] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const issuer = issuers.find((i) => i.code === code);
  const example = EXAMPLES[code];

  const lookup = useMutation({
    mutationFn: async ({ c, r }: { c: string; r: string }) => {
      const t0 = performance.now();
      try {
        const data = await api.simLookup(c, r);
        return { code: c, ref: r, ms: performance.now() - t0, data } satisfies Answer;
      } catch (error) {
        return { code: c, ref: r, ms: performance.now() - t0, error } satisfies Answer;
      }
    },
    onMutate: ({ c }) => {
      onBusy(c);
      setAnswer(null);
    },
    onSuccess: (a) => setAnswer(a),
    onSettled: () => onBusy(null),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const r = ref.trim();
    if (!r || !code) return;
    lookup.mutate({ c: code, r });
  }

  return (
    <section aria-labelledby="lookup-title" className={cn("rounded-panel border border-line bg-surface shadow-sm", className)}>
      <header className="px-5 pt-5 pb-3">
        <div className="eyebrow mb-1">Manual lookup</div>
        <h2 id="lookup-title" className="font-display text-lg font-semibold tracking-title text-ink">
          Look up a reference
        </h2>
        <p className="mt-1 text-sm text-ink-3 text-pretty">
          Ask a simulated registry for its record, the way a verifier would on the issuer's own portal.
        </p>
      </header>
      <form onSubmit={submit} className="space-y-4 px-5 pb-5">
        <Field label="Source">
          <Select
            value={code}
            onChange={(e) => {
              onCode(e.target.value);
              setAnswer(null);
            }}
          >
            {issuers.map((i) => (
              <option key={i.code} value={i.code}>
                {issuerName(i)}
                {isOnline(i) ? "" : " (not responding)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Reference number"
          hint={
            example ? (
              <span>
                Try{" "}
                <button
                  type="button"
                  onClick={() => setRef(example)}
                  className="rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2 transition-colors hover:bg-brand-soft hover:text-brand-ink"
                >
                  {example}
                </button>{" "}
                from the demo registry
              </span>
            ) : undefined
          }
        >
          <Input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={example ?? "Reference number"}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Button type="submit" magnetic className="w-full" leadingIcon={<Search />} loading={lookup.isPending} disabled={!ref.trim()}>
          Look up
        </Button>
        <div aria-live="polite" className="min-h-0">
          <AnimatePresence mode="wait" initial={false}>
            {lookup.isPending ? (
              <motion.div
                key="pending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2.5 rounded-card border border-dashed border-line-2 px-4 py-3 text-sm text-ink-3"
              >
                <BlockLoader className="text-brand-500" />
                Waiting for {issuer ? issuerName(issuer) : "the source"}
              </motion.div>
            ) : answer ? (
              <motion.div key={`${answer.code}-${answer.ref}-${answer.ms}`}>
                <Result a={answer} issuer={issuers.find((i) => i.code === answer.code)} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </form>
    </section>
  );
}
