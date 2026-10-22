import { Scale } from "lucide-react";

export const DISCLAIMER =
  "Decision support only. Findings are preliminary indicators for review by competent authorities. Pramana does not approve, reject or penalise any institution. Synthetic demo data.";

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[1440px] items-start gap-2.5 px-4 py-3 text-xs text-muted sm:px-6">
        <Scale aria-hidden className="mt-px size-3.5 shrink-0" />
        <p>{DISCLAIMER}</p>
      </div>
    </footer>
  );
}
