import { SearchX } from "lucide-react";
import { useLayoutEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { homePath, useSession } from "../../auth/session";
import { Wordmark } from "../../brand/EyeMark";
import { Footer } from "../../shell/AppShell";
import { ButtonLink, EmptyState, Page } from "../../ui2";

/** Signed-in visitors get the app look; anonymous ones keep the public v1 tokens. */
function useAppSurfaceWhen(on: boolean) {
  useLayoutEffect(() => {
    if (!on) return;
    const el = document.documentElement;
    const had = el.dataset.surface;
    el.dataset.surface = "app";
    return () => {
      if (had) el.dataset.surface = had;
      else delete el.dataset.surface;
    };
  }, [on]);
}

export default function NotFoundPage() {
  const location = useLocation();
  const { data: session } = useSession();
  const role = session?.user.role;
  useAppSurfaceWhen(!!session);
  const home = session ? homePath(role) : "/";
  const homeLabel = !session ? "Go to the home page" : role === "institution" ? "Go to your applications" : "Go to the review queue";
  const path = `${location.pathname}${location.search}`;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="flex h-14 items-center px-4 sm:px-6 lg:px-8">
          <Link to={home} aria-label="Pramana home" className="rounded-control">
            <Wordmark size={24} />
          </Link>
        </div>
      </header>
      <main id="main" className="flex flex-1 items-center px-4 py-12 sm:px-6 lg:px-8">
        <Page width="narrow">
          <EmptyState
            icon={<SearchX aria-hidden />}
            title={<h1 className="text-xl font-semibold text-ink">Page not found</h1>}
            description={
              <>
                The link may be old. Workspace links from before the redesign still redirect.
                <span className="mt-3 block truncate text-xs text-ink-3" title={path}>
                  Requested <code className="font-mono text-xs text-ink-2">{path}</code>
                </span>
              </>
            }
            action={
              <ButtonLink variant="primary" to={home}>
                {homeLabel}
              </ButtonLink>
            }
          />
        </Page>
      </main>
      <Footer />
    </div>
  );
}
