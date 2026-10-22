import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { BadgeCheck, Check, FileSearch, FlaskConical, LoaderCircle, ShieldAlert, Upload, X } from "lucide-react";
import { type DragEvent, type ReactNode, useId, useState } from "react";
import { api } from "../../api";
import { SeverityChip, StatusPill, Tag } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader, SectionTitle } from "../../components/ui/Card";
import { Digest } from "../../components/ui/Digest";
import { Callout, EmptyState, ErrorBanner } from "../../components/ui/Feedback";
import { fmtDateTime, fmtValue } from "../../lib/format";
import { humanize, severityRank } from "../../lib/labels";
import type { PdfSignatureCheck, PdfVerifyResult } from "../../types";
import { PageHeader } from "../shared/Summaries";

function AnchorBadge({ r }: { r: PdfSignatureCheck["response"] }) {
  if (r.demo_anchor === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded-[5px] border border-dashed border-unavail-dot bg-unavail-bg px-1.5 py-px text-[11px] font-bold tracking-wide text-unavail-fg">
        <FlaskConical aria-hidden className="size-3" /> DEMO anchor
      </span>
    );
  }
  if (typeof r.trust_anchor === "string" && r.trust_anchor.startsWith("India PKI") && r.demo_anchor === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-[5px] border border-verified-dot/50 bg-verified-bg px-1.5 py-px text-[11px] font-bold tracking-wide text-verified-fg">
        <BadgeCheck aria-hidden className="size-3" /> India PKI (CCA)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-[5px] border border-line-strong bg-subtle px-1.5 py-px text-[11px] font-semibold text-muted">
      No configured trust anchor
    </span>
  );
}

function Flag({ label, value }: { label: string; value: boolean | null | undefined }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        value === true ? "bg-verified-bg text-verified-fg" : value === false ? "bg-mismatch-bg text-mismatch-fg" : "bg-unchecked-bg text-unchecked-fg",
      )}
    >
      {value === true ? <Check aria-hidden className="size-3" /> : value === false ? <X aria-hidden className="size-3" /> : null}
      {label}
      <span className="sr-only">: {value === true ? "yes" : value === false ? "no" : "unknown"}</span>
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle-fg">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

function SignatureCard({ s, index }: { s: PdfSignatureCheck; index: number }) {
  const r = s.response ?? {};
  const noSignature = s.status === "not_checked" && !r.signer;
  return (
    <li className="rounded-lg border border-line bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-fg">{r.field ? `Signature ${r.field}` : `Signature ${index + 1}`}</span>
          <StatusPill status={s.status} />
          {!noSignature && <AnchorBadge r={r} />}
        </div>
        {r.revocation_checked === false && !noSignature && (
          <Tag className="border-manual-dot/50 bg-manual-bg text-manual-fg">Revocation not checked</Tag>
        )}
      </div>
      {r.signer && (
        <p className="mt-2 text-base font-medium text-fg">
          {r.signer}
          {r.signer_role && <span className="ml-2 text-xs font-normal text-muted">({humanize(r.signer_role)})</span>}
        </p>
      )}
      <p className="mt-1 text-sm leading-relaxed text-muted">{s.detail}</p>
      {s.claim && (
        <p className="mt-2 rounded-md bg-subtle px-3 py-2 text-sm text-fg">
          <span className="text-xs font-semibold text-subtle-fg">What this proves: </span>
          {s.claim}
        </p>
      )}
      {!noSignature && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Flag label="Intact" value={r.intact} />
            <Flag label="Valid" value={r.valid} />
            <Flag label="Trusted" value={r.trusted} />
            {typeof r.revoked === "boolean" && <Flag label="Not revoked" value={!r.revoked} />}
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Trust anchor">{r.trust_anchor ?? "None matched"}</Row>
            <Row label="Signing time">{r.signing_time ? fmtDateTime(r.signing_time) : "Not stated"}</Row>
            <Row label="Time source">{r.time_source ?? "Not recorded"}</Row>
            <Row label="Validated at">{r.validated_at && r.validated_at !== "now" ? fmtDateTime(r.validated_at) : "Current time"}</Row>
            <Row label="Coverage">{r.coverage ? humanize(r.coverage.toLowerCase()) : "Unknown"}</Row>
            <Row label="Modification level">{r.modification_level ? humanize(r.modification_level.toLowerCase()) : "Unknown"}</Row>
          </dl>
        </>
      )}
    </li>
  );
}

