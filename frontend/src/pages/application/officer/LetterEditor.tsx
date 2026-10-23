import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Download, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, qk } from "../../../api";
import { fmtDateTime, pluralize } from "../../../lib/format";
import type { Rule } from "../../../types";
import {
  Button,
  buttonStyles,
  Callout,
  cn,
  Code,
  DescriptionList,
  Digest,
  Drawer,
  ErrorState,
  EvidenceFrame,
  Field,
  IconButton,
  Input,
  MetaList,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "../../../ui2";
import { useInvalidateApp } from "../data";
import { CitationCard } from "../parts";
import { officerApi, useInvalidateLetters, type Letter, type LetterItem, type LetterItemInput } from "./officerApi";

interface DraftItem extends LetterItemInput {
  key: string;
  codes: string[];
}

const MIN_REASON = 10;

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

type ItemField = "title" | "description" | "required" | "respond_by";

function itemErrors(it: DraftItem): Partial<Record<ItemField, string>> {
  const e: Partial<Record<ItemField, string>> = {};
  if (it.title.trim().length < 3) e.title = "Give the item a title.";
  if (it.description.trim().length < 3) e.description = "Describe what needs to be corrected.";
  if (it.required.trim().length < 3) e.required = "Say what the institution must submit.";
  if (!it.respond_by || it.respond_by < today()) e.respond_by = "Choose a date from today onwards.";
  return e;
}

function ItemRow({
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
  const n = index + 1;
  return (
    <li className="space-y-3 py-5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-ink">Item {n}</h3>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-3">
          <MetaList items={item.codes.map((c) => <Code key={c} className="text-xs">{c}</Code>)} />
        </span>
        <IconButton size="sm" label={`Move item ${n} up`} icon={<ArrowUp />} disabled={index === 0} onClick={() => onMove(-1)} />
        <IconButton size="sm" label={`Move item ${n} down`} icon={<ArrowDown />} disabled={index === total - 1} onClick={() => onMove(1)} />
        <IconButton size="sm" label={`Remove item ${n}`} icon={<Trash2 />} disabled={total === 1} onClick={onRemove} />
      </div>
      <Field label="Title" error={err.title}>
        <Input value={item.title} maxLength={300} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label="What needs to be corrected" hint="Plain language for the institution. Detector internals stay out of the letter." error={err.description}>
        <Textarea rows={3} maxLength={2000} value={item.description} onChange={(e) => onChange({ description: e.target.value })} />
      </Field>
      <Field label="Handbook clause cited" hint="The clause is quoted exactly as the ruleset records it; only the choice of rule can change.">
        <Select value={item.rule_id ?? ""} onChange={(e) => onChange({ rule_id: e.target.value || null })}>
          <option value="">No clause cited</option>
          {rules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id}: {r.title}
            </option>
          ))}
        </Select>
      </Field>
      {rule?.source ? (
        <CitationCard citation={rule.source} ruleId={rule.id} />
      ) : (
        <p className="border-l-2 border-line-2 pl-3 text-sm text-ink-3">No handbook clause is cited for this item.</p>
      )}
      <Field label="What to submit" error={err.required}>
        <Textarea rows={2} maxLength={1200} value={item.required} onChange={(e) => onChange({ required: e.target.value })} />
      </Field>
      <Field label="Respond by" error={err.respond_by} className="max-w-[220px]">
        <Input type="date" min={today()} value={item.respond_by} onChange={(e) => onChange({ respond_by: e.target.value })} />
      </Field>
    </li>
  );
}

function Preview({ letter, saving }: { letter: Letter | null; saving: boolean }) {
  const pages = letter?.page_count ?? 0;
  const version = (letter?.status === "final" ? letter.finalised_at : letter?.updated_at) ?? "0";
  const final = letter?.status === "final";
  return (
    <div className="space-y-3">
      <EvidenceFrame
        title="PDF preview"
        meta={
          <span role="status">
            {!letter ? "Preparing" : saving ? "Updating" : `${final ? "Final" : "Draft"}, ${pluralize(pages, "page")}`}
          </span>
        }
      >
        {!letter ? (
          <Skeleton className="aspect-[1/1.414] w-full" />
        ) : (
          <div className="space-y-3">
            {Array.from({ length: pages }, (_, i) => (
              <img
                key={`${version}-${i}`}
                src={officerApi.letterPageUrl(letter.id, i + 1, version)}
                alt={`Page ${i + 1} of ${pages} of the ${final ? "final" : "draft"} deficiency letter`}
                className={cn("w-full rounded-control border border-line bg-white transition-opacity duration-150", saving && "opacity-60")}
              />
            ))}
          </div>
        )}
      </EvidenceFrame>
      {letter && (
        <a href={officerApi.letterPdfUrl(letter.id)} download className={buttonStyles("secondary", "sm", "w-full")}>
          <Download aria-hidden /> {final ? "Download PDF" : "Download draft PDF"}
        </a>
      )}
    </div>
  );
}

