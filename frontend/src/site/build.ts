// Replaced at build time by vite (frontend/build-info.ts): the last commit's date, YYYY-MM-DD
declare const __PRAMANA_CONTENT_DATE__: string | undefined;

/** When the shown content last changed: the date of the commit the UI was built from. */
export const CONTENT_DATE: string = typeof __PRAMANA_CONTENT_DATE__ === "string" ? __PRAMANA_CONTENT_DATE__ : "";

/** CONTENT_DATE as "28 Oct 2026", or in Hindi; empty when the build did not set it. */
export function contentDateLabel(lang: "en" | "hi" = "en"): string {
  if (!CONTENT_DATE) return "";
  const d = new Date(`${CONTENT_DATE}T00:00:00`);
  if (Number.isNaN(d.getTime())) return CONTENT_DATE;
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" }).format(d);
}
