import { SegmentedControl, Toolbar } from "../../../ui2";
import { useWorkspace } from "../context";
import { useParam, useSetParams } from "../data";
import { CampusView } from "./comparisons/CampusView";
import { RelatedView } from "./comparisons/RelatedView";
import { SinceLastYearView } from "./comparisons/SinceLastYearView";

type View = "since-last-year" | "related" | "campus";

/** How this application compares with last year, with other applications and with the ground. */
export function ComparisonsSection() {
  const { role } = useWorkspace();
  const [param] = useParam("view");
  const setParams = useSetParams();
  // Campus photo evidence is for officials only; the workspace route already excludes institutions
  const canCampus = role === "officer" || role === "verifier" || role === "admin";
  const options = [
    { value: "since-last-year", label: "Since last year" },
    { value: "related", label: "Related applications" },
    ...(canCampus ? [{ value: "campus", label: "Campus" }] : []),
  ];
  const view: View = options.some((o) => o.value === param) ? (param as View) : "since-last-year";

  return (
    <div className="space-y-6">
      <Toolbar>
        <SegmentedControl
          label="View"
          options={options}
          value={view}
          onChange={(v) => setParams({ view: v === "since-last-year" ? null : v, node: null })}
        />
      </Toolbar>
      {view === "since-last-year" && <SinceLastYearView />}
      {view === "related" && <RelatedView />}
      {view === "campus" && <CampusView />}
    </div>
  );
}
