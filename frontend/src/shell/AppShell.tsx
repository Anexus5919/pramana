import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/session";
import { EyeMark } from "../brand/EyeMark";
import { DisplayPrefsProvider } from "../a11y/prefs";
import { Drishti } from "../drishti";
import { LanguageProvider, useT } from "../i18n";
import { SiteFooter } from "../site/SiteFooter";
import { Sheet } from "../ui/Dialog";
import { ToastProvider } from "../ui/Toast";
import { cn } from "../ui/cn";
import { CommandPalette } from "./CommandPalette";
import { BrandLink, SIDEBAR_COLLAPSED_W, SIDEBAR_W, Sidebar, SidebarNav } from "./Sidebar";
import { ThemeProvider } from "./theme";
import { Topbar } from "./Topbar";

export { DISCLAIMER } from "../site/SiteFooter";

/** The site footer for pages outside the shell (the scan page, not found, the session error screen). */
export function Footer({ className }: { className?: string }) {
  return <SiteFooter className={cn("pb-6", className)} />;
}

/** App-wide providers that sit inside the router: motion preferences, theme, display preferences, language and toasts. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <DisplayPrefsProvider>
          <LanguageProvider>
            <ToastProvider>{children}</ToastProvider>
          </LanguageProvider>
        </DisplayPrefsProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}

/** Centered eye while a session or lazy page resolves. */
export function FullScreenLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas text-ink">
      <EyeMark size={56} active />
      <span className="text-sm text-ink-3">{label}</span>
    </div>
  );
}

const COLLAPSE_KEY = "pramana-sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Route key: workspace sections share one key so switching sections keeps scroll position. */
function pageKey(pathname: string): string {
  const ws = pathname.match(/^\/applications\/[^/]+/);
  return ws ? ws[0] : pathname;
}

/** Marks <html> as the signed-in app surface so the v2 tokens in index.css apply, including to portalled dialogs. */
export function useAppSurface() {
  useLayoutEffect(() => {
    const el = document.documentElement;
    el.dataset.surface = "app";
    return () => {
      delete el.dataset.surface;
    };
  }, []);
}

export function AppShell() {
  useAppSurface();
  const location = useLocation();
  const { role } = useAuth();
  const portal = role === "institution";
  const t = useT();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const key = pageKey(location.pathname);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // storage may be unavailable; the preference just will not persist
      }
      return !c;
    });
  }, []);

  useEffect(() => {
    if (portal) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [portal]);

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [key]);

  return (
    <div
      className="min-h-dvh bg-canvas"
      style={{ ["--sidebar-w" as string]: portal ? "0px" : `${collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W}px` }}
    >
      <a
        href="#main"
        className="sr-only z-[100] rounded-control bg-brand-solid px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("Skip to content")}
      </a>
      {!portal && (
        <>
          <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
          <Sheet open={navOpen} onClose={() => setNavOpen(false)} side="left" width={272} title="Navigation" bare>
            <div className="flex h-14 items-center px-4">
              <BrandLink />
            </div>
            <div className="px-3 pb-6">
              <SidebarNav onNavigate={() => setNavOpen(false)} />
            </div>
          </Sheet>
        </>
      )}
      <div className="flex min-h-dvh flex-col transition-[padding] duration-200 ease-out lg:pl-[var(--sidebar-w)]">
        <Topbar portal={portal} onOpenNav={() => setNavOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
        <main id="main" tabIndex={-1} className="w-full min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
        {/* Bottom padding clears Drishti's button, so the last line can scroll out from under it */}
        <SiteFooter width={portal ? "narrow" : "wide"} className="pb-24" />
      </div>
      {!portal && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
      <Drishti />
    </div>
  );
}
