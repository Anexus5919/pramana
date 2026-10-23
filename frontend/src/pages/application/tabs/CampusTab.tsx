import { useQuery } from "@tanstack/react-query";
import { Camera, Crosshair, WifiOff } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { api, qk } from "../../../api";
import { cn } from "../../../ui/cn";
import { Card, SectionCard } from "../../../ui/Card";
import { fadeUp, stagger } from "../../../ui/motion";
import { Skeleton } from "../../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../../ui/States";
import { Segmented } from "../../../ui/Tabs";
import { CampusMap } from "../campus/CampusMap";
import { CampusPlot } from "../campus/CampusPlot";
import { distanceLabel, fmtKm, mapPoints, type MapPoint } from "../campus/geo";
import { PhotoCard } from "../campus/PhotoCard";
import { useWorkspace } from "../context";
import { CautionNote, PaneLabel } from "../parts";

type View = "map" | "plot";

function Swatch({ p }: { p: MapPoint }) {
  if (p.kind === "photo")
    return <span aria-hidden className={cn("mt-1 size-3 shrink-0 rounded-full border-2 border-surface ring-1", p.outside ? "bg-mismatch-dot ring-mismatch-dot" : "bg-verified-dot ring-verified-dot")} />;
  return (
    <span
      aria-hidden
      className={cn("mt-1 size-3 shrink-0 rounded-[2px]", p.kind === "record" ? "bg-brand-500" : p.outside ? "rotate-45 bg-manual-dot" : "rotate-45 bg-ev-3")}
    />
  );
}

export function CampusTab() {
  const { app } = useWorkspace();
  const q = useQuery({ queryKey: qk.campus(app.id), queryFn: () => api.campus(app.id), staleTime: 60_000 });
  const [view, setView] = useState<View>("map");
  const [tilesFailed, setTilesFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const data = q.data;
  const points = useMemo(() => (data ? mapPoints(data) : []), [data]);

  const onTilesFailed = useCallback(() => {
    setTilesFailed(true);
    setView("plot");
  }, []);
  // Picking a point on the map brings its photo card into view; "Locate on map" on a card does the reverse
  const select = useCallback((id: string, reveal: "card" | "map" = "card") => {
    setSelected(id);
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const el = reveal === "map" ? document.getElementById("campus-map") : id !== "record" && id !== "declared" ? document.getElementById(`photo-${id}`) : null;
    el?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest" });
  }, []);

  if (q.isPending)
    return (
      <div role="status" aria-live="polite" className="grid gap-5">
        <span className="sr-only">Loading the campus map</span>
        <Skeleton className="h-[440px]" rounded="lg" />
        <Skeleton className="h-72" rounded="lg" />
      </div>
    );
  if (q.error || !data) return <ErrorState error={q.error} title="Could not load the campus map" onRetry={() => void q.refetch()} retrying={q.isFetching} />;

  const canMap = !!data.tiles && !!data.record;
  const shown: View = canMap ? view : "plot";
  const located = data.photos.filter((p) => p.exif.gps).length;

  return (
    <div className="grid gap-6">
      <SectionCard
        eyebrow="Officer only"
        title="Campus location"
        description="The campus on record, the point this application's satellite map declares, and where each photo says it was taken."
        actions={
          canMap ? (
            <Segmented<View>
              label="Map display"
              value={shown}
              onChange={setView}
              options={[
                { value: "map", label: "Map" },
                { value: "plot", label: "Plot" },
              ]}
            />
          ) : undefined
        }
      >
        {tilesFailed && (
          <p className="mb-3 flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
            <WifiOff aria-hidden className="size-4 shrink-0 text-ink-3" />
            Map tiles could not be loaded, so this is a plain plot with the same points and distances.
          </p>
        )}
        {!data.record ? (
          <EmptyState compact title="No campus location on record" description="The institution master has no coordinates, so distances cannot be measured." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div id="campus-map" className="min-w-0 scroll-mt-32">
              {shown === "map" ? (
                <CampusMap data={data} points={points} selected={selected} onSelect={select} onTilesFailed={onTilesFailed} />
              ) : (
                <CampusPlot data={data} points={points} selected={selected} onSelect={select} />
              )}
            </div>
            <div className="min-w-0">
              <PaneLabel>Points and distances</PaneLabel>
              <ul className="space-y-1.5">
                {points.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => select(p.id)}
                      aria-pressed={selected === p.id}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors",
                        selected === p.id ? "border-brand-300 bg-brand-soft/60" : "border-line bg-surface hover:border-brand-200",
                      )}
                    >
                      <Swatch p={p} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{p.label}</span>
                        <span className={cn("block text-xs", p.outside ? "font-semibold text-mismatch-fg" : "text-ink-3")}>{distanceLabel(p)}</span>
                        {p.kind === "declared" && data.map_tolerance_km !== null && (
                          <span className="block text-[11px] text-ink-4">Tolerance {fmtKm(data.map_tolerance_km)} (rule XD-SATMAP-LOCATION)</span>
                        )}
                        {p.kind === "photo" && (
                          <span className="block text-[11px] text-ink-4">
                            {p.outside ? `Beyond the ${data.threshold_km} km geotag threshold` : `Within the ${data.threshold_km} km geotag threshold`}
                          </span>
                        )}
                      </span>
                      <Crosshair aria-hidden className="mt-1 size-3.5 shrink-0 text-ink-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {data.photos.length > located && (
                <p className="mt-2 text-xs text-ink-3">
                  {data.photos.length - located} of {data.photos.length} photos carry no GPS position and are not plotted.
                </p>
              )}
              <CautionNote className="mt-3">
                EXIF positions can be edited or stripped, and indoor GPS drifts. Distances are straight lines from the campus on record.
              </CautionNote>
            </div>
          </div>
        )}
      </SectionCard>

      <section aria-labelledby="campus-photos">
        <div className="mb-3 flex items-center gap-2">
          <Camera aria-hidden className="size-4 text-ink-3" />
          <h2 id="campus-photos" className="font-display text-md font-semibold tracking-title text-ink">
            Photos <span className="tabular text-ink-3">{data.photos.length}</span>
          </h2>
        </div>
        {data.photos.length === 0 ? (
          <Card padded>
            <EmptyState compact title="No photos in this application" description="Infrastructure photos are optional. When uploaded, their metadata, credentials and contents appear here." />
          </Card>
        ) : (
          <motion.div className="grid gap-5" variants={stagger(0.08)} initial="hidden" animate="show">
            {data.photos.map((p) => (
              <motion.div key={p.document_id} variants={fadeUp}>
                <PhotoCard photo={p} data={data} appId={app.id} selected={selected === p.document_id} onLocate={() => select(p.document_id, "map")} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>
    </div>
  );
}
