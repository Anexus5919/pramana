import clsx from "clsx";
import {
  FilePlus,
  FileSearch,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  LogOut,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth, useLogout } from "../../auth/session";
import { roleLabel } from "../../lib/labels";
import type { Role } from "../../types";
import { Brand } from "./Brand";
import { Footer } from "./Footer";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="size-4" />, roles: ["officer", "verifier", "admin"] },
  { to: "/rules", label: "Rules", icon: <ScrollText className="size-4" />, roles: ["officer", "verifier", "admin"] },
  {
    to: "/verify-pdf",
    label: "Verify a PDF",
    icon: <FileSearch className="size-4" />,
    roles: ["officer", "verifier", "admin"],
  },
  {
    to: "/issuers",
    label: "Issuer simulator",
    icon: <FlaskConical className="size-4" />,
    roles: ["officer", "verifier", "admin"],
  },
  { to: "/audit", label: "Audit log", icon: <ShieldCheck className="size-4" />, roles: ["officer", "admin"] },
  { to: "/portal", label: "My applications", icon: <Inbox className="size-4" />, roles: ["institution"], end: true },
  { to: "/portal/new", label: "New application", icon: <FilePlus className="size-4" />, roles: ["institution"] },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function AppShell() {
  const { user, role, session } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const items = NAV.filter((n) => role && n.roles.includes(role));

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-on focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 sm:px-6">
          <Link to={role === "institution" ? "/portal" : "/dashboard"} className="rounded-md" aria-label="Pramana home">
            <Brand compact />
          </Link>
          <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  clsx(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    isActive ? "bg-primary-soft text-primary-ink" : "text-muted hover:bg-subtle hover:text-fg",
                  )
                }
              >
                {n.icon}
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            {user && (
              <div className="hidden items-center gap-2.5 md:flex">
                <span
                  aria-hidden
                  className="inline-flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-ink"
                >
                  {initials(user.display_name)}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="max-w-48 truncate text-sm font-medium text-fg">{user.display_name}</span>
                  <span className="text-xs text-subtle-fg">{session?.role_label ?? roleLabel[user.role]}</span>
                </span>
              </div>
            )}
            <ThemeToggle />
            <button
              type="button"
              onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted hover:bg-subtle hover:text-fg"
            >
              <LogOut aria-hidden className="size-4" />
              <span className="hidden lg:inline">Sign out</span>
              <span className="sr-only lg:hidden">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 outline-none sm:px-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
