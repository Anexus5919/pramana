import { AlertTriangle, CheckCircle2, Info, OctagonAlert, Search, X } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../ui/cn";

/* Callout ---------------------------------------------------------------- */

export type CalloutTone = "info" | "success" | "warning" | "danger" | "neutral";

const CALLOUT: Record<CalloutTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "border-pending-dot/25 bg-pending-bg", icon: "text-pending-fg", Icon: Info },
  success: { box: "border-verified-dot/25 bg-verified-bg", icon: "text-verified-fg", Icon: CheckCircle2 },
  warning: { box: "border-manual-dot/30 bg-manual-bg", icon: "text-manual-fg", Icon: AlertTriangle },
  danger: { box: "border-mismatch-dot/25 bg-mismatch-bg", icon: "text-mismatch-fg", Icon: OctagonAlert },
  neutral: { box: "border-line bg-surface-2", icon: "text-ink-3", Icon: Info },
};

export interface CalloutProps {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  /** One action at the right: a Button or ButtonLink */
  action?: ReactNode;
  icon?: ReactNode;
  /** Use role="status" for live updates, "alert" only for errors that block the task */
  role?: "status" | "alert";
  className?: string;
}

/** A single inline message: state banners, limitations, next steps. Never stack more than one per section. */
export function Callout({ tone = "info", title, children, action, icon, role, className }: CalloutProps) {
  const t = CALLOUT[tone];
  return (
    <div role={role} className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 rounded-card border px-4 py-3", t.box, className)}>
      <span aria-hidden className={cn("mt-0.5 shrink-0 [&_svg]:size-4", t.icon)}>
        {icon ?? <t.Icon />}
      </span>
      <div className="min-w-0 flex-1 text-sm text-ink-2">
        {title && <div className="font-medium text-ink">{title}</div>}
        {children && <div className={cn(title && "mt-0.5", "text-pretty")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/* EmptyState ------------------------------------------------------------- */

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** "sm" inside panels and tables, "md" for whole sections */
  size?: "sm" | "md";
  className?: string;
}

export function EmptyState({ icon, title, description, action, size = "md", className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", size === "md" ? "px-6 py-12" : "px-4 py-8", className)}>
      {icon && <div className="mb-3 text-ink-4 [&_svg]:size-6">{icon}</div>}
      <div className="text-base font-medium text-ink">{title}</div>
      {description && <p className="mt-1 max-w-md text-sm text-ink-3 text-pretty">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* DescriptionList -------------------------------------------------------- */

export interface DescriptionItem {
  label: ReactNode;
  value: ReactNode;
  /** Monospace value: IDs, hashes, codes, values read from documents */
  mono?: boolean;
  hint?: ReactNode;
  hidden?: boolean;
}

export interface DescriptionListProps {
  items: DescriptionItem[];
  /** "inline": label left, value right, hairlines between rows. "stacked": label above value in a grid. */
  layout?: "inline" | "stacked";
  /** Grid columns for the stacked layout */
  columns?: 1 | 2 | 3 | 4;
  labelWidth?: number;
  className?: string;
}

const COLS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

/** Label and value pairs. Empty values render as "Not given". */
export function DescriptionList({ items, layout = "inline", columns = 2, labelWidth = 168, className }: DescriptionListProps) {
  const shown = items.filter((i) => !i.hidden);
  const val = (it: DescriptionItem) =>
    it.value === null || it.value === undefined || it.value === "" ? <span className="text-ink-4">Not given</span> : it.value;
  if (layout === "stacked") {
    return (
      <dl className={cn("grid gap-x-8 gap-y-4", COLS[columns], className)}>
        {shown.map((it, i) => (
          <div key={i} className="min-w-0">
            <dt className="text-xs text-ink-3">{it.label}</dt>
            <dd className={cn("mt-0.5 text-sm break-words text-ink", it.mono && "font-mono text-sm")}>
              {val(it)}
              {it.hint && <div className="mt-0.5 text-xs text-ink-3">{it.hint}</div>}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className={cn("min-w-0", className)}>
      {shown.map((it, i) => (
        <div
          key={i}
          className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-0.5 border-b border-line py-2.5 first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[var(--dl-label)_minmax(0,1fr)]"
          style={{ ["--dl-label" as string]: `${labelWidth}px` }}
        >
          <dt className="text-sm text-ink-3">{it.label}</dt>
          <dd className={cn("min-w-0 text-sm break-words text-ink", it.mono && "font-mono text-sm")}>
            {val(it)}
            {it.hint && <div className="mt-0.5 text-xs text-ink-3">{it.hint}</div>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* Stat ------------------------------------------------------------------- */

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** One short line: a breakdown or a comparison */
  hint?: ReactNode;
  /** Makes the whole stat a link to the filtered list it summarises */
  to?: string;
  /** Colours the value; use only when the number itself is the alarm */
  tone?: "default" | "danger" | "warning";
}

/** A figure with a label. Group several in a StatGroup rather than a card per number. */
export function Stat({ label, value, hint, to, tone = "default" }: StatProps) {
  const body = (
    <>
      <div className="text-sm text-ink-3">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "danger" ? "text-mismatch-fg" : tone === "warning" ? "text-manual-fg" : "text-ink",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </>
  );
  return to ? (
    <Link to={to} className="block min-w-0 bg-surface px-5 py-4 transition-colors duration-150 hover:bg-surface-2">
      {body}
    </Link>
  ) : (
    <div className="min-w-0 bg-surface px-5 py-4">{body}</div>
  );
}

/** One bordered strip of stats divided by hairlines. Four at most. */
export function StatGroup({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <section
      aria-label={label}
      className={cn("grid min-w-0 grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4", className)}
    >
      {children}
    </section>
  );
}

/* Toolbar ---------------------------------------------------------------- */

/** Filters on the left, view controls or one action on the right. Sits directly above a table. */
export function Toolbar({ children, end, className }: { children?: ReactNode; end?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {end && <div className="flex shrink-0 items-center gap-2">{end}</div>}
    </div>
  );
}

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name; the placeholder is not a label */
  label: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, label, placeholder = "Search", className, ...rest },
  ref,
) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-4" />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-control border border-line-2 bg-surface pr-8 pl-8 text-sm text-ink shadow-xs transition-colors duration-150 outline-none placeholder:text-ink-4 hover:border-ink-4 focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-0 [&::-webkit-search-cancel-button]:hidden"
        {...rest}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
});

/* MetaList and Code ------------------------------------------------------ */

/** Inline facts separated by a quiet dot: "AICTE 1-55 · Engineering · AY 2026-27". Empty items are skipped. */
export function MetaList({ items, className }: { items: ReactNode[]; className?: string }) {
  const shown = items.filter((i) => i !== null && i !== undefined && i !== false && i !== "");
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5", className)}>
      {shown.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 && (
            <span aria-hidden className="text-ink-4">
              ·
            </span>
          )}
          {it}
        </span>
      ))}
    </span>
  );
}

/** Inline monospace for IDs, codes and values read from documents. */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cn("font-mono text-sm text-ink-2", className)}>{children}</code>;
}

/* EvidenceFrame ---------------------------------------------------------- */

export interface EvidenceFrameProps {
  title: ReactNode;
  /** Filename, page, status: use MetaList */
  meta?: ReactNode;
  /** Viewer controls: page nav, layers, zoom */
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** The frame around a document page or photo: header, controls, a neutral stage. Not a card in a card. */
export function EvidenceFrame({ title, meta, toolbar, children, footer, className }: EvidenceFrameProps) {
  return (
    <figure className={cn("min-w-0 overflow-hidden rounded-card border border-line bg-surface", className)}>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">{title}</div>
          {meta && <div className="text-xs text-ink-3">{meta}</div>}
        </div>
        {toolbar && <div className="flex flex-wrap items-center gap-1">{toolbar}</div>}
      </figcaption>
      <div className="min-w-0 bg-surface-2 p-4">{children}</div>
      {footer && <div className="border-t border-line px-4 py-2.5 text-xs text-ink-3">{footer}</div>}
    </figure>
  );
}
