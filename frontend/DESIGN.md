# Pramana design system

Pramana is Sanskrit for a valid means of knowledge. The first pramana is *pratyaksha*, direct perception: the eye. The product reads documents, checks them against evidence and shows its work. The visual language follows from that:

- **The eye** is the brand. On the landing page it is a WebGL eye built from voxel blocks. In the app it is a small SVG mark whose iris shows that the system is working.
- **Blocks** are the material. They are Jasper-style purple voxel blocks with lighter top faces, on a warm peach-to-pink sky. In the app, blocks show up as status cubes, segmented progress and severity meters. They are never decoration for its own sake.
- **Evidence is spatial.** Findings point at page regions, records and signatures. Animations exist to move the reader's eye to evidence, show cause and effect, and confirm actions.

## 1. Tokens

All colours come from CSS variables in `src/index.css`, exposed as Tailwind utilities (`bg-canvas`, `text-ink-2`, `bg-brand-500`, `text-verified-fg` and so on). Never hard-code hex values in components; the WebGL scene is the only exception and takes its palette from `src/landing/palette.ts`.

| Group | Tokens | Light | Notes |
|---|---|---|---|
| Canvas | `canvas`, `surface`, `surface-2`, `surface-3` | #fbf8f5, #ffffff, #f6f1ee, #efe8e6 | warm paper, not cold grey |
| Ink | `ink`, `ink-2`, `ink-3`, `ink-4` | #1c1622, #4a4252, #7d7486, #aaa1b0 | text hierarchy |
| Lines | `line`, `line-2` | #ece4e5, #dfd4d8 | hairlines; prefer 1px |
| Brand violet | `brand-50` to `brand-900` | 50 #f5f0ff, 100 #ebe0ff, 200 #d6c2ff, 300 #ba99ff, 400 #9e6dff, 500 #8b3dff, 600 #7428ea, 700 #5d1fc2, 800 #47198f, 900 #2b0f5c | primary actions, focus ring, selection |
| Sky | `peach`, `apricot`, `rose`, `lilac` | #ffe1c9, #ffcfa8, #f8cde0, #e2d3ff | gradients only (landing, empty states, hero cards) |
| Pupil | `pupil`, `pupil-2` | #120c1c, #1d1430 | dark sections, the "inside the eye" transition |
| Status | `{verified,mismatch,expired,pending,unavail,manual,unchecked}-{fg,bg,dot}` | verified #12723a/#e7f6ec/#1fa055, mismatch #b4232a/#fdebec/#e5484d, expired #a2440e/#fff0e4/#f76b15, pending #2b4fc2/#ebf0fe/#3e63dd, unavail #4c4a55/#f0eff2/#79768a, manual #8a5a00/#fdf4d6/#d9a106, unchecked #6b6874/#f3f2f4/#b3b0ba | verification statuses, from `lib/labels.ts` tones |
| Severity | `sev-{critical,high,medium,low,info}` | critical #8c1236, high #d43a4f, medium #e8822f, low #9a8f9f, info #c4bcc8 | fill colour of SeverityMeter blocks |
| Evidence class (trust ladder) | `ev-1` to `ev-7` | cryptographic #0f5f3a, issuer #1f8a50, record #2f5ad6, rule #7428ea, structural #c2550f, heuristic #d39b0a, model #9a94a3 | rung colours, strongest first |

Dark mode (`.dark` on `<html>`): canvas #0f0b16, surface #17111f, surface-2 #1f1729, ink #f3eef7, ink-2 #c9bfd1, ink-3 #968ba0, line #2b2235, brand stays violet with +1 lightness step; status bg tokens become 12% tints. Every component must use tokens so dark mode works without per-component overrides.

**Type.**
- Display: `font-display` (Inter Tight Variable), tracking `-0.035em` at 48px and up, `-0.02em` for 24 to 40px.
- Body: `font-sans` (Inter Variable), 15px/1.55.
- Mono: `font-mono` (JetBrains Mono Variable) for IDs, digests, codes, field values from documents.
- Eyebrow: 11px uppercase, tracking `0.12em`, `text-ink-3`, weight 600.
- Scale: 12, 13, 15, 17, 20, 24, 30, 38, 48, 64, 80.

**Shape.**
- Radius: 8 for controls, 14 for cards, 20 for panels, 28 for hero cards, full for pills.
- Shadows (`shadow-xs/sm/md/lg/glow`): soft and warm-tinted. Example: md is `0 10px 30px -12px rgb(60 20 110 / 0.18)`, `0 2px 6px -2px rgb(28 22 34 / 0.06)`.
- Glass panels: `bg-surface/75 backdrop-blur-xl border border-white/60` (dark: `border-white/10`).

**Layout.**
- 8px grid.
- App content max width 1440px.
- Sidebar 248px, collapsible to 72px.
- Breakpoints: below 1024px the sidebar becomes a drawer; below 640px stack columns.
- Never allow horizontal page scroll.

