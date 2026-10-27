import { useOutcomeView } from "../../conversation/api";
import { fmtDate } from "../../lib/format";
import { Panel, PanelDivider } from "../../ui2";

/**
 * The scrutiny outcome AICTE recorded, with the reasons the official wrote and a neutral next step.
 * Never the official's name, a finding code or how anything was found.
 */
export function OutcomePanel({ appId }: { appId: string }) {
  const q = useOutcomeView(appId);
  const o = q.data?.outcome;
  if (!o) return null;
  return (
    <Panel id="outcome" title="Scrutiny outcome" description={`Recorded by AICTE on ${fmtDate(o.recorded_at)}, ${o.round_label}`} className="scroll-mt-20">
      <p className="text-base font-medium text-ink text-pretty">{o.label}</p>
      <h3 className="mt-4 mb-1 text-xs font-medium text-ink-3">Reasons</h3>
      <p className="text-sm break-words whitespace-pre-line text-ink-2 text-pretty">{o.reasons}</p>
      <PanelDivider label="What you can do next" />
      <p className="text-sm text-ink-2 text-pretty">{o.what_next}</p>
    </Panel>
  );
}
