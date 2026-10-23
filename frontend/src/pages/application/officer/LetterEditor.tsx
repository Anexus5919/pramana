import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookOpen, Check, Download, FileSignature, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, qk } from "../../../api";
import { fmtDateTime, pluralize } from "../../../lib/format";
import type { Rule } from "../../../types";
import { Tag } from "../../../ui/Badge";
import { BlockLoader, Button, IconButton, buttonClasses } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { Dialog } from "../../../ui/Dialog";
import { Digest } from "../../../ui/Digest";
import { Field, Input, Select, Textarea } from "../../../ui/Field";
import { dur, ease, fadeUp, spring, stagger } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { ErrorState } from "../../../ui/States";
import { useToast } from "../../../ui/Toast";
import { useInvalidateApp } from "../data";
import { officerApi, useInvalidateLetters, type Letter, type LetterItem, type LetterItemInput } from "./officerApi";

interface DraftItem extends LetterItemInput {
  key: string;
  codes: string[];
}

const MIN_REASON = 8;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toDraft(it: LetterItem): DraftItem {
  return {
    key: it.finding_ids.join("|"),
    codes: it.codes,
    finding_ids: it.finding_ids,
    title: it.title,
    description: it.description,
    required: it.required,
    rule_id: it.citation?.rule_id ?? null,
    respond_by: it.respond_by,
  };
}

function itemErrors(it: DraftItem): Partial<Record<"title" | "description" | "required" | "respond_by", string>> {
  const e: Partial<Record<"title" | "description" | "required" | "respond_by", string>> = {};
  if (it.title.trim().length < 3) e.title = "Give the item a title.";
  if (it.description.trim().length < 3) e.description = "Describe what needs to be corrected.";
  if (it.required.trim().length < 3) e.required = "Say what the institution must submit.";
  if (!it.respond_by || it.respond_by < today()) e.respond_by = "Choose a date from today onwards.";
  return e;
}

/** The clause exactly as the ruleset quotes it; the editor can change which rule is cited, never its text. */
function ClauseQuote({ rule }: { rule: Rule | undefined }) {
  if (!rule?.source?.quote)
    return <p className="rounded-[10px] border border-dashed border-line-2 px-3 py-2 text-xs text-ink-3">No handbook clause is cited for this item.</p>;
  const where = [rule.source.section, rule.source.page ? `page ${rule.source.page}` : null].filter(Boolean).join(", ");
  return (
    <motion.figure
      key={rule.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.ui, ease: ease.out }}
      className="relative overflow-hidden rounded-[10px] border border-line bg-surface-2/60 py-2.5 pr-3 pl-4"
    >
      <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-ev-4" />
      <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
        <BookOpen aria-hidden className="size-3 text-ev-4" />
        <span className="font-semibold text-ink-2">APH 2024-27</span>
        {where && <span>{where}</span>}
        <span className="text-ink-4">quoted verbatim, not editable</span>
      </figcaption>
      <blockquote className="mt-1 text-[13px] leading-relaxed text-ink text-pretty">"{rule.source.quote}"</blockquote>
    </motion.figure>
  );
}

