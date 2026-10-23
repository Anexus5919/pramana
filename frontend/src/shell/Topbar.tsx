import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LogOut, Menu, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import { api, qk } from "../api";
import { useAuth, useLogout } from "../auth/session";
import { roleLabel } from "../lib/labels";
import { Kbd } from "../ui/Badge";
import { IconButton } from "../ui/Button";
import { cn } from "../ui/cn";
import { dur, ease } from "../ui/motion";
import { WORKSPACE_TAB_LABEL } from "./nav";
import { ThemeToggle } from "./theme";

interface Crumb {
  label: string;
  to?: string;
  mono?: boolean;
}

function useAppName(appId: string | undefined): string | undefined {
  const { data } = useQuery({
    queryKey: qk.application(appId ?? ""),
    queryFn: () => api.application(appId ?? ""),
    enabled: !!appId,
    staleTime: 60_000,
  });
  return data?.institution.name;
}

function useCrumbs(): Crumb[] {
  const { pathname } = useLocation();
  const ws = matchPath("/applications/:appId/:tab?", pathname);
  const portalApp = matchPath("/portal/applications/:appId", pathname);
  const appId = ws?.params.appId ?? portalApp?.params.appId;
  const name = useAppName(appId);

  if (ws) {
    const tab = ws.params.tab ?? "overview";
    return [
      { label: "Dashboard", to: "/dashboard" },
      { label: name ?? appId ?? "Application", to: `/applications/${encodeURIComponent(appId ?? "")}` },
      { label: WORKSPACE_TAB_LABEL[tab] ?? tab },
    ];
  }
  if (portalApp) return [{ label: "My applications", to: "/portal" }, { label: name ?? appId ?? "Application" }];
  const map: Record<string, Crumb[]> = {
    "/dashboard": [{ label: "Dashboard" }],
    "/rules": [{ label: "Rules" }],
    "/issuers": [{ label: "Issuer simulator" }],
    "/verify-pdf": [{ label: "Verify a PDF" }],
    "/audit": [{ label: "Audit log" }],
    "/platform": [{ label: "Platform" }],
    "/portal": [{ label: "My applications" }],
    "/portal/new": [{ label: "My applications", to: "/portal" }, { label: "New application" }],
  };
  return map[pathname.replace(/\/$/, "")] ?? [{ label: "Pramana" }];
}

function Breadcrumbs() {
  const crumbs = useCrumbs();
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${i}-${c.label}`} className={cn("flex min-w-0 items-center gap-1.5", !last && "hidden shrink sm:flex")}>
              {c.to && !last ? (
                <Link to={c.to} className="truncate rounded text-ink-3 transition-colors hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <motion.span
                  key={c.label}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: dur.ui, ease: ease.out }}
                  aria-current={last ? "page" : undefined}
                  className={cn("truncate font-medium", last ? "text-ink" : "text-ink-3")}
                >
                  {c.label}
                </motion.span>
              )}
              {!last && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-ink-4" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function initials(name: string) {
  return name
    .replace(/\(.*\)/, "")
    .split(/\s+/)
    .filter((p) => /^[A-Za-z]/.test(p))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function UserMenu() {
  const { user, session } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const role = session?.role_label || roleLabel[user.role];
  const name = user.display_name.replace(/\s*\(.*\)\s*$/, "");

  return (
    <div ref={ref} className="relative">
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2.5 rounded-full py-1 pr-1 pl-1 transition-colors hover:bg-surface-2 xl:pr-3"
      >
        <span
          aria-hidden
          className="inline-flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]"
        >
          {initials(user.display_name) || "U"}
        </span>
        <span className="hidden min-w-0 flex-col text-left leading-tight xl:flex">
          <span className="max-w-40 truncate text-sm font-medium text-ink">{name}</span>
          <span className="max-w-40 truncate text-[11px] text-ink-3">{role}</span>
        </span>
        <span className="sr-only">Account menu for {user.display_name}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Account"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: dur.ui, ease: ease.out } }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: dur.micro } }}
            style={{ originX: 1, originY: 0 }}
            className="absolute top-12 right-0 z-50 w-64 overflow-hidden rounded-card border border-line bg-surface p-1.5 shadow-lg"
          >
            <div className="px-3 pt-2 pb-3">
              <div className="truncate text-sm font-semibold text-ink">{user.display_name}</div>
              <div className="mt-0.5 truncate text-xs text-ink-3">{role}</div>
              <div className="mt-2 inline-flex rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                {user.username}
              </div>
            </div>
            <div className="h-px bg-line" />
            <button
              type="button"
              role="menuitem"
              autoFocus
              onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
              className="mt-1 flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function Topbar({ onOpenNav, onOpenPalette }: { onOpenNav: () => void; onOpenPalette: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-canvas/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <IconButton label="Open navigation" icon={<Menu />} className="lg:hidden" onClick={onOpenNav} />
        <div className="min-w-0 flex-1">
          <Breadcrumbs />
        </div>
        <button
          type="button"
          onClick={onOpenPalette}
          className="group flex h-10 items-center gap-2.5 rounded-[10px] border border-line bg-surface/80 pr-2 pl-3 text-sm text-ink-3 shadow-xs transition-[border-color,box-shadow,color] hover:border-line-2 hover:text-ink-2 hover:shadow-sm md:w-72"
          aria-label="Search pages and applications"
          aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="hidden flex-1 text-left md:inline">Search or jump to</span>
          <span className="hidden items-center gap-1 md:inline-flex">
            <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
