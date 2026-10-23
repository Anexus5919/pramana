import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { api, qk } from "../../api";
import { useAuth } from "../../auth/session";
import { fmtDate, fmtRelative } from "../../lib/format";
import { appStatusMeta } from "../../lib/labels";
import type { Application } from "../../types";
import { StatusPill } from "../../ui/Blocks";
import { ButtonLink } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { PageHeader } from "../../ui/Layout";
import { fadeUp, stagger } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../ui/States";
import { appStatusTone } from "../../ui/tone";
import { CompactStepper } from "./StatusStepper";

const NEEDS_YOU = new Set(["draft", "rectification_requested"]);

const order: Record<string, number> = { rectification_requested: 0, draft: 1, rectified: 2, submitted: 3, validating: 3, under_review: 4 };

function nextStep(a: Application): string {
  switch (a.status) {
    case "draft":
      return "Upload the required documents and submit";
    case "rectification_requested":
      return "AICTE asked you to fix some items";
    case "submitted":
    case "validating":
      return "Automatic checks are running";
    case "rectified":
      return "Resubmitted, waiting for AICTE";
    default:
      return "With an AICTE officer";
  }
}

function AppCard({ a, label }: { a: Application; label: string }) {
  const needs = NEEDS_YOU.has(a.status);
  return (
    <motion.li variants={fadeUp} className="min-w-0">
      <Link to={`/portal/applications/${encodeURIComponent(a.id)}`} className="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400">
        <Card interactive className="h-full p-5">
          <div className="relative flex h-full flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-xs text-ink-3">{a.id}</div>
                <h2 className="mt-1 font-display text-md font-semibold tracking-title text-ink text-pretty">{label}</h2>
              </div>
              <StatusPill status={a.status} tone={appStatusTone(a.status)} label={appStatusMeta[a.status]?.label} explain={false} />
            </div>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-ink-3">Academic year</dt>
                <dd className="font-medium text-ink tabular">{a.academic_year}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-ink-3">Round</dt>
                <dd className="font-medium text-ink tabular">{a.round}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-ink-3">{a.submitted_at ? "Submitted" : "Started"}</dt>
                <dd className="truncate font-medium text-ink">{fmtDate(a.submitted_at ?? a.created_at)}</dd>
              </div>
            </dl>
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
              <div className="min-w-0">
                <CompactStepper status={a.status} />
                <p className={needs ? "mt-1.5 text-xs font-medium text-brand-ink" : "mt-1.5 text-xs text-ink-3"}>
                  {nextStep(a)}
                  {a.latest_run?.finished_at && !needs ? `, last checked ${fmtRelative(a.latest_run.finished_at)}` : ""}
                </p>
              </div>
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-3 transition-[transform,background-color,color] duration-200 group-hover/card:translate-x-0.5 group-hover/card:bg-brand-soft group-hover/card:text-brand-ink">
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </div>
          </div>
        </Card>
      </Link>
    </motion.li>
  );
}

export default function MyApplicationsPage() {
  const { user } = useAuth();
  const apps = useQuery({ queryKey: qk.applications, queryFn: api.applications });
  const rs = useQuery({ queryKey: qk.ruleset, queryFn: api.activeRuleset, staleTime: 5 * 60_000 });
  const list = [...(apps.data ?? [])].sort((x, y) => (order[x.status] ?? 9) - (order[y.status] ?? 9) || (y.created_at ?? "").localeCompare(x.created_at ?? ""));
  const inst = apps.data?.[0]?.institution;
  const labelFor = (c: string) => rs.data?.checklists[c]?.label ?? c;
  const needs = list.filter((a) => NEEDS_YOU.has(a.status)).length;

  return (
    <div>
      <PageHeader
        eyebrow={inst ? `${inst.name}` : "Institution portal"}
        title="My applications"
        description="Applications your institution has started or submitted to AICTE, with where each one stands."
        actions={
          <ButtonLink to="/portal/new" leadingIcon={<Plus />}>
            New application
          </ButtonLink>
        }
        meta={
          inst ? (
            <>
              <span className="font-mono text-xs text-ink-3">{inst.aicte_id}</span>
              <span className="text-xs text-ink-4">|</span>
              <span className="text-xs text-ink-3">
                {inst.district}, {inst.state}
              </span>
              {apps.data && (
                <>
                  <span className="text-xs text-ink-4">|</span>
                  <span className={needs ? "text-xs font-medium text-brand-ink" : "text-xs text-ink-3"}>
                    {needs ? `${needs} need${needs === 1 ? "s" : ""} your action` : "Nothing needs your action"}
                  </span>
                </>
              )}
            </>
          ) : (
            user && <span className="text-xs text-ink-3">Signed in as {user.display_name}</span>
          )
        }
      />
      {apps.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[214px]" rounded="lg" />
          ))}
        </div>
      ) : apps.error ? (
        <ErrorState error={apps.error} title="Could not load your applications" onRetry={() => void apps.refetch()} retrying={apps.isFetching} />
      ) : list.length === 0 ? (
        <EmptyState
          sky
          title="No applications yet"
          description="Start an application for Extension of Approval or an increase in intake. You can save it as a draft and upload documents before you submit."
          action={
            <ButtonLink to="/portal/new" leadingIcon={<Plus />}>
              Start an application
            </ButtonLink>
          }
        />
      ) : (
        <motion.ul variants={stagger(0.06)} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((a) => (
            <AppCard key={a.id} a={a} label={labelFor(a.category)} />
          ))}
        </motion.ul>
      )}
      {list.length > 0 && (
        <motion.ol
          variants={stagger(0.08, 0.2)}
          initial="hidden"
          animate="show"
          aria-label="How an application moves"
          className="mt-8 grid gap-3 sm:grid-cols-3"
        >
          {[
            { t: "You upload and submit", d: "Documents and declared figures stay editable while the application is a draft." },
            { t: "Pramana checks the evidence", d: "Each document is read and compared with the handbook rules and issuer records." },
            { t: "An AICTE officer decides", d: "The checks only point at evidence. If something needs fixing, you will see it here." },
          ].map((s, i) => (
            <motion.li key={s.t} variants={fadeUp} className="flex gap-3 rounded-card border border-line bg-surface/70 p-4">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-brand-soft font-mono text-[11px] font-semibold text-brand-ink">{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{s.t}</span>
                <span className="mt-0.5 block text-xs text-ink-3 text-pretty">{s.d}</span>
              </span>
            </motion.li>
          ))}
        </motion.ol>
      )}
    </div>
  );
}
