import { ArrowDown, Send } from "lucide-react";
import type { ReactNode } from "react";
import { fmtDate, pluralize } from "../../lib/format";
import { humanize } from "../../lib/labels";
import type { ApplicationDetail, ChecklistSlot } from "../../types";
import { Button, Callout, Panel } from "../../ui2";
import { lastResponded, type PortalStage } from "./progress";
import { SubmissionProgress } from "./SubmissionProgress";

export interface NextStepProps {
  app: ApplicationDetail;
  stage: PortalStage;
  missing: ChecklistSlot[];
  /** Items in the open rectification request (the letter's count when there is one) */
  itemCount: number;
  /** The run followed live on this page, after a submission or a reload during a check */
  liveRun: string | null;
  onRunDone: (status: string) => void;
  onGoToDocuments: () => void;
  onSubmit: () => void;
  /** The declared figures are being edited: their Save is the action, so this panel shows none */
  editing: boolean;
}

function Sentence({ children }: { children: ReactNode }) {
  return <p className="min-w-0 flex-1 text-base text-ink text-pretty">{children}</p>;
}

/**
 * What to do now, in one sentence, with the only primary action of the page.
 * During the automatic check it shows the live stage progress instead.
 */
export function NextStepPanel({ app, stage, missing, itemCount, liveRun, onRunDone, onGoToDocuments, onSubmit, editing }: NextStepProps) {
  const n = missing.length;
  let body: ReactNode;
  let action: ReactNode = null;
  let hint: ReactNode = null;

  if (liveRun && (stage === "checking" || stage === "under-review")) {
    body = <SubmissionProgress runId={liveRun} onDone={onRunDone} />;
  } else
    switch (stage) {
      case "draft-missing":
        body = <Sentence>Upload {pluralize(n, "required document")} to continue.</Sentence>;
        action = (
          <Button variant="primary" size="lg" trailingIcon={<ArrowDown aria-hidden />} onClick={onGoToDocuments}>
            Go to documents
          </Button>
        );
        break;
      case "draft-ready":
        body = <Sentence>Every required document is uploaded. Check your declared figures, then submit.</Sentence>;
        action = (
          <Button variant="primary" size="lg" leadingIcon={<Send aria-hidden />} onClick={onSubmit}>
            Submit for review
          </Button>
        );
        break;
      case "checking":
        body = <Sentence>Submitted. The automatic check starts in a moment and its progress shows here.</Sentence>;
        break;
      case "check-failed":
        body = (
          <Callout tone="danger" title="The check stopped" className="flex-1">
            Your application is submitted. Nothing is lost; AICTE staff can restart the check.
          </Callout>
        );
        break;
      case "under-review":
        body = <Sentence>AICTE is reviewing your application. You will see any request for corrections here.</Sentence>;
        break;
      case "rectification":
        body = (
          <Sentence>
            AICTE asked you to correct {pluralize(itemCount, "item")}. Upload corrected documents or fix your figures, then resubmit.
          </Sentence>
        );
        action = (
          <Button
            variant="primary"
            size="lg"
            leadingIcon={<Send aria-hidden />}
            onClick={onSubmit}
            disabled={n > 0}
            aria-describedby={n > 0 ? "resubmit-hint" : undefined}
          >
            Resubmit
          </Button>
        );
        if (n > 0)
          hint = (
            <p id="resubmit-hint" className="mt-3 text-sm text-ink-3">
              Resubmit opens once every required document is uploaded. Still missing: {missing.map((m) => m.label).join(", ")}.
            </p>
          );
        break;
      case "rectified": {
        const r = lastResponded(app);
        body = (
          <Sentence>
            Resubmitted{r?.responded_at ? ` on ${fmtDate(r.responded_at)}` : ""}. AICTE is reviewing the corrections.
          </Sentence>
        );
        break;
      }
      case "closed":
        body = <Sentence>AICTE has finished processing this application. The decision reaches you from AICTE directly.</Sentence>;
        break;
      case "withdrawn":
        body = <Sentence>This application was withdrawn. Nothing more is needed.</Sentence>;
        break;
      default:
        body = (
          <Sentence>
            This application is {humanize(app.status).toLowerCase()}. Contact AICTE if you are unsure what to do next.
          </Sentence>
        );
    }

  return (
    <Panel id="next-step" title="Next step">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {body}
        {action && !editing && <div className="shrink-0">{action}</div>}
      </div>
      {!editing && hint}
      {editing && action && <p className="mt-3 text-sm text-ink-3">Save or cancel your changes to the declared figures first.</p>}
    </Panel>
  );
}
