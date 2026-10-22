import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

// Count-up driven by requestAnimationFrame; runs once on first view and jumps to the value under reduced motion
export function Count({
  value,
  decimals = 0,
  duration = 1.4,
  delay = 0,
  className = "",
  prefix = "",
  suffix = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  delay?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setShown(value);
      return;
    }
    let raf = 0;
    let start = -1;
    const tick = (t: number) => {
      if (start < 0) start = t + delay * 1000;
      const p = Math.min(1, Math.max(0, (t - start) / (duration * 1000)));
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, value, duration, delay]);
  const text = `${prefix}${value.toFixed(decimals)}${suffix}`;
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {prefix}
        {shown.toFixed(decimals)}
        {suffix}
      </span>
    </span>
  );
}
