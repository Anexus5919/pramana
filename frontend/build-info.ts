import { execSync } from "node:child_process";

/**
 * The date the shown content last changed, for the footer's "Last updated": the last commit's date.
 * PRAMANA_BUILD_DATE (YYYY-MM-DD) overrides it, for builds without the git history such as the Docker image;
 * without either, the build date stands in.
 */
export function contentDate(): string {
  const set = process.env.PRAMANA_BUILD_DATE?.trim();
  if (set && /^\d{4}-\d{2}-\d{2}$/.test(set)) return set;
  try {
    const d = execSync("git log -1 --format=%cs", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch {
    // no git, or not a checkout
  }
  return new Date().toISOString().slice(0, 10);
}

/** Vite `define` entries shared by every build of the UI. */
export function buildDefine(): Record<string, string> {
  return { __PRAMANA_CONTENT_DATE__: JSON.stringify(contentDate()) };
}
