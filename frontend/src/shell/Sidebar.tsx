import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Link, NavLink } from "react-router-dom";
import { homePath, useAuth } from "../auth/session";
import { useActivity, Wordmark } from "../brand/EyeMark";
import { roleLabel } from "../lib/labels";
import { cn } from "../ui/cn";
import { dur, ease, spring } from "../ui/motion";
import { Tooltip } from "../ui/Tooltip";
import { navFor, type NavItem } from "./nav";

export const SIDEBAR_W = 248;
export const SIDEBAR_COLLAPSED_W = 72;

function NavRow({ item, collapsed, layoutGroup, onNavigate }: { item: NavItem; collapsed: boolean; layoutGroup: string; onNavigate?: () => void }) {
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex h-10 items-center rounded-[10px] text-[14px] font-medium transition-colors duration-200",
          collapsed ? "w-10 justify-center" : "gap-3 px-3",
          isActive ? "text-ink" : "text-ink-3 hover:bg-surface-2/80 hover:text-ink",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={`${layoutGroup}-active`}
              transition={spring.snappy}
              aria-hidden
              className="absolute inset-0 rounded-[10px] bg-surface shadow-sm ring-1 ring-line"
            >
              <span className="absolute top-1/2 -left-px h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand-500" />
            </motion.span>
          )}
          <Icon
            aria-hidden
            className={cn(
              "relative size-[18px] shrink-0 transition-colors",
              isActive ? "text-brand-500" : "text-ink-3 group-hover:text-ink-2",
            )}
            strokeWidth={isActive ? 2.2 : 1.9}
          />
          {!collapsed && <span className="relative truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="bottom" wrapperClassName="flex">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export interface SidebarNavProps {
  collapsed?: boolean;
  /** Distinguishes the desktop rail from the mobile drawer so indicators do not jump between them */
  layoutGroup?: string;
  onNavigate?: () => void;
}

export function SidebarNav({ collapsed = false, layoutGroup = "rail", onNavigate }: SidebarNavProps) {
  const { role } = useAuth();
  const items = navFor(role);
  const groups = Array.from(new Set(items.map((i) => i.group)));
  return (
    <nav aria-label="Main" className={cn("flex flex-col gap-5", collapsed && "items-center")}>
      {groups.map((g) => (
        <div key={g} className={cn("flex flex-col gap-0.5", collapsed && "items-center")}>
          <AnimatePresence initial={false}>
            {!collapsed ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: dur.micro }}
                className="eyebrow mb-1.5 px-3"
              >
                {g}
              </motion.div>
            ) : (
              <div aria-hidden className="mb-1.5 h-px w-6 bg-line" />
            )}
          </AnimatePresence>
          {items
            .filter((i) => i.group === g)
            .map((i) => (
              <NavRow key={i.to} item={i} collapsed={collapsed} layoutGroup={layoutGroup} onNavigate={onNavigate} />
            ))}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { role, session } = useAuth();
  const { active, blink } = useActivity();
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W }}
      transition={{ duration: dur.panel, ease: ease.inOut }}
      className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-canvas/85 backdrop-blur-xl lg:flex"
    >
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "px-5")}>
        <Link to={homePath(role)} aria-label="Pramana home" className="rounded-md">
          <Wordmark size={collapsed ? 32 : 30} active={active} blink={blink} markOnly={collapsed} />
        </Link>
      </div>
      {!collapsed && session && (
        <div className="mx-4 mb-4 rounded-[12px] border border-line bg-surface/70 px-3 py-2.5">
          <div className="eyebrow">Workspace</div>
          <div className="mt-0.5 truncate text-sm font-medium text-ink">{session.role_label || roleLabel[session.user.role]}</div>
        </div>
      )}
      <div className={cn("min-h-0 flex-1 overflow-y-auto pb-4", collapsed ? "px-0 pt-2" : "px-3")}>
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className={cn("shrink-0 border-t border-line p-3", collapsed && "flex justify-center")}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-[10px] text-sm text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink",
            collapsed ? "w-10 justify-center" : "w-full px-3",
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
