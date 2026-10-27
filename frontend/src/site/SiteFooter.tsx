import { Link } from "react-router-dom";
import { useLang } from "../i18n";
import { cn } from "../ui/cn";
import { contentDateLabel } from "./build";
import { SITE_PAGES } from "./links";

export const DISCLAIMER =
  "Decision support only. Findings are preliminary indicators for review by competent authorities. Pramana does not approve, reject or penalise any institution. Synthetic demo data.";

export const OWNERSHIP = "Pramana is a prototype for AICTE, built for Smart India Hackathon 2026 (problem statement 26261). It is not an official AICTE or Government of India website.";

const WIDTH = {
  narrow: "max-w-[960px]",
  default: "max-w-[1280px]",
  wide: "max-w-[1600px]",
} as const;

/**
 * The footer on every page outside the landing: the information pages, the decision-support line, who runs the
 * site and when its content last changed. Labels follow the screen's language; the pages themselves are English.
 */
export function SiteFooter({ width = "default", className }: { width?: keyof typeof WIDTH; className?: string }) {
  const { lang, t } = useLang();
  const date = contentDateLabel(lang);
  return (
    <footer className={cn("px-4 sm:px-6 lg:px-8", className)}>
      <div className={cn("mx-auto space-y-2 border-t border-line pt-4 text-xs text-ink-3", WIDTH[width])}>
        <nav aria-label={t("Site information")}>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {SITE_PAGES.map((p) => (
              <li key={p.to}>
                <Link to={p.to} className="rounded text-ink-2 underline-offset-2 hover:text-ink hover:underline">
                  {t(p.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="leading-relaxed">{t(DISCLAIMER)}</p>
        <p className="leading-relaxed">
          {t(OWNERSHIP)}
          {date && (
            <>
              {" "}
              <span className="whitespace-nowrap">{t("Last updated: {date}", { date })}</span>
            </>
          )}
        </p>
      </div>
    </footer>
  );
}
