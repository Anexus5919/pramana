import { Link } from "react-router-dom";
import { fmtDateTime } from "../../lib/format";
import { roleLabel } from "../../lib/labels";
import { workspacePath } from "../../shell/nav";
import type { AuditEvent } from "../../types";
import { Callout, DescriptionList, Digest, Drawer, PanelDivider, type DescriptionItem } from "../../ui2";
import { actionLabel, type Recomputed } from "./chain";

const HASHLIKE = /^[0-9a-f]{40,}$/i;

function detailText(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (Array.isArray(v)) return v.length ? v.map(detailText).join(", ") : "None";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function detailLabel(k: string): string {
  const s = k.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Who did it, in plain words; system events carry no role. */
export function actorRole(e: AuditEvent): string | null {
  if (!e.actor_role || e.actor_role === "system") return null;
  return roleLabel[e.actor_role] ?? e.actor_role;
}

/** Details of one chained event: what happened, its own fields and the two hashes that link it. */
export function EventDrawer({ event, check, onClose }: { event: AuditEvent | null; check: Recomputed | undefined; onClose: () => void }) {
  const e = event;
  const details: DescriptionItem[] = Object.entries(e?.details ?? {}).map(([k, v]) => {
    const text = detailText(v);
    return HASHLIKE.test(text)
      ? { label: detailLabel(k), value: <Digest value={text} label={detailLabel(k)} head={12} tail={8} /> }
      : { label: detailLabel(k), value: text, mono: typeof v === "string" && /[-_/.]/.test(text) && !/\s/.test(text) };
  });
  return (
    <Drawer
      open={!!e}
      onClose={onClose}
      width={520}
      title={e ? `Event #${e.seq}` : "Event"}
      description={e ? actionLabel(e.action) : undefined}
    >
      {e && (
        <div className="space-y-6 p-5">
          {check && check.state !== "ok" && (
            <Callout tone="danger" title={check.state === "hash" ? "Stored hash does not match its content" : "Does not point at the previous event"}>
              {check.state === "hash"
                ? "Recomputing this event gives a different hash, so it changed after it was recorded."
                : "Its previous hash is not the hash of the event before it, so an event was changed or removed."}
            </Callout>
          )}
          <DescriptionList
            labelWidth={132}
            items={[
              {
                label: "Action",
                value: (
                  <span className="flex flex-col">
                    <span>{actionLabel(e.action)}</span>
                    <code className="font-mono text-xs text-ink-3">{e.action}</code>
                  </span>
                ),
              },
              { label: "Actor", value: e.actor, hint: actorRole(e) ?? undefined },
              { label: "Time", value: fmtDateTime(e.ts) },
              { label: "Object", value: e.object_id ? `${e.object_type} ${e.object_id}` : e.object_type, mono: !!e.object_id },
              {
                label: "Application",
                value: e.application_id ? (
                  <Link to={workspacePath(e.application_id)} className="rounded font-mono text-ink underline-offset-2 hover:underline">
                    {e.application_id}
                  </Link>
                ) : null,
                hidden: !e.application_id,
              },
            ]}
          />
          {details.length > 0 && (
            <div>
              <PanelDivider label="Details" className="mt-0" />
              <DescriptionList labelWidth={132} items={details} />
            </div>
          )}
          <div>
            <PanelDivider label="Chain link" className="mt-0" />
            <DescriptionList
              labelWidth={132}
              items={[
                { label: "Previous hash", value: <Digest value={e.prev_hash} label="Previous hash" head={12} tail={8} />, hint: "The hash of the event before this one" },
                { label: "Own hash", value: <Digest value={e.hash} label="Own hash" head={12} tail={8} />, hint: "SHA-256 of the previous hash plus this event" },
                {
                  label: "Recomputed",
                  value: check ? <Digest value={check.computed} label="Recomputed hash" head={12} tail={8} /> : null,
                  hidden: !check || check.state === "ok",
                },
              ]}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
