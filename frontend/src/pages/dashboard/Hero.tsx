import { ArrowRight, FileSearch, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/session";
import { pluralize } from "../../lib/format";
import type { Dashboard, DashboardRow } from "../../types";
import { Button, ButtonLink } from "../../ui/Button";
import { dur, ease } from "../../ui/motion";
import type { AppNavState } from "../../ui/shared";
import { IsoCube } from "./iso";

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const S = 15;

/** Each tower is an application in review order; height is open findings, a red cap marks high severity open. */
function QueueSkyline({ rows }: { rows: DashboardRow[] }) {
  const navigate = useNavigate();
  const [hover, setHover] = useState<DashboardRow | null>(null);
  const shown = rows.slice(0, 12);
  const max = Math.max(1, ...shown.map((r) => r.open_findings));
  const unit = Math.max(1, Math.ceil(max / 7));
  const levels = shown.map((r) => (r.open_findings ? Math.ceil(r.open_findings / unit) : 0));
  const tallest = Math.max(1, ...levels);
  const width = shown.length * S + S * 2 + 8;
  const height = tallest * S + shown.length * (S / 2) + S * 2 + 8;
  const baseX = S + 4;
  const baseY = tallest * S + 4;

  return (
    <figure className="relative flex min-w-0 flex-col items-center">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full max-w-[360px] overflow-visible drop-shadow-[0_18px_30px_rgb(60_20_110/0.18)]"
        role="group"
        aria-label={`Review queue skyline: ${shown.length} applications, tower height is open findings`}
      >
        {shown.map((r, i) => {
          const x = baseX + i * S;
          const y0 = baseY + i * (S / 2);
          const n = levels[i];
          const high = r.open_high > 0;
          const active = hover?.id === r.id;
          return (
            <motion.g
              key={r.id}
              role="link"
              tabIndex={0}
              aria-label={`${r.institution.name}: ${pluralize(r.open_findings, "open finding")}, ${r.open_high} high severity`}
              animate={{ y: active ? -5 : 0 }}
              transition={{ duration: dur.ui, ease: ease.out }}
              className="cursor-pointer outline-none"
              onPointerEnter={() => setHover(r)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(r)}
              onBlur={() => setHover(null)}
              onClick={() => navigate(`/applications/${encodeURIComponent(r.id)}`, { state: { institution: r.institution.name } satisfies AppNavState })}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(`/applications/${encodeURIComponent(r.id)}`);
              }}
            >
              {n === 0 ? (
                <IsoCube x={x} y={y0 - S} s={S} color="var(--brand-500)" ghost delay={0.2 + i * 0.05} />
              ) : (
                Array.from({ length: n }, (_, k) => (
                  <IsoCube
                    key={k}
                    x={x}
                    y={y0 - (k + 1) * S}
                    s={S}
                    color={high && k === n - 1 ? "var(--sev-high)" : active ? "var(--brand-400)" : "var(--brand-500)"}
                    delay={0.15 + i * 0.05 + k * 0.04}
                  />
                ))
              )}
            </motion.g>
          );
        })}
      </svg>
      <figcaption className="mt-2 min-h-10 max-w-[360px] text-center text-xs text-ink-2" aria-live="polite">
        {hover ? (
          <>
            <span className="font-semibold text-ink">{hover.institution.name}</span>
            <span className="block">
              {pluralize(hover.open_findings, "open finding")}
              {hover.open_high ? `, ${hover.open_high} high severity` : ""}
            </span>
          </>
        ) : (
          <>
            Each tower is an application in review order. Height is open findings
            {unit > 1 ? ` (one block per ${unit})` : ""}; a red cap means high severity is open.
          </>
        )}
      </figcaption>
    </figure>
  );
}

export function Hero({ data, onRefresh, refreshing }: { data: Dashboard; onRefresh: () => void; refreshing: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);
  const name = user?.display_name.replace(/\s*\(.*\)\s*$/, "") ?? "";
  const highOpen = data.alerts.filter((a) => a.kind === "high_severity_finding").length;
  const sources = data.alerts.filter((a) => a.kind !== "high_severity_finding").length;
  const inReview = data.applications.length;
  const years = Array.from(new Set(data.applications.map((a) => a.academic_year))).sort();
  const next = data.applications.find((a) => a.latest_run);

  return (
    <section className="relative overflow-hidden rounded-hero border border-white/50 bg-sky shadow-md grain dark:border-white/5">
      <div className="relative grid items-center gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(260px,380px)]">
        <div className="min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur.panel, ease: ease.out }}
            className="eyebrow text-ink-2"
          >
            {dayFmt.format(now)}
            {years.length ? ` · AY ${years.join(", ")} scrutiny` : ""}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur.story, ease: ease.out, delay: 0.05 }}
            className="mt-3 font-display text-3xl font-semibold tracking-display text-ink sm:text-4xl"
          >
            {greeting(now)}, {name}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur.story, ease: ease.out, delay: 0.12 }}
            className="mt-3 max-w-xl text-md text-ink-2 text-pretty"
          >
            {pluralize(inReview, "application")} in the queue.{" "}
            {highOpen ? (
              <>
                <strong className="font-semibold text-ink">{pluralize(highOpen, "high-severity finding")}</strong> waiting for a
                decision
              </>
            ) : (
              "No high-severity findings are waiting"
            )}
            {sources ? (
              <>
                , and <strong className="font-semibold text-ink">{pluralize(sources, "verification source")}</strong> need a
                manual check.
              </>
            ) : (
              "."
            )}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur.story, ease: ease.out, delay: 0.2 }}
            className="mt-7 flex flex-wrap items-center gap-3"
          >
            {next && (
              <Button
                size="lg"
                magnetic
                trailingIcon={<ArrowRight />}
                onClick={() =>
                  navigate(`/applications/${encodeURIComponent(next.id)}`, {
                    state: { institution: next.institution.name } satisfies AppNavState,
                  })
                }
              >
                Open next in queue
              </Button>
            )}
            <ButtonLink to="/verify-pdf" variant="secondary" size="lg" leadingIcon={<FileSearch />}>
              Verify a PDF
            </ButtonLink>
            <Button variant="ghost" size="lg" leadingIcon={<RotateCcw />} onClick={onRefresh} loading={refreshing}>
              Refresh
            </Button>
          </motion.div>
        </div>
        <QueueSkyline rows={data.applications} />
      </div>
    </section>
  );
}
