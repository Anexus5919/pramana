import { Link } from "react-router-dom";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#edits", label: "See through edits" },
  { href: "#ladder", label: "Trust ladder" },
  { href: "#numbers", label: "Numbers" },
];

export default function LandingFooter() {
  return (
    <footer className="bg-(--lp-pupil) px-4 pb-10 text-white/60 sm:px-6">
      <div className="mx-auto max-w-6xl border-t border-white/10 pt-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="lp-display flex items-center gap-2.5 text-[20px] font-semibold tracking-[-0.02em] text-white">
              <svg width="26" height="16" viewBox="0 0 26 16" aria-hidden>
                <path d="M1 8 C 6 1, 20 1, 25 8 C 20 15, 6 15, 1 8 Z" fill="none" stroke="#ba99ff" strokeWidth="1.5" />
                <rect x="9.5" y="4.5" width="7" height="7" rx="1" fill="#8b3dff" />
                <rect x="11.75" y="6.75" width="2.5" height="2.5" fill="#fffaf6" />
              </svg>
              Pramana
            </p>
            <p className="mt-2 text-[13.5px]">Smart India Hackathon 2026 · Problem statement 26261 · AICTE</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px]">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="rounded transition-colors hover:text-white">
                {l.label}
              </a>
            ))}
            <Link to="/login" className="rounded font-semibold text-white/85 transition-colors hover:text-white">
              Sign in
            </Link>
          </nav>
        </div>
        <p className="mt-10 max-w-3xl text-[13px] leading-relaxed text-white/50">
          Decision support only. Findings are preliminary indicators for review by competent authorities. Pramana does not approve,
          reject or penalise any institution. Synthetic demo data.
        </p>
      </div>
    </footer>
  );
}
