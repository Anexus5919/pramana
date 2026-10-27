import { Accessibility } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n";
import { useAppTheme } from "../shell/theme";
import { cn } from "../ui/cn";
import { IconButton } from "../ui2/Button";
import { SegmentedControl } from "../ui2/Tabs";
import { useDisplayPrefs, type Contrast, type TextSize } from "./prefs";

/**
 * Text size (A-, A, A+), contrast and, where the bar has no theme switch, the theme. Opens from one button in the
 * top bar, closes on Escape or a click outside, and returns focus to the button.
 */
export function AccessibilityMenu({ withTheme = false, className }: { withTheme?: boolean; className?: string }) {
  const t = useT();
  const { textSize, setTextSize, contrast, setContrast } = useDisplayPrefs();
  const { theme, toggle } = useAppTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = t("Accessibility options");
  return (
    <div ref={ref} className={cn("relative", className)}>
      <IconButton
        ref={btn}
        label={label}
        icon={<Accessibility aria-hidden />}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        active={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="absolute top-11 right-0 z-50 w-72 rounded-card border border-line bg-surface p-4 shadow-lg"
        >
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-3">{t("Text size")}</p>
              <SegmentedControl
                label={t("Text size")}
                value={textSize}
                onChange={(v) => setTextSize(v as TextSize)}
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
                options={[
                  { value: "sm", label: <SizeLabel mark="A-" name={t("smaller")} /> },
                  { value: "md", label: <SizeLabel mark="A" name={t("default")} /> },
                  { value: "lg", label: <SizeLabel mark="A+" name={t("larger")} /> },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-3">{t("Contrast")}</p>
              <SegmentedControl
                label={t("Contrast")}
                value={contrast}
                onChange={(v) => setContrast(v as Contrast)}
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
                options={[
                  { value: "standard", label: t("Standard") },
                  { value: "high", label: t("High contrast") },
                ]}
              />
            </div>
            {withTheme && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-ink-3">{t("Theme")}</p>
                <SegmentedControl
                  label={t("Theme")}
                  value={theme}
                  onChange={(v) => v !== theme && toggle()}
                  className="w-full [&>button]:flex-1 [&>button]:justify-center"
                  options={[
                    { value: "light", label: t("Light") },
                    { value: "dark", label: t("Dark") },
                  ]}
                />
              </div>
            )}
            <p className="border-t border-line pt-3 text-sm">
              <Link to="/accessibility-statement" className="text-brand-ink underline-offset-2 hover:underline" onClick={() => setOpen(false)}>
                {t("Accessibility statement")}
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** "A-" on screen; read out as "A- smaller", so the spoken name still contains the visible text. */
function SizeLabel({ mark, name }: { mark: string; name: string }) {
  return (
    <>
      <span className="font-semibold">{mark}</span>
      <span className="sr-only"> {name}</span>
    </>
  );
}
