import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useSession } from "../auth/session";
import { fmtRelative } from "../lib/format";
import { cn } from "../ui/cn";
import { HI } from "./hi";

/**
 * Hindi and English for the screens an institution sees, and the sign-in page. Officials' screens stay English.
 * Strings are keyed by their English text, so a missing translation falls back to English and the code stays readable.
 * Text that comes from the server (letter items, officers' reasons, notification bodies) is shown as sent.
 */
export type Lang = "en" | "hi";
export type Vars = Record<string, string | number>;
export type T = (en: string, vars?: Vars) => string;

export const LANG_KEY = "pramana-lang";

function readPref(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

function fill(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/**
 * A key may carry a context after "@@" when one English word needs two Hindi words: "Change@@verb" is the button
 * and "Change" the column heading. English shows the text before "@@".
 */
function plain(s: string): string {
  const i = s.indexOf("@@");
  return i < 0 ? s : s.slice(0, i);
}

/** English text in the given language, with {name} placeholders filled. */
export function translate(lang: Lang, en: string, vars?: Vars): string {
  return fill(lang === "hi" ? (HI[en] ?? plain(en)) : plain(en), vars);
}

/** English stays English: for helpers called on officials' screens too. */
export const en: T = (s, vars) => fill(plain(s), vars);

interface LangCtx {
  /** The language this screen is shown in */
  lang: Lang;
  /** The viewer's saved choice; applies only where Hindi is offered */
  pref: Lang;
  setPref: (l: Lang) => void;
  /** Hindi is offered on this screen: the institution portal and the sign-in page */
  bilingual: boolean;
  t: T;
  /** Singular or plural English key by count; {n} is filled with the count */
  tn: (n: number, one: string, other: string, vars?: Vars) => string;
}

const Ctx = createContext<LangCtx | null>(null);

/** Where Hindi is offered: the sign-in page for everyone, and the portal for institution accounts. */
function offersHindi(pathname: string, role: string | undefined): boolean {
  if (pathname === "/login") return true;
  return role === "institution" && (pathname === "/portal" || pathname.startsWith("/portal/"));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<Lang>(readPref);
  const { pathname } = useLocation();
  const session = useSession();
  const bilingual = offersHindi(pathname, session.data?.user.role);
  const lang: Lang = bilingual ? pref : "en";

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setPref = useCallback((l: Lang) => {
    setPrefState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // storage may be unavailable; the choice holds for this tab
    }
  }, []);

  const value = useMemo<LangCtx>(() => {
    const t: T = (s, vars) => translate(lang, s, vars);
    return {
      lang,
      pref,
      setPref,
      bilingual,
      t,
      tn: (n, one, other, vars) => t(n === 1 ? one : other, { n, ...vars }),
    };
  }, [lang, pref, setPref, bilingual]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const FALLBACK: LangCtx = {
  lang: "en",
  pref: "en",
  setPref: () => {},
  bilingual: false,
  t: en,
  tn: (n, one, other, vars) => en(n === 1 ? one : other, { n, ...vars }),
};

/** The current screen's language and its translator. Outside the provider (tests, the standalone landing) it is English. */
export function useLang(): LangCtx {
  return useContext(Ctx) ?? FALLBACK;
}

export function useT(): T {
  return useLang().t;
}

/** Date in the screen's language: "28 Oct 2026" or "28 अक्तू॰ 2026". */
export function useDateFormat() {
  const { lang } = useLang();
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "2-digit", month: "short", year: "numeric" });
    return (v: string | Date | null | undefined, fallback = "") => {
      if (!v) return fallback;
      const d = typeof v === "string" ? parseDate(v) : v;
      return d ? f.format(d) : fallback;
    };
  }, [lang]);
}

/** Date and time in the screen's language, as fmtDateTime: "28 Oct 2026, 14:05:09". */
export function useDateTimeFormat() {
  const { lang } = useLang();
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return (v: string | Date | null | undefined, fallback = "") => {
      if (!v) return fallback;
      const d = typeof v === "string" ? parseDate(v) : v;
      return d ? f.format(d) : fallback;
    };
  }, [lang]);
}

/** Time since a moment: the English "13 min ago" as before, or "13 मिनट पहले" in Hindi. */
export function useRelativeTime() {
  const { lang } = useLang();
  return useCallback(
    (v: string | null | undefined) => {
      if (lang !== "hi") return fmtRelative(v);
      const d = v ? parseDate(v) : null;
      if (!d) return "";
      const s = Math.round((Date.now() - d.getTime()) / 1000);
      if (s < 45) return "अभी";
      const m = Math.round(s / 60);
      if (m < 60) return `${m} मिनट पहले`;
      const h = Math.round(m / 60);
      if (h < 24) return `${h} घंटे पहले`;
      return `${Math.round(h / 24)} दिन पहले`;
    },
    [lang],
  );
}

function parseDate(v: string): Date | null {
  // Backend timestamps may be naive UTC; treat them as UTC
  const s = /[zZ]|[+-]\d{2}:?\d{2}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : `${v}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The language switch. It names the other language in that language's own script, as Government of India
 * portals do, and is shown only where Hindi is offered.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { bilingual, lang, setPref } = useLang();
  if (!bilingual) return null;
  const next: Lang = lang === "hi" ? "en" : "hi";
  return (
    <button
      type="button"
      lang={next}
      onClick={() => setPref(next)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-control border border-line-2 px-2.5 text-sm font-medium text-ink-2 transition-colors duration-150 hover:border-ink-4 hover:text-ink",
        className,
      )}
    >
      {next === "hi" ? "हिंदी" : "English"}
    </button>
  );
}
