import { BookOpen, CornerDownRight, FileText, History, ListChecks, SendHorizontal, ScanText, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../../../api";
import { fmtMs, pluralize } from "../../../lib/format";
import { workspacePath } from "../../../shell/nav";
import { Button, Callout, cn, Drawer } from "../../../ui2";
import { useWorkspace } from "../context";
import { validBox } from "../data";
import { CitationCard } from "../parts";
import { useAsk, type AskAnswer, type AskEvidence } from "./officerApi";

const SUGGESTIONS = ["Why is the fire NOC flagged?", "What is still unverified?", "Which rule needs the SSC?", "What changed after signing?"];

const KIND_ICON: Record<AskEvidence["kind"], ReactNode> = {
  finding: <ListChecks />,
  region: <ScanText />,
  document: <FileText />,
  verification: <ShieldCheck />,
  rule: <BookOpen />,
  run: <History />,
};

interface Turn {
  id: number;
  question: string;
  answer?: AskAnswer;
  error?: string;
}

function Chip({ ev, onOpen, pressed, related }: { ev: AskEvidence; onOpen: () => void; pressed?: boolean; related?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={ev.kind === "rule" ? pressed : undefined}
      title={related ? `Linked to the cited finding. ${ev.text}` : ev.text}
      className={cn(
        "inline-flex h-6 max-w-[220px] items-center gap-1 rounded-[5px] border px-1.5 align-middle text-xs font-medium transition-colors duration-150 [&_svg]:size-3 [&_svg]:shrink-0",
        related && "border-dashed",
        pressed ? "border-line-2 bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {KIND_ICON[ev.kind]}
      <span className="font-mono text-ink-3">{ev.id}</span>
      <span className="truncate">{ev.label}</span>
    </button>
  );
}

function modeLabel(a: AskAnswer): string {
  if (a.mode === "model") return `Local model ${a.model ?? ""}`.trim();
  if (a.model) return "Template answer; the model sentences failed the evidence check";
  return "Template answer; no model reachable";
}

function Answer({ a, onLeave }: { a: AskAnswer; onLeave: () => void }) {
  const { app, openDoc } = useWorkspace();
  const navigate = useNavigate();
  const [rule, setRule] = useState<string | null>(null);

  const open = (ev: AskEvidence) => {
    const t = ev.target;
    if (t.type === "rule") {
      setRule((r) => (r === ev.id ? null : ev.id));
      return;
    }
    onLeave();
    if (t.type === "finding") navigate(workspacePath(app.id, "findings", { finding: t.finding_id }));
    else if (t.type === "region" && validBox(t.bbox)) openDoc({ docId: t.document_id, page: t.page, bbox: t.bbox, label: t.label });
    else if (t.type === "region" || t.type === "document") openDoc({ docId: t.document_id });
    else if (t.type === "verification") navigate(workspacePath(app.id, "documents", { view: "verification", attempt: t.attempt_id }));
    else if (t.type === "run") navigate(workspacePath(app.id, "activity", { view: "runs" }));
  };
  const ruleEv = rule ? a.evidence[rule] : null;

  return (
    <div className="space-y-3">
      {a.sentences.length === 0 ? (
        <p className="text-sm text-ink-3">No sentence passed the evidence check, so nothing is shown. Rephrase the question or open Findings.</p>
      ) : (
        <ol className="space-y-2">
          {a.sentences.map((s, i) => (
            <li key={i} className="text-base text-ink text-pretty">
              {s.text}{" "}
              <span className="inline-flex flex-wrap gap-1 align-middle">
                {s.cites.map((c) => a.evidence[c] && <Chip key={c} ev={a.evidence[c]} pressed={rule === c} onOpen={() => open(a.evidence[c])} />)}
                {(s.related ?? []).map(
                  (c) => a.evidence[c] && <Chip key={`r-${c}`} related ev={a.evidence[c]} pressed={rule === c} onOpen={() => open(a.evidence[c])} />,
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {ruleEv && ruleEv.target.type === "rule" && (
        <CitationCard
          ruleId={ruleEv.target.rule_id}
          citation={{
            doc: ruleEv.target.doc ?? undefined,
            doc_title: ruleEv.target.doc_title,
            section: ruleEv.target.section ?? undefined,
            page: ruleEv.target.page ?? undefined,
            quote: ruleEv.target.quote ?? undefined,
          }}
        />
      )}
      <p className="text-xs text-ink-3" title={a.mode === "model" ? (a.provider ?? undefined) : (a.fallback ?? undefined)}>
        {modeLabel(a)}, {fmtMs(a.latency_ms)}, {pluralize(a.sentences.length, "sentence")} shown
      </p>
      {a.dropped_count > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer rounded text-ink-2 hover:text-ink">{pluralize(a.dropped_count, "sentence")} dropped by the evidence check</summary>
          <ul className="mt-2 space-y-2 border-l-2 border-line-2 pl-3">
            {a.dropped.map((d, i) => (
              <li key={i}>
                <span className="block text-ink-3">{d.text || "(empty)"}</span>
                <span className="block font-medium text-ink-2">{d.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Ask why: questions about this application, answered only from cited evidence of the latest run. */
export function AskPanel({ open, onClose, prefill }: { open: boolean; onClose: () => void; prefill?: { question: string; key: number } }) {
  const { app } = useWorkspace();
  const ask = useAsk(app.id);
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTurns([]);
  }, [app.id]);

  const prefillKey = prefill?.key;
  useEffect(() => {
    if (!prefill) return;
    setQ(prefill.question);
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    // react only to a new prefill
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  const submit = (question: string) => {
    const text = question.trim();
    if (text.length < 3 || ask.isPending) return;
    const id = Date.now();
    setTurns((t) => [...t, { id, question: text }]);
    setQ("");
    ask.mutate(text, {
      onSuccess: (a) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, answer: a } : x))),
      onError: (e) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: errorMessage(e) } : x))),
    });
  };

  const newest = turns[turns.length - 1];
  const announce = newest?.answer
    ? `Answer: ${newest.answer.sentences.map((s) => s.text).join(" ") || "no sentence passed the evidence check."}`
    : newest?.error
      ? `The question was not answered: ${newest.error}`
      : "";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={440}
      title="Ask why"
      description={<span className="text-xs">Answers cite the latest run only. Model output, evidence class E7.</span>}
      footer={
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(q);
          }}
        >
          <label htmlFor="ask-why-input" className="sr-only">
            Question about this application
          </label>
          <input
            id="ask-why-input"
            ref={input}
            data-autofocus
            value={q}
            maxLength={300}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask about a finding or a document"
            className="h-8 min-w-0 flex-1 rounded-control border border-line-2 bg-surface px-3 text-sm text-ink shadow-xs outline-none placeholder:text-ink-4 hover:border-ink-4 focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-0"
          />
          <Button type="submit" variant="secondary" leadingIcon={<SendHorizontal />} disabled={q.trim().length < 3} loading={ask.isPending}>
            Ask
          </Button>
        </form>
      }
    >
      <div className="space-y-6 px-5 py-5">
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        <p className="text-sm text-ink-3 text-pretty">
          Explains existing findings and decides nothing. Answers use Pramana's findings, verification results, rule clauses and run facts, never document text. A
          sentence without evidence is dropped and counted.
        </p>
        {turns.length === 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Suggested questions</h3>
            <div className="flex flex-col items-start gap-1">
              {SUGGESTIONS.map((s) => (
                <Button key={s} size="sm" variant="ghost" leadingIcon={<CornerDownRight />} onClick={() => submit(s)} className="-ml-2.5 text-ink-2">
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t) => (
          <section key={t.id} className="space-y-2 border-t border-line pt-4 first:border-t-0 first:pt-0">
            <p className="text-sm text-ink-3">{t.question}</p>
            {t.answer ? (
              <Answer a={t.answer} onLeave={onClose} />
            ) : t.error ? (
              <Callout tone="danger" title="Not answered">
                {t.error}
              </Callout>
            ) : (
              <p role="status" className="text-sm text-ink-2">
                Reading the findings and checking each sentence against its evidence.
              </p>
            )}
          </section>
        ))}
        <div ref={end} />
      </div>
    </Drawer>
  );
}
