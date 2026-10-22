import { BadgeCheck, Check, FileText, Fingerprint, KeyRound, Minus, ShieldOff, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { fmtDateTime } from "../../lib/format";
import type { PdfSignatureCheck } from "../../types";
import { StatusPill } from "../../ui/Blocks";
import { Badge, Tag } from "../../ui/Badge";
import { cn } from "../../ui/cn";
import { dur, ease, spring } from "../../ui/motion";
import { Tooltip } from "../../ui/Tooltip";
import { parseAnchor, readable, splitSigner, type AnchorInfo } from "./pdf";

/** Timeline of the reveal, in seconds; collapsed to zero under reduced motion. */
const T = { doc: 0, line1: 0.2, signer: 0.5, line2: 0.75, anchor: 1.2, ticks: 1.45, step: 0.22 };

function Appear({ delay, children, className }: { delay: number; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : delay, duration: dur.panel, ease: ease.out }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** A vertical link drawn from the lower block up to the upper one. */
function Link({ delay, ok, label }: { delay: number; ok: boolean; label: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex h-12 items-stretch pl-[27px]" aria-hidden>
      <svg width="12" height="48" viewBox="0 0 12 48" className="overflow-visible">
        <motion.path
          d="M6 48 L6 4"
          fill="none"
          stroke={ok ? "var(--verified-dot)" : "var(--mismatch-dot)"}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={ok ? undefined : "3 4"}
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: reduce ? 0 : delay, duration: reduce ? 0 : 0.45, ease: ease.inOut }}
        />
        <motion.path
          d="M2 8 L6 3 L10 8"
          fill="none"
          stroke={ok ? "var(--verified-dot)" : "var(--mismatch-dot)"}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: ok ? 1 : 0 }}
          transition={{ delay: reduce ? 0 : delay + 0.4, duration: dur.ui }}
        />
      </svg>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduce ? 0 : delay + 0.15, duration: dur.ui }}
        className={cn("ml-3 self-center text-[11px] font-medium", ok ? "text-verified-fg" : "text-mismatch-fg")}
      >
        {label}
      </motion.span>
    </div>
  );
}

function Block({
  icon,
  eyebrow,
  title,
  children,
  tone = "neutral",
  className,
}: {
  icon: ReactNode;
  eyebrow: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  tone?: "neutral" | "trusted" | "demo" | "missing";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 items-start gap-3 rounded-card border p-3.5",
        tone === "neutral" && "border-line bg-surface shadow-xs",
        tone === "trusted" && "border-verified-dot/35 bg-verified-bg shadow-xs",
        tone === "demo" && "border-dashed border-manual-dot/60 bg-manual-bg",
        tone === "missing" && "border-dashed border-mismatch-dot/50 bg-mismatch-bg/60",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[9px] [&_svg]:size-[18px]",
          tone === "trusted" ? "bg-verified-dot text-white" : tone === "demo" ? "bg-manual-dot text-white" : tone === "missing" ? "bg-mismatch-dot text-white" : "bg-brand-soft text-brand-ink",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">{eyebrow}</div>
        <div className="mt-0.5 text-sm leading-snug font-semibold break-words text-ink">{title}</div>
        {children && <div className="mt-1 text-xs leading-relaxed text-ink-3">{children}</div>}
      </div>
    </div>
  );
}

function AnchorBlock({ a }: { a: AnchorInfo }) {
  if (a.kind === "none")
    return (
      <Block tone="missing" icon={<ShieldOff />} eyebrow="Trust anchor" title="No configured trust anchor matched">
        The certificate does not chain to any root Pramana is configured to trust.
      </Block>
    );
  const subject = a.subject.length ? (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
      {a.subject.map((s) => (
        <div key={s.key} className="contents">
          <dt className="text-ink-3">{s.key}</dt>
          <dd className="font-medium break-words text-ink-2">{s.value}</dd>
        </div>
      ))}
    </dl>
  ) : null;
  if (a.kind === "demo")
    return (
      <Block
        tone="demo"
        icon={<KeyRound />}
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Trust anchor <Tag variant="demo">DEMO</Tag>
          </span>
        }
        title={a.label}
      >
        A demonstration root for synthetic documents, not a real certifying authority.
        {subject && <div className="mt-1.5">{subject}</div>}
      </Block>
    );
  return (
    <Block tone={a.kind === "india" ? "trusted" : "neutral"} icon={<BadgeCheck />} eyebrow="Trust anchor (root)" title={a.label}>
      {subject}
    </Block>
  );
}

