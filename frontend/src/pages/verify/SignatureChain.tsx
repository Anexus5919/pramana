import { BadgeCheck, FileText, KeyRound, ShieldOff } from "lucide-react";
import type { ReactNode } from "react";
import { fmtDateTime } from "../../lib/format";
import type { PdfSignatureCheck } from "../../types";
import { Code, DescriptionList, SimulatedTag, StatusBadge, VerificationBadge, cn } from "../../ui2";
import { parseAnchor, readable, splitSigner } from "./pdf";

function yesNo(v: boolean | null | undefined, yes: string, no: string): ReactNode {
  if (v === true) return yes;
  if (v === false) return <span className="font-medium text-mismatch-fg">{no}</span>;
  return <span className="text-ink-3">Not determined</span>;
}

function Step({ icon, label, title, children, last = false }: { icon: ReactNode; label: string; title: ReactNode; children?: ReactNode; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-1">
      {!last && <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-line-2" />}
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line-2 bg-surface text-ink-3 [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="text-xs text-ink-3">{label}</div>
        <div className="text-sm font-medium break-words text-ink">{title}</div>
        {children && <div className="mt-0.5 text-xs break-words text-ink-3">{children}</div>}
      </div>
    </li>
  );
}

function LinkLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="relative py-2 pl-11">
      <span aria-hidden className="absolute inset-y-0 left-[15px] w-px bg-line-2" />
      <span className={cn("text-xs", ok ? "text-ink-3" : "font-medium text-mismatch-fg")}>{children}</span>
    </li>
  );
}

/** One embedded signature: the chain from the trust anchor down to the file, then what was checked and what it proves. */
export function SignatureChain({ s, filename, pages }: { s: PdfSignatureCheck; filename: string; pages: number }) {
  const r = s.response ?? {};
  const anchor = parseAnchor(r);
  const signer = splitSigner(r.signer);
  const chains = r.trusted === true && anchor.kind !== "none";
  const whole = r.coverage === "ENTIRE_FILE";
  const subject = anchor.subject.map((x) => `${x.key}: ${x.value}`).join(", ");

  return (
    <article aria-label={`Signature field ${r.field ?? "unnamed"}`} className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-sm font-semibold text-ink">
          Signature field <Code>{r.field ?? "unnamed"}</Code>
        </h3>
        <VerificationBadge status={s.status} />
        {s.simulated && <SimulatedTag />}
        {r.revocation_checked === false && <span className="text-xs text-ink-3">Revocation not checked, validated offline</span>}
      </div>

      <div className="mt-4 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-8">
        <ol aria-label="Certificate chain, from the trust anchor down to this file" className="min-w-0">
          <Step
            icon={anchor.kind === "none" ? <ShieldOff /> : <BadgeCheck />}
            label={anchor.kind === "demo" ? "Trust anchor, DEMO root for synthetic documents" : "Trust anchor"}
            title={anchor.kind === "none" ? "No configured trust anchor matched" : anchor.label}
          >
            {anchor.kind === "none" ? "The certificate does not chain to any root Pramana is configured to trust." : subject || undefined}
          </Step>
          <LinkLine ok={chains}>{chains ? "Issued under this root" : "Does not chain to a trusted root"}</LinkLine>
          <Step icon={<KeyRound />} label="Signer certificate" title={signer.name}>
            {[signer.org, r.signer_role ? `Role: ${readable(String(r.signer_role))}` : ""].filter(Boolean).join(". ") || undefined}
          </Step>
          <LinkLine ok={r.intact !== false}>{whole ? "Signed the entire file" : `Signed: ${readable(r.coverage)}`}</LinkLine>
          <Step icon={<FileText />} label="This file" title={<span className="font-mono">{filename}</span>} last>
            {pages} {pages === 1 ? "page" : "pages"}
          </Step>
        </ol>

        <div className="min-w-0 space-y-4">
          <DescriptionList
            layout="stacked"
            columns={3}
            items={[
              { label: "Intact", value: yesNo(r.intact, "Yes", "No"), hint: "The signed bytes are unchanged." },
              { label: "Valid", value: yesNo(r.valid, "Yes", "No"), hint: "Verifies with the signer's key." },
              { label: "Trusted", value: yesNo(r.trusted, "Yes", "No"), hint: "Chains to a configured root." },
            ]}
          />
          <DescriptionList
            labelWidth={148}
            items={[
              { label: "Coverage", value: readable(r.coverage), hint: whole ? "No bytes outside the signature." : undefined },
              {
                label: "Modification level",
                value: readable(r.modification_level),
                hint: r.modification_level === "NONE" ? "Nothing was added after signing." : undefined,
              },
              { label: "Signing time", value: r.signing_time ? fmtDateTime(r.signing_time) : "Not stated", hint: r.time_source ? `Source: ${r.time_source}` : undefined },
              {
                label: "Revocation",
                value:
                  r.revocation_checked === false ? (
                    "Not checked"
                  ) : r.revoked ? (
                    <span className="font-medium text-mismatch-fg">Certificate revoked</span>
                  ) : (
                    "Checked, not revoked"
                  ),
                hint: r.revocation_checked === false ? "Validated offline; the certifying authority was not asked. Confirm separately if it matters." : undefined,
              },
            ]}
          />
          <div className="border-t border-line pt-4">
            <div className="text-xs text-ink-3">What this proves</div>
            <p className="mt-0.5 text-sm font-medium text-ink text-pretty">{s.claim ?? "No claim can be made from this signature."}</p>
            <p className="mt-1 text-xs text-ink-3 text-pretty">
              It does not prove that the signer was entitled to issue this document, or that its contents are correct. {s.detail}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export function NoSignature({ detail }: { detail?: string }) {
  return (
    <div className="flex items-start gap-3">
      <ShieldOff aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-4" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">This PDF carries no digital signature</span>
          <StatusBadge tone="unchecked" title="There is no signature to validate.">
            Not checked
          </StatusBadge>
        </div>
        <p className="mt-0.5 text-sm text-ink-3 text-pretty">
          {detail ?? "There is nothing to validate cryptographically."} Without a signature nothing here can say who produced the file or whether it changed
          since. A seal image is not a signature. The structure checks still apply.
        </p>
      </div>
    </div>
  );
}
