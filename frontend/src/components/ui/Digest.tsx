import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { shortHash } from "../../lib/format";

export function Digest({
  value,
  length = 10,
  label,
  className,
  copy = true,
}: {
  value: string | null | undefined;
  length?: number;
  label?: string;
  className?: string;
  copy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-xs text-subtle-fg">none</span>;
  return (
    <span className={clsx("inline-flex items-center gap-1", className)}>
      <code
        title={value}
        className="rounded bg-subtle px-1 py-px font-mono text-[12px] text-fg"
        aria-label={label ? `${label} ${value}` : value}
      >
        {shortHash(value, length)}
      </code>
      {copy && (
        <button
          type="button"
          className="rounded p-0.5 text-subtle-fg hover:bg-subtle hover:text-fg"
          aria-label={`Copy ${label ?? "value"}`}
          title="Copy full value"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      )}
    </span>
  );
}
