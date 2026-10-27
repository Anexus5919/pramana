import { forwardRef, useState } from "react";
import { Tooltip, cn } from "../ui2";
import { DrishtiMascot, type MascotCue, type MascotMood } from "./DrishtiMascot";

const NAME = "Ask Drishti (दृष्टि)";

export interface DrishtiButtonProps {
  open: boolean;
  mood: MascotMood;
  cue: MascotCue | null;
  /** A reply arrived while the window was closed */
  unread: boolean;
  controls: string;
  onClick: () => void;
}

/** The round button at the bottom right of every signed-in page: Drishti's own face. */
export const DrishtiButton = forwardRef<HTMLButtonElement, DrishtiButtonProps>(function DrishtiButton(
  { open, mood, cue, unread, controls, onClick },
  ref,
) {
  const [hover, setHover] = useState(false);
  return (
    <div className="fixed right-4 z-[60]" style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}>
      <Tooltip content={NAME} disabled={open} className="whitespace-nowrap">
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) onClick();
          }}
          aria-label={open ? "Close Drishti" : unread ? `${NAME}, new reply` : NAME}
          aria-expanded={open}
          aria-controls={open ? controls : undefined}
          aria-haspopup="dialog"
          // Inline radius: the app-wide focus style rounds focused controls to 4 px
          style={{ borderRadius: 9999 }}
          className={cn(
            "relative inline-flex size-14 items-center justify-center shadow-lg transition-transform duration-150 ease-out hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:hover:scale-100",
            open && "ring-2 ring-brand-300 ring-offset-2 ring-offset-canvas",
          )}
        >
          <DrishtiMascot size={56} mood={mood} cue={cue} lookAt={open ? "panel" : null} hover={hover} />
          {unread && (
            <span aria-hidden className="absolute top-0.5 right-0.5 size-3 rounded-full bg-mismatch-dot ring-2 ring-surface" />
          )}
        </button>
      </Tooltip>
    </div>
  );
});
