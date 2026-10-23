import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../api";
import type { CampusPayload } from "../../../types";
import { Button } from "../../../ui2";
import "./campus.css";
import { bearing, distanceLabel, fmtKm, NEAR_KM, type MapPoint } from "./geo";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

// Flat markers: the campus on record is a solid square, the declared map point a diamond, photos are round thumbnails
// CSS variables only resolve in style, not in SVG presentation attributes
const SQUARE = (fill: string, diamond = false) =>
  `<span aria-hidden="true" style="display:block;width:16px;height:16px;border-radius:3px;border:2px solid var(--surface);background:${fill};${diamond ? "transform:rotate(45deg);" : ""}"></span>`;

function icon(p: MapPoint): L.DivIcon {
  if (p.kind === "record") return L.divIcon({ className: "", html: SQUARE("var(--brand-solid)"), iconSize: [16, 16], iconAnchor: [8, 8] });
  if (p.kind === "declared")
    return L.divIcon({ className: "", html: SQUARE(p.outside ? "var(--manual-dot)" : "var(--ev-3)", true), iconSize: [16, 16], iconAnchor: [8, 8] });
  const ring = p.outside ? "var(--mismatch-dot)" : "var(--verified-dot)";
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:36px;height:36px;border-radius:999px;border:3px solid ${ring};overflow:hidden;background:var(--surface-2)"><img src="${api.photoUrl(p.id)}" alt="" style="width:100%;height:100%;object-fit:cover"/></span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function popup(p: MapPoint): string {
  const where = `<div style="color:var(--ink-3);font-size:12px">${esc(distanceLabel(p))}</div>`;
  if (p.kind !== "photo" || !p.photo) return `<strong>${esc(p.label)}</strong>${where}<div style="font-family:var(--ff-mono, monospace);font-size:12px;color:var(--ink-3)">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div>`;
  const ph = p.photo;
  return `<div style="width:220px"><img src="${api.photoUrl(ph.document_id)}" alt="Photo ${esc(ph.filename)}" style="width:100%;border-radius:6px;display:block;margin-bottom:6px"/><strong>${esc(ph.filename)}</strong>${where}<div style="color:var(--ink-3);font-size:12px">Captured ${esc(ph.exif.captured ?? "unknown")}${ph.exif.camera ? ` on ${esc(ph.exif.camera)}` : ""}</div></div>`;
}

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** OpenStreetMap tiles through plain Leaflet. Calls onTilesFailed when tiles cannot load, so the tab can show the plot. */
export function CampusMap({
  data,
  points,
  selected,
  onSelect,
  onTilesFailed,
}: {
  data: CampusPayload;
  points: MapPoint[];
  selected: string | null;
  onSelect: (id: string) => void;
  onTilesFailed: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<Record<string, L.Marker>>({});
  const failed = useRef(onTilesFailed);
  const select = useRef(onSelect);
  failed.current = onTilesFailed;
  select.current = onSelect;
  const far = useMemo(() => points.filter((p) => (p.km ?? 0) > NEAR_KM), [points]);
  const home = useRef<L.LatLngBounds | null>(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const rec = data.record;
    if (!el.current || !rec || !data.tiles) return;
    const still = reduced();
    const map = L.map(el.current, {
      scrollWheelZoom: false,
      keyboard: true,
      zoomAnimation: !still,
      fadeAnimation: !still,
      markerZoomAnimation: !still,
    });
    mapRef.current = map;
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    // OSM tile policy: attribution shown, no bulk or prefetch, and a referrer even though the app sends no-referrer
    const tiles = L.tileLayer(data.tiles.url, {
      maxZoom: data.tiles.max_zoom,
      attribution: data.tiles.attribution,
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    let loaded = 0;
    let errors = 0;
    tiles.on("tileload", () => (loaded += 1));
    tiles.on("tileerror", () => {
      errors += 1;
      if (errors >= 4 && loaded === 0) failed.current();
    });
    const timer = window.setTimeout(() => loaded === 0 && failed.current(), 9000);
    tiles.addTo(map);

    const center: L.LatLngTuple = [rec.lat, rec.lon];
    L.circle(center, { radius: data.threshold_km * 1000, className: "pr-ring", interactive: false }).addTo(map);
    L.marker([rec.lat + data.threshold_km / 110.57, rec.lon], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: "pr-ring-label", html: `${data.threshold_km} km geotag threshold`, iconSize: [160, 14], iconAnchor: [80, 16] }),
    }).addTo(map);
    if (data.declared && data.map_tolerance_km)
      L.circle(center, { radius: data.map_tolerance_km * 1000, className: "pr-ring pr-ring-tol", interactive: false }).addTo(map);

    // The ring has no projection until the map has a view, so take its bounds from the centre
    const bounds = L.latLng(center).toBounds(data.threshold_km * 2000);
    for (const p of points) {
      if (p.kind !== "record") {
        const line = L.polyline([center, [p.lat, p.lon]], { className: p.outside ? "pr-line pr-line-outside" : "pr-line", interactive: false }).addTo(map);
        // Labels only where they do not sit on top of the campus marker itself
        if ((p.km ?? 0) <= NEAR_KM && (p.km ?? 0) >= 0.25) line.bindTooltip(fmtKm(p.km), { permanent: true, direction: "center", className: "pr-dist" });
      }
      const m = L.marker([p.lat, p.lon], { icon: icon(p), title: `${p.label}: ${distanceLabel(p)}`, alt: p.label, riseOnHover: true, keyboard: true })
        .bindPopup(popup(p), { maxWidth: 260 })
        .on("click", () => select.current(p.id))
        .addTo(map);
      markers.current[p.id] = m;
      if ((p.km ?? 0) <= NEAR_KM) bounds.extend([p.lat, p.lon]);
    }
    home.current = bounds;
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: false });
    return () => {
      window.clearTimeout(timer);
      markers.current = {};
      mapRef.current = null;
      map.remove();
    };
  }, [data, points]);

  useEffect(() => {
    const map = mapRef.current;
    const p = points.find((x) => x.id === selected);
    if (!map || !p) return;
    const m = markers.current[p.id];
    if ((p.km ?? 0) > NEAR_KM) {
      map.flyToBounds(L.latLngBounds([[p.lat, p.lon], [data.record!.lat, data.record!.lon]]), { padding: [60, 60], animate: !reduced() });
      setWide(true);
    } else map.panTo([p.lat, p.lon], { animate: !reduced() });
    m?.openPopup();
  }, [selected, points, data.record]);

  const showAll = () => {
    const map = mapRef.current;
    if (!map || !data.record) return;
    const b = L.latLngBounds([[data.record.lat, data.record.lon]]);
    for (const p of points) b.extend([p.lat, p.lon]);
    map.flyToBounds(b, { padding: [50, 50], animate: !reduced() });
    setWide(true);
  };
  const backHome = () => {
    if (mapRef.current && home.current) mapRef.current.flyToBounds(home.current, { padding: [40, 40], maxZoom: 16, animate: !reduced() });
    setWide(false);
  };

  return (
    <div className="pr-map relative overflow-hidden rounded-control border border-line">
      <div ref={el} className="h-[440px] w-full" role="region" aria-label="Campus map: campus on record, declared map point and photo geotags" />
      {far.length > 0 && data.record && wide && (
        <Button size="sm" variant="secondary" leadingIcon={<Minimize2 />} onClick={backHome} className="absolute top-3 right-3 z-[1000]">
          Back to the campus
        </Button>
      )}
      {far.length > 0 && data.record && !wide && (
        <div className="absolute top-3 right-3 z-[1000] max-w-[min(320px,calc(100%-90px))] rounded-card border border-line bg-surface p-3 shadow-lg">
          <p className="text-sm font-medium text-ink">
            {far.length === 1 ? "1 point is" : `${far.length} points are`} outside this view
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-ink-3">
            {far.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onSelect(p.id)} className="rounded text-left underline-offset-2 hover:text-ink hover:underline focus-visible:text-ink">
                  {p.label}: {fmtKm(p.km)} {bearing([data.record!.lat, data.record!.lon], [p.lat, p.lon])}
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="secondary" leadingIcon={<Maximize2 />} onClick={showAll} className="mt-2">
            Show all points
          </Button>
        </div>
      )}
    </div>
  );
}
