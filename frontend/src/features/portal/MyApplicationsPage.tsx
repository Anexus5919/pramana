import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FilePlus, Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { AppStatusBadge } from "../../components/ui/Badge";
import { ButtonLink } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState, ErrorBanner, Skeleton } from "../../components/ui/Feedback";
import { fmtDate } from "../../lib/format";
import { PageHeader } from "../shared/Summaries";
import { useLabels } from "../shared/useRuleset";

const NEXT_STEP: Record<string, string> = {
  draft: "Upload the required documents and submit.",
  rectification_requested: "Correct the listed items and resubmit.",
  submitted: "Submitted; automated checks are running.",
  validating: "Automated checks are running.",
  under_review: "With the scrutiny team.",
  rectified: "Resubmitted after rectification.",
};

export function MyApplicationsPage() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: qk.applications, queryFn: api.applications });
  const { category } = useLabels();
  const inst = q.data?.[0]?.institution;

  return (
    <div>
      <PageHeader
        eyebrow={inst ? `${inst.name} | ${inst.aicte_id}` : user?.display_name}
        title="My applications"
        subtitle="Applications your institution has created. Open one to upload documents, edit declared data or respond to a rectification request."
        actions={
          <ButtonLink to="/portal/new" variant="primary" icon={<FilePlus className="size-4" />}>
            New application
          </ButtonLink>
        }
      />
      {q.isPending ? (
        <Skeleton className="h-60" />
      ) : q.error ? (
        <ErrorBanner error={q.error} title="Could not load your applications" />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox className="size-6" />}
            title="No applications yet"
            action={
              <ButtonLink to="/portal/new" variant="primary">
                Start an application
              </ButtonLink>
            }
          >
            Create an application, fill in the declared data and upload the documents on its checklist.
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {q.data.map((a) => (
            <li key={a.id}>
              <Link
                to={`/portal/applications/${encodeURIComponent(a.id)}`}
                className="group block rounded-lg border border-line bg-surface p-4 shadow-xs transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-subtle-fg">{a.id}</p>
                    <p className="mt-0.5 text-base font-semibold text-fg">{category(a.category)}</p>
                    <p className="text-sm text-muted">Academic year {a.academic_year}</p>
                  </div>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-subtle-fg group-hover:text-primary-ink" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <AppStatusBadge status={a.status} />
                  <span className="text-xs text-subtle-fg">Round {a.round}</span>
                  <span className="text-xs text-subtle-fg">
                    {a.submitted_at ? `Submitted ${fmtDate(a.submitted_at)}` : `Created ${fmtDate(a.created_at)}`}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">{NEXT_STEP[a.status] ?? ""}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
