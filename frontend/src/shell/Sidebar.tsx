import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { homePath, useAuth } from "../auth/session";
import { EyeMark, useActivity } from "../brand/EyeMark";
import { cn } from "../ui/cn";
import { Tooltip } from "../ui/Tooltip";
import { NAV_GROUP_LABEL, navFor, type NavGroup, type NavItem } from "./nav";

export const SIDEBAR_W = 232;
export const SIDEBAR_COLLAPSED_W = 56;

function NavRow({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "group flex h-8 items-center rounded-control text-sm transition-colors duration-150",
          collapsed ? "w-8 justify-center" : "gap-2.5 px-2.5",
          isActive ? "bg-brand-soft font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon aria-hidden className={cn("size-4 shrink-0", isActive ? "text-brand-ink" : "text-ink-3 group-hover:text-ink-2")} />
          {!collapsed && <span className="truncate">{item.label}</span>}
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
  onNavigate?: () => void;
}

/** Grouped navigation for officials. Group order follows the order of work. */
export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const { role } = useAuth();
  const items = navFor(role);
  const groups = Array.from(new Set(items.map((i) => i.group))) as NavGroup[];
  return (
    <nav aria-label="Main" className={cn("flex flex-col gap-5", collapsed && "items-center")}>
      {groups.map((g) => {
        const label = NAV_GROUP_LABEL[g];
        return (
          <div key={g} role="group" aria-label={label ?? "Review"} className={cn("flex flex-col gap-0.5", collapsed && "items-center")}>
            {label &&
              (collapsed ? (
                <div aria-hidden className="mb-1.5 h-px w-5 bg-line" />
              ) : (
                <div aria-hidden className="mb-1 px-2.5 text-xs font-medium text-ink-3">
                  {label}
                </div>
              ))}
            {items
              .filter((i) => i.group === g)
              .map((i) => (
                <NavRow key={i.to} item={i} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
          </div>
        );
      })}
    </nav>
  );
}

/** Brand lockup: the eye doubles as the global activity indicator. */
export function BrandLink({ compact = false }: { compact?: boolean }) {
  const { role } = useAuth();
  const { active, blink } = useActivity();
  return (
    <Link to={homePath(role)} aria-label="Pramana home" className="inline-flex items-center gap-2 rounded text-ink">
      <EyeMark size={24} active={active} blink={blink} />
      {!compact && <span className="text-base font-semibold">Pramana</span>}
    </Link>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      style={{ width: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W }}
      className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out lg:flex"
    >
      <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "justify-center" : "px-4")}>
        <BrandLink compact={collapsed} />
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto pt-2 pb-4", collapsed ? "px-0" : "px-3")}>
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className={cn("shrink-0 border-t border-line p-3", collapsed && "flex justify-center px-0")}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-control text-sm text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink",
            collapsed ? "w-8 justify-center" : "w-full px-2.5",
          )}
        >
          {collapsed ? <PanelLeftOpen aria-hidden className="size-4" /> : <PanelLeftClose aria-hidden className="size-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
