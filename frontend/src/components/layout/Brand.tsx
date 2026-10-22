import clsx from "clsx";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={clsx("shrink-0", className)}>
      <rect width="32" height="32" rx="7" fill="#25306b" />
      <path
        d="M9 23V9h7.5a4.5 4.5 0 0 1 0 9H13"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.5" cy="22.5" r="2.2" fill="#8fd3b0" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark className={compact ? "size-7" : "size-9"} />
      <span className="flex flex-col leading-tight">
        <span className={clsx("font-semibold tracking-tight text-fg", compact ? "text-[15px]" : "text-lg")}>
          Pramana
        </span>
        {!compact && <span className="text-xs text-subtle-fg">Evidence-linked approval scrutiny (prototype)</span>}
      </span>
    </span>
  );
}