function ItemCard({
  item,
  index,
  total,
  rules,
  touched,
  onChange,
  onMove,
  onRemove,
}: {
  item: DraftItem;
  index: number;
  total: number;
  rules: Rule[];
  touched: boolean;
  onChange: (patch: Partial<DraftItem>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const err = touched ? itemErrors(item) : {};
  const rule = rules.find((r) => r.id === item.rule_id);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: dur.ui, ease: ease.inOut } }}
      transition={{ layout: spring.snappy, duration: dur.panel, ease: ease.out }}
      className="overflow-hidden rounded-card border border-line bg-surface shadow-xs"
      aria-label={`Item ${index + 1}: ${item.title}`}
    >
      <div className="flex items-center gap-2 border-b border-line bg-surface-2/50 px-3 py-2">
        <motion.span
          layout="position"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-brand-500 font-mono text-xs font-semibold text-white shadow-[inset_0_2px_0_rgb(255_255_255/0.3)]"
        >
          {index + 1}
        </motion.span>
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {item.codes.map((c) => (
            <Tag key={c} variant="mono" className="max-w-full truncate">
              {c}
            </Tag>
          ))}
        </span>
        <IconButton size="sm" variant="ghost" label={`Move item ${index + 1} up`} icon={<ArrowUp />} disabled={index === 0} onClick={() => onMove(-1)} />
        <IconButton size="sm" variant="ghost" label={`Move item ${index + 1} down`} icon={<ArrowDown />} disabled={index === total - 1} onClick={() => onMove(1)} />
        <IconButton size="sm" variant="ghost" label={`Remove item ${index + 1}`} icon={<Trash2 />} disabled={total === 1} onClick={onRemove} />
      </div>
      <div className="space-y-3 p-3.5">
        <Field label="Title" error={err.title}>
          <Input value={item.title} maxLength={300} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field label="What needs to be corrected" hint="Plain language for the institution. Detector internals stay out of the letter." error={err.description}>
          <Textarea rows={3} maxLength={2000} value={item.description} onChange={(e) => onChange({ description: e.target.value })} />
        </Field>
        <div className="space-y-2">
          <Field label="Handbook clause cited">
            <Select value={item.rule_id ?? ""} onChange={(e) => onChange({ rule_id: e.target.value || null })}>
              <option value="">No clause cited</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id}: {r.title}
                </option>
              ))}
            </Select>
          </Field>
          <AnimatePresence mode="wait" initial={false}>
            <ClauseQuote key={rule?.id ?? "none"} rule={rule} />
          </AnimatePresence>
        </div>
        <Field label="What to submit" error={err.required}>
          <Textarea rows={2} maxLength={1200} value={item.required} onChange={(e) => onChange({ required: e.target.value })} />
        </Field>
        <Field label="Respond by" error={err.respond_by} className="max-w-[220px]">
          <Input type="date" min={today()} value={item.respond_by} onChange={(e) => onChange({ respond_by: e.target.value })} />
        </Field>
      </div>
    </motion.li>
  );
}

function Preview({ letter, saving }: { letter: Letter | null; saving: boolean }) {
  const pages = letter?.page_count ?? 0;
  const version = (letter?.status === "final" ? letter.finalised_at : letter?.updated_at) ?? "0";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">PDF preview</span>
        <AnimatePresence initial={false}>
          {saving && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5 text-xs text-ink-3" role="status">
              <BlockLoader className="text-brand-500" /> Updating
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {!letter ? (
        <Skeleton className="aspect-[1/1.414] w-full" rounded="md" />
      ) : (
        Array.from({ length: pages }, (_, i) => (
          <motion.img
            key={`${version}-${i}`}
            src={officerApi.letterPageUrl(letter.id, i + 1, version)}
            alt={`Page ${i + 1} of ${pages} of the ${letter.status === "final" ? "final" : "draft"} deficiency notice`}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: saving ? 0.55 : 1 }}
            transition={{ duration: dur.ui }}
            className="w-full rounded-[8px] border border-line bg-white shadow-sm"
          />
        ))
      )}
      {letter && (
        <a href={officerApi.letterPdfUrl(letter.id)} download className={buttonClasses("ghost", "sm", "w-full border border-line")}>
          <Download aria-hidden /> {letter.status === "final" ? "Download final PDF" : "Download draft PDF"}
        </a>
      )}
    </div>
  );
}

function SentView({ letter, round }: { letter: Letter; round: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid gap-6 py-2 md:grid-cols-[minmax(0,1fr)_280px]">
      <div>
        <motion.div variants={fadeUp} className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-[12px] bg-verified-bg text-verified-fg">
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
              <motion.path
                d="M5 12.5l4.2 4.2L19 7"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: dur.panel, ease: ease.out, delay: 0.1 }}
              />
            </svg>
          </span>
          <div>
            <h3 className="font-display text-lg font-semibold tracking-title text-ink">Deficiency notice sent</h3>
            <p className="text-sm text-ink-3">
              {pluralize(letter.items.length, "item")} attached to the rectification request. The application is now in round {round}.
            </p>
          </div>
        </motion.div>
        <motion.dl variants={fadeUp} className="mt-5 space-y-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-ink-3">PDF SHA-256, recorded in the audit chain</dt>
            <dd>
              <Digest value={letter.final_sha256} label="Letter SHA-256" head={12} tail={8} />
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-ink-3">Finalised</dt>
            <dd className="text-ink">{fmtDateTime(letter.finalised_at)}</dd>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <dt className="text-ink-3">Reason recorded</dt>
            <dd className="max-w-[60%] text-right text-ink-2">"{letter.final_reason}"</dd>
          </div>
        </motion.dl>
        <motion.p variants={fadeUp} className="mt-4 rounded-control bg-surface-2 px-3 py-2 text-xs text-ink-3">
          The institution sees this notice and can download it on its application page under "What AICTE asked you to fix".
        </motion.p>
      </div>
      <motion.div variants={fadeUp}>
        <Preview letter={letter} saving={false} />
      </motion.div>
    </motion.div>
  );
}

