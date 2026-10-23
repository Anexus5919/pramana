import { ArrowLeft } from "lucide-react";
import { createContext, useContext, type HTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../ui/cn";
import { ActionMenu, type ActionMenuItem } from "./ActionMenu";

const WIDTH = {
  /** Officer pages: tables, workspace */
  default: "max-w-[1280px]",
  /** Institution portal, forms, wizards: one calm column */
  narrow: "max-w-[960px]",
  /** Document viewers and wide tables that need the whole canvas */
  full: "max-w-none",
} as const;

export interface PageProps extends HTMLAttributes<HTMLDivElement> {
  width?: keyof typeof WIDTH;
}

/** Root of every signed-in page: sets the content width and the 32px vertical rhythm between blocks. */
export function Page({ width = "default", className, children, ...rest }: PageProps) {
  return (
    <div className={cn("mx-auto w-full min-w-0 space-y-8", WIDTH[width], className)} {...rest}>
      {children}
    </div>
  );
}

export interface PageHeaderProps {
  title: ReactNode;
  /** One line of context under the title: IDs, year, place. Use MetaList for several facts. */
  context?: ReactNode;
  /** A single StatusBadge shown beside the title */
  status?: ReactNode;
  /** Up-one-level link for detail pages (the breadcrumb already shows the path on wide screens) */
  back?: { to: string; label: string };
  /** The one primary action of the screen */
  primary?: ReactNode;
  /** At most two secondary buttons; everything else goes in `menu` */
  secondary?: ReactNode;
  /** Overflow actions shown in a "More actions" menu */
  menu?: ActionMenuItem[];
  /** Rendered under the header, flush: section tabs or a stepper */
  children?: ReactNode;
  className?: string;
}

/** Title, one line of context, one primary action, a few secondary ones and an overflow menu. */
export function PageHeader({ title, context, status, back, primary, secondary, menu, children, className }: PageHeaderProps) {
  return (
    <header className={cn("min-w-0", className)}>
      {back && (
        <Link
          to={back.to}
          className="mb-3 inline-flex items-center gap-1.5 rounded text-sm text-ink-3 transition-colors duration-150 hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 text-xl font-semibold text-ink">{title}</h1>
            {status}
          </div>
          {context && <div className="mt-1 text-sm text-ink-3">{context}</div>}
        </div>
        {(primary || secondary || (menu && menu.length > 0)) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {secondary}
            {menu && <ActionMenu items={menu} label="More actions" />}
            {primary}
          </div>
        )}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  );
}

const InPanel = createContext(false);

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  /** Small controls in the panel header: a link, a segmented control, one button */
  actions?: ReactNode;
  footer?: ReactNode;
  /** "none" for edge-to-edge tables and lists */
  padding?: "none" | "md";
  as?: "section" | "div" | "aside";
  bodyClassName?: string;
}

/**
 * The only boxed surface. Panels never nest: inside a panel use PanelDivider,
 * DescriptionList or rows. A nested Panel renders as a plain block and warns in development.
 */
export function Panel({ title, description, actions, footer, padding = "md", as = "section", className, bodyClassName, children, ...rest }: PanelProps) {
  const nested = useContext(InPanel);
  if (nested && import.meta.env.DEV) console.warn("Panel inside Panel: use PanelDivider or a Section instead of nesting boxes.");
  const Tag = as;
  const hasHeader = title || description || actions;
  return (
    <InPanel.Provider value={true}>
      <Tag
        className={cn(nested ? "min-w-0" : "min-w-0 rounded-card border border-line bg-surface", className)}
        {...rest}
      >
        {hasHeader && (
          <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", nested ? "pb-3" : "px-5 pt-4 pb-3")}>
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-ink-3 text-pretty">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        )}
        <div className={cn(padding === "md" && !nested && (hasHeader ? "px-5 pb-5" : "p-5"), bodyClassName)}>{children}</div>
        {footer && (
          <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-line", nested ? "pt-3" : "px-5 py-3")}>
            {footer}
          </div>
        )}
      </Tag>
    </InPanel.Provider>
  );
}

/** Hairline between groups inside a panel; optional small label. */
export function PanelDivider({ label, className }: { label?: ReactNode; className?: string }) {
  if (!label) return <hr className={cn("my-4 border-line", className)} />;
  return (
    <div className={cn("my-4 flex items-center gap-3", className)}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Heading level; h2 on pages, h3 inside a workspace section */
  level?: 2 | 3;
}

/** An unboxed group on the page canvas: heading, one line of description, then content. */
export function Section({ title, description, actions, level = 2, className, children, ...rest }: SectionProps) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <section className={cn("min-w-0", className)} {...rest}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <H className="text-md font-semibold text-ink">{title}</H>
          {description && <p className="mt-0.5 text-sm text-ink-3 text-pretty">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
