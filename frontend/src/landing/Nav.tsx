import { ArrowRight } from "lucide-react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../brand";
import { spring, useWorkspaceHref } from "./kit";

const LINKS = [
  { id: "how", label: "How it works" },
  { id: "edits", label: "Edits" },
  { id: "network", label: "Cross-check" },
  { id: "ladder", label: "Trust ladder" },
  { id: "numbers", label: "Numbers" },
];

export default function Nav() {
  const href = useWorkspaceHref();
  const [active, setActive] = useState<string | null>(null);
  const [solid, setSolid] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 40));

  // scroll-spy: the link of the section under the middle of the viewport is marked current
  useEffect(() => {
    const els = LINKS.map((l) => document.getElementById(l.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((e) => io.observe(e));
    const top = document.getElementById("top");
    const ioTop = new IntersectionObserver(([e]) => e.isIntersecting && setActive(null), { rootMargin: "-45% 0px -50% 0px" });
    if (top) ioTop.observe(top);
    return () => {
      io.disconnect();
      ioTop.disconnect();
    };
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4">
      <nav
        aria-label="Primary"
        className={`lp-glass pointer-events-auto mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 rounded-full pr-2 pl-4 transition-[box-shadow,background-color] duration-300 sm:pl-5 ${solid ? "lp-glass-solid lp-shadow-md" : ""}`}
      >
        <a href="#top" aria-label="Pramana, back to top" className="shrink-0 rounded-full">
          <Wordmark size={28} />
        </a>
        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.id} className="relative">
              <a
                href={`#${l.id}`}
                aria-current={active === l.id ? "location" : undefined}
                className={`relative z-10 block rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${active === l.id ? "text-(--lp-brand-700)" : "text-(--lp-ink-2) hover:text-(--lp-ink)"}`}
              >
                {l.label}
              </a>
              {active === l.id && (
                <motion.span
                  layoutId="lp-nav-active"
                  className="absolute inset-0 rounded-full bg-(--lp-brand-50) ring-1 ring-(--lp-brand-100)"
                  transition={spring.snappy}
                  aria-hidden
                />
              )}
            </li>
          ))}
        </ul>
        <Link
          to={href}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-(--lp-brand-500) px-4 text-[13px] font-semibold text-white shadow-[0_8px_20px_-8px_rgb(139_61_255/0.8)] transition-colors hover:bg-(--lp-brand-600) active:scale-[0.97]"
        >
          Open workspace <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </nav>
    </header>
  );
}
