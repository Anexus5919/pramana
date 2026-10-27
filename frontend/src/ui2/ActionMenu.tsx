import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "./cn";
import { buttonStyles, type ButtonSize, type ButtonVariant } from "./Button";

export interface ActionMenuItem {
  id: string;
  label: ReactNode;
  /** One short line under the label, for decisions that need a hint */
  description?: ReactNode;
  icon?: ReactNode;
  /** Either an action or a route; `to` navigates */
  onSelect?: () => void;
  to?: string;
  disabled?: boolean;
  /** Red text, for destructive or decisive actions */
  danger?: boolean;
  /** Draws a separator above this item */
  separated?: boolean;
  hidden?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  /** Accessible name of the trigger and, for the "button" trigger, its text */
  label: string;
  /** "icon" is a square overflow button; "button" shows the label with a chevron */
  trigger?: "icon" | "button";
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  align?: "start" | "end";
  /** Menu width in px */
  width?: number;
  /** Opens the menu each time it changes to a new non-zero value, e.g. from a deep link */
  openSignal?: number;
  className?: string;
}

/** Dropdown of secondary actions. Arrow keys move, Enter selects, Escape closes and returns focus. */
export function ActionMenu({
  items,
  label,
  trigger = "icon",
  variant = "secondary",
  size = "md",
  icon,
  align = "end",
  width = 248,
  openSignal = 0,
  className,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const navigate = useNavigate();
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    if (!open) return;
    const first = list.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not([disabled])");
    first?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (visible.length === 0) return null;

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const nodes = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])") ?? []);
    const at = nodes.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nodes[(at + 1) % nodes.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nodes[(at - 1 + nodes.length) % nodes.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      nodes[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <div ref={root} className={cn("relative inline-flex", className)} onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={trigger === "icon" ? label : undefined}
        title={trigger === "icon" ? label : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={buttonStyles(variant, size, undefined, trigger === "icon")}
      >
        {trigger === "icon" ? (
          (icon ?? <MoreHorizontal aria-hidden />)
        ) : (
          <>
            {icon}
            {label}
            <ChevronDown aria-hidden className="-mr-0.5 opacity-70" />
          </>
        )}
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          style={{ width }}
          className={cn(
            "absolute top-full z-50 mt-1 rounded-card border border-line bg-surface p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {visible.map((item) => (
            <div key={item.id}>
              {item.separated && <div role="separator" className="my-1 h-px bg-line" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close();
                  if (item.to) navigate(item.to);
                  item.onSelect?.();
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-sm transition-colors duration-150 outline-none",
                  "hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                  item.danger ? "text-mismatch-fg" : "text-ink",
                )}
              >
                {item.icon && <span className="mt-0.5 shrink-0 text-ink-3 [&_svg]:size-4">{item.icon}</span>}
                <span className="min-w-0">
                  <span className="block font-medium">{item.label}</span>
                  {item.description && <span className="mt-0.5 block text-xs text-ink-3">{item.description}</span>}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
