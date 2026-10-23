import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "../../../api";
import type { ApplicationDetail } from "../../../types";
import type { Readiness, ReadinessItem } from "./types";

/** Re-check this long after the last upload or saved figure, so several quick changes cost one check. */
const DEBOUNCE_MS = 700;

export type Trigger = "open" | "upload" | "figures" | "manual";

export interface ReadinessChange {
  fixed: ReadinessItem[];
  raised: ReadinessItem[];
  trigger: Trigger;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

const flat = (r: Readiness) => r.groups.flatMap((g) => g.items);

/**
 * The readiness check for an editable application. It runs when the page opens and again, debounced,
 * whenever the current documents or the declared figures change; the previous result stays on screen meanwhile.
 */
export function useReadiness(app: ApplicationDetail, enabled: boolean) {
  const docsKey = useMemo(
    () =>
      app.documents
        .filter((d) => !d.superseded)
        .map((d) => `${d.declared_type}:${d.sha256}`)
        .sort()
        .join("|"),
    [app.documents],
  );
  const figuresKey = useMemo(() => JSON.stringify(app.declared ?? {}), [app.declared]);
  const inputs = `${app.status}#${app.round}#${docsKey}#${figuresKey}`;
  const settled = useDebounced(inputs, DEBOUNCE_MS);
  const [nonce, setNonce] = useState(0);

  // What prompted the latest check, for the progress line and the change summary
  const last = useRef({ docsKey, figuresKey });
  const [trigger, setTrigger] = useState<Trigger>("open");
  useEffect(() => {
    if (docsKey !== last.current.docsKey) setTrigger("upload");
    else if (figuresKey !== last.current.figuresKey) setTrigger("figures");
    last.current = { docsKey, figuresKey };
  }, [docsKey, figuresKey]);

  const q = useQuery({
    queryKey: ["readiness", app.id, settled, nonce],
    queryFn: () => request<Readiness>("POST", `/applications/${encodeURIComponent(app.id)}/readiness`, {}),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Compare each new result with the one before it
  const prev = useRef<Readiness | null>(null);
  const [change, setChange] = useState<ReadinessChange | null>(null);
  useEffect(() => {
    const data = q.data;
    if (!data || q.isPlaceholderData) return;
    const before = prev.current;
    prev.current = data;
    if (!before || before.checked_at === data.checked_at) return;
    const was = new Map(flat(before).map((i) => [i.id, i.status]));
    const now = flat(data);
    setChange({
      fixed: now.filter((i) => i.status === "met" && was.get(i.id) === "fix"),
      raised: now.filter((i) => i.status === "fix" && was.get(i.id) !== "fix"),
      trigger,
    });
  }, [q.data, q.isPlaceholderData, trigger]);

  const waitingForInput = inputs !== settled;
  return {
    data: q.data,
    error: q.error,
    checking: enabled && (waitingForInput || q.isFetching),
    trigger,
    change,
    recheck: () => {
      setTrigger("manual");
      setNonce((n) => n + 1);
    },
  };
}
