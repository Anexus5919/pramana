import { Download, FileText, MessageSquareText, Play, RotateCcw, Send } from "lucide-react";
import { useState } from "react";
import {
  ActionMenu,
  ApplicationStatusBadge,
  Button,
  ButtonLink,
  Callout,
  Code,
  DataTable,
  DescriptionList,
  Dialog,
  Digest,
  Drawer,
  EmptyState,
  EvidenceClassLabel,
  EvidenceFrame,
  Field,
  IconButton,
  Input,
  MetaList,
  Page,
  PageHeader,
  Panel,
  PanelDivider,
  ReviewBadge,
  RuleOutcomeBadge,
  SearchInput,
  Section,
  SegmentedControl,
  SeverityIndicator,
  SimulatedTag,
  Skeleton,
  Stat,
  StatGroup,
  StatusBadge,
  Stepper,
  TabPanel,
  Tabs,
  Textarea,
  Toolbar,
  Tooltip,
  VerificationBadge,
  useToast,
  type Column,
} from "./index";

interface Row {
  id: string;
  name: string;
  status: string;
  open: number;
  high: number;
}

const ROWS: Row[] = [
  { id: "APP-2026-000107", name: "Panchganga Institute of Technology", status: "under_review", open: 13, high: 11 },
  { id: "APP-2026-000103", name: "Konkan Institute of Engineering and Management", status: "rectification_requested", open: 4, high: 2 },
  { id: "APP-2026-000101", name: "Shree Dnyaneshwar Institute of Technology", status: "rectified", open: 0, high: 0 },
];

const COLUMNS: Column<Row>[] = [
  { id: "name", header: "Institution", sortValue: (r) => r.name, cell: (r) => r.name },
  { id: "id", header: "Application", hideBelow: "md", cell: (r) => <Code>{r.id}</Code> },
  { id: "status", header: "Status", cell: (r) => <ApplicationStatusBadge status={r.status} /> },
  { id: "open", header: "Open findings", align: "right", sortValue: (r) => r.open, cell: (r) => r.open },
  {
    id: "high",
    header: "High or critical",
    align: "right",
    sortValue: (r) => r.high,
    cell: (r) => (r.high ? <span className="font-medium text-mismatch-fg">{r.high}</span> : <span className="text-ink-3">0</span>),
  },
];

const SCALE = [
  { cls: "text-2xl font-semibold", label: "30 / 36 semibold, rare: hero figures only" },
  { cls: "text-xl font-semibold", label: "24 / 32 semibold, page title, stat value" },
  { cls: "text-lg font-semibold", label: "20 / 28 semibold, dialog title, institution step title" },
  { cls: "text-md font-semibold", label: "16 / 24 semibold, section heading" },
  { cls: "text-base", label: "14 / 20 regular, body and UI default" },
  { cls: "text-sm", label: "13 / 20 regular, secondary text, table cells" },
  { cls: "text-xs", label: "12 / 16 regular, meta, captions, column headers" },
];

const SWATCHES = ["canvas", "surface", "surface-2", "line", "ink", "ink-3", "brand-solid", "brand-soft"];

