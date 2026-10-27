import { api } from "../api";
import type { Role } from "../types";
import type { DrishtiAskBody, DrishtiAskResponse, DrishtiLanguage, DrishtiSuggestionsPayload } from "./types";

// Dev builds only: VITE_DRISHTI_MOCK=1 answers from a local mock. Production builds compile this to false,
// so the mock module is dropped from the bundle whatever the environment says.
export const DRISHTI_MOCK = import.meta.env.DEV && import.meta.env.VITE_DRISHTI_MOCK === "1";

export async function askDrishti(body: DrishtiAskBody, role: Role | undefined): Promise<DrishtiAskResponse> {
  if (DRISHTI_MOCK) return (await import("./mock")).mockAsk(body, role);
  return api.drishtiAsk(body);
}

export async function drishtiSuggestions(role: Role | undefined, lang: DrishtiLanguage): Promise<DrishtiSuggestionsPayload> {
  if (DRISHTI_MOCK) return (await import("./mock")).mockSuggestions(role);
  return api.drishtiSuggestions(lang);
}

/** Starter language: Hindi for a browser set to Hindi, English otherwise; the user can ask in any of the three. */
export function preferredLanguage(): DrishtiLanguage {
  return typeof navigator !== "undefined" && /^hi(-|$)/i.test(navigator.language) ? "hi" : "en";
}
