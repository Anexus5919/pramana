// Automated WCAG 2.1 A and AA scan of Pramana's main screens with axe-core, driving the installed Chrome.
//
//   node scripts/a11y-scan.mjs [--base http://127.0.0.1:8000] [--out a11y-report.json] [--only name,name]
//                              [--modes light,dark,contrast,contrast-dark] [--widths desktop,phone]
//
// Needs a running server with the seeded demo data (backend/scripts/seed.py) and Chrome or Edge; set CHROME_PATH
// if neither is in its usual place. Prints violations per page and mode and writes the full result as JSON.
// An automated scan finds only part of the problems; see docs/features/gigw.md.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const PASSWORD = process.env.PRAMANA_DEMO_PASSWORD ?? "Pramana@2026";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BASE = arg("base", "http://127.0.0.1:8000").replace(/\/$/, "");
const OUT = arg("out", "a11y-report.json");
const ONLY = arg("only", "") ? new Set(arg("only", "").split(",")) : null;
const MODES = arg("modes", "light,dark,contrast,contrast-dark").split(",");
const WIDTHS = arg("widths", "desktop,phone").split(",");

const VIEWPORT = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844, isMobile: true, hasTouch: true } };
const MODE = {
  light: { theme: "light", contrast: "standard" },
  dark: { theme: "dark", contrast: "standard" },
  contrast: { theme: "light", contrast: "high" },
  "contrast-dark": { theme: "dark", contrast: "high" },
};

// Seeded demo: A3 has a correction round with its letter and threads, A6 a recorded scrutiny outcome
const A3 = "APP-2026-000103";
const A6 = "APP-2026-000106";

/** The screens to scan. `user` signs in first; `ready` is a selector to wait for; `act` runs before the scan. */
const PAGES = [
  { name: "landing", path: "/", ready: "main" },
  { name: "login", path: "/login", ready: "form" },
  ...["privacy-policy", "terms-of-use", "copyright-policy", "hyperlinking-policy", "accessibility-statement", "help", "contact", "sitemap"].map(
    (p) => ({ name: p, path: `/${p}`, ready: "main h1" }),
  ),
  { name: "review-queue", user: "officer", path: "/dashboard", ready: "main h1" },
  { name: "workspace-summary", user: "officer", path: `/applications/${A3}`, ready: "main h1" },
  { name: "workspace-findings", user: "officer", path: `/applications/${A3}/findings`, ready: "main h1" },
  {
    name: "workspace-finding-drawer",
    user: "officer",
    path: async (page) => {
      const id = await page.evaluate(async (app) => {
        const r = await fetch(`/api/applications/${app}/findings`, { credentials: "include" });
        const list = await r.json();
        return Array.isArray(list) && list[0] ? list[0].id : null;
      }, A3);
      return `/applications/${A3}/findings?finding=${id}`;
    },
    ready: "[role=dialog], main h1",
  },
  { name: "workspace-rectification", user: "officer", path: `/applications/${A3}/rectification`, ready: "main h1" },
  {
    name: "drishti-open",
    user: "officer",
    path: "/dashboard",
    ready: "main h1",
    act: async (page) => {
      await page.click('button[aria-label*="Drishti"]');
      await page.waitForSelector("[role=dialog], [aria-label*='Drishti'][role=region], textarea", { timeout: 5000 }).catch(() => {});
    },
  },
  { name: "portal-applications", user: "inst3", path: "/portal", ready: "main h1" },
  { name: "portal-application-letter", user: "inst3", path: `/portal/applications/${A3}`, ready: "main h1" },
  { name: "portal-outcome", user: "inst6", path: `/portal/applications/${A6}`, ready: "main h1" },
  // The same portal screens in Hindi, and the display options menu open
  { name: "portal-applications-hi", user: "inst3", lang: "hi", path: "/portal", ready: "main h1" },
  { name: "portal-application-letter-hi", user: "inst3", lang: "hi", path: `/portal/applications/${A3}`, ready: "main h1" },
  { name: "portal-outcome-hi", user: "inst6", lang: "hi", path: `/portal/applications/${A6}`, ready: "main h1" },
  { name: "login-hi", lang: "hi", path: "/login", ready: "form" },
  {
    name: "display-options-open",
    user: "inst3",
    path: "/portal",
    ready: "main h1",
    act: async (page) => {
      await page.click('header button[title="Accessibility options"]');
      await page.waitForSelector('[role=group][aria-label="Accessibility options"]', { timeout: 5000 });
    },
  },
];

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error("Chrome not found; set CHROME_PATH");
  return hit;
}