/** Living reference for design system v2: every component with its real props. Route: /ui-kit. */
export default function Kit() {
  const toast = useToast();
  const [tab, setTab] = useState("components");
  const [view, setView] = useState("open");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Page>
      <PageHeader
        title="Design system v2"
        context={<MetaList items={["IBM Plex Sans and Plex Mono", "8-point grid", "Reference: frontend/DESIGN-v2.md"]} />}
        status={<StatusBadge tone="primary">Reference</StatusBadge>}
        secondary={
          <Button leadingIcon={<MessageSquareText aria-hidden />} onClick={() => setDrawer(true)}>
            Ask why
          </Button>
        }
        menu={[
          { id: "run", label: "Run validation", icon: <Play />, onSelect: () => toast({ title: "Validation started", tone: "info" }) },
          { id: "replay", label: "Replay latest run", icon: <RotateCcw />, onSelect: () => undefined },
          { id: "pack", label: "Export evidence pack", icon: <Download />, onSelect: () => undefined },
        ]}
        primary={
          <ActionMenu
            trigger="button"
            variant="primary"
            label="Decide"
            width={300}
            items={[
              {
                id: "rectify",
                label: "Request rectification",
                description: "Send a deficiency letter. The institution corrects and resubmits.",
                icon: <Send />,
                onSelect: () => setDialog(true),
              },
              {
                id: "outcome",
                label: "Record scrutiny outcome",
                description: "Record the authority's decision with a reason. Starts the re-verification watch.",
                icon: <FileText />,
                onSelect: () => setDialog(true),
              },
            ]}
          />
        }
      >
        <Tabs
          label="Kit sections"
          idBase="kit"
          value={tab}
          onChange={setTab}
          items={[
            { id: "components", label: "Components" },
            { id: "foundations", label: "Foundations" },
            { id: "states", label: "States", count: 3 },
          ]}
        />
      </PageHeader>

      {tab === "foundations" && (
        <TabPanel idBase="kit" value="foundations" className="space-y-8 pt-0">
          <Section title="Type scale" description="One family for UI, one mono for IDs, hashes, codes and document values. Weights 400, 500, 600 only.">
            <Panel>
              <div className="space-y-3">
                {SCALE.map((s) => (
                  <div key={s.cls} className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
                    <span className={s.cls}>Fire Safety Certificate</span>
                    <span className="text-xs text-ink-3">{s.label}</span>
                  </div>
                ))}
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <Code>APP-2026-000107 sha256:e8283cb375</Code>
                  <span className="text-xs text-ink-3">Plex Mono 13, IDs and document values only</span>
                </div>
              </div>
            </Panel>
          </Section>
          <Section title="Colour" description="Neutral surfaces. Violet only for the primary action, focus and selection. Status colours only for status.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {SWATCHES.map((c) => (
                <div key={c} className="text-xs text-ink-3">
                  <div className="mb-1.5 h-12 rounded-control border border-line" style={{ background: `var(--${c})` }} />
                  {c}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["verified", "mismatch", "expired", "pending", "unavail", "manual", "unchecked", "primary"] as const).map((t) => (
                <StatusBadge key={t} tone={t}>
                  {t}
                </StatusBadge>
              ))}
            </div>
          </Section>
        </TabPanel>
      )}

      {tab === "states" && (
        <TabPanel idBase="kit" value="states" className="space-y-6 pt-0">
          <Callout tone="info" title="Validation is running" role="status" action={<Button size="sm">View progress</Button>}>
            Reading 3 of 8 documents. You can keep working; results appear when the run finishes.
          </Callout>
          <Callout tone="warning" title="Rectification requested">
            The institution was asked to correct 2 items on 23 Oct 2026.
          </Callout>
          <Callout tone="neutral">Decision support only. Pramana does not approve or reject; officials decide.</Callout>
          <Panel padding="none">
            <EmptyState
              icon={<FileText />}
              title="No findings on this run"
              description="Every rule was met and every verification answered. Record the scrutiny outcome when you are ready."
              action={<Button variant="primary">Record scrutiny outcome</Button>}
            />
          </Panel>
          <Panel>
            <div className="space-y-3">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </Panel>
        </TabPanel>
      )}

      {tab === "components" && (
        <TabPanel idBase="kit" value="components" className="space-y-8 pt-0">
          <StatGroup label="Example summary">
            <Stat label="Applications" value={11} hint="11 need attention" />
            <Stat label="Open findings" value={59} hint="Across 11 applications" />
            <Stat label="High or critical" value={41} tone="danger" hint="Each needs a decision with a reason" />
            <Stat label="Awaiting manual confirmation" value={3} hint={<span className="inline-flex items-center gap-1.5">1 awaiting the issuer <SimulatedTag /></span>} />
          </StatGroup>

          <Section title="Buttons" description="One primary per screen. Secondary for the next most likely action. Everything else in the More menu.">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary">Submit for review</Button>
              <Button>Replace file</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="danger">Dismiss finding</Button>
              <Button loading>Saving</Button>
              <Button size="sm">Small</Button>
              <Button size="lg" variant="primary">
                Large, institution primary
              </Button>
              <ButtonLink to="/dashboard">Router link</ButtonLink>
              <IconButton label="Download" icon={<Download />} variant="secondary" />
              <Tooltip content="Tooltips explain; they never hold the only copy of important text.">
                <Button variant="ghost">Hover for tooltip</Button>
              </Tooltip>
            </div>
          </Section>

          <Section title="Status, severity and evidence">
            <Panel>
              <div className="flex flex-wrap items-center gap-3">
                <ApplicationStatusBadge status="under_review" />
                <ApplicationStatusBadge status="rectification_requested" />
                <VerificationBadge status="verified" />
                <VerificationBadge status="mismatch_detected" />
                <VerificationBadge status="source_unavailable" />
                <ReviewBadge status="evidence_requested" />
                <RuleOutcomeBadge outcome="fail" />
                <RuleOutcomeBadge outcome="insufficient_evidence" />
                <SimulatedTag />
              </div>
              <PanelDivider label="Severity" />
              <div className="flex flex-wrap items-center gap-5">
                {["critical", "high", "medium", "low", "info"].map((s) => (
                  <SeverityIndicator key={s} severity={s} />
                ))}
              </div>
              <PanelDivider label="Evidence class" />
              <div className="flex flex-wrap items-center gap-5">
                {["cryptographic", "issuer", "record", "rule", "structural", "heuristic", "model"].map((c) => (
                  <EvidenceClassLabel key={c} cls={c} />
                ))}
              </div>
            </Panel>
          </Section>

          <Section title="Table with toolbar" description="Panel with padding none, a Toolbar, then the DataTable. Rows are links or open a drawer.">
            <Panel title="Applications" padding="none">
              <Toolbar
                className="px-5 pb-3"
                end={
                  <SegmentedControl
                    label="Show"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "open", label: "Open", count: 2 },
                      { value: "all", label: "All", count: 3 },
                    ]}
                  />
                }
              >
                <SearchInput value={q} onChange={setQ} label="Filter" placeholder="Filter" />
              </Toolbar>
              <div className="border-t border-line">
                <DataTable
                  label="Example applications"
                  rows={ROWS.filter((r) => (view === "open" ? r.open > 0 : true)).filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))}
                  columns={COLUMNS}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => setSelected(r.id)}
                  selectedKey={selected}
                  defaultSort={{ id: "open", dir: "desc" }}
                />
              </div>
            </Panel>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Description list" description="Inline layout, label left.">
              <DescriptionList
                items={[
                  { label: "AICTE ID", value: "1-5501010707", mono: true },
                  { label: "Category", value: "Extension of Approval" },
                  { label: "Report digest", value: <Digest value="e8283cb375a9d0f8081f" /> },
                  { label: "Society", value: null },
                ]}
              />
            </Panel>
            <Panel title="Stepper" description="Institution progress. One step is current or needs attention.">
              <Stepper
                label="Application progress"
                steps={[
                  { id: "details", label: "Details", status: "complete", description: "12 Dec 2025" },
                  { id: "documents", label: "Documents", status: "complete", description: "7 of 7" },
                  { id: "review", label: "AICTE review", status: "attention", description: "Action needed" },
                  { id: "decision", label: "Decision", status: "upcoming" },
                ]}
              />
              <PanelDivider />
              <Stepper
                orientation="vertical"
                label="Wizard steps"
                steps={[
                  { id: "c", label: "Category and year", status: "complete" },
                  { id: "p", label: "Programmes", status: "current" },
                  { id: "n", label: "Declared figures", status: "upcoming" },
                ]}
              />
            </Panel>
          </div>

          <Section title="Evidence frame">
            <EvidenceFrame
              title="Fire Safety Certificate"
              meta={<MetaList items={["fire_noc.pdf", "Page 1 of 1", "Digital text"]} />}
              toolbar={
                <>
                  <Button size="sm" variant="ghost">
                    Fields 5
                  </Button>
                  <Button size="sm" variant="ghost">
                    Findings 5
                  </Button>
                </>
              }
              footer="Boxes mark where each value was read. Select a finding to locate it."
            >
              <div className="mx-auto h-56 max-w-md rounded-sm border border-line bg-surface shadow-xs" />
            </EvidenceFrame>
          </Section>

          <Section title="Form fields">
            <Panel>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Reason" hint="At least 10 characters. Shown in the audit log.">
                  <Textarea rows={3} placeholder="Why this decision" />
                </Field>
                <Field label="Reference number">
                  <Input placeholder="FES/KOL/2025/04519" />
                </Field>
              </div>
            </Panel>
          </Section>
        </TabPanel>
      )}

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Record scrutiny outcome"
        description="Pramana records the decision; it never makes it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setDialog(false)}>
              Record outcome
            </Button>
          </>
        }
      >
        <Field label="Reason">
          <Textarea rows={3} />
        </Field>
      </Dialog>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Ask why" description="Answers cite the latest run only.">
        <div className="p-5 text-sm text-ink-2">Drawer content: the Ask why conversation, a finding detail or the run progress.</div>
      </Drawer>
    </Page>
  );
}
