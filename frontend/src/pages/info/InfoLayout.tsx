import { ChevronRight } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AccessibilityMenu } from "../../a11y/AccessibilityMenu";
import { homePath, useSession } from "../../auth/session";
import { Wordmark } from "../../brand/EyeMark";
import { useLang } from "../../i18n";
import { useAppSurface } from "../../shell/AppShell";
import { SiteFooter } from "../../site/SiteFooter";
import { cn } from "../../ui/cn";
import { ButtonLink } from "../../ui2/Button";

export interface InfoPageProps {
  title: string;
  /** One sentence under the title */
  summary?: ReactNode;
  children: ReactNode;
}

/**
 * A standard information page (policies, help, contact, sitemap): public, readable signed in or out, in the
 * signed-in app's type and colours, with the display options in the bar and the site footer below.
 */
export function InfoPage({ title, summary, children }: InfoPageProps) {
  useAppSurface();
  const { data: session } = useSession();
  const { pref } = useLang();
  const role = session?.user.role;

  useEffect(() => {
    document.title = `${title} | Pramana`;
    return () => {
      document.title = "Pramana";
    };
  }, [title]);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only z-[100] rounded-control bg-brand-solid px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[960px] items-center gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="Pramana home" className="rounded-control">
            <Wordmark size={24} />
          </Link>
          <span className="flex-1" />
          <AccessibilityMenu withTheme />
          {session ? (
            <ButtonLink to={homePath(role)}>{role === "institution" ? "Your applications" : "Review queue"}</ButtonLink>
          ) : (
            <ButtonLink to="/login" variant="primary">
              Sign in
            </ButtonLink>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 px-4 py-8 outline-none sm:px-6 lg:py-10">
        <article className="mx-auto max-w-[760px]">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm">
            <ol className="flex flex-wrap items-center gap-1.5 text-ink-3">
              <li>
                <Link to="/" className="rounded hover:text-ink">
                  Home
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight className="size-3.5" />
              </li>
              <li>
                <span aria-current="page" className="font-medium text-ink">
                  {title}
                </span>
              </li>
            </ol>
          </nav>
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {summary && <p className="mt-2 text-md text-ink-2 text-pretty">{summary}</p>}
          {pref === "hi" && (
            <p lang="hi" className="mt-4 rounded-control border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
              यह पृष्ठ अभी केवल अंग्रेज़ी में उपलब्ध है।
            </p>
          )}
          <Prose className="mt-8">{children}</Prose>
        </article>
      </main>
      <SiteFooter width="narrow" className="pb-8" />
    </div>
  );
}

/** Running text on the information pages: headings, paragraphs, lists and tables in the app's type scale. */
export function Prose({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "text-base leading-relaxed text-ink-2",
        "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_h2:first-child]:mt-0",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-md [&_h3]:font-semibold [&_h3]:text-ink",
        "[&_p]:mt-3 [&_p:first-child]:mt-0 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5",
        "[&_a]:text-brand-ink [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold [&_strong]:text-ink",
        "[&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A plain data table for the information pages. */
export function InfoTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full min-w-[520px] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line bg-surface-2 text-xs text-ink-3">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-4 py-2 align-top font-medium text-ink">
                    {c}
                  </th>
                ) : (
                  <td key={j} className="px-4 py-2 align-top text-ink-2">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A link to another site: opens in a new tab and says so. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens another website in a new tab)</span>
    </a>
  );
}
