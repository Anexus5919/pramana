import { BookOpen, ChevronDown, FileText, History, ListChecks, MessageCircleQuestion, SendHorizontal, ShieldCheck, SquareDashed, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../../../api";
import { fmtMs, pluralize } from "../../../lib/format";
import { Tag } from "../../../ui/Badge";
import { EvidenceClassChip } from "../../../ui/Blocks";
import { BlockLoader, IconButton } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { dur, ease, fadeUp, spring, stagger } from "../../../ui/motion";
import { useWorkspace } from "../context";
import { appPath, validBox } from "../data";
import { CitationCard } from "../parts";
import { useAsk, type AskAnswer, type AskEvidence } from "./officerApi";

const SUGGESTIONS = ["Why is the fire NOC flagged?", "What is still unverified?", "Which rule needs the SSC?", "What changed after signing?"];

const KIND_ICON: Record<AskEvidence["kind"], ReactNode> = {
  finding: <ListChecks />,
  region: <SquareDashed />,
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

function Elapsed() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const t = window.setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => window.clearInterval(t);
  }, []);
  return <span className="font-mono text-xs text-ink-3 tabular">{s} s</span>;
}

function Chip({ ev, onOpen, pressed, related }: { ev: AskEvidence; onOpen: () => void; pressed?: boolean; related?: boolean }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onOpen}
      aria-pressed={ev.kind === "rule" ? pressed : undefined}
      title={related ? `Linked to the cited finding. ${ev.text}` : ev.text}
      className={cn(
        "inline-flex h-6 max-w-[220px] items-center gap-1 rounded-[6px] border px-1.5 align-middle text-[11.5px] font-medium transition-colors duration-200 [&_svg]:size-3 [&_svg]:shrink-0",
        related && "border-dashed",
        pressed ? "border-brand-400 bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-2 hover:border-brand-300 hover:bg-brand-soft hover:text-brand-ink",
      )}
    >
      {KIND_ICON[ev.kind]}
      <span className="font-mono text-[10.5px] text-ink-3">{ev.id}</span>
      <span className="truncate">{ev.label}</span>
    </motion.button>
  );
}

