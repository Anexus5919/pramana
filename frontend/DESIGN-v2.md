# Pramana design system v2 (signed-in app)

Authoritative for every screen after sign-in: the officer, verifier and admin app and the institution portal. `DESIGN.md` (v1) still governs the landing pages, `/login` and `/scan`, which v2 does not touch.

Companion documents: `docs/design/audit.md` (why), `docs/design/ia.md` (navigation and flows), `docs/design/screens.md` (per-screen build specs). Living reference: `/ui-kit` (dev builds, or production with `VITE_UI_KIT=1`).

The idea in one line: **a quiet, dense, evidence-first tool**. Officials read a lot and decide carefully; the interface should disappear behind the evidence, with exactly one obvious next action on every screen.

## 1. How the scoping works

`AppShell` sets `data-surface="app"` on `<html>` while it is mounted. `src/index.css` redefines the tokens under `html[data-surface="app"]` (and `html.dark[data-surface="app"]`). Because every Tailwind colour, radius, shadow and text-size utility reads a CSS variable, the whole signed-in app (including portalled dialogs, drawers and toasts) takes the v2 look, while the landing pages, login and `/scan` keep v1 untouched.

While pages are still being rebuilt, the same scope neutralises v1 decoration: sky gradients render flat, `glass` is opaque, `grain` is off, `eyebrow` becomes sentence-case 12 px, `font-display` resolves to the UI font.

## 2. Typography

| Role | Family | Notes |
|---|---|---|
| All UI text | IBM Plex Sans Variable (`@fontsource-variable/ibm-plex-sans@5.3.0`, OFL) | Enterprise and public-sector feel, excellent at 12 to 14 px, distinct from the landing page's Inter Tight |
| IDs, hashes, codes, values read from documents | IBM Plex Mono 400 and 500 (`@fontsource/ibm-plex-mono@5.3.0`, OFL) | Nothing else is monospace: not labels, not numbers in tables |

- Weights: 400 (body), 500 (labels, buttons, table emphasis), 600 (titles and figures). Nothing else.
- Numerals: `tabular-nums` is on for the whole app surface, so columns of figures align.
- Letter spacing: 0, except headings at -0.005em. No uppercase tracked eyebrows. The one uppercase label is `SimulatedTag`, because the product rule requires it to stand out.

**Type scale** (Tailwind utility, size / line height, use):

| Utility | Size | Use |
|---|---|---|
| `text-xs` | 12 / 16 | Meta lines, captions, table column headers, badge text |
| `text-sm` | 13 / 20 | Secondary text, table cells, descriptions, buttons |
| `text-base` | 14 / 20 | Body default, panel titles (600) |
| `text-md` | 16 / 24 | Section headings (600) |
| `text-lg` | 20 / 28 | Dialog titles, institution step titles |
| `text-xl` | 24 / 32 | Page titles, stat values (600) |
| `text-2xl` | 30 / 36 | Reserved; no screen needs it today |

Never use arbitrary sizes (`text-[11px]` and the like). Minimum text size is 12 px.

## 3. Spacing and layout

