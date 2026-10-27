import { AlertTriangle, CheckCircle2, CircleDot, MessageSquarePlus, Paperclip, Send, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { errorMessage } from "../api";
import { fmtBytes } from "../lib/format";
import { Button, Callout, IconButton, SegmentedControl, Textarea, cn, useToast } from "../ui2";
import { usePostMessage, useSetStatus, type MessageKind, type Thread } from "./api";
import { ATTACH_ACCEPT, ATTACH_MAX_MB, CELL_NAME, KIND_HELP, MAX_BODY, MIN_REASON, detectionWords } from "./labels";

type InstitutionKind = Exclude<MessageKind, "cell_reply">;

const KIND_OPTIONS: Record<InstitutionKind, string> = {
  reply: "Reply",
  question: "Ask a question",
  review_request: "Request review",
};

const OK_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

/** A quick check in the browser; the server checks the file's bytes as well. */
function fileProblem(f: File): string | null {
  if (f.size > ATTACH_MAX_MB * 1024 * 1024) return `The file is larger than ${ATTACH_MAX_MB} MB.`;
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  if (!OK_TYPES.has(f.type) && !["pdf", "jpg", "jpeg", "png"].includes(ext)) return "Attach a PDF, JPG or PNG file.";
  return null;
}

function Counter({ n, id }: { n: number; id: string }) {
  return (
    <span id={id} className={cn("text-xs tabular-nums", n > MAX_BODY ? "font-medium text-mismatch-fg" : "text-ink-3")}>
      {n.toLocaleString("en-IN")} / {MAX_BODY.toLocaleString("en-IN")}
    </span>
  );
}

function AttachButton({ file, onFile, error }: { file: File | null; onFile: (f: File | null) => void; error: string | null }) {
  const ref = useRef<HTMLInputElement>(null);
  const hint = useId();
  return (
    <div className="min-w-0">
      <input
        ref={ref}
        type="file"
        accept={ATTACH_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          onFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {file ? (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-control border border-line bg-surface-2 py-0.5 pr-0.5 pl-2 text-sm text-ink-2">
          <Paperclip aria-hidden className="size-3.5 shrink-0 text-ink-3" />
          <span className="truncate">{file.name}</span>
          <span className="shrink-0 text-xs text-ink-3">{fmtBytes(file.size)}</span>
          <IconButton size="sm" variant="ghost" label={`Remove ${file.name}`} icon={<X />} onClick={() => onFile(null)} />
        </span>
      ) : (
        <Button size="sm" variant="ghost" leadingIcon={<Paperclip />} aria-describedby={hint} onClick={() => ref.current?.click()}>
          Attach a file
        </Button>
      )}
      <p id={hint} className={cn("mt-1 text-xs", error ? "font-medium text-mismatch-fg" : "text-ink-3")} role={error ? "alert" : undefined}>
        {error ?? `Optional. One PDF, JPG or PNG up to ${ATTACH_MAX_MB} MB.`}
      </p>
    </div>
  );
}

/**
 * The institution's composer for one thread: Reply, Ask a question or Request review, with one optional file.
 * Collapsed to a single button until opened, so a long letter stays readable.
 */
export function InstitutionComposer({
  appId,
  rectificationId,
  thread,
  autoOpen = false,
}: {
  appId: string;
  rectificationId: string;
  thread: Thread;
  autoOpen?: boolean;
}) {
  const toast = useToast();
  const post = usePostMessage(appId, rectificationId);
  const [open, setOpen] = useState(autoOpen);
  const [kind, setKind] = useState<InstitutionKind>(thread.general ? "question" : "reply");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const ids = useId();
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);
  useEffect(() => {
    if (open) area.current?.focus({ preventScroll: true });
  }, [open]);

  const kinds = (Object.keys(KIND_OPTIONS) as InstitutionKind[]).filter(
    (k) => k !== "review_request" || (!thread.general && thread.status !== "resolved"),
  );
  const text = body.trim();
  const tooShort = kind === "review_request" && text.length > 0 && text.length < MIN_REASON;
  const error = tried && !text ? "Write a message first." : tried && tooShort ? "Give your reason in a sentence or two." : null;

  if (!open)
    return (
      <Button size="sm" variant="secondary" leadingIcon={<MessageSquarePlus />} onClick={() => setOpen(true)}>
        Write to the {CELL_NAME}
      </Button>
    );

  const send = () => {
    setTried(true);
    if (!text || tooShort || text.length > MAX_BODY || fileError) return;
    post.mutate(
      { threadId: thread.id, body: text, kind, file },
      {
        onSuccess: () => {
          toast.success(
            kind === "review_request" ? "Review requested" : "Sent",
            kind === "review_request"
              ? `The ${CELL_NAME} replies before any outcome is recorded.`
              : `The ${CELL_NAME} sees it in its queue.`,
          );
          setBody("");
          setFile(null);
          setTried(false);
          setOpen(false);
        },
      },
    );
  };

  return (
    <form
      className="space-y-3 rounded-control border border-line bg-surface p-3"
      aria-label={`Write to the ${CELL_NAME} about ${thread.general ? "the round" : `item ${thread.item_no}`}`}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <SegmentedControl
        label="What do you want to do"
        size="sm"
        value={kind}
        onChange={(v) => setKind(v as InstitutionKind)}
        options={kinds.map((k) => ({ value: k, label: KIND_OPTIONS[k] }))}
      />
      <p id={`${ids}-help`} className="text-sm text-ink-3 text-pretty">
        {KIND_HELP[kind]}
      </p>
      <div>
        <label htmlFor={`${ids}-body`} className="sr-only">
          {kind === "review_request" ? "Your reason" : "Your message"}
        </label>
        <Textarea
          ref={area}
          id={`${ids}-body`}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "review_request" ? "Why this item is not right, in a sentence or two" : "Your message"}
          aria-describedby={`${ids}-help ${ids}-count${error ? ` ${ids}-err` : ""}`}
          aria-invalid={error ? true : undefined}
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          <p id={`${ids}-err`} role={error ? "alert" : undefined} className="text-xs font-medium text-mismatch-fg">
            {error}
          </p>
          <Counter n={text.length} id={`${ids}-count`} />
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AttachButton
          file={file}
          error={fileError}
          onFile={(f) => {
            setFile(f);
            setFileError(f ? fileProblem(f) : null);
          }}
        />
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={post.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="secondary" leadingIcon={<Send />} loading={post.isPending}>
            {kind === "review_request" ? "Request review" : kind === "question" ? "Send question" : "Send reply"}
          </Button>
        </div>
      </div>
      {post.error && (
        <Callout tone="danger" role="alert" title="Not sent">
          {errorMessage(post.error)}
        </Callout>
      )}
    </form>
  );
}

/**
 * The cell's reply box: send a reply, or mark the item resolved or still open with the same text as the note.
 * The institution reads every word, so the box says so and flags words that describe how an indicator was found.
 */
export function CellComposer({ appId, rectificationId, thread, canSetStatus }: { appId: string; rectificationId: string; thread: Thread; canSetStatus: boolean }) {
  const toast = useToast();
  const post = usePostMessage(appId, rectificationId);
  const status = useSetStatus(appId, rectificationId);
  const [body, setBody] = useState("");
  const ids = useId();
  const text = body.trim();
  const words = detectionWords(body);
  const busy = post.isPending || status.isPending;
  const err = post.error ?? status.error;

  const reply = () =>
    post.mutate(
      { threadId: thread.id, body: text, kind: "cell_reply", file: null },
      {
        onSuccess: () => {
          setBody("");
          status.reset();
          toast.success("Reply sent", `The institution sees it from the ${CELL_NAME}.`);
        },
      },
    );
  const decide = (to: "resolved" | "still_open") =>
    status.mutate(
      { threadId: thread.id, status: to, note: text },
      {
        onSuccess: () => {
          setBody("");
          post.reset();
          toast.success(to === "resolved" ? "Item marked resolved" : "Item kept open", "The institution sees your note.");
        },
      },
    );

  return (
    <div className="w-full space-y-2">
      <label htmlFor={`${ids}-body`} className="block text-sm font-medium text-ink-2">
        {thread.pending_review ? "Reply to the review request" : "Reply to the institution"}
      </label>
      <Textarea
        id={`${ids}-body`}
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-describedby={`${ids}-hint${words.length ? ` ${ids}-warn` : ""}`}
      />
      <div className="flex items-start justify-between gap-3">
        <p id={`${ids}-hint`} className="text-xs text-ink-3 text-pretty">
          The institution sees this. Say what to submit; do not describe how an indicator was found.
        </p>
        <Counter n={text.length} id={`${ids}-count`} />
      </div>
      {words.length > 0 && (
        <p id={`${ids}-warn`} className="flex items-start gap-1.5 text-xs font-medium text-manual-fg">
          <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>
            This mentions {words.map((w) => `"${w}"`).join(", ")}, which describes how something was found. You can still send it; consider saying what to
            submit instead.
          </span>
        </p>
      )}
      {err && (
        <Callout tone="danger" role="alert" title="Not saved">
          {errorMessage(err)}
        </Callout>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {canSetStatus && !thread.general && (
          <>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<CircleDot />}
              disabled={!text || busy || text.length > 1000}
              loading={status.isPending && status.variables?.status === "still_open"}
              onClick={() => decide("still_open")}
              title="Keep the item open, with your text as the note"
            >
              Keep open
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<CheckCircle2 />}
              disabled={!text || busy || text.length > 1000}
              loading={status.isPending && status.variables?.status === "resolved"}
              onClick={() => decide("resolved")}
              title="Mark the item resolved, with your text as the note"
            >
              Mark resolved
            </Button>
          </>
        )}
        <Button size="sm" variant="secondary" leadingIcon={<Send />} disabled={!text || busy || text.length > MAX_BODY} loading={post.isPending} onClick={reply}>
          Send reply
        </Button>
      </div>
    </div>
  );
}
