import { useReducedMotion } from "motion/react";
import { forwardRef, useEffect, useState } from "react";
import { EyeMark } from "../brand/EyeMark";
import { Tooltip, cn } from "../ui2";

/** An occasional blink while idle, every 6 to 14 s; none with reduced motion or in a hidden tab. */
function useIdleBlink(enabled: boolean): number {
  const reduce = useReducedMotion();
  const [blink, setBlink] = useState(0);
  useEffect(() => {
    if (!enabled || reduce) return;
    let t = 0;
    const schedule = () => {
      t = window.setTimeout(() => {
        if (document.visibilityState === "visible") setBlink((b) => b + 1);
        schedule();
      }, 6000 + Math.random() * 8000);
    };
    schedule();
    return () => window.clearTimeout(t);
  }, [enabled, reduce]);
  return blink;
}

export interface DrishtiButtonProps {
  open: boolean;
  /** A reply is on its way: the eye scans */
  pending: boolean;
  /** A reply arrived while the window was closed */
  unread: boolean;
  /** Bumped once per reply, so the eye blinks when one lands */
  replies: number;
  controls: string;
  onClick: () => void;
}

/** The round button at the bottom right of every signed-in page. */
export const DrishtiButton = forwardRef<HTMLButtonElement, DrishtiButtonProps>(function DrishtiButton(
  { open, pending, unread, replies, controls, onClick },
  ref,
) {
  const idle = useIdleBlink(!pending);
  return (
    <div className="fixed right-4 z-[60]" style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}>
      <Tooltip content="Ask Drishti (दृष्टि)" disabled={open} className="whitespace-nowrap">
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) onClick();
          }}
          aria-label={open ? "Close Drishti" : unread ? "Ask Drishti, new reply" : "Ask Drishti"}
          aria-expanded={open}
          aria-controls={open ? controls : undefined}
          aria-haspopup="dialog"
          // Inline radius: the app-wide focus style rounds focused controls to 4 px
          style={{ borderRadius: 9999 }}
          className={cn(
            "relative inline-flex size-14 items-center justify-center border text-ink shadow-lg transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2",
            open ? "border-brand-300 bg-brand-soft" : "border-line-2 bg-surface hover:bg-surface-2",
          )}
        >
          <EyeMark size={30} active={pending} blink={idle + replies} />
          {unread && (
            <span aria-hidden className="absolute top-1 right-1 size-2.5 rounded-full bg-brand-solid ring-2 ring-surface" />
          )}
        </button>
      </Tooltip>
    </div>
  );
});
