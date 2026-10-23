import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "../ui/cn";

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right";
  /** CSS width, e.g. "120px" or "30%" */
  width?: string;
  /** Hide on narrow viewports; the row link column should never be hidden */
  hideBelow?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Accessible name of the table (rendered as a visually hidden caption) */
  label: string;
  /** Row navigation: the `linkColumn` cell becomes a real link and the whole row is clickable */
  rowHref?: (row: T) => string;
  /** Router state passed with row navigation */
  rowState?: (row: T) => unknown;
  /** Column id whose cell holds the row link; defaults to the first column */
  linkColumn?: string;
  /** For rows that open a panel instead of a route */
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  defaultSort?: { id: string; dir: "asc" | "desc" };
  /** comfortable: 48px rows (queues, lists); compact: 36px rows (dense reference tables) */
  density?: "comfortable" | "compact";
  empty?: ReactNode;
  className?: string;
}

const HIDE: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
  "2xl": "hidden 2xl:table-cell",
};

function isInteractive(el: EventTarget | null): boolean {
  return el instanceof Element && !!el.closest("a,button,input,select,textarea,label,[role=button],[role=menuitem]");
}

/** Sortable table with a hover state and row click. Lives inside a Panel with padding="none". */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  label,
  rowHref,
  rowState,
  linkColumn,
  onRowClick,
  selectedKey,
  defaultSort,
  density = "comfortable",
  empty,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const navigate = useNavigate();
  const linkCol = linkColumn ?? columns[0]?.id;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, columns, sort]);

  const clickable = !!rowHref || !!onRowClick;
  const cellPad = density === "compact" ? "h-9 px-3" : "h-12 px-4";

  return (
    <div className={cn("min-w-0 overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => {
              const active = sort?.id === c.id;
              const ariaSort = active ? (sort?.dir === "asc" ? "ascending" : "descending") : c.sortValue ? "none" : undefined;
              return (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={ariaSort}
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    "h-9 px-4 text-xs font-medium whitespace-nowrap text-ink-3",
                    density === "compact" && "px-3",
                    c.align === "right" ? "text-right" : "text-left",
                    c.hideBelow && HIDE[c.hideBelow],
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSort((s) => (s?.id === c.id ? { id: c.id, dir: s.dir === "asc" ? "desc" : "asc" } : { id: c.id, dir: "asc" }))
                      }
                      className={cn(
                        "-mx-1 inline-flex items-center gap-1 rounded px-1 transition-colors duration-150 hover:text-ink",
                        active && "text-ink",
                      )}
                    >
                      {c.header}
                      {active ? (
                        sort?.dir === "asc" ? (
                          <ArrowUp aria-hidden className="size-3" />
                        ) : (
                          <ArrowDown aria-hidden className="size-3" />
                        )
                      ) : (
                        <ChevronsUpDown aria-hidden className="size-3 opacity-50" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-ink-3">
                {empty ?? "Nothing to show."}
              </td>
            </tr>
          ) : (
            sorted.map((row) => {
              const key = rowKey(row);
              const href = rowHref?.(row);
              const selected = selectedKey != null && selectedKey === key;
              return (
                <tr
                  key={key}
                  aria-selected={selectedKey != null ? selected : undefined}
                  onClick={
                    clickable
                      ? (e) => {
                          if (isInteractive(e.target) || window.getSelection()?.toString()) return;
                          if (href) navigate(href, { state: rowState?.(row) });
                          else onRowClick?.(row);
                        }
                      : undefined
                  }
                  className={cn(
                    "border-b border-line transition-colors duration-150 last:border-b-0",
                    clickable && "cursor-pointer hover:bg-surface-2",
                    selected && "bg-brand-soft hover:bg-brand-soft",
                  )}
                >
                  {columns.map((c) => {
                    const content = c.cell(row);
                    const isLink = c.id === linkCol;
                    return (
                      <td
                        key={c.id}
                        className={cn(
                          cellPad,
                          "align-middle text-ink",
                          c.align === "right" && "text-right",
                          c.hideBelow && HIDE[c.hideBelow],
                          c.className,
                        )}
                      >
                        {isLink && href ? (
                          <Link to={href} state={rowState?.(row)} className="rounded font-medium text-ink hover:underline">
                            {content}
                          </Link>
                        ) : isLink && onRowClick ? (
                          <button
                            type="button"
                            onClick={() => onRowClick(row)}
                            className="rounded text-left font-medium text-ink hover:underline"
                          >
                            {content}
                          </button>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