function Answer({ a, fresh }: { a: AskAnswer; fresh: boolean }) {
  const { app, openDoc } = useWorkspace();
  const navigate = useNavigate();
  const [rule, setRule] = useState<string | null>(null);
  const [showDropped, setShowDropped] = useState(false);

  const open = (ev: AskEvidence) => {
    const t = ev.target;
    if (t.type === "finding") navigate(appPath(app.id, "findings", { finding: t.finding_id }));
    else if (t.type === "region" && validBox(t.bbox)) openDoc({ docId: t.document_id, page: t.page, bbox: t.bbox, label: t.label });
    else if (t.type === "document") openDoc({ docId: t.document_id });
    else if (t.type === "verification") navigate(appPath(app.id, "verification", { attempt: t.attempt_id }));
    else if (t.type === "run") navigate(appPath(app.id, "runs"));
    else if (t.type === "rule") setRule((r) => (r === ev.id ? null : ev.id));
  };
  const ruleEv = rule ? a.evidence[rule] : null;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {a.mode === "model" ? (
          <Tag variant="neutral" title={a.provider ?? undefined}>
            {a.external ? "External model" : "Local model"} {a.model}
          </Tag>
        ) : (
          <Tag variant="neutral">Template answer, no model reachable</Tag>
        )}
        <span className="text-[11px] text-ink-4">{fmtMs(a.latency_ms)}</span>
      </div>
      {a.sentences.length === 0 ? (
        <p className="text-sm text-ink-3">No sentence passed the evidence check, so nothing is shown. Rephrase the question or open the Findings tab.</p>
      ) : (
        <motion.ol variants={stagger(0.08)} initial={fresh ? "hidden" : false} animate="show" className="space-y-2">
          {a.sentences.map((s, i) => (
            <motion.li key={i} variants={fadeUp} className="text-[14px] leading-relaxed text-ink text-pretty">
              {s.text}{" "}
              <span className="inline-flex flex-wrap gap-1 align-middle">
                {s.cites.map((c) => a.evidence[c] && <Chip key={c} ev={a.evidence[c]} pressed={rule === c} onOpen={() => open(a.evidence[c])} />)}
                {(s.related ?? []).map((c) => a.evidence[c] && <Chip key={c} related ev={a.evidence[c]} pressed={rule === c} onOpen={() => open(a.evidence[c])} />)}
              </span>
            </motion.li>
          ))}
        </motion.ol>
      )}
      <AnimatePresence initial={false}>
        {ruleEv && ruleEv.target.type === "rule" && (
          <motion.div key={ruleEv.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: dur.ui, ease: ease.out }} className="overflow-hidden">
            <CitationCard
              ruleId={ruleEv.target.rule_id}
              citation={{ doc: ruleEv.target.doc ?? undefined, doc_title: ruleEv.target.doc_title, section: ruleEv.target.section ?? undefined, page: ruleEv.target.page ?? undefined, quote: ruleEv.target.quote ?? undefined }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="text-xs text-ink-3">
        {pluralize(a.sentences.length, "sentence")} shown,{" "}
        {a.dropped_count > 0 ? (
          <button type="button" onClick={() => setShowDropped((v) => !v)} aria-expanded={showDropped} className="inline-flex items-center gap-0.5 font-medium text-brand-ink hover:underline">
            {a.dropped_count} dropped by the evidence check
            <ChevronDown aria-hidden className={cn("size-3 transition-transform duration-200", showDropped && "rotate-180")} />
          </button>
        ) : (
          "0 dropped by the evidence check"
        )}
      </div>
      <AnimatePresence initial={false}>
        {showDropped && (
          <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: dur.ui, ease: ease.out }} className="space-y-1.5 overflow-hidden">
            {a.dropped.map((d, i) => (
              <li key={i} className="rounded-[8px] bg-surface-2 px-2.5 py-1.5 text-xs">
                <span className="text-ink-3 line-through decoration-ink-4">{d.text || "(empty)"}</span>
                <span className="mt-0.5 block font-medium text-mismatch-fg">{d.reason}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Docked, non-modal panel: chips open findings and page regions in the workspace while the panel stays open. */
export function AskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { app } = useWorkspace();
  const ask = useAsk(app.id);
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const seen = useRef<Set<number>>(new Set());
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    setTurns([]);
    seen.current = new Set();
  }, [app.id]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  }, [open]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
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

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.aside
          ref={panel}
          key="ask"
          role="complementary"
          aria-label="Ask why"
          initial={{ x: "100%" }}
          animate={{ x: 0, transition: spring.soft }}
          exit={{ x: "100%", transition: { duration: dur.panel, ease: ease.inOut } }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          className="fixed top-16 right-0 bottom-0 z-[60] flex w-[min(440px,100vw)] flex-col border-l border-line bg-surface shadow-lg"
        >
          <header className="border-b border-line px-4 pt-3.5 pb-3">
            <div className="flex items-start gap-2">
              <MessageCircleQuestion aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-500" />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-md font-semibold tracking-title text-ink">Ask why</h2>
                <p className="text-xs text-ink-3">{app.id}, latest run only</p>
              </div>
              <IconButton size="sm" label="Close Ask why" icon={<X />} onClick={onClose} />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-surface-2/60 px-2.5 py-2">
              <EvidenceClassChip cls="model" />
              <span className="text-xs font-medium text-ink-2">Explains existing findings, decides nothing.</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-4">
              Answers use only Pramana's findings, verification results, rule clauses and run facts, never document text. Each sentence must cite evidence; sentences that do not hold up are dropped and counted. Dashed chips link a cited finding to its rule and page region.
            </p>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite">
            {turns.length === 0 && (
              <div className="space-y-2">
                <p className="eyebrow">Try</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <motion.button
                      key={s}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => submit(s)}
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-xs font-medium text-ink-2 transition-colors hover:border-brand-300 hover:bg-brand-soft hover:text-brand-ink"
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t) => {
              const fresh = !seen.current.has(t.id) && !!t.answer;
              if (t.answer) seen.current.add(t.id);
              return (
                <motion.section key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.panel, ease: ease.out }} className="space-y-2.5">
                  <p className="ml-auto w-fit max-w-[90%] rounded-[12px] rounded-br-[4px] bg-brand-soft px-3 py-2 text-sm font-medium text-brand-ink">{t.question}</p>
                  {t.answer ? (
                    <Answer a={t.answer} fresh={fresh} />
                  ) : t.error ? (
                    <p className="rounded-[8px] bg-mismatch-bg px-3 py-2 text-sm text-mismatch-fg" role="alert">
                      {t.error}
                    </p>
                  ) : (
                    <div role="status" className="flex items-center gap-2.5 rounded-[10px] bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
                      <BlockLoader className="text-brand-500" />
                      <span className="flex-1">Reading the findings and checking each sentence against its evidence</span>
                      <Elapsed />
                    </div>
                  )}
                </motion.section>
              );
            })}
            <div ref={end} />
          </div>

          <form
            className="border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit(q);
            }}
          >
            <label htmlFor="ask-why-input" className="sr-only">
              Question about this application
            </label>
            <div className="flex items-center gap-2">
              <input
                id="ask-why-input"
                ref={input}
                value={q}
                maxLength={300}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Why is the fire NOC flagged?"
                className="h-10 min-w-0 flex-1 rounded-control border border-line-2 bg-surface px-3 text-[14px] text-ink shadow-xs outline-none placeholder:text-ink-4 focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-400/20"
              />
              <IconButton type="submit" variant="primary" label="Ask" icon={<SendHorizontal />} disabled={q.trim().length < 3 || ask.isPending} loading={ask.isPending} />
            </div>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}
