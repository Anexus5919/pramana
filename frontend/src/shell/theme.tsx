import { Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useTheme } from "../lib/theme";
import { IconButton } from "../ui/Button";
import { dur } from "../ui/motion";

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
  const dark = theme === "dark";
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <IconButton
      label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
      className={className}
      icon={
        <motion.span
          key={theme}
          initial={mounted.current ? { rotate: -90, scale: 0.4, opacity: 0 } : false}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ duration: dur.ui }}
          className="inline-flex"
        >
          {dark ? <Moon /> : <Sun />}
        </motion.span>
      }
    />
  );
}
