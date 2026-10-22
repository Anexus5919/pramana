import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Clock, CornerDownLeft, LogOut, Moon, Search, Sun, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api, qk } from "../api";
import { useAuth, useLogout } from "../auth/session";
import { appStatusMeta, humanize } from "../lib/labels";
import { Kbd } from "../ui/Badge";
import { cn } from "../ui/cn";
import { dur, ease } from "../ui/motion";
import { applicationPath, navFor } from "./nav";
import { useAppTheme } from "./theme";

interface Command {
  id: string;
  group: "Recent" | "Pages" | "Applications" | "Actions";
  label: string;
  hint?: string;
  keywords?: string;
  icon: LucideIcon;
  run: () => void;
}

const RECENT_KEY = "pramana-recent-commands";

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

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const logout = useLogout();
  const { theme, toggle } = useAppTheme();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const apps = useQuery({ queryKey: qk.applications, queryFn: api.applications, enabled: open && !!role });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const opener = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => input.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      opener?.focus?.();
    };
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to);
    const pages: Command[] = navFor(role).map((n) => ({
      id: `page:${n.to}`,
      group: "Pages",
      label: n.label,
      keywords: n.keywords,
      icon: n.icon,
      run: go(n.to),
    }));
    const appCmds: Command[] = (apps.data ?? []).map((a) => ({
      id: `app:${a.id}`,
      group: "Applications",
      label: a.institution.name,
      hint: `${a.id} · ${appStatusMeta[a.status]?.label ?? humanize(a.status)}`,
      keywords: `${a.id} ${a.institution.aicte_id} ${a.category} ${a.academic_year} ${a.institution.district} ${a.institution.state}`,
      icon: Building2,
      run: go(applicationPath(role, a.id)),
    }));
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
  }, [role, apps.data, navigate, theme, toggle, logout]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const recentIds = readRecent();
      const recent = recentIds
        .map((rid) => commands.find((c) => c.id === rid))
        .filter((c): c is Command => !!c && c.group !== "Actions")
        .map((c) => ({ ...c, group: "Recent" as const }));
      const rest = commands.filter((c) => !recentIds.includes(c.id));
      return [...recent, ...rest.filter((c) => c.group !== "Applications"), ...rest.filter((c) => c.group === "Applications").slice(0, 6)];
    }
    return commands
      .map((c) => ({ c, s: Math.max(fuzzyScore(q, c.label) * 1.5, fuzzyScore(q, `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""}`)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
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
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[index]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  }

  let lastGroup = "";
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            className="absolute inset-0 bg-overlay backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.ui }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: dur.panel, ease: ease.out } }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: dur.micro } }}
            className="relative w-full max-w-[620px] overflow-hidden rounded-panel border border-line bg-surface shadow-lg"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search aria-hidden className="size-[18px] shrink-0 text-ink-3" />
              <input
                ref={input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages, applications, AICTE IDs"
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none"
                role="combobox"
                aria-expanded="true"
                aria-controls={`${id}-list`}
                aria-activedescendant={results[index] ? `${id}-opt-${index}` : undefined}
                aria-autocomplete="list"
              />
              <Kbd>Esc</Kbd>
            </div>
            <div ref={list} id={`${id}-list`} role="listbox" aria-label="Results" className="max-h-[min(56vh,460px)] overflow-y-auto p-2">
              {results.length === 0 && (
                <div className="px-3 py-10 text-center text-sm text-ink-3">
                  {apps.isPending && role ? "Loading applications" : `Nothing matches "${query}"`}
                </div>
              )}
              {results.map((c, i) => {
                const header = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                const Icon = c.group === "Recent" ? Clock : c.icon;
                const on = i === index;
                return (
                  <div key={`${c.group}-${c.id}`}>
                    {header && <div className="eyebrow px-3 pt-3 pb-1.5">{header}</div>}
                    <div
                      id={`${id}-opt-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={on}
                      onPointerMove={() => setIndex(i)}
                      onClick={() => choose(c)}
                      className={cn(
                        "relative flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5",
                        on ? "text-ink" : "text-ink-2",
                      )}
                    >
                      {on && (
                        <motion.span
                          layoutId={`${id}-hl`}
                          transition={{ type: "spring", stiffness: 520, damping: 40 }}
                          className="absolute inset-0 rounded-[10px] bg-brand-soft"
                          aria-hidden
                        />
                      )}
                      <span
                        className={cn(
                          "relative inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] border",
                          on ? "border-brand-200 bg-surface text-brand-500" : "border-line bg-surface-2 text-ink-3",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="relative min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.label}</span>
                        {c.hint && <span className="block truncate font-mono text-[11px] text-ink-3">{c.hint}</span>}
                      </span>
                      {on && (
                        <span className="relative text-brand-ink">
                          {c.group === "Actions" ? <CornerDownLeft className="size-4" /> : <ArrowRight className="size-4" />}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-line bg-surface-2/60 px-4 py-2.5 text-xs text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> to move
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>Enter</Kbd> to open
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
