import { FileArchive, FileWarning, Gavel, History, MessageSquareText, Play, ScrollText } from "lucide-react";
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
  onValidate?: () => void;
  onReplay?: () => void;
  onPack?: () => void;
  onAsk?: () => void;
  onRectify?: () => void;
  onOutcome?: () => void;
}

/** Institution, one status, one context line, Ask why, More actions and the one primary action: Decide. */
export function WorkspaceHeader({
  app,
  section,
  openCount,
  openHigh,
  validating,
  askOpen,
  onValidate,
  onReplay,
  onPack,
  onAsk,
  onRectify,
  onOutcome,
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
      description: "Record the authority's decision with a reason. Starts the re-verification watch.",
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
            app.category_label,
            `AY ${app.academic_year}, round ${app.round}`,
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
      primary={onRectify && onOutcome ? <ActionMenu trigger="button" variant="primary" label="Decide" width={300} items={decide} /> : undefined}
    >
      <Tabs
        label="Application sections"
        value={section}
        items={WORKSPACE_SECTIONS.map((s) => ({
          id: s.id,
          label: s.label,
          href: workspacePath(app.id, s.id),
          count: s.id === "findings" ? openCount : undefined,
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
