import { ArrowDownRight } from "lucide-react";
import { motion } from "motion/react";
import { Tag } from "../../ui/Badge";
import { StatusCube } from "../../ui/Blocks";
import { cn } from "../../ui/cn";
import { fadeUp, stagger, tap } from "../../ui/motion";
import { toneClass } from "../../ui/tone";
import type { Tile } from "./summary";

/** One block per check, each a jump to its section, so the whole result reads at a glance. */
export function Overview({ items, onJump }: { items: Tile[]; onJump: (id: string) => void }) {
  return (
    <section aria-labelledby="an-overview-title">
      <h2 id="an-overview-title" className="sr-only">
        Results at a glance
      </h2>
      <motion.ul variants={stagger(0.035)} initial="hidden" animate="show" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {items.map((t) => (
          <motion.li key={t.id} variants={fadeUp} className="min-w-0">
            <motion.button
              type="button"
              whileTap={tap}
              onClick={() => onJump(t.id)}
              aria-label={`${t.label}: ${t.value}${t.note ? `. ${t.note}` : ""}. Go to the section.`}
              className={cn(
                "group relative flex h-full w-full min-w-0 items-start gap-2.5 rounded-card border bg-surface px-3.5 py-3 text-left shadow-xs transition-[border-color,box-shadow] duration-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                toneClass[t.tone].border,
              )}
            >
              <StatusCube tone={t.tone} size={16} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="eyebrow block truncate">{t.label}</span>
                <span className={cn("mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm leading-snug font-semibold", toneClass[t.tone].fg)}>
                  {t.value}
                  {t.tag && <Tag variant="demo">{t.tag}</Tag>}
                </span>
                {t.note && <span className="mt-0.5 block text-xs leading-snug text-ink-3">{t.note}</span>}
              </span>
              <ArrowDownRight aria-hidden className="size-3.5 shrink-0 text-ink-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:text-brand-ink" />
            </motion.button>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}
