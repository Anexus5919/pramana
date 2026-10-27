import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Viewer display preferences: text size and contrast. They live on <html> as data-text-size and data-contrast,
 * which index.css turns into a root font size and a high-contrast token set; index.html applies the saved values
 * before the first paint. Both are kept per browser in localStorage.
 */
export type TextSize = "sm" | "md" | "lg";
export type Contrast = "standard" | "high";

export const TEXT_SIZE_KEY = "pramana-text-size";
export const CONTRAST_KEY = "pramana-contrast";

function read<V extends string>(key: string, allowed: readonly V[], fallback: V): V {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as V) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage may be unavailable in private windows; the choice still holds for this tab
  }
}

interface PrefsCtx {
  textSize: TextSize;
  setTextSize: (s: TextSize) => void;
  contrast: Contrast;
  setContrast: (c: Contrast) => void;
}

const Ctx = createContext<PrefsCtx | null>(null);

export function DisplayPrefsProvider({ children }: { children: ReactNode }) {
  const [textSize, setSize] = useState<TextSize>(() => read(TEXT_SIZE_KEY, ["sm", "md", "lg"] as const, "md"));
  const [contrast, setCon] = useState<Contrast>(() => read(CONTRAST_KEY, ["standard", "high"] as const, "standard"));

  useEffect(() => {
    const el = document.documentElement;
    if (textSize === "md") delete el.dataset.textSize;
    else el.dataset.textSize = textSize;
  }, [textSize]);

  useEffect(() => {
    const el = document.documentElement;
    if (contrast === "high") el.dataset.contrast = "high";
    else delete el.dataset.contrast;
  }, [contrast]);

  const setTextSize = useCallback((s: TextSize) => {
    setSize(s);
    write(TEXT_SIZE_KEY, s);
  }, []);
  const setContrast = useCallback((c: Contrast) => {
    setCon(c);
    write(CONTRAST_KEY, c);
  }, []);

  const value = useMemo(() => ({ textSize, setTextSize, contrast, setContrast }), [textSize, setTextSize, contrast, setContrast]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDisplayPrefs(): PrefsCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDisplayPrefs must be used inside DisplayPrefsProvider");
  return v;
}
