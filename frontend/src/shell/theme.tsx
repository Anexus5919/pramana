import { Moon, Sun } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { useT } from "../i18n";
import { useTheme } from "../lib/theme";
import { IconButton } from "../ui2/Button";

type ThemeCtx = ReturnType<typeof useTheme>;
const Ctx = createContext<ThemeCtx | null>(null);

/** Shares one theme state between the toggle, the command palette and any page. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useTheme();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppTheme must be used inside ThemeProvider");
  return v;
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useAppTheme();
  const t = useT();
  const dark = theme === "dark";
  return (
    <IconButton
      label={t(dark ? "Switch to light theme" : "Switch to dark theme")}
      onClick={toggle}
      className={className}
      icon={dark ? <Moon aria-hidden /> : <Sun aria-hidden />}
    />
  );
}
