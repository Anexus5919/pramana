import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { api, qk } from "../../api";
import { Page, PageHeader, Tabs } from "../../ui2";
import { FacultyRadar } from "./FacultyRadar";
import { NetworkView } from "./NetworkView";

/** Cycle-wide integrity views for officials: the evidence network and the faculty overlap radar. */
export default function IntegrityPage() {
  const { view } = useParams();
  const tab = view === "faculty" ? "faculty" : "network";
  const [params, setParams] = useSearchParams();
  const dataset = params.get("dataset") === "synthetic" ? "synthetic" : "current";
  const setDataset = (d: "current" | "synthetic") =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("node");
        if (d === "synthetic") n.set("dataset", d);
        else n.delete("dataset");
        return n;
      },
      { replace: true },
    );
  const current = useQuery({ queryKey: qk.integrityNetwork(), queryFn: () => api.integrityNetwork(), staleTime: 60_000 });
  const synthetic = useQuery({
    queryKey: qk.integrityNetwork("synthetic"),
    queryFn: () => api.integrityNetwork("synthetic"),
    staleTime: Infinity,
    enabled: dataset === "synthetic",
  });
  const net = dataset === "synthetic" ? synthetic : current;
  const fac = useQuery({ queryKey: qk.facultyOverlaps, queryFn: api.facultyOverlaps, staleTime: 60_000 });
  const year = current.data?.academic_year ?? fac.data?.academic_year;

  return (
    <Page width="wide">
      <PageHeader
        title="Integrity"
        context={`Evidence shared between applications${year ? ` in AY ${year}` : ""}. A shared item is an indicator that needs confirmation, not a conclusion about any institution or person.`}
      >
        <Tabs
          label="Integrity views"
          value={tab}
          items={[
            { id: "network", label: "Integrity network", count: current.data?.stats.clusters, href: "/integrity" },
            { id: "faculty", label: "Faculty overlaps", count: fac.data?.stats.faculty_ids, href: "/integrity/faculty" },
          ]}
        />
      </PageHeader>
      {tab === "network" ? (
        <NetworkView query={net} datasets={current.data?.datasets ?? []} dataset={dataset} onDataset={setDataset} />
      ) : (
        <FacultyRadar query={fac} />
      )}
    </Page>
  );
}
