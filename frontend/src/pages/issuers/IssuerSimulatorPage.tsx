import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { api, errorMessage, qk } from "../../api";
import { useAuth } from "../../auth/session";
import type { SimIssuer } from "../../types";
import { Tag } from "../../ui/Badge";
import { StatusCube } from "../../ui/Blocks";
import { PageHeader } from "../../ui/Layout";
import { fadeUp, stagger } from "../../ui/motion";
import { Skeleton } from "../../ui/Skeleton";
import { EmptyState, ErrorState } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { IssuerCard, isOnline, issuerName } from "./IssuerCard";
import { LookupPanel } from "./LookupPanel";

function Notice() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-card border border-dashed border-manual-dot/50 bg-manual-bg/70 p-4">
      <FlaskConical className="mt-0.5 size-5 shrink-0 text-manual-fg" aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Tag variant="demo">Simulated</Tag>
          <span className="text-sm font-semibold text-manual-fg">No real issuer is contacted</span>
        </div>
        <p className="mt-1.5 max-w-3xl text-sm text-ink-2 text-pretty">
          Real registries sit behind captcha protected portals or need formal authorisation before an API can be used. These stand-ins
          answer from a synthetic registry with the same lookup shape, so validation, field comparison and the source unavailable path
          can be shown end to end. Every response carries <span className="font-mono text-[13px]">simulated: true</span> and is labelled
          wherever it appears.
        </p>
      </div>
    </div>
  );
}

function Summary({ issuers }: { issuers: SimIssuer[] }) {
  const up = issuers.filter(isOnline).length;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-3">
      <span className="inline-flex items-center gap-[3px]" aria-hidden>
        {issuers.map((i) => (
          <StatusCube key={i.code} tone={isOnline(i) ? "verified" : "unavail"} size={12} />
        ))}
      </span>
      <span className="tabular">
        {up} of {issuers.length} sources responding
      </span>
    </span>
  );
}

export default function IssuerSimulatorPage() {
  const { is } = useAuth();
  const admin = is("admin");
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: qk.issuers, queryFn: api.simIssuers });
  const issuers = q.data ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const code = selected ?? issuers[0]?.code ?? "";

  const toggle = useMutation({
    mutationFn: ({ c, available }: { c: string; available: boolean }) => api.setIssuerAvailability(c, available),
    onMutate: async ({ c, available }) => {
      await qc.cancelQueries({ queryKey: qk.issuers });
      const prev = qc.getQueryData<SimIssuer[]>(qk.issuers);
      qc.setQueryData<SimIssuer[]>(qk.issuers, (old) => old?.map((i) => (i.code === c ? { ...i, available } : i)));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.issuers, ctx.prev);
      toast.error("Availability was not changed", errorMessage(e));
    },
    onSuccess: (_d, { c, available }) => {
      const i = issuers.find((x) => x.code === c);
      const name = i ? issuerName(i) : c;
      if (available) toast.success(`${name} is responding again`, "Next validation runs will query it as usual.");
      else toast.info(`${name} stopped responding`, "Next validation runs will record source unavailable.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.issuers }),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Verification sources"
        title="Issuer simulator"
        description="Stand-ins for the reference-number lookups that issuing authorities offer. During validation Pramana asks the issuer for its own record and compares it with the values read from the document."
        meta={issuers.length ? <Summary issuers={issuers} /> : undefined}
      />
      <Notice />
      {q.isPending ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-52 w-full" rounded="lg" />
            ))}
          </div>
          <Skeleton className="h-80 w-full" rounded="lg" />
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} title="Could not load the simulated sources" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : !issuers.length ? (
        <EmptyState title="No simulated sources configured" description="The demo registry file has no issuers." />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {issuers.map((i) => (
              <motion.div key={i.code} variants={fadeUp} className="min-w-0">
                <IssuerCard
                  issuer={i}
                  selected={i.code === code}
                  busy={busy === i.code}
                  canToggle={admin}
                  toggling={toggle.isPending && toggle.variables?.c === i.code}
                  onSelect={() => setSelected(i.code)}
                  onToggle={(available) => toggle.mutate({ c: i.code, available })}
                />
              </motion.div>
            ))}
          </motion.div>
          <LookupPanel issuers={issuers} code={code} onCode={setSelected} onBusy={setBusy} className="min-w-0 xl:sticky xl:top-24" />
        </div>
      )}
    </div>
  );
}