- **8-point grid** with 4-point half steps for compact components. Common values: 4, 8, 12, 16, 20, 24, 32, 48.
- **Page padding:** 16 px mobile, 24 px from `sm`, 32 px from `lg` (set by `AppShell`'s `main`).
- **Content width** (`<Page width>`): `default` 1280 px for reading pages, `wide` 1600 px for the review queue and the workspace, `narrow` 960 px for the institution portal and forms, `full` for viewers.
- **Vertical rhythm:** 32 px between page blocks (`Page` applies `space-y-8`), 24 px between panels in a grid (`gap-6`), 12 px between a section heading and its content.
- **Columns:** main plus a 360 px aside from `2xl` (1536 px); below that the aside stacks under the main column. Two-column panel grids from `lg`.
- **Shell:** sidebar 232 px (collapsed 56 px), top bar 56 px. Institutions: top bar only.
- **Density:** table rows 48 px (`comfortable`) for queues and lists, 36 px (`compact`) for reference tables; header row 36 px. Controls are 32 px tall (`md`), 28 px (`sm`), 40 px (`lg`, institution primary actions only).
- **Radii:** 6 px controls, 8 px panels and dialogs, full circles only for avatars and step markers. No 14, 20 or 28 px radii.
- **Elevation:** panels are flat (1 px `line` border, no shadow). Shadows only on things that float: menus, popovers, dialogs, drawers, toasts (`shadow-lg`), plus `shadow-xs` on buttons and inputs.

## 4. Colour

Restrained: neutral surfaces, ink for text, violet for intent, status colours for status.

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | #f7f7f8 | #111114 | Page background |
| `surface` | #ffffff | #18181c | Panels, top bar, sidebar |
| `surface-2` / `surface-3` | #f3f3f5 / #e9e9ed | #1f1f24 / #28282e | Hover, segmented track, evidence stage |
| `ink` / `ink-2` / `ink-3` / `ink-4` | #17171c / #3d3d47 / #5c5c68 / #73737f | #f2f2f4 / #d0d0d6 / #a3a3ad / #8a8a94 | Text hierarchy; `ink-4` only for placeholders, icons and "Not given" |
| `line` / `line-2` | #e6e6ea / #d5d5dc | #2a2a31 / #3a3a42 | Hairlines; `line-2` for control borders |
| `brand-solid` | #6a35dc | #6f45e6 | The primary button, active tab underline, step markers |
| `brand-soft` | #f3effe | #231c3d | Selected nav item, selected table row |
| `brand-ink` | #5a28c0 | #b8a4ff | Icons and text on `brand-soft` |
| focus ring | `brand-500` #7c4dea | #a68bff | `:focus-visible` outline, 2 px, offset 2 px |

Status tones (`{tone}-fg`, `{tone}-bg`, `{tone}-dot`): `verified` green, `mismatch` red, `expired` orange, `pending` blue, `manual` amber, `unavail` and `unchecked` grey, `primary` violet. Every `fg` on its `bg` meets WCAG AA (4.5:1) in both themes. Severity fills: `sev-critical`, `sev-high`, `sev-medium`, `sev-low`, `sev-info`.

Rules:
- Violet appears once per screen as a fill (the primary button). Links are ink with an underline on hover, not violet.
- Status colour only on status. Never colour a whole panel, row or heading; never use a status colour for decoration.
- Colour is never the only signal: badges carry words, severity carries a word or an sr-only label.
- No gradients, glass, grain, glows, coloured shadows or illustrations in the app.

## 5. Components (`src/ui2`, import from `../../ui2`)

Every rebuilt screen imports only from `src/ui2/index.ts`. v1 `src/ui` stays for not-yet-rebuilt pages and for the landing and login pages.

| Component | File | Props (key ones) | Rules |
|---|---|---|---|
| `Page` | `Page.tsx` | `width?: "default" \| "wide" \| "narrow" \| "full"` | Root of every page; sets width and 32 px rhythm |
| `PageHeader` | `Page.tsx` | `title`, `context?`, `status?`, `back?: {to,label}`, `primary?`, `secondary?`, `menu?: ActionMenuItem[]`, `children?` (tabs or stepper) | One `h1`. Exactly one primary. At most two secondary buttons. |
| `Panel` | `Page.tsx` | `title?`, `description?`, `actions?`, `footer?`, `padding?: "none" \| "md"`, `as?` | The only box. Never nests (a nested Panel renders unboxed and warns in dev). |
| `PanelDivider` | `Page.tsx` | `label?` | Groups inside a panel |
| `Section` | `Page.tsx` | `title`, `description?`, `actions?`, `level?: 2 \| 3` | Unboxed group on the canvas |
| `DataTable<T>` | `DataTable.tsx` | `rows`, `columns: Column<T>[]`, `rowKey`, `label`, `rowHref?`, `rowState?`, `linkColumn?`, `onRowClick?`, `selectedKey?`, `defaultSort?`, `density?`, `empty?` | Put it in a `Panel padding="none"`. Rows are real links (keyboard) and whole-row clickable. Column: `{id, header, cell, sortValue?, align?, width?, hideBelow?}` |
| `Tabs`, `TabPanel` | `Tabs.tsx` | `items: {id,label,count?,attention?,href?}[]`, `value`, `onChange?`, `label`, `idBase?` | Route tabs when every item has `href`; otherwise ARIA tabs with arrow keys. Six at most. |
| `SegmentedControl` | `Tabs.tsx` | `options: {value,label,count?}[]`, `value`, `onChange`, `label`, `size?` | Views inside a section, two to four options |
| `Stepper` | `Stepper.tsx` | `steps: {id,label,description?,status}[]`, `label`, `orientation?` | `status`: complete, current, attention, upcoming |
| `StatusBadge` | `Status.tsx` | `tone`, `children`, `title?` | The one status style. Typed wrappers: `ApplicationStatusBadge`, `VerificationBadge`, `ReviewBadge`, `RuleOutcomeBadge` |
| `SeverityIndicator` | `Status.tsx` | `severity`, `showLabel?` | Four bars plus the word |
| `EvidenceClassLabel` | `Status.tsx` | `cls`, `showName?` | Quiet text "E2 Issuer"; officer screens only |
| `SimulatedTag` | `Status.tsx` | none | Required next to anything from the issuer simulator |
| `ActionMenu` | `ActionMenu.tsx` | `items: {id,label,description?,icon?,onSelect?,to?,disabled?,danger?,separated?,hidden?}[]`, `label`, `trigger?: "icon" \| "button"`, `variant?`, `align?`, `width?` | Secondary actions; the Decide menu uses `trigger="button" variant="primary"` |
| `Button`, `ButtonLink`, `IconButton` | `Button.tsx` | `variant?: primary \| secondary \| ghost \| danger`, `size?: sm \| md \| lg`, `loading?`, `leadingIcon?`, `trailingIcon?` | `IconButton` needs `label` |
| `Callout` | `Blocks.tsx` | `tone?: info \| success \| warning \| danger \| neutral`, `title?`, `action?`, `role?` | One per section at most |
| `EmptyState` | `Blocks.tsx` | `title`, `description?`, `action?`, `icon?`, `size?` | Says what is missing and what to do |
| `DescriptionList` | `Blocks.tsx` | `items: {label,value,mono?,hint?,hidden?}[]`, `layout?: inline \| stacked`, `columns?` | Empty values show "Not given" |
| `Stat`, `StatGroup` | `Blocks.tsx` | `label`, `value`, `hint?`, `to?`, `tone?` | Four stats at most, in one strip, never a card per number |
| `Toolbar`, `SearchInput` | `Blocks.tsx` | `end?`; `value`, `onChange`, `label` | Directly above the table it filters |
| `MetaList`, `Code` | `Blocks.tsx` | `items: ReactNode[]` | Context lines; inline mono |
| `EvidenceFrame` | `Blocks.tsx` | `title`, `meta?`, `toolbar?`, `footer?` | Frame for document pages and photos |
| `Dialog`, `Drawer` | re-exported from `ui/Dialog` | `open`, `onClose`, `title`, `description?`, `footer?` (`Drawer`: `side?`, `width?`) | Focus trapped, Esc closes |
| `Tooltip`, `useToast`, `Skeleton`, `ErrorState`, `Digest`, `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Kbd` | re-exported from v1 | unchanged | Restyled through tokens |

Retired in rebuilt screens (do not import): `Card`, `SectionCard`, `Spotlight`, `StatusCube`, `StatusPill`, `CubeStrip`, `BlockProgress`, `SeverityMeter`, `EvidenceClassChip`, `Counter`, `Badge`, `Tag`, magnetic buttons, `EmptyState sky`, and the `bg-sky`, `bg-sky-soft`, `bg-pupil`, `grain`, `glass` utilities.

## 6. Motion

Motion is for feedback and orientation only.

- Durations: 150 ms for hover, press and colour; 200 ms for drawers, dialogs, menus and disclosure. Easing `cubic-bezier(0.2, 0, 0, 1)` (`ease2` in `ui2/motion.ts`).
- Allowed: drawer and dialog enter and exit, toast enter, disclosure height, real progress (spinners and live run steps while work is happening), the eye mark's activity state.
- Not allowed: page transitions, staggered list reveals, animated counters, `layoutId` flourishes, magnetic or spotlight effects, looping pulses, shimmer bars, rotating icons, scan lines.
- `prefers-reduced-motion`: the global CSS rule and `MotionConfig reducedMotion="user"` stay; nothing must depend on motion to be understood.

## 7. Copy and terms

Sentence case everywhere. Short labels. Numbers as figures. Dates as "23 Oct 2026" in tables, "23 Oct 2026, 14:05" in history; relative times ("2 h ago") only with the absolute time in a tooltip. No em or en dashes, no emojis, no exclamation marks.

| Use | Not | Meaning |
|---|---|---|
| Finding | issue, alert, flag, gap | A rule or check outcome an official should look at |
| Indicator | signal, red flag | An observable trace inside one file (forensics); officer screens only |
| Rule | check, norm | A handbook rule in the active ruleset |
| Checklist | rule list | The rule outcomes for one application: Met, Not met, Could not decide, Not applicable |
| Verification | check, validation | Confirming a document with its issuer, signature or signed QR |
| Validation run (run) | scan, analysis | One pass of the pipeline over an application |
| Review (of a finding) | triage | An official's action on a finding, with a reason |
| Decision | verdict | Request rectification or record the scrutiny outcome; always an official's |
| Deficiency letter | deficiency notice | The formal letter sent with a rectification request |
| Rectification | correction, fix | The institution correcting items and resubmitting |
| Application | case, file | One submission by one institution for one year |
| Simulated | demo, mock | Anything from the issuer simulator; tag it SIMULATED |

Product rules: never call a document forged, fake, fraudulent or genuine; Pramana never approves or rejects and every decisive action asks for a reason; simulated sources are labelled SIMULATED; institutions never see forensic indicators, severities, evidence classes or rule codes.

## 8. Accessibility

- Keyboard: every action reachable with Tab; menus and tabs use arrow keys; Esc closes menus, dialogs and drawers and returns focus to the trigger.
- No global single-key shortcuts unless they can be turned off or only fire with focus in the list (WCAG 2.1.4).
- Focus ring visible on every interactive element (2 px `focus` colour).
- Targets at least 24 by 24 px; primary actions 32 px (40 px for institutions).
- One `h1` per page (the `PageHeader` title); `h2` for panels and sections.
- Tables use `caption`, `th scope="col"` and `aria-sort`; never `aria-hidden` header rows.
- Live regions (`role="status"`) only for real changes, not ticking timers.
- Contrast AA for all text in both themes; `ink-4` is not used for running text.