function Tick({ value, label, meaning, delay }: { value: boolean | null | undefined; label: string; meaning: string; delay: number }) {
  const reduce = useReducedMotion();
  const d = reduce ? 0 : delay;
  const state = value === true ? "yes" : value === false ? "no" : "unknown";
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: d, duration: dur.ui, ease: ease.out }}
      className="flex items-start gap-3"
    >
      <motion.span
        initial={{ scale: 0.3, rotate: -40 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: d + 0.05, ...spring.snappy }}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-[8px]",
          state === "yes" && "bg-verified-dot text-white",
          state === "no" && "bg-mismatch-dot text-white",
          state === "unknown" && "bg-unchecked-bg text-unchecked-fg",
        )}
        aria-hidden
      >
        {state === "yes" ? <Check className="size-4" strokeWidth={3} /> : state === "no" ? <X className="size-4" strokeWidth={3} /> : <Minus className="size-4" />}
      </motion.span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">
          {label}
          <span className="sr-only">: {state === "yes" ? "yes" : state === "no" ? "no" : "not determined"}</span>
        </div>
        <div className="text-xs text-ink-3">{meaning}</div>
      </div>
    </motion.li>
  );
}

function Fact({ label, children, delay }: { label: string; children: ReactNode; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: reduce ? 0 : delay, duration: dur.ui }}
      className="min-w-0 border-t border-line py-2.5"
    >
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm break-words text-ink">{children}</dd>
    </motion.div>
  );
}