## 2. Motion

Library: `motion` (`import { motion, AnimatePresence, useInView, ... } from "motion/react"`). Shared values live in `src/ui/motion.ts`; do not invent new easings.

| Name | Value | Use |
|---|---|---|
| `ease.out` | cubic-bezier(0.22, 1, 0.36, 1) | enters, reveals |
| `ease.inOut` | cubic-bezier(0.65, 0, 0.35, 1) | morphs, page transitions |
| `spring.snappy` | stiffness 420, damping 34 | layout and selection indicators |
| `spring.soft` | stiffness 180, damping 24 | panels, drawers |
| `dur.micro` / `dur.ui` / `dur.panel` / `dur.story` | 0.12 / 0.2 / 0.32 / 0.7 s | hover / state change / panel / narrative |

**Rules. Every animation must answer "what does this help the user understand?"**
1. **State changes animate; idle things stay still.** A status that changes morphs colour and icon. A resolved finding collapses with a strike. A newly arrived alert slides in. Nothing loops forever except progress indicators shown while real work is happening.
2. **Spatial continuity.** Selecting a row expands into its detail with a shared `layoutId`. Tab indicators slide. Drawers come from the side where their trigger is.
3. **Direct attention to evidence.** When a finding opens a document region, the box draws its stroke, then pulses once. A field highlight follows the same rule.
4. **Show real progress.** Validation progress uses the real stage names and timings from `run.stages`; never fake percentages. Spinners only while a request is pending.
5. **Confirm actions.** A press gives a 0.97 scale tap. Success shows a check morph and a toast with what changed. Destructive or decisive actions (dismiss, accept, escalate) need a reason and show it in the history immediately.
6. **Reveal on first view only.** Staggered list reveals happen on mount, not on every refetch. Use `initial={false}` on re-renders.
7. **Cursor interactions must carry meaning.**
   - Allowed: a spotlight highlight on interactive cards (shows clickability); a magnetic pull on the one primary CTA per page at most, 6px max; the iris following the cursor on the landing page (the eye is watching what you look at); hover previews of evidence.
   - Not allowed: cursor trails, confetti, parallax on data tables, bouncing icons.
8. **Respect `prefers-reduced-motion`.** Wrap the app in `<MotionConfig reducedMotion="user">`. The WebGL eye renders a single static frame, and counters jump to their final values.
9. **Performance.**
   - Animate `transform` and `opacity` only, never layout properties, except when using `layout`.
   - Code-split the landing page (three.js) from the app.
   - Cap the WebGL DPR at 1.75 and pause rendering when the canvas is off-screen or the tab is hidden.

## 3. The blocks motif in the app

These live in `src/ui/`; build them as custom components, not generic libraries.

| Component | What it shows |
|---|---|
| `StatusCube` | Tiny isometric cube SVG (top, left and right faces in three shades of the status dot colour) plus an optional label. It is the verification status everywhere. A changing status cross-fades the faces. |
| `SeverityMeter` | Four stacked blocks rising left to right. The number filled is 1 for low, 2 medium, 3 high, 4 critical, and info is outline only. |
| `BlockProgress` | A row of N blocks for pipeline stages. Done blocks fill, the current block shimmers, failed turns mismatch. |
| `EvidenceClassChip` | Rung number (E1 to E7) on a block in the `ev-n` colour, plus a name. The tooltip gives the definition and whether this class may say "verified". |
| `EyeMark` | Brand logo: an almond outline, a voxel iris (3x3 squares) and a square pupil. The iris scans while `useIsFetching() + useIsMutating() > 0` and blinks once when a mutation succeeds, so the logo is the global activity indicator. |

## 4. Component ownership (parallel builders: stay inside your folders)

| Owner | Folders |
|---|---|
| Foundation | `src/index.css`, `src/ui/**`, `src/brand/**`, `src/shell/**`, `src/App.tsx`, `src/main.tsx`, `src/pages/dashboard/**` |
| Landing | `src/landing/**`, `src/pages/login/**` |
| Workspace | `src/pages/application/**` (all tabs, document viewer, graph, audit chain, runs, dialogs) |
| Pages | `src/pages/rules/**`, `src/pages/issuers/**`, `src/pages/audit/**`, `src/pages/verify/**`, `src/pages/portal/**`, `src/pages/not-found/**` |

Shared and read-only for everyone except Foundation: `src/api.ts`, `src/types.ts`, `src/auth/session.ts`, `src/lib/**`. If you need a change there, put it in your final report.

## 5. Voice

- Plain English, no emojis, and never an em dash or en dash (use hyphens, commas or colons).
- Never say forged, fake or genuine about a document. Use the backend's words: indicator, mismatch, modified after signing, not found in issuer registry.
- Anything simulated carries a visible `SIMULATED` or `DEMO` tag.
- Every page footer says: "Decision support only. Findings are preliminary indicators for review by competent authorities. Pramana does not approve, reject or penalise any institution. Synthetic demo data."
