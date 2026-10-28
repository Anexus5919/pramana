import { useOutcomeView } from "../../conversation/api";
import { useDateFormat, useT } from "../../i18n";
import { roundPhrase } from "../../lib/labels";
import { Panel, PanelDivider } from "../../ui2";

/** After the scrutiny outcome, in plain words: who decides, who ratifies and where the decision arrives. */
const NEXT_STAGES = [
  "AICTE's Executive Committee takes the decision on the approval of your application, considering this scrutiny outcome.",
  "The Council of AICTE ratifies the Executive Committee's decision.",
  "The decision reaches you on the AICTE portal as a letter.",
];

/**
 * The scrutiny outcome AICTE recorded, with the reasons the official wrote, what happens after it and a neutral
 * next step. Never the official's name, a finding code, how anything was found or the report officials prepare.
 */
export function OutcomePanel({ appId }: { appId: string }) {
  const q = useOutcomeView(appId);
  const t = useT();
  const date = useDateFormat();
  const o = q.data?.outcome;
  if (!o) return null;
  return (
    <Panel
      id="outcome"
      title={t("Scrutiny outcome")}
      description={t("Recorded by AICTE on {date}, {round}", { date: date(o.recorded_at), round: o.round ? roundPhrase(o.round, t) : o.round_label })}
      className="scroll-mt-20"
    >
      <p className="text-base font-medium text-ink text-pretty">{t(o.label)}</p>
      <h3 className="mt-4 mb-1 text-xs font-medium text-ink-3">{t("Reasons")}</h3>
      <p className="text-sm break-words whitespace-pre-line text-ink-2 text-pretty">{o.reasons}</p>
      <PanelDivider label={t("What happens next")} />
      <ol className="space-y-2">
        {NEXT_STAGES.map((s, i) => (
          <li key={s} className="flex gap-3 text-sm text-ink-2 text-pretty">
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-2 text-xs font-medium text-ink-3 tabular-nums"
            >
              {i + 1}
            </span>
            <span className="min-w-0">{t(s)}</span>
          </li>
        ))}
      </ol>
      <PanelDivider label={t("What you can do next")} />
      <p className="text-sm text-ink-2 text-pretty">{t(o.what_next)}</p>
    </Panel>
  );
}
