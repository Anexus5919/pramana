import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { api, qk } from "../../../../api";
import { cn, Callout, Code, EmptyState, ErrorState, Panel, SegmentedControl, Skeleton } from "../../../../ui2";
import { CampusMap } from "../../campus/CampusMap";
import { CampusPlot } from "../../campus/CampusPlot";
import { distanceLabel, fmtKm, mapPoints, type MapPoint } from "../../campus/geo";
import { PhotoCard } from "../../campus/PhotoCard";
import { useWorkspace } from "../../context";

type Display = "map" | "plot";

function Swatch({ p }: { p: MapPoint }) {
  if (p.kind === "photo")
    return <span aria-hidden className={cn("mt-1 size-3 shrink-0 rounded-full border-2 border-surface", p.outside ? "bg-mismatch-dot" : "bg-verified-dot")} />;
  return (
    <span
      aria-hidden
      className={cn("mt-1 size-3 shrink-0 rounded-[2px]", p.kind === "record" ? "bg-brand-solid" : p.outside ? "rotate-45 bg-manual-dot" : "rotate-45 bg-ev-3")}
    />
  );
}

/** Where the campus is on record, where its map and photos say it is, and what each photo shows. */
export function CampusView() {
  const { app } = useWorkspace();
  const q = useQuery({ queryKey: qk.campus(app.id), queryFn: () => api.campus(app.id), staleTime: 60_000 });
  const [display, setDisplay] = useState<Display>("map");
  const [tilesFailed, setTilesFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const data = q.data;
  const points = useMemo(() => (data ? mapPoints(data) : []), [data]);

  const onTilesFailed = useCallback(() => {
    setTilesFailed(true);
    setDisplay("plot");
  }, []);
  // Picking a point brings its photo panel into view; "Locate on map" on a photo does the reverse
  const select = useCallback((id: string, reveal: "card" | "map" = "card") => {
    setSelected(id);
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const el = reveal === "map" ? document.getElementById("campus-map") : id !== "record" && id !== "declared" ? document.getElementById(`photo-${id}`) : null;
    el?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest" });
  }, []);

  if (q.isPending)
    return (
      <div role="status" className="space-y-6">
        <span className="sr-only">Loading the campus location and photos</span>
        <Skeleton className="h-[520px]" />
        <Skeleton className="h-72" />
      </div>
    );
  if (q.error || !data) return <ErrorState error={q.error} title="Could not load the campus location" onRetry={() => void q.refetch()} retrying={q.isFetching} />;

  const canMap = !!data.tiles && !!data.record;
  const shown: Display = canMap ? display : "plot";
  const located = data.photos.filter((p) => p.exif.gps).length;

  return (
    <div className="space-y-6">
      <Panel
        title="Location"
        description="The campus on record, the point this application's satellite map declares, and where each photo says it was taken."
        actions={
          canMap ? (
            <SegmentedControl
              size="sm"
              label="Location display"
              value={shown}
              onChange={(v) => setDisplay(v as Display)}
              options={[
                { value: "map", label: "Map" },
                { value: "plot", label: "Plot" },
              ]}
            />
          ) : undefined
        }
      >
        {!data.record ? (
          <EmptyState size="sm" title="No campus location on record" description="The institution master has no coordinates, so distances cannot be measured." />
        ) : (
          <div className="space-y-4">
            {tilesFailed && <p className="text-sm text-ink-3">Map tiles could not be loaded, so this is a plain plot with the same points and distances.</p>}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div id="campus-map" className="min-w-0 scroll-mt-24">
                {shown === "map" ? (
                  <CampusMap data={data} points={points} selected={selected} onSelect={select} onTilesFailed={onTilesFailed} />
                ) : (
                  <CampusPlot data={data} points={points} selected={selected} onSelect={select} />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="mb-2 text-sm font-medium text-ink">Points and distances</h3>
                <ul className="-mx-2 space-y-0.5">
                  {points.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => select(p.id)}
                        aria-pressed={selected === p.id}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-control px-2 py-2 text-left transition-colors duration-150",
                          selected === p.id ? "bg-brand-soft" : "hover:bg-surface-2",
                        )}
                      >
                        <Swatch p={p} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{p.label}</span>
                          <span className={cn("block text-xs", p.outside ? "font-medium text-mismatch-fg" : "text-ink-3")}>{distanceLabel(p)}</span>
                          {p.kind === "declared" && data.map_tolerance_km !== null && (
                            <span className="block text-xs text-ink-3">
                              Tolerance {fmtKm(data.map_tolerance_km)}, rule <Code className="text-xs">XD-SATMAP-LOCATION</Code>
                            </span>
                          )}
                          {p.kind === "photo" && (
                            <span className="block text-xs text-ink-3">
                              {p.outside ? `Beyond the ${data.threshold_km} km geotag threshold` : `Within the ${data.threshold_km} km geotag threshold`}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {data.photos.length > located && (
                  <p className="mt-2 text-xs text-ink-3">
                    {data.photos.length - located} of {data.photos.length} photos carry no GPS position and are not plotted.
                  </p>
                )}
              </div>
            </div>
            <Callout tone="neutral">EXIF positions can be edited or stripped, and indoor GPS drifts. Distances are straight lines from the campus on record.</Callout>
          </div>
        )}
      </Panel>

      {data.photos.length === 0 ? (
        <Panel title="Photos">
          <EmptyState
            size="sm"
            title="No photos in this application"
            description="Infrastructure photos are optional. When uploaded, their metadata, credentials and contents appear here."
          />
        </Panel>
      ) : (
        data.photos.map((p) => (
          <PhotoCard key={p.document_id} photo={p} data={data} appId={app.id} selected={selected === p.document_id} onLocate={() => select(p.document_id, "map")} />
        ))
      )}
    </div>
  );
}
