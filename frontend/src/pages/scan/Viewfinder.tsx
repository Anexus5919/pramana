import { QrCode } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../ui/cn";
import { dur, ease } from "../../ui/motion";
import { toneClass, type Tone } from "../../ui/tone";

/**
 * The photo inside camera-style corner brackets. While the server reads the QR a line sweeps the photo
 * (real work in progress); when the answer arrives the brackets take the result's colour and close in,
 * tying the verdict to the picture it came from.
 */
export function Viewfinder({
  preview,
  busy,
  tone,
  compact = false,
  small = false,
  placeholder,
}: {
  preview: string | null;
  busy: boolean;
  tone: Tone | null;
  compact?: boolean;
  /** A fixed small frame, for checks that have no photo to show */
  small?: boolean;
  /** Shown instead of the QR glyph when there is no photo, e.g. for a check opened from a scan link */
  placeholder?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const color = tone ? toneClass[tone].color : "var(--brand-500)";
  const corners: [string, number, number][] = [
    ["left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-[14px]", 1, 1],
    ["right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-[14px]", -1, 1],
    ["left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-[14px]", 1, -1],
    ["right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-[14px]", -1, -1],
  ];
  return (
    <div className={cn("relative mx-auto aspect-square w-full", small ? "max-w-[200px]" : compact ? "max-w-[180px] lg:max-w-[340px]" : "max-w-[300px] sm:max-w-[340px]")}>
      <div className="absolute inset-3 overflow-hidden rounded-[12px] bg-surface-2">
        {preview ? (
          <motion.img
            key={preview}
            src={preview}
            alt="The photo being checked"
            className="size-full object-cover"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: dur.panel, ease: ease.out }}
          />
        ) : (
          <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_50%_40%,var(--brand-soft),transparent_70%)]">
            {placeholder ?? <QrCode aria-hidden className="size-24 text-brand-400" strokeWidth={1.25} />}
          </div>
        )}
        {busy && preview && (
          <>
            <div aria-hidden className="absolute inset-0 bg-pupil/25" />
            {reduce ? (
              <div aria-hidden className="absolute inset-x-0 top-1/2 h-0.5 bg-brand-400 shadow-[0_0_12px_var(--brand-400)]" />
            ) : (
              <motion.div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 40%, color-mix(in oklab, var(--brand-400) 55%, transparent) 50%, transparent 60%)",
                }}
                initial={{ y: "-60%" }}
                animate={{ y: ["-60%", "60%"] }}
                transition={{ duration: 1.4, ease: ease.inOut, repeat: Infinity }}
              />
            )}
          </>
        )}
      </div>
      {corners.map(([c, dx, dy], i) => (
        <motion.span
          key={i}
          aria-hidden
          className={cn("absolute size-12 transition-colors duration-300", c)}
          style={{ borderColor: color }}
          animate={tone ? { x: [0, dx * 10, dx * 6], y: [0, dy * 10, dy * 6], opacity: 1 } : { x: 0, y: 0, opacity: busy ? [0.55, 1] : 1 }}
          transition={tone ? { duration: dur.story, ease: ease.out } : busy ? { duration: 0.7, repeat: Infinity, repeatType: "reverse" } : { duration: dur.ui }}
        />
      ))}
    </div>
  );
}
