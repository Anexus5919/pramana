import { CircleSlash, Stamp, Type } from "lucide-react";
import { motion } from "motion/react";
import { pluralize } from "../../lib/format";
import { Tag } from "../../ui/Badge";
import { SectionCard } from "../../ui/Card";
import { fadeUp, stagger } from "../../ui/motion";
import { RevisionPanel, RevisionStage } from "../application/history/TimeMachine";
import { validBox } from "../application/data";
import type { Focus } from "../application/viewer/DocViewer";
import { NoSignature, SignatureChain } from "../verify/SignatureChain";
import { Metadata, Revisions } from "../verify/StructurePanels";
import { analyseApi, type Analysis } from "./analyseApi";
import { actionCls, Section } from "./parts";
import { signedOnly } from "./summary";

export function SignaturesSection({ a }: { a: Analysis }) {
  const signed = signedOnly(a);
  const expected = signed.map((s) => s.response.expected_signers).find((x): x is string[] => Array.isArray(x));
  return (
    <Section
      bare
      id="signatures"
      eyebrow="Digital signatures"
      title={signed.length > 1 ? `${signed.length} digital signatures` : "Digital signature"}
      description="Validated with pyHanko against the India PKI (CCA) roots bundled with Pramana, and a DEMO root used only for synthetic documents. Works offline."
    >
      <div className="space-y-4">
        {signed.length === 0 ? (
          <NoSignature detail={a.signatures[0]?.detail} filename={a.filename} pages={a.page_count} />
        ) : (
          signed.map((s, i) => <SignatureChain key={`${s.response.field ?? i}`} s={s} filename={a.filename} pages={a.page_count} />)
        )}
        {expected && (
          <p className="rounded-[12px] border border-line bg-surface px-4 py-3 text-sm text-ink-2 text-pretty">
            For a {a.doc_type.label ?? "document of this type"} the ruleset expects the issuer to sign as{" "}
            <span className="font-medium text-ink">{expected.join(" or ")}</span>. The role shown on each signature compares the certificate with that
            expectation. Without an application Pramana cannot tell whether a signer is the applicant institution.
          </p>
        )}
      </div>
    </Section>
  );
}

export function TimeMachineSection({ a }: { a: Analysis }) {
  if (!a.revisions || (a.revision_count ?? 1) < 2) return null;
  const source = {
    data: { ...a.revisions, supported: true },
    pageUrl: (n: number, page: number) => analyseApi.revisionPageUrl(a.token, n, page),
  };
  return (
    <Section
      bare
      id="revisions"
      eyebrow="Revisions"
      title={`Time machine: ${pluralize(a.revision_count ?? 1, "revision")}`}
      description="An incremental save appends bytes and never rewrites earlier ones, so the file cut at each end-of-file marker is that revision exactly. Each step renders the page as it was saved."
    >
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <RevisionStage doc={a.document} source={source} className="h-[680px]" />
        <div className="min-w-0 rounded-card border border-line bg-surface p-4 shadow-sm">
          <RevisionPanel doc={a.document} source={source} />
        </div>
      </div>
    </Section>
  );
}

export function FileStructureSection({ a, onFocus }: { a: Analysis; onFocus: (f: Focus) => void }) {
  const fonts = a.document.forensic_facts?.metadata?.fonts ?? [];
  return (
    <Section bare id="file" eyebrow="File structure" title="Metadata, revisions, fonts and seal-sized images" description="Context for the indicators above. Metadata is easy to edit, so it is never evidence on its own.">
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-3">
        <div className="grid min-w-0 gap-5">
          <Revisions count={a.revision_count} />
          <SectionCard title={`Fonts (${fonts.length})`} description="Fonts the pages draw text with. A value in a font no other value uses is raised above as an indicator.">
            {fonts.length === 0 ? (
              <p className="text-sm text-ink-3">No embedded font resources.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {fonts.slice(0, 24).map((f) => (
                  <li key={f}>
                    <Tag variant="mono" className="gap-1">
                      <Type aria-hidden className="size-3 text-ink-4" />
                      {f.replace(/^\/?[A-Z]{6}\+/, "").replace(/^\//, "")}
                    </Tag>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
        <Metadata meta={a.metadata ?? {}} />
        <SectionCard
          title={`Seal-sized images (${a.seal_images.length})`}
          description="Raster images the size of a seal or stamp, fingerprinted by exact pixels and perceptual hash. Reuse across issuers is checked only inside applications."
        >
          {a.seal_images.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ink-3">
              <CircleSlash aria-hidden className="size-4" /> No seal-sized raster image on the first pages.
            </p>
          ) : (
            <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-2">
              {a.seal_images.map((s, i) => (
                <motion.li key={`${s.sha256}-${i}`} variants={fadeUp} className="flex items-start justify-between gap-3 rounded-[10px] border border-line p-2.5">
                  <div className="min-w-0 text-xs">
                    <p className="flex items-center gap-1.5 font-medium text-ink">
                      <Stamp aria-hidden className="size-3.5 text-ink-3" /> Page {s.page}, {s.px[0]} x {s.px[1]} px
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3" title={s.phash}>
                      phash {s.phash.slice(0, 16)}
                    </p>
                  </div>
                  {validBox(s.bbox) && (
                    <button type="button" className={actionCls} onClick={() => onFocus({ page: s.page, bbox: s.bbox, label: "Seal-sized image" })}>
                      Show
                    </button>
                  )}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </SectionCard>
      </div>
    </Section>
  );
}

export function CannotKnowSection({ a }: { a: Analysis }) {
  return (
    <Section
      id="limits"
      eyebrow="Without an application"
      title="What Pramana cannot know from this file alone"
      description="These checks need the application the file belongs to. Nothing on this page is a compliance outcome."
    >
      <motion.ul variants={stagger(0.05)} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {a.cannot_know.map((c) => (
          <motion.li key={c.what} variants={fadeUp} className="rounded-[12px] border border-dashed border-line-2 bg-surface-2/40 p-3">
            <p className="text-sm font-semibold text-ink">{c.what}</p>
            <p className="mt-1 text-sm text-ink-3 text-pretty">{c.why}</p>
          </motion.li>
        ))}
      </motion.ul>
    </Section>
  );
}
