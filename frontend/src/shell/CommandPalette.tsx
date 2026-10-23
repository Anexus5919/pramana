import { useQuery } from "@tanstack/react-query";
import { Building2, Clock, LogOut, Moon, Search, Sun, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { api, qk } from "../api";
import { useAuth, useLogout } from "../auth/session";
import { appStatusMeta, humanize } from "../lib/labels";
import type { AppNavState } from "../ui/shared";
import { Kbd, cn, dur2, ease2 } from "../ui2";
import { navFor, workspacePath } from "./nav";
import { useAppTheme } from "./theme";

type Group = "Recent" | "Pages" | "Applications" | "Actions";

interface Command {
  id: string;
  group: Group;
  label: string;
  /** Plain text the search matches on, beside the label */
  hintText?: string;
  hint?: ReactNode;
  keywords?: string;
  icon: LucideIcon;
  run: () => void;
}

const RECENT_KEY = "pramana-recent-commands";
const MAX_RESULTS = 12;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage may be blocked; recents are a convenience only
  }
}

/** Subsequence match with bonuses for word starts and contiguous runs; 0 means no match. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = text.toLowerCase();
  if (!q) return 1;
  let score = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    const wordStart = found === 0 || /[\s\-_/.(]/.test(t[found - 1]);
    run = found === ti ? run + 1 : 0;
    score += 1 + (wordStart ? 3 : 0) + run * 2 - Math.min(found - ti, 6) * 0.2;
    ti = found + 1;
  }
  if (t.includes(query.toLowerCase().trim())) score += 10;
  return score;
}

/** Ctrl K: jump to a page or an application, switch theme or sign out. Officials only. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAuth();
  const logout = useLogout();
  const { theme, toggle } = useAppTheme();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(true);
  const id = useId();
  const apps = useQuery({ queryKey: qk.applications, queryFn: api.applications, enabled: open && !!role });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    restoreFocus.current = true;
    const opener = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => input.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      // Back to the trigger, unless Tab already moved focus somewhere on purpose
      if (restoreFocus.current) opener?.focus?.();
    };
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string, state?: AppNavState) => () => navigate(to, state ? { state } : undefined);
    const pages: Command[] = navFor(role).map((n) => ({
      id: `page:${n.to}`,
      group: "Pages",
      label: n.label,
      keywords: n.keywords,
      icon: n.icon,
      run: go(n.to),
    }));
    const appCmds: Command[] = (apps.data ?? []).map((a) => {
      const status = appStatusMeta[a.status]?.label ?? humanize(a.status);
      return {
        id: `app:${a.id}`,
        group: "Applications",
        label: a.institution.name,
        hintText: `${a.id} ${status}`,
        hint: (
          <>
            <code className="font-mono text-xs">{a.id}</code>
            <span aria-hidden> · </span>
            {status}
          </>
        ),
        keywords: `${a.institution.aicte_id} ${a.category} ${a.academic_year} ${a.institution.district} ${a.institution.state}`,
        icon: Building2,
        run: go(workspacePath(a.id), { institution: a.institution.name, from: location.pathname }),
      };
    });
    const actions: Command[] = [
      {
        id: "action:theme",
        group: "Actions",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        keywords: "dark light mode appearance",
        icon: theme === "dark" ? Sun : Moon,
        run: toggle,
      },
      {
        id: "action:signout",
        group: "Actions",
        label: "Sign out",
        keywords: "logout exit",
        icon: LogOut,
        run: () => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) }),
      },
    ];
    return [...pages, ...appCmds, ...actions];
  }, [role, apps.data, navigate, location.pathname, theme, toggle, logout]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const recentIds = readRecent();
      const recent = recentIds
        .map((rid) => commands.find((c) => c.id === rid))
        .filter((c): c is Command => !!c && c.group !== "Actions")
        .slice(0, 5)
        .map((c) => ({ ...c, group: "Recent" as const }));
      const rest = commands.filter((c) => !recentIds.includes(c.id));
      return [...recent, ...rest.filter((c) => c.group !== "Applications"), ...rest.filter((c) => c.group === "Applications").slice(0, 6)];
    }
    return commands
      .map((c) => ({ c, s: Math.max(fuzzyScore(q, c.label) * 1.5, fuzzyScore(q, `${c.label} ${c.hintText ?? ""} ${c.keywords ?? ""}`)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_RESULTS)
      .map((x) => x.c);
  }, [query, commands]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function choose(c: Command | undefined) {
    if (!c) return;
    pushRecent(c.id);
    onClose();
    c.run();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Home" && e.ctrlKey) {
      e.preventDefault();
      setIndex(0);
    } else if (e.key === "End" && e.ctrlKey) {
      e.preventDefault();
      setIndex(Math.max(0, results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[index]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }

  // Tab is not trapped: when focus leaves the palette, it closes and focus stays where Tab put it
  function onBlur(e: FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (next && !e.currentTarget.contains(next)) {
      restoreFocus.current = false;
      onClose();
    }
  }

  const status = apps.isPending && role ? "Loading applications" : `Nothing matches "${query.trim()}"`;
  let lastGroup = "";
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[16vh]">
          <motion.div
            className="absolute inset-0 bg-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: dur2.base, ease: ease2 } }}
            exit={{ opacity: 0, transition: { duration: dur2.fast, ease: ease2 } }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: dur2.base, ease: ease2 } }}
            exit={{ opacity: 0, transition: { duration: dur2.fast, ease: ease2 } }}
            className="relative w-full max-w-[560px] overflow-hidden rounded-card border border-line bg-surface shadow-lg"
            onKeyDown={onKeyDown}
            onBlur={onBlur}
          >
            <div className="flex h-12 items-center gap-3 border-b border-line px-4">
              <Search aria-hidden className="size-4 shrink-0 text-ink-3" />
              <input
                ref={input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages and applications"
                aria-label="Search pages and applications"
                className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none"
                role="combobox"
                aria-expanded="true"
                aria-controls={`${id}-list`}
                aria-activedescendant={results[index] ? `${id}-opt-${index}` : undefined}
                aria-autocomplete="list"
              />
            </div>
            <div ref={list} id={`${id}-list`} role="listbox" aria-label="Results" className="max-h-[min(56vh,432px)] overflow-y-auto p-1.5">
              {results.length === 0 && (
                <div role="status" className="px-3 py-8 text-center text-sm text-ink-3">
                  {status}
                </div>
              )}
              {results.map((c, i) => {
                const header = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                const Icon = c.group === "Recent" ? Clock : c.icon;
                const on = i === index;
                return (
                  <div key={`${c.group}-${c.id}`} role="presentation">
                    {header && (
                      <div role="presentation" className="px-2.5 pt-2.5 pb-1 text-xs font-medium text-ink-3">
                        {header}
                      </div>
                    )}
                    <div
                      id={`${id}-opt-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={on}
                      onPointerMove={() => setIndex(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(c)}
                      className={cn(
                        "flex h-9 cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-sm",
                        on ? "bg-brand-soft text-ink" : "text-ink-2",
                      )}
                    >
                      <Icon aria-hidden className={cn("size-4 shrink-0", on ? "text-brand-ink" : "text-ink-3")} />
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                      {c.hint && <span className="shrink-0 truncate text-xs text-ink-3">{c.hint}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> to move
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>Enter</Kbd> to open
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>Esc</Kbd> to close
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
