import type { SimIssuer } from "../../types";

/** Issuer name without the "(SIMULATED)" suffix; the SimulatedTag says it instead. */
export function issuerName(i: SimIssuer): string {
  return i.name.replace(/\s*\(SIMULATED\)\s*$/i, "");
}

export function isOnline(i: SimIssuer): boolean {
  return i.available !== false;
}

export function modeLabel(i: SimIssuer): string {
  return i.mode === "async" ? "Asynchronous" : "Synchronous";
}

/** One reference per source from the synthetic demo registry, so the lookup can be tried without a document at hand. */
export const EXAMPLES: Record<string, string> = {
  "FIRE-SERVICES": "FES/PUN/2025/04417",
  "MUNICIPAL-OC": "PUN/BP/OC/2009/00913",
  "SHCIL-ESTAMP": "IN-MH37491251215259X",
  "ICAI-UDIN": "25100731840H1TP8DP",
  "SE-REGISTRY": "SE/CSMC/2012/0457",
};