export function SignatureChain({ s, filename, pages }: { s: PdfSignatureCheck; filename: string; pages: number }) {
  const r = s.response ?? {};
  const anchor = parseAnchor(r);
  const signer = splitSigner(r.signer);
  const chains = r.trusted === true && anchor.kind !== "none";
  const whole = r.coverage === "ENTIRE_FILE";
  const facts = T.ticks + T.step * 3;

  return (
    <section aria-label={`Signature ${r.field ?? ""}`} className="overflow-hidden rounded-panel border border-line bg-surface shadow-md">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2/50 px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <Fingerprint className="size-4 text-ink-3" aria-hidden />
          <span className="text-sm font-semibold text-ink">
            Signature field <span className="font-mono text-[13px] font-medium">{r.field ?? "unnamed"}</span>
          </span>
          <StatusPill status={s.status} />
          {s.simulated && <Tag variant="demo">SIMULATED</Tag>}
        </div>
        {r.revocation_checked === false && (
          <Tooltip content="Offline mode: the certificate's revocation status was not fetched from the CA. If revocation matters for this decision, confirm it separately.">
            <span tabIndex={0} className="inline-flex">
              <Badge tone="manual" variant="outline">
                Revocation not checked
              </Badge>
            </span>
          </Tooltip>
        )}
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0" aria-label="Certificate chain, from the trust anchor down to this file">
          <Appear delay={T.anchor}>
            <AnchorBlock a={anchor} />
          </Appear>
          <Link delay={T.line2} ok={chains} label={chains ? "Issued under this root" : "Does not chain to a trusted root"} />
          <Appear delay={T.signer}>
            <Block icon={<KeyRound />} eyebrow="Signer certificate" title={signer.name}>
              {signer.org && <span className="block">{signer.org}</span>}
              {r.signer_role && <span className="block">Role: {readable(String(r.signer_role))}</span>}
            </Block>
          </Appear>
          <Link delay={T.line1} ok={r.intact !== false} label={whole ? "Signed the entire file" : `Signed: ${readable(r.coverage)}`} />
          <Appear delay={T.doc}>
            <Block icon={<FileText />} eyebrow="This file" title={<span className="font-mono text-[13px]">{filename}</span>}>
              {pages} {pages === 1 ? "page" : "pages"}
            </Block>
          </Appear>
        </div>

        <div className="min-w-0">
          <ul className="grid gap-3.5 sm:grid-cols-3 lg:grid-cols-1" aria-label="Signature checks">
            <Tick value={r.intact} label="Intact" meaning="The signed bytes are unchanged." delay={T.ticks} />
            <Tick value={r.valid} label="Valid" meaning="The signature verifies with the signer's key." delay={T.ticks + T.step} />
            <Tick value={r.trusted} label="Trusted" meaning="The certificate chains to a configured root." delay={T.ticks + T.step * 2} />
          </ul>

          <dl className="mt-4 grid gap-x-6 sm:grid-cols-2">
            <Fact label="Coverage" delay={facts}>
              {readable(r.coverage)}
              {whole && <span className="block text-xs text-ink-3">No bytes outside the signature.</span>}
            </Fact>
            <Fact label="Modification level" delay={facts + 0.05}>
              {readable(r.modification_level)}
              {r.modification_level === "NONE" && <span className="block text-xs text-ink-3">Nothing was added after signing.</span>}
            </Fact>
            <Fact label="Signing time" delay={facts + 0.1}>
              {r.signing_time ? fmtDateTime(r.signing_time) : "Not stated"}
              {r.time_source && (
                <span className="mt-1 flex">
                  <Tag variant="mono">{r.time_source}</Tag>
                </span>
              )}
            </Fact>
            <Fact label="Revocation" delay={facts + 0.15}>
              {r.revocation_checked === false ? (
                <span className="text-manual-fg">Revocation not checked</span>
              ) : r.revoked ? (
                <span className="text-mismatch-fg">Certificate revoked</span>
              ) : (
                "Checked, not revoked"
              )}
              {r.revocation_checked === false && <span className="block text-xs text-ink-3">Validated offline; the CA was not asked.</span>}
            </Fact>
          </dl>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: facts + 0.3, duration: dur.panel, ease: ease.out }}
            className="mt-4 rounded-card border border-brand-200 bg-brand-soft/60 p-4"
          >
            <div className="eyebrow text-brand-ink">What this proves</div>
            <p className="mt-1 font-display text-md leading-snug font-medium text-ink text-pretty">
              {s.claim ?? "No claim can be made from this signature."}
            </p>
            <p className="mt-2 text-xs text-ink-3 text-pretty">
              It does not prove that the signer was entitled to issue this document, or that its contents are correct.
            </p>
          </motion.div>
          <p className="mt-3 text-xs leading-relaxed text-ink-3 text-pretty">{s.detail}</p>
        </div>
      </div>
    </section>
  );
}

export function NoSignature({ detail, filename, pages }: { detail?: string; filename: string; pages: number }) {
  return (
    <section aria-label="No embedded signature" className="rounded-panel border border-line bg-surface p-5 shadow-sm">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Appear delay={0.15}>
            <div className="flex items-center gap-3 rounded-card border border-dashed border-line-2 p-3.5 text-sm text-ink-3">
              <ShieldOff className="size-5 shrink-0" aria-hidden /> No signer certificate to trace
            </div>
          </Appear>
          <div className="h-8 pl-[33px]" aria-hidden>
            <span className="block h-full w-0 border-l-2 border-dashed border-line-2" />
          </div>
          <Appear delay={0}>
            <Block icon={<FileText />} eyebrow="This file" title={<span className="font-mono text-[13px]">{filename}</span>}>
              {pages} {pages === 1 ? "page" : "pages"}
            </Block>
          </Appear>
        </div>
        <div className="min-w-0">
          <StatusPill status="not_checked" label="No embedded signature" />
          <h3 className="mt-3 font-display text-lg font-semibold text-ink">This PDF carries no digital signature</h3>
          <p className="mt-1 text-sm text-ink-3 text-pretty">
            {detail ?? "There is nothing to validate cryptographically."} Without a signature, nothing here can say who produced the
            file or whether it changed since. The structure checks below still apply.
          </p>
        </div>
      </div>
    </section>
  );
}
