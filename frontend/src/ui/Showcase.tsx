import { ArrowRight, Download, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ApiError } from "../api";
import { EVIDENCE_CLASSES, PIPELINE_STAGES, SEVERITIES, stageLabel, VERIFICATION_STATUSES } from "../lib/labels";
import {
  Badge,
  BlockProgress,
  Button,
  Checkbox,
  Counter,
  Dialog,
  Digest,
  EmptyState,
  ErrorState,
  EvidenceClassChip,
  Field,
  IconButton,
  Input,
  Kbd,
  KeyValue,
  PageHeader,
  SectionCard,
  Segmented,
  Select,
  SeverityMeter,
  Sheet,
  Skeleton,
  StatusCube,
  StatusPill,
  Switch,
  Tabs,
  Tag,
  Textarea,
  Tooltip,
  useToast,
  Card,
} from "./index";

/** Dev-only gallery of the primitives at /ui-kit. */
export default function Showcase() {
  const toast = useToast();
  const [tab, setTab] = useState("findings");
  const [seg, setSeg] = useState<"all" | "open">("all");
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState(0);
  const st = VERIFICATION_STATUSES[status % VERIFICATION_STATUSES.length];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Foundation"
        title="Interface kit"
        description="Every primitive in src/ui with its interaction states. Development builds only."
        actions={<Tag variant="demo">Dev only</Tag>}
      />

      <SectionCard title="Buttons" description="Primary, secondary, ghost, soft and danger in three sizes.">
        <div className="flex flex-wrap items-center gap-3">
          <Button magnetic trailingIcon={<ArrowRight />}>Primary magnetic</Button>
          <Button variant="secondary" leadingIcon={<Download />}>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="soft" leadingIcon={<Plus />}>Soft</Button>
          <Button variant="danger" leadingIcon={<Trash2 />}>Danger</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <IconButton label="Add" icon={<Plus />} variant="secondary" />
          <Kbd>Ctrl</Kbd>
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Status" description="Click the pill to cycle and watch the cube cross-fade.">
          <div className="flex flex-wrap gap-2">
            {VERIFICATION_STATUSES.map((s) => (
              <StatusPill key={s} status={s} />
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4">
            <button type="button" onClick={() => setStatus((n) => n + 1)} className="rounded-full">
              <StatusPill status={st} size="md" explain={false} />
            </button>
            <StatusCube status={st} size={28} label />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="primary">Primary</Badge>
            <Badge tone="verified" variant="outline">Outline</Badge>
            <Badge tone="manual" variant="dot">Dot</Badge>
            <Tag>Neutral</Tag>
            <Tag variant="brand">Brand</Tag>
            <Tag variant="demo">Simulated</Tag>
            <Tag variant="mono">APP-2026-000107</Tag>
          </div>
        </SectionCard>

        <SectionCard title="Severity and evidence">
          <div className="flex flex-wrap gap-4">
            {SEVERITIES.map((s) => (
              <SeverityMeter key={s} severity={s} label size="md" />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {EVIDENCE_CLASSES.map((c) => (
              <EvidenceClassChip key={c} cls={c} />
            ))}
          </div>
          <div className="mt-5">
            <BlockProgress
              showLabels
              stages={PIPELINE_STAGES.map((s, i) => ({
                key: s,
                label: stageLabel[s],
                state: i < 3 ? "done" : i === 3 ? "current" : i === 5 ? "failed" : "pending",
                ms: i < 3 ? 120 * (i + 1) : undefined,
              }))}
            />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Tabs and filters">
        <Tabs
          label="Workspace"
          value={tab}
          onChange={setTab}
          items={[
            { id: "overview", label: "Overview" },
            { id: "findings", label: "Findings", count: 11, attention: true },
            { id: "documents", label: "Documents", count: 14 },
            { id: "audit", label: "Audit" },
          ]}
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Tabs
            variant="pill"
            label="Pill tabs"
            value={tab}
            onChange={setTab}
            items={[
              { id: "overview", label: "Overview" },
              { id: "findings", label: "Findings" },
              { id: "documents", label: "Documents" },
            ]}
          />
          <Segmented
            label="Filter"
            value={seg}
            onChange={setSeg}
            options={[
              { value: "all", label: "All", count: 38 },
              { value: "open", label: "Open", count: 12 },
            ]}
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Fields">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fire NOC number" hint="As printed on the certificate">
              <Input placeholder="FES/KOL/2025/04519" />
            </Field>
            <Field label="Intake" error="Must be a whole number" required>
              <Input defaultValue="sixty" />
            </Field>
            <Field label="Category">
              <Select defaultValue="EOA">
                <option value="EOA">Extension of approval</option>
                <option value="NEW">New institution</option>
              </Select>
            </Field>
            <Field label="Reason">
              <Textarea rows={2} placeholder="Recorded in the history" />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            <Checkbox checked={checked} onChange={setChecked} label="Include superseded" description="Show earlier rounds" />
            <Switch checked={on} onChange={setOn} label="Issuer available" />
          </div>
        </SectionCard>

        <SectionCard title="Data">
          <KeyValue
            items={[
              { label: "Report digest", value: <Digest value="30c9dddd42d84a03fb359189ed8d6202e4f3065fae80349162049bbaf8c1fb44" label="report digest" /> },
              { label: "Open findings", value: <Counter value={1234} /> },
              { label: "AICTE ID", value: "1-5501010707", mono: true },
              { label: "With tooltip", value: <Tooltip content="Tooltips work on focus and hover."><span tabIndex={0} className="underline decoration-dotted">Hover me</span></Tooltip> },
            ]}
          />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-2/3" rounded="sm" />
            <Skeleton className="h-4 w-1/2" rounded="sm" />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card interactive padded>
          <div className="eyebrow">Interactive card</div>
          <p className="mt-2 text-sm text-ink-2">Move the cursor over this card to see the spotlight.</p>
        </Card>
        <Card padded>
          <EmptyState compact title="Nothing to flag" description="No open findings on this run." />
        </Card>
        <ErrorState error={new ApiError(503, "The issuer registry did not respond.", null)} title="Could not verify" onRetry={() => undefined} />
      </div>

      <SectionCard title="Overlays">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDialog(true)}>Open dialog</Button>
          <Button variant="secondary" onClick={() => setSheet(true)}>Open sheet</Button>
          <Button variant="ghost" onClick={() => toast.success("Finding dismissed", "Reason recorded in the history.")}>Success toast</Button>
          <Button variant="ghost" onClick={() => toast.error("Could not save", "The server returned 409.")}>Error toast</Button>
          <Button variant="ghost" onClick={() => toast.info("Validation started")}>Info toast</Button>
        </div>
      </SectionCard>

      <EmptyState sky title="Sky empty state" description="Use the sky backdrop for prominent empty states such as a first run." action={<Button>Run validation</Button>} />

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Dismiss finding"
        description="A reason is required and appears in the history immediately."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={() => setDialog(false)}>Dismiss</Button>
          </>
        }
      >
        <Field label="Reason">
          <Textarea rows={3} data-autofocus />
        </Field>
      </Dialog>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Finding detail" description="Opens from the right, where its trigger lives.">
        <div className="p-5">
          <EmptyState compact title="Sheet body" />
        </div>
      </Sheet>
    </div>
  );
}
