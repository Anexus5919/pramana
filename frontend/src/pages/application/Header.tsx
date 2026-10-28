import { ClipboardList, FileArchive, FileWarning, Gavel, History, MessageSquareText, Play, ScrollText } from "lucide-react";
import { roundPhrase } from "../../lib/labels";
import { WORKSPACE_SECTIONS, workspacePath, type WorkspaceSection } from "../../shell/nav";
import type { ApplicationDetail } from "../../types";
import { ActionMenu, ApplicationStatusBadge, Button, Code, MetaList, PageHeader, Skeleton, Tabs, type ActionMenuItem } from "../../ui2";

export interface HeaderProps {
  app: ApplicationDetail;
  section: WorkspaceSection;
  /** Open findings for the Findings tab count; undefined while findings load */
  openCount: number | undefined;
  /** Any open finding is high or critical */
  openHigh: boolean;
  validating: boolean;
  askOpen: boolean;
  /** Bumped to open the Decide menu, e.g. from a Drishti link */
  decideSignal?: number;
  onValidate?: () => void;
  onReplay?: () => void;
  onPack?: () => void;
  /** Opens the inspection brief for the Expert Visit Committee (officer) */
  onBrief?: () => void;
  onAsk?: () => void;
  onRectify?: () => void;
  onOutcome?: () => void;
  /** Threads where the institution wrote last, for the Rectification tab count */
  awaitingReply?: number;
  /** Review requests without a cell reply; recording the outcome waits for them */
  reviewPending?: number;
}

/** Institution, one status, one context line, Ask why, More actions and the one primary action: Decide. */
export function WorkspaceHeader({
  app,
  section,
  openCount,
  openHigh,
  validating,
  askOpen,
  decideSignal,
  onValidate,
  onReplay,
  onPack,
  onBrief,
  onAsk,
  onRectify,
  onOutcome,
  awaitingReply,
  reviewPending = 0,
}: HeaderProps) {
  const inst = app.institution;
  const menu: ActionMenuItem[] = [
    {
      id: "validate",
      label: validating ? "Validation is running" : "Run validation again",
      icon: <Play />,
      onSelect: onValidate,
      disabled: validating,
      hidden: !onValidate,
    },
    { id: "replay", label: "Replay latest run", icon: <History />, onSelect: onReplay, hidden: !onReplay || !app.latest_run },
    { id: "pack", label: "Export evidence pack", icon: <FileArchive />, onSelect: onPack, hidden: !onPack },
    { id: "brief", label: "Prepare inspection brief", description: "What to see, count and ask on a site visit", icon: <ClipboardList />, onSelect: onBrief, hidden: !onBrief },
    { id: "audit", label: "View audit trail", icon: <ScrollText />, to: workspacePath(app.id, "activity", { view: "audit" }), separated: true },
  ];
  const decide: ActionMenuItem[] = [
    {
      id: "rectify",
      label: "Request rectification",
      description: "Send a deficiency letter. The institution corrects and resubmits.",
      icon: <FileWarning />,
      onSelect: onRectify,
    },
    {
      id: "outcome",
      label: "Record scrutiny outcome",
      description:
        reviewPending > 0
          ? "Reply to the institution's review request first."
          : "Record it with a reason. It goes to the Executive Committee, which decides.",
      icon: <Gavel />,
      onSelect: onOutcome,
      disabled: !app.latest_run,
    },
  ];

  return (
    <PageHeader
      title={inst.name}
      status={<ApplicationStatusBadge status={app.status} />}
      context={
        <MetaList
          items={[
            <Code key="aicte">{inst.aicte_id}</Code>,
            <Code key="id">{app.id}</Code>,
            // Same short label as the review queue; the bracketed qualifier made the line wrap at 1280
            <span key="cat" title={app.category_label}>
              {app.category_label.replace(/\s*\(.*\)$/, "")}
            </span>,
            `AY ${app.academic_year}, ${roundPhrase(app.round)}`,
            [inst.district, inst.state].filter(Boolean).join(", "),
          ]}
        />
      }
      secondary={
        onAsk && (
          <Button variant="secondary" leadingIcon={<MessageSquareText />} aria-expanded={askOpen} onClick={onAsk}>
            Ask why
          </Button>
        )
      }
      menu={menu}
      primary={onRectify && onOutcome ? <ActionMenu trigger="button" variant="primary" label="Decide" width={300} items={decide} openSignal={decideSignal} /> : undefined}
    >
      <Tabs
        label="Application sections"
        value={section}
        items={WORKSPACE_SECTIONS.filter((s) => s.id !== "rectification" || app.rectifications.length > 0 || section === s.id).map((s) => ({
          id: s.id,
          label: s.label,
          href: workspacePath(app.id, s.id),
          count: s.id === "findings" ? openCount : s.id === "rectification" && awaitingReply ? awaitingReply : undefined,
          attention: s.id === "findings" ? openHigh : undefined,
        }))}
      />
    </PageHeader>
  );
}

/** Header-shaped placeholder while the application loads. */
export function HeaderSkeleton({ name }: { name?: string }) {
  return (
    <div className="space-y-3">
      {name ? <h1 className="text-xl font-semibold text-ink">{name}</h1> : <Skeleton className="h-8 w-96 max-w-full" />}
      <Skeleton className="h-4 w-[28rem] max-w-full" />
      <Skeleton className="mt-5 h-10 w-full" />
    </div>
  );
}
