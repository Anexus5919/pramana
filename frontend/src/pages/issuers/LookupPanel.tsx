import { useMutation } from "@tanstack/react-query";
import { CircleSlash, Loader2, Search, Unplug } from "lucide-react";
import { useState, type FormEvent, type Ref } from "react";
import { ApiError, api } from "../../api";
import { humanize } from "../../lib/labels";
import type { SimIssuer, SimLookup } from "../../types";
import {
  Button,
  Callout,
  DescriptionList,
  ErrorState,
  Field,
  Input,
  Panel,
  PanelDivider,
  Select,
  SimulatedTag,
  StatusBadge,
  cn,
} from "../../ui2";
import { EXAMPLES, isOnline, issuerName } from "./issuer";

interface Answer {
  code: string;
  ref: string;
  ms: number;
  data?: SimLookup;
  error?: unknown;
}

function Titled({ children }: { children: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {children}
      <SimulatedTag />
    </span>
  );
}

function Result({ a, issuer }: { a: Answer; issuer: SimIssuer | undefined }) {
  const timing = (
    <p className="mt-2 text-xs text-ink-3">
      Answered in {Math.round(a.ms)} ms{issuer?.latency_ms !== undefined ? `, simulated latency ${issuer.latency_ms} ms` : ""}
    </p>
  );
  if (a.error instanceof ApiError && a.error.status === 503) {
    return (
      <Callout tone="neutral" icon={<Unplug />} title={<Titled>Source unavailable</Titled>}>
        <p>{a.error.message.replace(/\s*\(SIMULATED\)/i, "")}.</p>
        <p className="mt-1">
          A validation run in this state records source unavailable and routes the document for manual confirmation. Nothing is marked
          verified or mismatched on a missing answer.
        </p>
        {timing}
      </Callout>
    );
  }
  if (a.error) return <ErrorState compact error={a.error} title="The lookup did not complete" />;
  const d = a.data;
  if (!d) return null;
  if (!d.found || !d.record) {
    return (
      <Callout tone="warning" icon={<CircleSlash />} title={<Titled>Not found in the issuer registry</Titled>}>
        <p>
          The registry has no record for <span className="font-mono text-ink">{a.ref}</span>. Check the reference for a typing slip
          before treating this as an indicator.
        </p>
        {timing}
      </Callout>
    );
  }
  const rec = d.record as { ref_no?: string; status?: string; fields?: Record<string, unknown> };
  const fields = Object.entries(rec.fields ?? {});
  const compared = new Set(issuer?.compare_fields ?? []);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusBadge tone="verified">Record found</StatusBadge>
        <SimulatedTag />
      </div>
      <DescriptionList
        labelWidth={112}
        items={[
          { label: "Reference", value: rec.ref_no ?? a.ref, mono: true },
          { label: "Status", value: rec.status ? humanize(rec.status) : null },
          ...fields.map(([k, v]) => ({
            label: humanize(k),
            value: <span className="font-mono">{String(v)}</span>,
            hint: compared.has(k) ? "Compared with the document" : undefined,
          })),
        ]}
      />
      {fields.length === 0 && (
        <p className="mt-3 text-sm text-ink-2 text-pretty">
          This source confirms existence only, by letter. In a validation run the document waits as verification pending until the
          confirmation is recorded.
        </p>
      )}
      {timing}
    </div>
  );
}

export interface LookupPanelProps {
  issuers: SimIssuer[];
  code: string;
  onCode: (code: string) => void;
  reference: string;
  onReference: (ref: string) => void;
  selectRef?: Ref<HTMLSelectElement>;
  className?: string;
}

/** The simulated issuer's own lookup page, as a verifier would use it by hand. */
export function LookupPanel({ issuers, code, onCode, reference, onReference, selectRef, className }: LookupPanelProps) {
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
    onMutate: () => setAnswer(null),
    onSuccess: (a) => setAnswer(a),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const r = reference.trim();
    if (!r || !code) return;
    lookup.mutate({ c: code, r });
  }

  const shown = answer && answer.code === code ? answer : null;

  return (
    <Panel
      title="Look up a record"
      description="Ask a simulated registry for its record, as a verifier would on the issuer's own portal."
      className={cn("min-w-0", className)}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Issuer">
          <Select ref={selectRef} value={code} onChange={(e) => onCode(e.target.value)}>
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
                  onClick={() => onReference(example)}
                  className="rounded bg-surface-2 px-1 font-mono text-xs text-ink-2 transition-colors duration-150 hover:bg-surface-3 hover:text-ink"
                >
                  {example}
                </button>{" "}
                from the demo registry
              </span>
            ) : undefined
          }
        >
          <Input
            value={reference}
            onChange={(e) => onReference(e.target.value)}
            placeholder={example ?? "Reference number"}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Button type="submit" leadingIcon={<Search />} loading={lookup.isPending} disabled={!reference.trim()}>
          Look up
        </Button>
      </form>
      <div aria-live="polite">
        {lookup.isPending ? (
          <>
            <PanelDivider label="Result" />
            <p className="inline-flex items-center gap-2 text-sm text-ink-3">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Waiting for {issuer ? issuerName(issuer) : "the issuer"}
            </p>
          </>
        ) : shown ? (
          <>
            <PanelDivider label="Result" />
            <Result a={shown} issuer={issuers.find((i) => i.code === shown.code)} />
          </>
        ) : null}
      </div>
    </Panel>
  );
}
