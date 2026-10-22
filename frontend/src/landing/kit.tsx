import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { homePath, useSession } from "../auth/session";

// Shared motion values (mirror DESIGN.md section 2)
export const ease = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};
export const spring = {
  snappy: { type: "spring" as const, stiffness: 420, damping: 34 },
  soft: { type: "spring" as const, stiffness: 180, damping: 24 },
};
export const dur = { micro: 0.12, ui: 0.2, panel: 0.32, story: 0.7 };

// Where "Open the workspace" goes: the role home when signed in, otherwise the login page
export function useWorkspaceHref(): string {
  const { data } = useSession();
  return data ? homePath(data.user.role) : "/login";
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`lp-eyebrow ${className}`}>{children}</p>;
}

type SectionProps = {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  className?: string;
  tone?: "paper" | "pupil";
  headerClassName?: string;
};

// Standard section shell: semantic section, eyebrow, display title, lede
export function Section({ id, eyebrow, title, lede, children, className = "", tone = "paper", headerClassName = "" }: SectionProps) {
  const dark = tone === "pupil";
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`relative scroll-mt-20 px-4 py-24 sm:px-6 md:py-32 ${dark ? "bg-(--lp-pupil) text-white" : ""} ${className}`}
    >
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className={`max-w-3xl ${headerClassName}`}>
          {eyebrow && <Eyebrow className={dark ? "text-white/60!" : ""}>{eyebrow}</Eyebrow>}
          <h2
            id={`${id}-title`}
            className={`lp-display mt-3 text-[34px] leading-[1.04] font-semibold sm:text-[44px] md:text-[52px] ${dark ? "text-white" : "text-(--lp-ink)"}`}
          >
            {title}
          </h2>
          {lede && (
            <p className={`mt-5 max-w-2xl text-[17px] leading-relaxed ${dark ? "text-white/70" : "text-(--lp-ink-2)"}`}>{lede}</p>
          )}
        </Reveal>
        {children}
      </div>
    </section>
  );
}

// Reveal on first view only
export function Reveal({
  children,
  className = "",
  delay = 0,
  y = 18,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: dur.story, ease: ease.out, delay }}
    >
      {children}
    </motion.div>
  );
}

// Number that counts up the first time it scrolls into view; jumps to the value under reduced motion
export function CountUp({
  value,
  decimals = 0,
  duration = 1.4,
  className = "",
  prefix = "",
  suffix = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration, ease: ease.out, onUpdate: (v) => setShown(v) });
    return () => controls.stop();
  }, [inView, reduced, value, duration]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`} aria-label={`${prefix}${value.toFixed(decimals)}${suffix}`}>
      <span aria-hidden>
        {prefix}
        {shown.toFixed(decimals)}
        {suffix}
      </span>
    </span>
  );
}

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 text-[15px] font-semibold transition-[background-color,box-shadow,color,transform] duration-200 active:scale-[0.97] select-none";

// Primary violet call to action (Link)
export function PrimaryLink({ to, children, className = "" }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={`${btnBase} bg-(--lp-brand-500) text-white shadow-[0_10px_30px_-10px_rgb(139_61_255/0.7),inset_0_1px_0_rgb(255_255_255/0.25)] hover:bg-(--lp-brand-600) ${className}`}
    >
      {children}
    </Link>
  );
}

// Outlined secondary action (button)
export function OutlineButton({
  onClick,
  children,
  className = "",
  dark = false,
}: {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${btnBase} border ${dark ? "border-white/30 text-white hover:bg-white/10" : "border-(--lp-ink)/80 bg-white/40 text-(--lp-ink) backdrop-blur-sm hover:bg-white/80"} ${className}`}
    >
      {children}
    </button>
  );
}

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

// Small "SIMULATED" or "SYNTHETIC" tag
export function SimTag({ children = "SIMULATED", className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={`lp-mono inline-flex items-center rounded-[5px] border border-(--lp-manual-dot)/40 bg-(--lp-manual-bg) px-1.5 py-px text-[10px] font-semibold tracking-[0.08em] text-(--lp-manual-fg) ${className}`}
    >
      {children}
    </span>
  );
}
