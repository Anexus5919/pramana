import { ArrowLeft, Home } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { homePath, useSession } from "../../auth/session";
import { EyeMark, Wordmark } from "../../brand/EyeMark";
import { roleLabel } from "../../lib/labels";
import { Footer } from "../../shell/AppShell";
import { Button } from "../../ui/Button";
import { dur, ease } from "../../ui/motion";

/** How long the eye searches before it settles; it is looking for the page, then it has looked. */
const SEARCH_MS = 2600;

export default function NotFoundPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { data: session } = useSession();
  const home = session ? homePath(session.user.role) : "/";
  const homeLabel = session ? (session.user.role === "institution" ? "Go to my applications" : "Go to the dashboard") : "Go home";
  const [searching, setSearching] = useState(!reduce);
  const [blink, setBlink] = useState(0);
  const path = `${location.pathname}${location.search}`;
  const canGoBack = typeof window !== "undefined" && (window.history.state as { idx?: number } | null)?.idx ? true : false;

  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(() => {
      setSearching(false);
      setBlink((b) => b + 1);
    }, SEARCH_MS);
    return () => window.clearTimeout(t);
  }, [reduce]);

  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: dur.story, ease: ease.out, delay },
  });

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-sky-soft opacity-80 [mask-image:linear-gradient(to_bottom,black,transparent)] dark:opacity-30" />
      <header className="relative mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link to={home} className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-400" aria-label="Pramana home">
          <Wordmark size={30} />
        </Link>
        {session && (
          <span className="hidden text-sm text-ink-3 sm:inline">
            Signed in as <span className="font-medium text-ink-2">{session.user.display_name.replace(/\s*\(.*\)\s*$/, "")}</span>, {roleLabel[session.user.role] ?? session.role_label}
          </span>
        )}
      </header>

      <main id="main" className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pt-6 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: dur.story, ease: ease.out }}
          className="relative mb-8"
        >
          <EyeMark size={176} active={searching} blink={blink} className="relative text-ink" title={searching ? "Looking for the page" : "The page was not found"} />
        </motion.div>

        <motion.div {...rise(0.08)} className="eyebrow mb-3">
          Error 404
        </motion.div>
        <motion.h1 {...rise(0.12)} className="font-display text-4xl font-semibold tracking-display text-ink text-balance sm:text-5xl">
          This page is not here
        </motion.h1>
        <motion.p {...rise(0.18)} aria-live="polite" className="mt-4 max-w-lg text-md text-ink-2 text-pretty">
          {searching ? "Looking for it." : "Pramana looked and found nothing at this address."} The link may be out of date, or the page may
          belong to a different role.
        </motion.p>
        <motion.div {...rise(0.24)} className="mt-6 max-w-full">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 py-1.5 shadow-xs backdrop-blur">
            <span className="text-xs text-ink-3">Requested</span>
            <span className="truncate font-mono text-[13px] text-ink" title={path}>
              {path}
            </span>
          </span>
        </motion.div>
        <motion.div {...rise(0.3)} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" magnetic leadingIcon={<Home />} onClick={() => navigate(home)}>
            {homeLabel}
          </Button>
          <Button size="lg" variant="secondary" leadingIcon={<ArrowLeft />} onClick={() => (canGoBack ? navigate(-1) : navigate(home))}>
            Go back
          </Button>
        </motion.div>
      </main>

      <Footer className="relative" />
    </div>
  );
}
