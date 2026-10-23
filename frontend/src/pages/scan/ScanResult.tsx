import { useMutation } from "@tanstack/react-query";
import { Check, CircleCheck, CircleMinus, Database, Link2, Minus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Tag } from "../../ui/Badge";
import { StatusCube } from "../../ui/Blocks";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Digest } from "../../ui/Digest";
import { dur, ease, fadeUp, stagger } from "../../ui/motion";
import { toneClass } from "../../ui/tone";
import { registryLookup, type ScanField, type ScanResponse, type ScanTokenResult, type ScanValidity } from "./scanApi";
import { fmtDay, statusView } from "./status";

type Answer = "same" | "diff";

function show(f: ScanField): string {
  if (f.value === null || f.value === undefined) return "not stated";
  return f.kind === "date" ? fmtDay(String(f.value)) : String(f.value);
}

function Signed({ f }: { f: ScanField }) {
  return f.kind === "date" && f.value ? <span className="mt-0.5 block text-[11.5px] text-ink-3">signed as {String(f.value)}</span> : null;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <h3 className="eyebrow mb-2">{children}</h3>;
}

/** The validity window the issuer signed, with today placed on it. */
function ValidityTrack({ v }: { v: ScanValidity }) {
  const from = v.from ? Date.parse(v.from) : null;
  const until = v.until ? Date.parse(v.until) : null;
  const today = Date.parse(v.checked_on);
  if (from === null && until === null) return null;
  const lo = Math.min(from ?? today, today);
  const hi = Math.max(until ?? today, today);
  const span = Math.max(hi - lo, 1);
  const pos = (t: number) => 6 + ((t - lo) / span) * 88;
  const a = pos(from ?? lo);
  const b = pos(until ?? hi);
  const t = pos(today);
  const tone = v.state === "expired" ? toneClass.expired : v.state === "not_yet_valid" ? toneClass.pending : toneClass.verified;
  return (
    <div className="mt-4" role="img" aria-label={`Valid from ${fmtDay(v.from)} until ${fmtDay(v.until)}; checked on ${fmtDay(v.checked_on)}`}>
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-5 h-1.5 rounded-full bg-surface-3" />
        <motion.div
          className="absolute top-5 h-1.5 origin-left rounded-full"
          style={{ left: `${a}%`, width: `${Math.max(b - a, 1)}%`, background: tone.color }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: dur.story, ease: ease.out }}
        />
        <motion.div
          className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${t}%` }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: dur.story * 0.8, duration: dur.ui, ease: ease.out }}
        >
          <span className="rounded-full bg-ink px-1.5 text-[10px] leading-4 font-semibold text-canvas">Today</span>
          <span className="h-4 w-0.5 bg-ink" />
        </motion.div>
      </div>
      <div className="flex justify-between text-xs text-ink-3">
        <span>{v.from ? `From ${fmtDay(v.from)}` : "Start not stated"}</span>
        <span>{v.until ? `Until ${fmtDay(v.until)}` : "End not stated"}</span>
      </div>
    </div>
  );
}

/** Each signed value next to a choice: the paper shows the same value, or a different one. */
function Compare({ fields }: { fields: ScanField[] }) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const diff = fields.filter((f) => answers[f.key] === "diff");
  const done = fields.every((f) => answers[f.key]);
  return (
    <section aria-labelledby="cmp-title">
      <h3 id="cmp-title" className="eyebrow mb-1">
        Compare with the paper
      </h3>
      <p className="mb-3 text-sm text-ink-2 text-pretty">The issuer signed exactly these values. Check each one against the printed certificate.</p>
      <motion.ul className="divide-y divide-line overflow-hidden rounded-card border border-line" variants={stagger(0.05)} initial="hidden" animate="show">
        {fields.map((f) => {
          const a = answers[f.key];
          return (
            <motion.li key={f.key} variants={fadeUp} className={cn("px-3.5 py-3 transition-colors duration-300", a === "diff" && "bg-mismatch-bg/60", a === "same" && "bg-verified-bg/50")}>
              <div className="text-xs font-medium text-ink-3">{f.label}</div>
              <div className="mt-0.5 font-mono text-[15px] leading-snug font-medium break-words text-ink">{show(f)}</div>
              <Signed f={f} />
              <div className="mt-2 inline-flex rounded-control border border-line bg-surface p-0.5" role="group" aria-label={`Does the paper show the same ${f.label.toLowerCase()}?`}>
                {(["same", "diff"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={a === v}
                    onClick={() => setAnswers((x) => ({ ...x, [f.key]: v }))}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-brand-400",
                      a === v ? (v === "same" ? "bg-verified-bg text-verified-fg" : "bg-mismatch-bg text-mismatch-fg") : "text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {v === "same" ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                    {v === "same" ? "Same on paper" : "Different"}
                  </button>
                ))}
              </div>
            </motion.li>
          );
        })}
      </motion.ul>
      <AnimatePresence initial={false}>
        {(diff.length > 0 || done) && (
          <motion.div
            key={diff.length > 0 ? "diff" : "same"}
            role="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.ui, ease: ease.out }}
            className={cn("mt-3 rounded-card border px-3.5 py-3 text-sm text-pretty", diff.length ? "border-mismatch-dot/40 bg-mismatch-bg text-mismatch-fg" : "border-verified-dot/30 bg-verified-bg text-verified-fg")}
          >
            {diff.length > 0 ? (
              <>
                <b className="font-semibold">The paper differs from what the issuer signed</b> ({diff.map((f) => f.label.toLowerCase()).join(", ")}). Rely on the
                signed values, not the print, and ask the issuer to confirm.
              </>
            ) : (
              <>
                <b className="font-semibold">Every signed value matches the paper.</b> That shows the QR belongs with these values; it still does not show who printed the paper.
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Registry({ token }: { token: string }) {
  const q = useMutation({ mutationFn: () => registryLookup(token) });
  const r = q.data;
  return (
    <section aria-labelledby="reg-title" className="rounded-card border border-dashed border-line-2 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="reg-title" className="text-sm font-semibold text-ink">
          Issuer registry
        </h3>
        <Tag variant="demo">Simulated</Tag>
      </div>
      <p className="mt-1 text-sm text-ink-3 text-pretty">Optionally ask the issuer's registry whether it holds this certificate. In the prototype the registry is simulated.</p>
      {!r && (
        <Button className="mt-3 w-full sm:w-auto" variant="soft" leadingIcon={<Database />} loading={q.isPending} onClick={() => q.mutate()}>
          Look up in the registry
        </Button>
      )}
      {q.error && <p className="mt-2 text-sm text-mismatch-fg" role="alert">{q.error.message}</p>}
      {r && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.ui, ease: ease.out }} className="mt-3 space-y-2 text-sm" role="status">
          {!r.available ? (
            <p className="text-unavail-fg">{r.detail ?? "The registry did not respond."} Nothing was confirmed.</p>
          ) : r.found ? (
            <p className="flex items-start gap-2 text-ink">
              <StatusCube tone={r.status === "valid" ? "verified" : "mismatch"} size={13} className="mt-1" />
              <span className="min-w-0">
                {r.registry} holds <span className="font-mono break-words">{r.ref}</span>, status {r.status ?? "not stated"}.
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-2 text-mismatch-fg">
              <StatusCube tone="mismatch" size={13} className="mt-1" />
              <span className="min-w-0">
                {r.registry} has no record of <span className="font-mono break-words">{r.ref}</span>.
              </span>
            </p>
          )}
          {r.compare && r.compare.length > 0 && (
            <ul className="divide-y divide-line rounded-[10px] border border-line">
              {r.compare.map((c) => (
                <li key={c.label} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-xs text-ink-3">{c.label}</span>
                    <span className="block font-mono text-[13px] break-words text-ink">{c.registry}</span>
                  </span>
                  <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-medium", c.match ? "text-verified-fg" : "text-mismatch-fg")}>
                    {c.match ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                    {c.match ? "Same as signed" : "Differs"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      )}
    </section>
  );
}

/**
 * Where the data came from when a link was involved. The link only transports the token; the signature is the
 * proof, and since a link can point anywhere the person is told to check the page they are on.
 */
function LinkNote({ data, r }: { data: ScanResponse; r?: ScanTokenResult }) {
  const fromLink = data.source === "link";
  if (!fromLink && !r?.link_host) return null;
  return (
    <section aria-labelledby="link-title" className="flex gap-3 rounded-card border border-line bg-surface-2/60 p-3.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-surface text-ink-2 shadow-xs">
        <Link2 className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 text-sm text-ink-2 text-pretty">
        <h3 id="link-title" className="font-semibold text-ink">
          {fromLink ? "The link only carries the data" : "This QR is a link"}
        </h3>
        {fromLink ? (
          <p className="mt-0.5">
            The issuer&apos;s signature, checked against its published key, is what proves it. A link can point anywhere, so in production make sure this page
            is on the issuer&apos;s or AICTE&apos;s official domain.
          </p>
        ) : (
          <p className="mt-0.5">
            It points to <span className="font-mono text-[13px] break-all text-ink">{r?.link_host}</span>. Pramana read the signed data from the code and did not
            open the link; only the signature counts, wherever a link points.
          </p>
        )}
        {fromLink && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
            This page is on <span className="rounded-[6px] bg-surface px-1.5 py-0.5 font-mono text-[12px] break-all text-ink">{window.location.host}</span>
            <Tag variant="demo">Prototype server</Tag>
          </p>
        )}
      </div>
    </section>
  );
}

function Lists({ r }: { r: ScanTokenResult }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section aria-labelledby="proves-title">
        <Eyebrow>
          <span id="proves-title">What this proves</span>
        </Eyebrow>
        <ul className="space-y-2">
          {(r.proves ?? []).map((p) => (
            <li key={p} className="flex gap-2 text-sm text-ink-2 text-pretty">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-verified-dot" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="not-title">
        <Eyebrow>
          <span id="not-title">What this does not prove</span>
        </Eyebrow>
        <ul className="space-y-2">
          {(r.does_not_prove ?? []).map((p) => (
            <li key={p} className="flex gap-2 text-sm text-ink-2 text-pretty">
              <CircleMinus className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function ScanResult({ data }: { data: ScanResponse }) {
  const r = data.results[0];
  const view = statusView(data.status, r, data.source);
  const tone = toneClass[view.tone];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [data.checked_at]);
  const unsigned = r && !r.signed && (r.fields?.length ?? 0) > 0;
  return (
    <motion.article
      aria-labelledby="scan-result-title"
      className="overflow-hidden rounded-panel border border-line bg-surface shadow-md"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.panel, ease: ease.out }}
    >
      <header className={cn("border-b px-4 py-4 sm:px-5", tone.bg, tone.border)}>
        <div className="flex items-start gap-3">
          <StatusCube tone={view.tone} size={26} className="mt-0.5" />
          <div className="min-w-0">
            <h2 id="scan-result-title" ref={heading} tabIndex={-1} className={cn("font-display text-[22px] leading-tight font-semibold tracking-title outline-none", tone.fg)}>
              {view.title}
            </h2>
            <p className="mt-1 text-sm text-ink-2 text-pretty">{view.lede}</p>
          </div>
        </div>
        {r?.issuer?.name && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            <span>
              {r.signed ? "Signed by" : "Claims to be from"} <b className="font-semibold text-ink">{r.issuer.name}</b>
            </span>
            {r.issuer.simulated && <Tag variant="demo">Simulated</Tag>}
            {r.issuer.kid && <Tag variant="mono">key {r.issuer.kid}</Tag>}
          </p>
        )}
        {r?.validity && r.validity.state !== "none" && <ValidityTrack v={r.validity} />}
      </header>

      <div className="space-y-6 px-4 py-5 sm:px-5">
        <LinkNote data={data} r={r} />
        {r?.signed && r.fields && r.fields.length > 0 && <Compare fields={r.fields} />}
        {unsigned && (
          <section>
            <Eyebrow>What the QR says (unverified)</Eyebrow>
            <ul className="divide-y divide-line rounded-card border border-line">
              {r.fields!.map((f) => (
                <li key={f.key} className="flex items-start gap-2 px-3.5 py-2.5">
                  <Minus className="mt-1 size-3.5 shrink-0 text-ink-4" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-xs text-ink-3">{f.label}</span>
                    <span className="block font-mono text-sm break-words text-ink-2">{show(f)}</span>
                    <Signed f={f} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {r?.signed && <Lists r={r} />}
        {r?.signed && r.registry_available && r.token && <Registry token={r.token} />}
        {r?.status === "not_signed" && r.text_preview && (
          <p className="rounded-[10px] bg-surface-2 px-3 py-2 font-mono text-xs break-all text-ink-3">{r.text_preview}</p>
        )}
        {data.qr_found > 1 && <p className="text-xs text-ink-3">{data.qr_found} QR codes were found; the first is shown.</p>}

        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-ink-3">
          {data.source === "link" ? (
            <>
              <span>Token fingerprint</span>
              {data.token_sha256 && <Digest value={data.token_sha256} label="SHA-256 of the checked token" />}
              <span>Link not stored</span>
            </>
          ) : (
            <>
              <span>Image fingerprint</span>
              {data.image_sha256 && <Digest value={data.image_sha256} label="SHA-256 of the checked image" />}
              <span>{data.stored ? "Photo stored" : "Photo not stored"}</span>
            </>
          )}
        </footer>
      </div>
    </motion.article>
  );
}
