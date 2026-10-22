import clsx from "clsx";
import type { ReactNode } from "react";

export function KeyValue({
  items,
  className,
  cols = 1,
}: {
  items: { label: ReactNode; value: ReactNode; key?: string }[];
  className?: string;
  cols?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={clsx(
        "grid gap-x-6 gap-y-2.5 text-sm",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((it, i) => (
        <div key={it.key ?? i} className="min-w-0">
          <dt className="text-xs text-subtle-fg">{it.label}</dt>
          <dd className="mt-0.5 break-words text-fg">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