export function LetterEditor({
  appId,
  open,
  findingIds,
  resumeId,
  onClose,
}: {
  appId: string;
  open: boolean;
  findingIds?: string[];
  resumeId?: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const invalidateApp = useInvalidateApp(appId);
  const invalidateLetters = useInvalidateLetters(appId);
  const rulesQ = useQuery({ queryKey: qk.ruleset, queryFn: api.activeRuleset, staleTime: 5 * 60_000, enabled: open });
  const rules = useMemo(() => [...(rulesQ.data?.rules ?? [])].sort((a, b) => a.id.localeCompare(b.id)), [rulesQ.data]);

  const [letter, setLetter] = useState<Letter | null>(null);
  const [subject, setSubject] = useState("");
  const [intro, setIntro] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState<"edit" | "confirm" | "sent">("edit");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [sentRound, setSentRound] = useState(0);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (stage === "confirm") requestAnimationFrame(() => reasonRef.current?.focus());
  }, [stage]);

  const load = (l: Letter) => {
    setLetter(l);
    setSubject(l.subject);
    setIntro(l.intro);
    setItems(l.items.map(toDraft));
    setDirty(false);
  };

  const start = useMutation({
    mutationFn: () => (resumeId ? officerApi.letter(resumeId) : officerApi.draftLetter(appId, findingIds)),
    onSuccess: (l) => {
      load(l);
      invalidateLetters();
    },
  });
  const save = useMutation({
    mutationFn: () =>
      officerApi.updateLetter(letter!.id, {
        subject: subject.trim(),
        intro: intro.trim(),
        items: items.map(({ key: _k, codes: _c, ...rest }) => ({ ...rest, title: rest.title.trim(), description: rest.description.trim(), required: rest.required.trim() })),
      }),
    onSuccess: (l) => load(l),
  });
  const finalise = useMutation({
    mutationFn: () => officerApi.finaliseLetter(letter!.id, reason.trim(), message.trim() || null),
    onSuccess: (r) => {
      setLetter(r.letter);
      setSentRound(r.round);
      setStage("sent");
      invalidateApp();
      invalidateLetters();
      toast.success("Deficiency notice sent", `Its SHA-256 is in the audit chain. ${pluralize(r.letter.items.length, "item")} sent with the rectification request.`);
    },
  });

  useEffect(() => {
    if (!open) return;
    setLetter(null);
    setItems([]);
    setStage("edit");
    setTouched(false);
    setReason("");
    setMessage("");
    save.reset();
    finalise.reset();
    start.mutate();
    // start a draft each time the dialog opens
  }, [open]);

  const invalid = items.some((it) => Object.keys(itemErrors(it)).length > 0) || subject.trim().length < 3;
  const edit = (i: number, patch: Partial<DraftItem>) => {
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };
  const move = (i: number, dir: -1 | 1) => {
    setItems((xs) => {
      const n = [...xs];
      const [x] = n.splice(i, 1);
      n.splice(i + dir, 0, x);
      return n;
    });
    setDirty(true);
  };
  const remove = (i: number) => {
    setItems((xs) => xs.filter((_, j) => j !== i));
    setDirty(true);
  };
  const onSave = () => {
    setTouched(true);
    if (!invalid) save.mutate();
  };
  const onFinalise = async () => {
    setTouched(true);
    if (invalid) return;
    if (stage === "edit") {
      if (dirty) {
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
      }
      setStage("confirm");
      return;
    }
    if (reason.trim().length < MIN_REASON) return;
    finalise.mutate();
  };

  const busy = save.isPending || finalise.isPending;
  const shortReason = touched && stage === "confirm" && reason.trim().length < MIN_REASON;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={stage === "sent" ? "Deficiency notice" : "Draft deficiency notice"}
      description={
        stage === "sent"
          ? "Final and sent. The PDF can no longer be edited."
          : "Each item cites its handbook clause verbatim. Reorder, remove or reword items, then finalise with a reason. The PDF carries a DRAFT watermark until then."
      }
      footer={
        stage === "sent" ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <span className="mr-auto text-xs text-ink-3" aria-live="polite">
              {letter && (dirty ? "Unsaved changes" : `Draft saved${letter.updated_at ? `, ${fmtDateTime(letter.updated_at)}` : ""}`)}
            </span>
            {stage === "confirm" ? (
              <Button variant="ghost" onClick={() => setStage("edit")} disabled={busy}>
                Back to editing
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button variant="secondary" onClick={onSave} disabled={!letter || !dirty || busy} loading={save.isPending}>
                  Save draft
                </Button>
              </>
            )}
            <Button leadingIcon={<FileSignature />} onClick={() => void onFinalise()} disabled={!letter || busy || start.isPending} loading={finalise.isPending}>
              {stage === "confirm" ? "Finalise and send" : "Finalise"}
            </Button>
          </>
        )
      }
    >
      {start.error ? (
        <ErrorState error={start.error} title="The draft could not be prepared" onRetry={() => start.mutate()} retrying={start.isPending} />
      ) : stage === "sent" && letter ? (
        <SentView letter={letter} round={sentRound} />
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            {(save.error || finalise.error) && (
              <ErrorState compact error={save.error ?? finalise.error} title={finalise.error ? "The notice was not sent" : "The draft was not saved"} />
            )}
            <AnimatePresence initial={false}>
              {stage === "confirm" && (
                <motion.section
                  key="confirm"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: dur.panel, ease: ease.out }}
                  className="overflow-hidden"
                  aria-label="Finalise the notice"
                >
                  <div className="space-y-3 rounded-card border border-brand-200 bg-brand-soft/60 p-4">
                    <p className="text-sm text-ink-2">
                      Finalising removes the DRAFT watermark, stores the PDF, records its SHA-256 in the audit chain and sends it with a rectification request
                      for {pluralize(items.reduce((n, it) => n + it.finding_ids.length, 0), "finding")}. The institution can then download it.
                    </p>
                    <Field label="Reason for sending this notice" hint={`At least ${MIN_REASON} characters. Kept in the audit chain, not printed on the letter.`} error={shortReason ? `Give a reason of at least ${MIN_REASON} characters.` : undefined}>
                      <Textarea ref={reasonRef} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Fire certificate expired before submission; renewal needed." />
                    </Field>
                    <Field label="Message shown with the request" hint="Optional. The letter subject is used when this is empty.">
                      <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
                    </Field>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
            {start.isPending || !letter ? (
              <div className="space-y-3" role="status">
                <span className="sr-only">Drafting the notice from the selected findings</span>
                <Skeleton className="h-10" />
                <Skeleton className="h-20" />
                <Skeleton className="h-64" rounded="lg" />
              </div>
            ) : (
              <fieldset disabled={stage === "confirm" || busy} className={cn("min-w-0 space-y-4 transition-opacity", stage === "confirm" && "opacity-60")}>
                <Field label="Subject" error={touched && subject.trim().length < 3 ? "Give the notice a subject." : undefined}>
                  <Input value={subject} maxLength={300} onChange={(e) => (setSubject(e.target.value), setDirty(true))} />
                </Field>
                <Field label="Opening paragraph">
                  <Textarea rows={3} maxLength={3000} value={intro} onChange={(e) => (setIntro(e.target.value), setDirty(true))} />
                </Field>
                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-sm font-medium text-ink-2">Items</span>
                    <span className="text-xs text-ink-3">{pluralize(items.length, "item")}, numbered in this order</span>
                  </div>
                  <ol className="space-y-3">
                    <AnimatePresence initial={false}>
                      {items.map((it, i) => (
                        <ItemCard
                          key={it.key}
                          item={it}
                          index={i}
                          total={items.length}
                          rules={rules}
                          touched={touched}
                          onChange={(p) => edit(i, p)}
                          onMove={(d) => move(i, d)}
                          onRemove={() => remove(i)}
                        />
                      ))}
                    </AnimatePresence>
                  </ol>
                </div>
              </fieldset>
            )}
          </div>
          <aside className="min-w-0 md:sticky md:top-0 md:self-start">
            <Preview letter={letter} saving={save.isPending} />
            {letter && (
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-4">
                <Check aria-hidden className="mt-0.5 size-3 shrink-0" />
                Neutral layout without emblem or letterhead. Footer: Prepared with the Pramana prototype. Synthetic demo data.
              </p>
            )}
          </aside>
        </div>
      )}
    </Dialog>
  );
}
