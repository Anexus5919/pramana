import { MotionConfig, AnimatePresence, motion, useIsPresent } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { EyeMark } from "../brand/EyeMark";
import { Sheet } from "../ui/Dialog";
import { ToastProvider } from "../ui/Toast";
import { cn } from "../ui/cn";
import { pageTransition } from "../ui/motion";
import { CommandPalette } from "./CommandPalette";
import { SIDEBAR_COLLAPSED_W, SIDEBAR_W, Sidebar, SidebarNav } from "./Sidebar";
import { ThemeProvider } from "./theme";
import { Topbar } from "./Topbar";

export const DISCLAIMER =
  "Decision support only. Findings are preliminary indicators for review by competent authorities. Pramana does not approve, reject or penalise any institution. Synthetic demo data.";

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-line px-4 py-5 sm:px-6 lg:px-8", className)}>
      <p className="mx-auto max-w-[1440px] text-xs leading-relaxed text-ink-3">{DISCLAIMER}</p>
    </footer>
  );
}

/** App-wide providers that sit inside the router: motion preferences, theme and toasts. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
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

/** Route key: workspace tabs share one key so switching tabs does not replay the page transition. */
function pageKey(pathname: string): string {
  const ws = pathname.match(/^\/applications\/[^/]+/);
  return ws ? ws[0] : pathname;
}

/** Keeps rendering the outgoing page while it animates out. */
function PresentOutlet() {
  const outlet = useOutlet();
  const present = useIsPresent();
  const last = useRef(outlet);
  if (present) last.current = outlet;
  return <>{last.current}</>;
}

export function AppShell() {
  const location = useLocation();
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
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [key]);

  return (
    <div
      className="min-h-dvh bg-canvas"
      style={{ ["--sidebar-w" as string]: `${collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W}px` }}
    >
      <a
        href="#main"
        className="sr-only z-[100] rounded-control bg-brand-solid px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[420px] opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)] bg-sky-soft dark:opacity-30"
      />
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <Sheet open={navOpen} onClose={() => setNavOpen(false)} side="left" width={288} title="Navigation" bare>
        <div className="flex h-16 items-center px-5">
          <span className="font-display text-[19px] font-semibold tracking-[-0.03em] text-ink">Pramana</span>
        </div>
        <div className="px-3 pb-6">
          <SidebarNav layoutGroup="drawer" onNavigate={() => setNavOpen(false)} />
        </div>
      </Sheet>
      <div className="relative flex min-h-dvh flex-col transition-[padding] duration-300 ease-in-out lg:pl-[var(--sidebar-w)]">
        <Topbar onOpenNav={() => setNavOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
        <main id="main" tabIndex={-1} className="relative mx-auto w-full max-w-[1440px] min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={key} variants={pageTransition} initial="initial" animate="enter" exit="exit" className="min-w-0">
              <PresentOutlet />
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer />
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