let axeVersion = "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signIn(page, user) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const status = await page.evaluate(
    async (u, p) =>
      (
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u, password: p }),
          credentials: "include",
        })
      ).status,
    user,
    PASSWORD,
  );
  if (status !== 200) throw new Error(`sign-in as ${user} failed: ${status}`);
}

async function scan(page, spec, mode, width) {
  const m = MODE[mode];
  await page.setViewport(VIEWPORT[width]);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluate((m) => {
    localStorage.setItem("pramana-theme", m.theme);
    localStorage.setItem("pramana-contrast", m.contrast);
    localStorage.setItem("pramana-lang", m.lang);
  }, { ...m, lang: spec.lang ?? "en" });
  const path = typeof spec.path === "function" ? await spec.path(page) : spec.path;
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector(spec.ready, { timeout: 15000 }).catch(() => {});
  await sleep(600);
  if (spec.act) {
    await spec.act(page);
    await sleep(600);
  }
  await page.addScriptTag({ content: AXE });
  axeVersion ||= await page.evaluate(() => window.axe.version);
  const res = await page.evaluate(
    (tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] }),
    TAGS,
  );
  return res.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 40).map((n) => n.target.join(" ")),
    summary: v.nodes[0]?.failureSummary?.split("\n").slice(0, 3).join(" "),
    details: v.nodes.slice(0, 40).map((n) => (n.any?.[0] ?? n.all?.[0] ?? n.none?.[0])?.message ?? ""),
  }));
}

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-first-run", "--hide-scrollbars", "--disable-extensions"],
});
const results = [];
try {
  const byUser = new Map();
  for (const spec of PAGES) {
    if (ONLY && !ONLY.has(spec.name)) continue;
    const key = spec.user ?? "anonymous";
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(spec);
  }
  for (const [user, specs] of byUser) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    if (user !== "anonymous") await signIn(page, user);
    else await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    for (const spec of specs)
      for (const width of WIDTHS)
        for (const mode of MODES) {
          let violations;
          try {
            violations = await scan(page, spec, mode, width);
          } catch (e) {
            violations = [{ id: "scan-error", impact: "critical", help: String(e?.message ?? e), nodes: 0, targets: [] }];
          }
          // a scan that could not run counts as one critical problem, so it is never read as clean
          const count = (i) => violations.filter((v) => v.impact === i).reduce((a, v) => a + Math.max(v.nodes, v.id === "scan-error" ? 1 : 0), 0);
          const row = { page: spec.name, user, mode, width, critical: count("critical"), serious: count("serious"), moderate: count("moderate"), minor: count("minor"), violations };
          results.push(row);
          const ids = violations.map((v) => `${v.id}(${v.impact[0]}${v.nodes})`).join(" ");
          console.log(`${spec.name.padEnd(28)} ${mode.padEnd(13)} ${width.padEnd(7)} c${row.critical} s${row.serious} m${row.moderate} n${row.minor} ${ids}`);
        }
    await ctx.close();
  }
} finally {
  await browser.close();
}

writeFileSync(OUT, JSON.stringify({ base: BASE, tags: TAGS, axe: axeVersion, at: new Date().toISOString(), results }, null, 2));
const serious = results.reduce((a, r) => a + r.critical + r.serious, 0);
console.log(`\n${results.length} scans, ${serious} serious or critical nodes; full report in ${OUT}`);
process.exitCode = serious > 0 ? 1 : 0;
