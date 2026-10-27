import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LogOut, Menu, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, matchPath, useLocation, useNavigate } from "react-router-dom";
import { api, qk } from "../api";
import { AccessibilityMenu } from "../a11y/AccessibilityMenu";
import { useAuth, useLogout } from "../auth/session";
import { LanguageToggle, useT } from "../i18n";
import { roleLabel } from "../lib/labels";
import { Kbd } from "../ui/Badge";
import { cn } from "../ui/cn";
import { IconButton } from "../ui2/Button";
import { PORTAL_NAV, WORKSPACE_CRUMB_LABEL, workspacePath } from "./nav";
import { NotificationBell } from "./NotificationBell";
import { BrandLink } from "./Sidebar";
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
    const tab = ws.params.tab ?? "summary";
    return [
      { label: "Review queue", to: "/dashboard" },
      { label: name ?? appId ?? "Application", to: workspacePath(appId ?? "") },
      { label: WORKSPACE_CRUMB_LABEL[tab] ?? tab },
    ];
  }
  if (portalApp) return [{ label: "Applications", to: "/portal" }, { label: name ?? appId ?? "Application" }];
  if (matchPath("/integrity/:view?", pathname))
    return matchPath("/integrity/faculty", pathname)
      ? [{ label: "Tools" }, { label: "Integrity", to: "/integrity" }, { label: "Faculty overlaps" }]
      : [{ label: "Tools" }, { label: "Integrity" }];
  const map: Record<string, Crumb[]> = {
    "/dashboard": [{ label: "Review queue" }],
    "/rules": [{ label: "Governance" }, { label: "Rules" }],
    "/issuers": [{ label: "Tools" }, { label: "Issuer simulator" }],
    "/analyse": [{ label: "Tools" }, { label: "Analyse a document" }],
    "/audit": [{ label: "Governance" }, { label: "Audit log" }],
    "/platform": [{ label: "Governance" }, { label: "Platform" }],
    "/portal": [{ label: "Applications" }],
    "/portal/new": [{ label: "Applications", to: "/portal" }, { label: "New application" }],
    "/ui-kit": [{ label: "UI kit" }],
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
                <span aria-current={last ? "page" : undefined} className={cn("truncate", last ? "font-medium text-ink" : "text-ink-3")}>
                  {c.label}
                </span>
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
  const t = useT();
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
  const role = t(session?.role_label || roleLabel[user.role]);
  const name = user.display_name.replace(/\s*\(.*\)\s*$/, "");

  return (
    <div ref={ref} className="relative">
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-control py-1 pr-1 pl-1 transition-colors duration-150 hover:bg-surface-2 xl:pr-2.5"
      >
        <span
          aria-hidden
          className="inline-flex size-7 items-center justify-center rounded-full bg-surface-3 text-xs font-medium text-ink-2"
        >
          {initials(user.display_name) || "U"}
        </span>
        <span className="hidden min-w-0 flex-col text-left leading-tight xl:flex">
          <span className="max-w-40 truncate text-sm font-medium text-ink">{name}</span>
          <span className="max-w-40 truncate text-xs text-ink-3">{role}</span>
        </span>
        <span className="sr-only">{t("Account menu for {name}", { name: user.display_name })}</span>
      </button>
      {open && (
          <div
            role="menu"
            aria-label={t("Account")}
            className="absolute top-11 right-0 z-50 w-64 overflow-hidden rounded-card border border-line bg-surface p-1 shadow-lg"
          >
            <div className="px-3 pt-2 pb-3">
              <div className="truncate text-sm font-semibold text-ink">{user.display_name}</div>
              <div className="mt-0.5 truncate text-xs text-ink-3">{role}</div>
              <div className="mt-1 font-mono text-xs text-ink-3">{user.username}</div>
            </div>
            <div className="h-px bg-line" />
            <button
              type="button"
              role="menuitem"
              autoFocus
              onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
              className="mt-1 flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
            >
              <LogOut className="size-4" aria-hidden />
              {t("Sign out")}
            </button>
          </div>
        )}
    </div>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** The tab title names the page: the breadcrumb trail, deepest first, then Pramana. */
function useDocumentTitle() {
  const crumbs = useCrumbs();
  const t = useT();
  const title = [...crumbs].reverse().map((c) => t(c.label)).join(" | ");
  useEffect(() => {
    document.title = title && title !== "Pramana" ? `${title} | Pramana` : "Pramana";
    return () => {
      document.title = "Pramana";
    };
  }, [title]);
}

export function Topbar({
  onOpenNav,
  onOpenPalette,
  portal = false,
}: {
  onOpenNav: () => void;
  onOpenPalette: () => void;
  /** Institution layout: brand and links in the bar, no sidebar */
  portal?: boolean;
}) {
  const t = useT();
  useDocumentTitle();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {portal ? (
          <>
            <BrandLink />
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <nav aria-label={t("Main")} className="flex min-w-0 flex-1 items-center gap-1">
              {PORTAL_NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex h-8 items-center rounded-control px-2.5 text-sm transition-colors duration-150",
                      isActive ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )
                  }
                >
                  {t(n.label)}
                </NavLink>
              ))}
            </nav>
          </>
        ) : (
          <>
            <IconButton label="Open navigation" icon={<Menu />} className="lg:hidden" onClick={onOpenNav} />
            <div className="min-w-0 flex-1">
              <Breadcrumbs />
            </div>
            <button
              type="button"
              onClick={onOpenPalette}
              className="flex h-8 items-center gap-2 rounded-control border border-line-2 bg-surface pr-1.5 pl-2.5 text-sm text-ink-3 transition-colors duration-150 hover:border-ink-4 hover:text-ink-2 md:w-64"
              aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
            >
              <Search className="size-4 shrink-0" aria-hidden />
              {/* Named "Search pages and applications": the visible word first, so voice control matches it */}
              <span className="flex-1 text-left max-md:sr-only">Search</span>
              <span className="sr-only"> pages and applications</span>
              <span aria-hidden className="hidden items-center gap-1 md:inline-flex">
                <Kbd>{isMac ? "Cmd" : "Ctrl"}</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
          </>
        )}
        {portal && <LanguageToggle />}
        <NotificationBell />
        <AccessibilityMenu withTheme />
        <ThemeToggle className="hidden sm:inline-flex" />
        <UserMenu />
      </div>
    </header>
  );
}
