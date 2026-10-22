import { Tag } from "../../components/ui/Badge";
import { fmtValue } from "../../lib/format";
import { humanize } from "../../lib/labels";
import type { Declared, Programme } from "../../types";

export const DECLARED_FIELDS: { key: string; label: string; unit?: string; type: "number" | "text" }[] = [
  { key: "faculty_count", label: "Faculty count", type: "number" },
  { key: "built_up_area_sqm", label: "Built-up area", unit: "sq m", type: "number" },
  { key: "land_area_acres", label: "Land area", unit: "acres", type: "number" },
  { key: "building_age_years", label: "Building age", unit: "years", type: "number" },
  { key: "administrative_area_sqm", label: "Administrative area", unit: "sq m", type: "number" },
  { key: "amenities_area_sqm", label: "Amenities area", unit: "sq m", type: "number" },
  { key: "internet_bandwidth_mbps", label: "Internet bandwidth", unit: "Mbps", type: "number" },
  { key: "fire_noc_number", label: "Fire NOC number", type: "text" },
  { key: "fee_transaction_id", label: "Fee transaction ID", type: "text" },
];

const KNOWN = new Set(["programmes", ...DECLARED_FIELDS.map((f) => f.key)]);

export function ProgrammesTable({ programmes }: { programmes: Programme[] }) {
  if (!programmes.length) return <p className="text-sm text-subtle-fg">No programmes declared.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-subtle/70 text-left text-[11px] tracking-wider text-subtle-fg uppercase">
            <th scope="col" className="px-2.5 py-1.5 font-semibold">Code</th>
            <th scope="col" className="px-2.5 py-1.5 font-semibold">Programme</th>
            <th scope="col" className="px-2.5 py-1.5 font-semibold">Level</th>
            <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">Approved</th>
            <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">Proposed</th>
            <th scope="col" className="px-2.5 py-1.5 font-semibold">Flags</th>
          </tr>
        </thead>
        <tbody>
          {programmes.map((p, i) => {
            const up = Number(p.proposed_intake) > Number(p.approved_intake);
            return (
              <tr key={`${p.code}-${i}`} className="border-t border-line">
                <td className="px-2.5 py-1.5 font-mono text-xs">{p.code}</td>
                <td className="px-2.5 py-1.5">{p.name}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap text-muted">
                  {p.level}
                  {p.duration_years ? <span className="text-subtle-fg">, {p.duration_years} y</span> : null}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtValue(p.approved_intake)}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">
                  <span className={up ? "font-semibold text-manual-fg" : undefined}>{fmtValue(p.proposed_intake)}</span>
                  {up && <span className="sr-only"> (increase requested)</span>}
                </td>
                <td className="px-2.5 py-1.5">
                  <span className="flex flex-wrap gap-1">
                    {p.core && <Tag>Core</Tag>}
                    {p.cs_allied && <Tag>CS / allied</Tag>}
                    {p.nba_accredited && <Tag>NBA claimed</Tag>}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DeclaredDataView({ declared }: { declared: Declared }) {
  const programmes = Array.isArray(declared.programmes) ? declared.programmes : [];
  const extras = Object.entries(declared).filter(([k]) => !KNOWN.has(k));
  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-1.5 text-xs font-medium text-muted">Programmes</h4>
        <ProgrammesTable programmes={programmes} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        {DECLARED_FIELDS.map((f) => (
          <div key={f.key} className="min-w-0">
            <dt className="text-xs text-subtle-fg">{f.label}</dt>
            <dd className="mt-0.5 truncate text-fg">
              {declared[f.key] === undefined || declared[f.key] === "" ? (
                <span className="text-subtle-fg">Not declared</span>
              ) : (
                <>
                  {fmtValue(declared[f.key])}
                  {f.unit && <span className="ml-1 text-xs text-subtle-fg">{f.unit}</span>}
                </>
              )}
            </dd>
          </div>
        ))}
        {extras.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-subtle-fg">{humanize(k)}</dt>
            <dd className="mt-0.5 truncate text-fg" title={fmtValue(v)}>
              {fmtValue(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
