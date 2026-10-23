import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { pluralize } from "../../lib/format";
import { ButtonLink, Panel, Skeleton } from "../../ui2";
import { kindColor, useGraphTheme } from "./graphTheme";
import { layoutNetwork } from "./layout";
import type { NetworkPayload } from "./types";

/** A quiet static drawing of the linked clusters; the full network is one click away. */
function Thumbnail({ data }: { data: NetworkPayload }) {
  const t = useGraphTheme();
  const lay = useMemo(() => {
    const l = layoutNetwork({ ...data, applications: data.applications.filter((a) => a.cluster) }, "evidence");
    const xs = l.nodes.map((n) => n.x);
    const ys = l.nodes.map((n) => n.y);
    return { ...l, x0: Math.min(...xs) - 30, y0: Math.min(...ys) - 30, w: Math.max(...xs) - Math.min(...xs) + 60, h: Math.max(...ys) - Math.min(...ys) + 60 };
  }, [data]);
  const pos = new Map(lay.nodes.map((n) => [n.id, n]));
  return (
    <svg viewBox={`${lay.x0} ${lay.y0} ${lay.w} ${lay.h}`} className="block h-28 w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {lay.edges.map((e) => {
        const a = pos.get(e.source);
        const b = pos.get(e.target);
        if (!a || !b) return null;
        return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={t.line2} strokeWidth={5} />;
      })}
      {lay.nodes.map((n) =>
        n.kind === "application" ? (
          <circle key={n.id} cx={n.x} cy={n.y} r={22} fill={t.surface} stroke={t.ink3} strokeWidth={5} />
        ) : (
          <circle key={n.id} cx={n.x} cy={n.y} r={15} fill={kindColor(n.kind, t)} stroke={t.surface} strokeWidth={4} />
        ),
      )}
    </svg>
  );
}

export function NetworkSummaryBlock() {
  const q = useQuery({ queryKey: qk.integrityNetwork(), queryFn: () => api.integrityNetwork(), staleTime: 60_000 });
  const data = q.data;
  if (q.isPending) return <Skeleton className="h-48" rounded="lg" />;
  if (!data) return null;
  const s = data.stats;
  return (
    <Panel
      as="section"
      title="Linked applications"
      description={
        s.clusters
          ? `${pluralize(s.clusters, "linked cluster")} across ${pluralize(s.linked_applications, "application")}, joined by ${pluralize(s.shared_items, "shared item")}.`
          : "No two applications share evidence this year."
      }
      footer={
        <ButtonLink size="sm" variant="ghost" to="/integrity" trailingIcon={<ArrowRight aria-hidden />} className="-ml-2">
          Open the integrity network
        </ButtonLink>
      }
    >
      {s.clusters > 0 && (
        <div className="space-y-3">
          <Link to="/integrity" tabIndex={-1} aria-hidden className="block rounded-control border border-line bg-surface px-2 py-1 transition-colors duration-150 hover:border-line-2">
            <Thumbnail data={data} />
          </Link>
          <ul className="space-y-1.5">
            {data.clusters.slice(0, 3).map((c) => (
              <li key={c.id}>
                <Link to={`/integrity?node=${encodeURIComponent(c.applications[0])}`} className="line-clamp-2 text-xs text-ink-2 hover:text-ink hover:underline">
                  {c.summary}.
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
