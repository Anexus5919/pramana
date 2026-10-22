import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { ease } from "./motion";

export interface CounterProps {
  value: number;
  /** Seconds for the first count-up */
  duration?: number;
  decimals?: number;
  className?: string;
  format?: (n: number) => string;
}

const fmt = (n: number, d: number) => n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Counts up once when first scrolled into view; later changes tween from the previous value. */
export function Counter({ value, duration = 1.1, decimals = 0, className, format }: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const shown = useRef(0);
  const [display, setDisplay] = useState(reduce ? value : 0);
  const render = format ?? ((n: number) => fmt(n, decimals));

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      shown.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration: shown.current === 0 ? duration : 0.5,
      ease: ease.out,
      onUpdate: (v) => {
        shown.current = v;
        setDisplay(v);
      },
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      <span className="sr-only">{render(value)}</span>
      <span aria-hidden>{render(decimals ? display : Math.round(display))}</span>
    </span>
  );
}
