import { SquareDashed } from "lucide-react";
import type { ReactNode } from "react";
import { pluralize } from "../../lib/format";
import { Callout, PanelDivider } from "../../ui2";
import { validBox } from "../application/data";
import { RevisionPanel, RevisionStage } from "../application/history/TimeMachine";
import type { Focus } from "../application/viewer/DocViewer";
import { NoSignature, SignatureChain } from "../verify/SignatureChain";
import { Metadata, Revisions } from "../verify/StructurePanels";
import { analyseApi, type Analysis } from "./analyseApi";
import { anchorId, ReportPanel, RowAction } from "./parts";
import { signedOnly } from "./summary";

export function SignaturesSection({ a }: { a: Analysis }) {
  const signed = signedOnly(a);
  const expected = signed.map((s) => s.response.expected_signers).find((x): x is string[] => Array.isArray(x));
  return (
    <ReportPanel
      id="signatures"
      title={signed.length > 1 ? `${signed.length} digital signatures` : "Digital signature"}
      description="Validated with pyHanko against the India PKI (CCA) roots bundled with Pramana, and a DEMO root used only for synthetic documents. Works offline."
    >
      {signed.length === 0 ? (
        <NoSignature detail={a.signatures[0]?.detail} />
      ) : (
        signed.map((s, i) => (
          <div key={`${s.response.field ?? i}`}>
            {i > 0 && <PanelDivider className="my-6" />}
            <SignatureChain s={s} filename={a.filename} pages={a.page_count} />
          </div>
        ))
      )}
      {expected && (
        <p className="mt-6 border-t border-line pt-4 text-sm text-ink-2 text-pretty">
          For a {a.doc_type.label ?? "document of this type"} the ruleset expects the issuer to sign as <span className="font-medium text-ink">{expected.join(" or ")}</span>.
          The role on each signature compares the certificate with that expectation. Without an application Pramana cannot tell whether a signer is the applicant
          institution.
        </p>
      )}
    </ReportPanel>
  );
}

export function TimeMachineSection({ a }: { a: Analysis }) {
  if (!a.revisions || (a.revision_count ?? 1) < 2) return null;
  const source = {
    data: { ...a.revisions, supported: true },
    pageUrl: (n: number, page: number) => analyseApi.revisionPageUrl(a.token, n, page),
  };
  return (
    <ReportPanel
      id="revisions"
      title="Time machine"
      description={`${pluralize(a.revision_count ?? 1, "revision")}. An incremental save appends bytes and never rewrites earlier ones, so each step shows the page exactly as it was saved.`}
    >
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <RevisionStage doc={a.document} source={source} className="h-[680px]" />
        <div className="min-w-0">
          <RevisionPanel doc={a.document} source={source} />
        </div>
      </div>
    </ReportPanel>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function FileStructureSection({ a, onFocus }: { a: Analysis; onFocus: (f: Focus) => void }) {
  const fonts = (a.document.forensic_facts?.metadata?.fonts ?? []).map((f) => f.replace(/^\/?[A-Z]{6}\+/, "").replace(/^\//, ""));
  return (
    <ReportPanel id="file" title="File structure" description="Context for the indicators. Metadata is easy to edit, so it is never evidence on its own.">
      <div className="grid min-w-0 items-start gap-x-8 gap-y-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Group title="Revisions">
            <Revisions count={a.revision_count} />
            {(a.revision_count ?? 1) >= 2 && a.revisions && (
              <a href={`#${anchorId("revisions")}`} className="mt-1 inline-block rounded text-sm text-ink underline-offset-2 hover:underline">
                Open the time machine
              </a>
            )}
          </Group>
          <Group title={`Fonts (${fonts.length})`}>
            {fonts.length === 0 ? (
              <p className="text-sm text-ink-3">No embedded font resources.</p>
            ) : (
              <p className="font-mono text-xs break-words text-ink-2">{fonts.slice(0, 24).join(", ")}</p>
            )}
            <p className="mt-1 text-xs text-ink-3">A value in a font no other value uses is raised as an indicator.</p>
          </Group>
          <Group title={`Seal-sized images (${a.seal_images.length})`}>
            {a.seal_images.length === 0 ? (
              <p className="text-sm text-ink-3">No seal-sized raster image on the first pages.</p>
            ) : (
              <ul className="divide-y divide-line">
                {a.seal_images.map((s, i) => (
                  <li key={`${s.sha256}-${i}`} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        Page {s.page}, {s.px[0]} x {s.px[1]} px
                      </p>
                      <p className="truncate font-mono text-xs text-ink-3" title={s.phash}>
                        phash {s.phash.slice(0, 16)}
                      </p>
                    </div>
                    {validBox(s.bbox) && (
                      <RowAction leadingIcon={<SquareDashed />} onClick={() => onFocus({ page: s.page, bbox: s.bbox, label: "Seal-sized image" })}>
                        Show
                      </RowAction>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-ink-3">Fingerprinted by exact pixels and perceptual hash. Reuse across issuers is checked only inside applications.</p>
          </Group>
        </div>
        <Group title="Document information">
          <Metadata meta={a.metadata ?? {}} />
        </Group>
      </div>
    </ReportPanel>
  );
}

export function CannotKnowSection({ a }: { a: Analysis }) {
  return (
    <section id={anchorId("limits")} className="scroll-mt-20" aria-label="What Pramana cannot know">
      <Callout tone="neutral" title="What Pramana cannot know from this file alone">
        <p>These checks need the application the file belongs to. Nothing on this page is a compliance outcome.</p>
        <ul className="mt-2 grid gap-x-8 gap-y-2 md:grid-cols-2">
          {a.cannot_know.map((c) => (
            <li key={c.what}>
              <span className="font-medium text-ink">{c.what}.</span> {c.why}
            </li>
          ))}
        </ul>
      </Callout>
    </section>
  );
}
