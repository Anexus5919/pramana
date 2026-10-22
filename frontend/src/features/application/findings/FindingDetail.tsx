import { useAuth } from "../../../auth/session";
import { EvidenceClassBadge, ReviewStatusPill, SeverityChip, SimulatedBadge, Tag } from "../../../components/ui/Badge";
import { SectionTitle } from "../../../components/ui/Card";
import { Callout } from "../../../components/ui/Feedback";
import { fmtValue } from "../../../lib/format";
import { categoryMeta, evidenceClassMeta, humanize } from "../../../lib/labels";
import type { DocumentSummary, Finding } from "../../../types";
import { CitationBlock } from "../evidence/Citation";
import { EvidenceList, officialDocHref } from "../evidence/EvidenceList";
import { TraceInputs } from "../evidence/TraceInputs";
import { FindingHistory } from "./FindingHistory";
import { ReviewPanel } from "./ReviewPanel";

export function isSimulatedFinding(f: Finding): boolean {
  return f.evidence.some((e) => e.kind === "verification" && e.simulated);
}

export function FindingDetail({
  appId,
  finding,
  docs,
  docTypeLabel,
  onRectify,
}: {
  appId: string;
  finding: Finding;
  docs: Record<string, DocumentSummary>;
  docTypeLabel: (c: string) => string;
  onRectify?: () => void;
}) {
  const { is } = useAuth();
  const canReview = is("officer", "verifier");
  const docHref = officialDocHref(appId);
  const trace = finding.trace ?? {};
  const ec = evidenceClassMeta[finding.evidence_class];
  const simulated = isSimulatedFinding(finding);
  const computed = trace.detail?.computed;

  return (
    <article aria-labelledby="finding-title" className="space-y-5">
      <header>
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityChip severity={finding.severity} />
          <EvidenceClassBadge evidenceClass={finding.evidence_class} />
          <Tag>{categoryMeta[finding.category]?.label ?? humanize(finding.category)}</Tag>
          <ReviewStatusPill status={finding.review_status} />
          {simulated && <SimulatedBadge />}
        </div>
        <h2 id="finding-title" className="mt-2.5 text-lg leading-snug font-semibold text-fg">
          {finding.title}
        </h2>
        <p className="mt-1 font-mono text-[11px] text-subtle-fg">
          {finding.code}
          {finding.rule?.version != null && ` v${finding.rule.version}`}
          {" | outcome "}
          {humanize(finding.outcome)}
        </p>
        <p className="mt-2.5 text-sm leading-relaxed text-fg">{finding.message}</p>
        {ec && (
          <p className="mt-2 text-xs text-muted">
            Evidence strength: {ec.label} (E{ec.level} of 7). {ec.meaning}
          </p>
        )}
      </header>

      {finding.limitation && (
        <Callout tone="caution" title="Limitation">
          {finding.limitation}
        </Callout>
      )}

      {finding.review_note && (
        <div className="rounded-md border border-line bg-subtle/60 px-3 py-2 text-sm">
          <span className="text-xs font-medium text-subtle-fg">Latest review note</span>
          <p className="mt-0.5 text-fg">{finding.review_note}</p>
        </div>
      )}

      {finding.rule && (
        <section>
          <SectionTitle className="mb-2">Rule citation</SectionTitle>
          <CitationBlock citation={finding.rule.citation} />
        </section>
      )}

      <section>
        <SectionTitle className="mb-2">Evidence ({finding.evidence.length})</SectionTitle>
        <EvidenceList
          evidence={finding.evidence}
          docs={docs}
          docHref={docHref}
          fallbackDocId={finding.document_id}
          docTypeLabel={docTypeLabel}
        />
      </section>

      {(trace.inputs?.length || trace.missing?.length || trace.check) && (
        <section>
          <SectionTitle className="mb-2">Trace</SectionTitle>
          <TraceInputs inputs={trace.inputs ?? []} missing={trace.missing} docHref={docHref} />
          {trace.check && (
            <div className="mt-2 rounded-md border border-line bg-subtle/50 p-2.5">
              <p className="text-[11px] font-medium text-subtle-fg">
                Check ({String((trace.check as { type?: unknown }).type ?? "expression")})
              </p>
              <pre className="mt-1 overflow-x-auto font-mono text-[12px] whitespace-pre-wrap text-fg">
                {String(
                  (trace.check as { expr?: unknown; date?: unknown }).expr ??
                    (trace.check as { date?: unknown }).date ??
                    JSON.stringify(trace.check),
                )}
              </pre>
              {computed && Object.keys(computed).length > 0 && (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {Object.entries(computed).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="font-mono text-subtle-fg">{k}</dt>
                      <dd className="font-mono text-fg">{fmtValue(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </section>
      )}

      {canReview && (
        <section>
          <SectionTitle className="mb-2">Review</SectionTitle>
          <ReviewPanel key={finding.id} appId={appId} finding={finding} onRectify={is("officer") ? onRectify : undefined} />
        </section>
      )}

      <section>
        <SectionTitle className="mb-2">History</SectionTitle>
        <FindingHistory findingId={finding.id} />
      </section>
    </article>
  );
}