function SentView({ letter, round }: { letter: Letter; round: number }) {
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0 space-y-5">
        <Callout tone="success" title="Deficiency letter sent" role="status">
          {pluralize(letter.items.length, "item")} sent with the rectification request. The application is now in round {round}, and the institution can download
          the letter from its application page.
        </Callout>
        <DescriptionList
          labelWidth={148}
          items={[
            { label: "SHA-256", value: <Digest value={letter.final_sha256} label="Letter SHA-256" head={16} tail={10} />, hint: "Recorded in the audit trail" },
            { label: "Finalised", value: fmtDateTime(letter.finalised_at) },
            { label: "Reason", value: letter.final_reason },
            { label: "Round", value: String(round || letter.round) },
          ]}
        />
      </div>
      <Preview letter={letter} saving={false} />
    </div>
  );
}

/** Drafts, edits and finalises the deficiency letter that goes with a rectification request. */
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
      toast.success("Deficiency letter sent", `Its SHA-256 is in the audit trail. ${pluralize(r.letter.items.length, "item")} sent with the rectification request.`);
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
    // start a draft each time the drawer opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const findingCount = items.reduce((n, it) => n + it.finding_ids.length, 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={860}
      title={stage === "sent" ? "Deficiency letter" : "Draft deficiency letter"}
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
            <span className="mr-auto text-xs text-ink-3" role="status">
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
                <Button onClick={onSave} disabled={!letter || !dirty || busy} loading={save.isPending}>
                  Save draft
                </Button>
              </>
            )}
            <Button variant="primary" onClick={() => void onFinalise()} disabled={!letter || busy || start.isPending} loading={finalise.isPending}>
              {stage === "confirm" ? "Finalise and send" : "Finalise"}
            </Button>
          </>
        )
      }
    >
      <div className="p-5">
        {start.error ? (
          <ErrorState error={start.error} title="The draft could not be prepared" onRetry={() => start.mutate()} retrying={start.isPending} />
        ) : stage === "sent" && letter ? (
          <SentView letter={letter} round={sentRound} />
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0 space-y-5">
              {(save.error || finalise.error) && (
                <ErrorState error={save.error ?? finalise.error} title={finalise.error ? "The letter was not sent" : "The draft was not saved"} />
              )}
              {stage === "confirm" && (
                <section aria-labelledby="letter-confirm" className="space-y-3 border-b border-line pb-5">
                  <h3 id="letter-confirm" className="text-base font-semibold text-ink">
                    Finalise and send
                  </h3>
                  <p className="text-sm text-ink-2 text-pretty">
                    Finalising removes the DRAFT watermark, stores the PDF, records its SHA-256 in the audit trail and sends it with a rectification request for{" "}
                    {pluralize(findingCount, "finding")}. The institution can then download it.
                  </p>
                  <Field
                    label="Reason for sending this letter"
                    required
                    hint={`At least ${MIN_REASON} characters. Kept in the audit trail, not printed on the letter.`}
                    error={shortReason ? `Give a reason of at least ${MIN_REASON} characters.` : undefined}
                  >
                    <Textarea ref={reasonRef} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </Field>
                  <Field label="Message shown with the request" hint="Optional. The letter subject is used when this is empty.">
                    <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
                  </Field>
                </section>
              )}
              {start.isPending || !letter ? (
                <div className="space-y-3" role="status">
                  <span className="sr-only">Drafting the letter from the selected findings</span>
                  <Skeleton className="h-10" />
                  <Skeleton className="h-20" />
                  <Skeleton className="h-64" />
                </div>
              ) : (
                <fieldset disabled={stage === "confirm" || busy} className={cn("min-w-0 space-y-4", stage === "confirm" && "opacity-60")}>
                  <legend className="sr-only">Letter contents</legend>
                  <Field label="Subject" error={touched && subject.trim().length < 3 ? "Give the letter a subject." : undefined}>
                    <Input value={subject} maxLength={300} onChange={(e) => (setSubject(e.target.value), setDirty(true))} />
                  </Field>
                  <Field label="Opening paragraph">
                    <Textarea rows={3} maxLength={3000} value={intro} onChange={(e) => (setIntro(e.target.value), setDirty(true))} />
                  </Field>
                  <div className="border-t border-line pt-4">
                    <p className="mb-4 text-xs text-ink-3">{pluralize(items.length, "item")}, numbered in this order</p>
                    <ol className="divide-y divide-line">
                      {items.map((it, i) => (
                        <ItemRow
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
                    </ol>
                  </div>
                </fieldset>
              )}
            </div>
            <aside className="min-w-0 md:sticky md:top-0 md:self-start">
              <Preview letter={letter} saving={save.isPending} />
              {letter && (
                <p className="mt-3 text-xs text-ink-3">Neutral layout without emblem or letterhead. Footer: Prepared with the Pramana prototype. Synthetic demo data.</p>
              )}
            </aside>
          </div>
        )}
      </div>
    </Drawer>
  );
}