function Result({ data }: { data: PdfVerifyResult }) {
  const signals = [...data.forensic_signals].sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
  const meta = Object.entries(data.metadata ?? {}).filter(([, v]) => v !== "" && v != null);
  return (
    <div className="animate-fade-in space-y-5">
      <Card aria-labelledby="file-title">
        <CardHeader id="file-title" icon={<FileSearch className="size-4" />} title={data.filename} subtitle="Checked in memory; the file was not stored. The check is recorded in the audit log." />
        <dl className="grid gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="SHA-256">
            <Digest value={data.sha256} length={20} label="SHA-256" />
          </Row>
          <Row label="Pages">{data.pages}</Row>
          <Row label="Revisions">
            <span className={clsx((data.revisions ?? 1) > 1 && "font-semibold text-manual-fg")}>{fmtValue(data.revisions)}</span>
            {(data.revisions ?? 1) > 1 && <span className="ml-1 text-xs text-muted">(incremental updates present)</span>}
          </Row>
          <Row label="Signatures">{data.signatures.filter((s) => s.response?.signer).length}</Row>
        </dl>
        {data.active_content.length > 0 && (
          <div className="border-t border-line px-4 py-3">
            <Callout tone="caution" title="Active content found" icon={<ShieldAlert className="size-4" />}>
              <ul className="mt-1 space-y-0.5">
                {data.active_content.map((a) => (
                  <li key={a.key}>
                    <span className="font-mono text-xs">{a.key}</span> x{a.count}: {a.meaning}
                  </li>
                ))}
              </ul>
            </Callout>
          </div>
        )}
      </Card>

      <section aria-labelledby="sig-title">
        <SectionTitle className="mb-2">
          <span id="sig-title">Digital signatures</span>
        </SectionTitle>
        <ul className="space-y-3">
          {data.signatures.map((s, i) => (
            <SignatureCard key={i} s={s} index={i} />
          ))}
        </ul>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card aria-labelledby="fx-title">
          <CardHeader id="fx-title" title={`Forensic signals (${signals.length})`} subtitle="Observable facts about the file structure, not conclusions" />
          {signals.length === 0 ? (
            <p className="px-4 py-3 text-sm text-subtle-fg">No structural signals.</p>
          ) : (
            <ul className="divide-y divide-line">
              {signals.map((s, i) => (
                <li key={`${s.code}-${i}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SeverityChip severity={s.severity} />
                    <span className="font-mono text-[11px] text-subtle-fg">{s.code}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-fg">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.detail}</p>
                  {s.limitation && (
                    <Callout tone="caution" className="mt-2 py-1.5 text-xs">
                      {s.limitation}
                    </Callout>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card aria-labelledby="meta-title">
          <CardHeader id="meta-title" title="Document information" subtitle="Metadata is easy to edit; treat it as context only" />
          {meta.length === 0 ? (
            <p className="px-4 py-3 text-sm text-subtle-fg">No metadata in the file.</p>
          ) : (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
              {meta.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-xs text-subtle-fg">{k}</dt>
                  <dd className="text-xs break-words text-fg">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}

export function VerifyPdfPage() {
  const inputId = useId();
  const [over, setOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const mut = useMutation({ mutationFn: (f: File) => api.verifyPdf(f) });

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setFile(f);
    mut.mutate(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (!mut.isPending) pick(e.dataTransfer.files);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Verify a PDF"
        subtitle="Check any PDF's embedded signatures against the configured trust anchors and inspect its structure, without attaching it to an application."
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={clsx(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          over ? "border-primary bg-primary-soft/60" : "border-line-strong bg-surface",
        )}
      >
        {mut.isPending ? (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-pending-fg">
            <LoaderCircle aria-hidden className="size-5 animate-spin" /> Validating signatures and structure of {file?.name}
          </p>
        ) : (
          <>
            <Upload aria-hidden className="size-6 text-subtle-fg" />
            <p className="text-sm text-fg">Drop a PDF here</p>
            <label htmlFor={inputId} className="cursor-pointer">
              <span className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-on shadow-sm hover:bg-primary-hover">
                Choose a PDF
              </span>
              <input
                id={inputId}
                type="file"
                accept=".pdf,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  pick(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="text-xs text-subtle-fg">Up to 15 MB. Signatures are validated offline; revocation status may not be fetched.</p>
          </>
        )}
      </div>
      {!!mut.error && (
        <div className="space-y-2">
          <ErrorBanner error={mut.error} title="The PDF could not be checked" />
          {file && (
            <Button size="sm" onClick={() => mut.mutate(file)}>
              Try again
            </Button>
          )}
        </div>
      )}
      {mut.data ? (
        <Result data={mut.data} />
      ) : (
        !mut.isPending &&
        !mut.error && (
          <EmptyState icon={<FileSearch className="size-6" />} title="No file checked yet" className="py-6">
            A valid result proves the signed bytes are unchanged and the certificate chains to a trusted root. It does not
            prove the signer was entitled to issue the document.
          </EmptyState>
        )
      )}
    </div>
  );
}
