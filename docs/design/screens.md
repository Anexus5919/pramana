# Screen specs v2: build packages A, B and C

Read these first: `docs/design/ia.md` (navigation and flows, authoritative), `frontend/DESIGN-v2.md` (tokens, type, components, copy), `frontend/src/ui2/Kit.tsx` (every component in use, open `/ui-kit`), and the finished exemplar `frontend/src/pages/dashboard/DashboardPage.tsx`. Demo data: A7 = `APP-2026-000107` (richest), A10 = `APP-2026-000110` (campus map), inst3 = `APP-2026-000103` (rectification), inst1 = `APP-2026-000101`. Password `Pramana@2026`.

## 0. How to build any screen

1. **Imports.** Import UI only from `src/ui2` (`import { Page, PageHeader, Panel, ... } from "../../ui2"`). Rebuilt screens never import `src/ui/*`. Exception: feature components owned by package B (DocViewer, TimeMachine and so on, see section 1).
2. **Page frame.** The root is `<Page width="default" | "wide" | "narrow">`:
   - `default` (1280 px) for reading pages;
   - `wide` (1600 px) for the review queue and the workspace;
   - `narrow` (960 px) for the institution portal.

   `Page` gives 32 px between blocks. Do not add outer margins.
3. **Header.** Start with one `PageHeader`.
   - It has exactly one `primary`.
   - Use `secondary` for at most two buttons. Everything else goes in `menu: ActionMenuItem[]`.
   - `context` is one line; use `MetaList` for several facts.
   - `status` takes one badge.
4. **Panels.**
   - `Panel` is the only box, and panels never nest.
   - Group inside a panel with `PanelDivider`, `DescriptionList` or rows with `divide-y divide-line`.
   - `Section` is an unboxed heading on the canvas.
   - Tables go in `<Panel padding="none">`, then a `Toolbar className="px-5 pb-3"`, then `<div className="border-t border-line"><DataTable .../></div>`, as in the dashboard.
5. **Type.**
   - Use only `text-xs` (12), `text-sm` (13), `text-base` (14), `text-md` (16), `text-lg` (20) and `text-xl` (24).
   - Use only the weights 400, `font-medium` and `font-semibold`.
   - `font-mono` (`Code`, `Digest`) is only for IDs, hashes, rule codes and values read from documents.
6. **Banned in rebuilt screens:**
   - `bg-sky`, `bg-sky-soft`, `bg-pupil`, `grain`, `glass`, gradients, glossy `bg-white/40` strips;
   - `StatusCube`, `CubeStrip`, `BlockProgress`, `StatusPill`, `SeverityMeter`, `EvidenceClassChip`, `Counter`, `Spotlight`, `Card interactive`, `magnetic`;
   - the `eyebrow` utility, `font-display`, any `text-[Npx]`, `tracking-*`, `shadow-glow`;
   - `layoutId` flourishes, `stagger`, `whileInView`, page or tab crossfades, `animate-ping`, infinite loops.

   Their replacements are `StatusBadge` (and the typed badges), `SeverityIndicator`, `EvidenceClassLabel`, `Stat`/`StatGroup` and plain numbers.
7. **Motion.** Motion is allowed only for:
   - Drawer, Dialog and toasts (built in);
   - disclosure (height, 200 ms);
   - real progress, driven by real stage data.

   Use `dur2`/`ease2` from `ui2`. Respect reduced motion; `MotionConfig reducedMotion="user"` is already on.
8. **Status.** Use one badge per row and never colour alone: the badge text carries the meaning. Severity is `SeverityIndicator`, with `showLabel={false}` only under a column header that says "Severity".
9. **Product rules in copy.**
   - Never use forged, fake, fraudulent or genuine.
   - Pramana never approves or rejects; officials decide. Every decisive action (dismiss, accept, escalate, request rectification, record outcome, purge) needs a reason field.
   - Anything from the issuer simulator carries `SimulatedTag`.
   - Institutions never see forensic signals, severities, evidence classes or rule codes.
   - No em dashes, no en dashes, no emojis.
   - Use sentence case.
   - Use the glossary in DESIGN-v2.md: finding, indicator (forensic only), rule, checklist, verification, run, review, decision, deficiency letter, rectification, scrutiny outcome.
10. **States.** Every screen has:
    - a loading `Skeleton` shaped like the final layout, wrapped in `role="status"` with an sr-only label;
    - an `ErrorState` with retry;
    - an `EmptyState` that says what to do next.
11. **Keep everything working.** Every existing hook, mutation, query key and URL parameter keeps working. Move logic, do not rewrite it. Delete v1 presentational code you replace.
12. **Done means:**
    - `pnpm build` passes (run it from `frontend/`).
    - Commits are small Conventional Commits, for example `refactor(workspace): rebuild the findings section`.
    - No Co-Authored-By, no "Generated with", no mention of AI.
    - Push only to your own branch, never to main.

## 1. Shared files and ownership

| Owner | May edit | Notes |
|---|---|---|
| Foundation (done) | `src/index.css`, `src/ui2/**`, `src/shell/**` (except CommandPalette), `src/App.tsx`, `src/main.tsx`, `src/pages/dashboard/**` | Packages do not edit these. |
| Package A | `src/pages/analyse/**`, `src/pages/verify/**`, `src/pages/issuers/**`, `src/pages/rules/**`, `src/pages/audit/**`, `src/pages/platform/**`, `src/pages/not-found/**`, `src/shell/CommandPalette.tsx` | |
| Package B | `src/pages/application/**` | Includes the legacy-tab redirect, done inside the workspace. The route in App.tsx stays `/applications/:appId/:tab?`. |
| Package C | `src/pages/portal/**` | |
| Read-only for all | `src/api.ts`, `src/types.ts`, `src/lib/**`, `src/auth/**`, `src/ui/**` (v1, frozen), `src/brand/**`, landing folders, `src/pages/login/**`, `src/pages/scan/**` | |

**Missing ui2 piece?** Add it as a new file in your own folder, for example `src/pages/portal/parts/NextStep.tsx`, built from ui2 primitives and tokens. List it in your final report so Foundation can promote it into ui2. Do not edit `src/ui2`.

**B owns the cross-package helpers.** These live in `pages/application`:

- `viewer/DocViewer.tsx`, `viewer/ViewerSheet.tsx`
- `history/TimeMachine.tsx` (`RevisionStage`, `RevisionPanel`, `TimeMachineLink`)
- `history/api.ts` (`historyApi`, `useRevisions`, `useWatch`, `useSinceLastYear`, `useRunWatch`, `useRecordOutcome`)
- `parts.tsx` (`CitationCard`, `ComparisonTable`, `EvidenceList`, `TraceInputs`, `CautionNote`, `SimTag`, `GeoFigure`, `RevisionDiffView`)
- `campus/PhotoCard.tsx` (`Credentials`)
- `live/useLiveRun.ts`, `live/LiveRunView.tsx` (`useElapsed`)
- `officer/officerApi.ts`

Analyse (A), the issuer simulator (A) and the portal (C) import some of these read-only. B may restyle them, but must keep their exported names and props stable. If B must change a signature, B updates the call sites in A and C in the same commit and says so in its report. A and C must not edit these files.

## 2. Package A: officer pages other than the workspace

### 2.1 Analyse a document (`/analyse`, `/verify-pdf` redirects here)

**Frame.** `Page width="default"`.

**PageHeader:**
- Title: "Analyse a document".
- Context: "Check one PDF or photo without filing it. Nothing is stored after you forget it."
- Primary: "Choose a file". It opens the file input of the drop zone through a ref.
- Menu: "Forget all files" (calls `analyseApi.forget` for each SESSION entry). Show it only when the session list is not empty.

**Layout, top to bottom:**
1. **Drop zone panel.** `Panel` titled "File". Rebuild `pages/verify/DropZone.tsx` calmly:
   - a dashed `border-line-2` area 160 px tall;
   - an icon, "Drop a PDF, JPG or PNG, or choose a file", and the accepted types from `ACCEPT`.
   - Remove the tilting illustration, the cursor-following label, the bobbing chips and `bg-sky-soft`.
   - Recent files from the module `SESSION` cache appear under a `PanelDivider label="This session"` as a row list: filename, size, time, Open button.
2. **While pending.** A `Callout tone="info" role="status"` showing the current step from the analyse steps: "Reading text layer". Use real step names only.
3. **Report**, in one column, with an in-page index at 2xl. The index is a sticky right column of 200 px with anchor links, replacing the Overview jump tiles.
   1. Header `Panel`:
      - `DescriptionList layout="stacked" columns={4}` with File, Size, Pages, Ruleset, SHA-256 (`Digest`), "Hash matches your browser" (yes/no text) and "Kept until".
      - The panel action is a secondary button "Forget this file now".
      - The StepTimeline becomes a single line of `MetaList` stage timings.
   2. A `Callout tone="warning"` only when reading was incomplete.
   3. Two columns at xl: left `EvidenceFrame` with `DocViewer` or `PhotoStage`; right, stacked Panels for Intake, Text, Type, Fields, Signed QR, Issuer registry (`SimulatedTag` on every registry result, including "Not found" and "Source unavailable") and Indicators (forensic, officer view).
   4. Full width: Signatures (`SignatureChain`), Time machine, File structure (`StructurePanels`), and "What Pramana cannot know" as a `Callout tone="neutral"`.

**Removed or merged:**
- the Overview jump tiles (they repeat the section titles);
- the "Not filed" tag repeated three times (now said once, in the context line);
- the PKI note in the header (keep it only in Signatures);
- `whileInView` fades in `analyse/parts.tsx`.

The `Section` in `analyse/parts.tsx` becomes ui2 `Panel` with `title` and `description`, without the eyebrow.

**Copy:** replace "a date drawn over the signed one" with "a date changed after the file was signed".

**States:**
- Intro (no file): an `EmptyState` with the three sample fixture paths as `Code` lines.
- Error: `ErrorState` with "Try another file".

**Acceptance:**
- Upload a PDF and a JPG; every section renders.
- Forget works.
- No horizontal scroll at 1280.
- Every registry result shows SIMULATED.

### 2.2 Issuer simulator (`/issuers?code=&ref=`)

**Frame.** `Page width="default"`.

**PageHeader:**
- Title: "Issuer simulator". Status: `<SimulatedTag />`.
- Context: "Stand-in registries for the prototype. N of M responding."
- Primary: "Look up a record". It focuses the lookup source select.
- Menu (officer and admin): "Run re-verification watch now" (`useRunWatch`).

**Layout:**
1. `Callout tone="neutral"`, once: "These issuers are simulated. Changing them shows how Pramana reacts; it never edits a real registry."
2. Two columns at xl (`minmax(0,1fr) 380px`):
   - **Left: issuers table.** `Panel title="Issuers" padding="none"` with a `DataTable` (density comfortable):
     - columns: Issuer (name plus `Code` code), Mode (sync/async), Latency, Compares (plain comma list, not pills), Status (`StatusBadge` verified "Responding" or unavail "Not responding"), Availability (admin only: `Switch` with `setIssuerAvailability`, optimistic as today);
     - row click selects the issuer in both forms;
     - remove the animated `Cable` and the per-card Responding line.
   - **Right, sticky (`top-20`).** `Panel title="Look up a record"` holds the LookupPanel form and its result. Every result outcome shows `SimulatedTag`. Record fields go in a `DescriptionList`.
3. Below, officer and admin only: `Panel title="Change a record"` holds IssuerActions:
   - Source and Reference come from the same selected issuer, so drop the third picker;
   - a Note field;
   - Revoke, Suspend and Restore as secondary buttons. Revoke uses the danger variant and requires the note as a reason;
   - the result is a `Callout`.

**Prefill:** `?code` and `?ref` prefill both forms, as today.

**Removed:**
- three separate source pickers (now one selected issuer);
- the summary cubes in the header (now the context line count);
- SIMULATED repeated four times or more (once in the header plus once per result).

**Acceptance:**
- An admin toggles availability and the table updates.
- A lookup of a known ref shows the record.
- Revoke followed by "Run re-verification watch now" raises a watch event visible on A7 Summary.
- A verifier sees no Change a record panel.

### 2.3 Rules (`/rules?tab=rules|checklists|impact&doc=`)

**Frame.** `Page width="default"`.

**PageHeader:**
- Title: "Rules".
- Context: `MetaList` of ruleset id and version, "N rules", and the SHA (`Digest`).
- Primary on the Change impact tab only (officer and admin): "Recheck applications".
- Children: `Tabs` route links (`?tab=`) for Rules, Checklists and Change impact (officer and admin), with no counts.

**Removed:**
- the RulesetCard hero (bg-sky-soft and three big stats that repeat the tab counts). Its explainer becomes one `Callout tone="neutral"` at the top of the Rules tab; Sources become a `DescriptionList` in a "Sources" panel at the bottom of the Rules tab.

**Rules tab:**
- `Toolbar`: `SearchInput`, a category `Select` (with counts in the option text), the doc-filter shown as a removable `StatusBadge tone="primary"` "Reads: Fire NOC" plus a clear button, and Expand all / Collapse all as a ghost button.
- Rules grouped by category under `Section level={3}`. Each group is one `Panel padding="none"` with a list of rows.
- Each row is a native `<details>` disclosure:
  - collapsed: `Code` rule id, title, `SeverityIndicator`, version as plain text;
  - expanded: the expression, documents read, "In force from", "Only when", the citation (`CitationCard` from B, read-only import), messages per outcome as a `DescriptionList`, and the limitation as a `Callout tone="neutral"`.
- Remove the overlay button pattern and the tabbable tooltip spans.

**Checklists tab:**
- A `DataTable` with columns: Document type, then one column per category with the cell text Required / Optional / Not listed (plain text, Required in `font-medium`), Issuer (text link to `/issuers?code=`, plus `SimulatedTag`), Applicant signed (Yes/No), and Rules (button "N rules" that sets `?tab=rules&doc=`).

**Change impact tab:**
- Active ruleset line, then a `DataTable`: Application (link to the workspace), Rule, Before (`RuleOutcomeBadge`), After (`RuleOutcomeBadge`).
- `EmptyState`: "No application changes outcome under this ruleset."

**Acceptance:**
- `?doc=fire_noc` filters the rules.
- A checklist row's rules button switches tab with the filter.
- Recheck works for an officer.
- A verifier sees no Change impact tab.

### 2.4 Audit log (`/audit`, officer and admin)

**Frame.** `Page width="default"`.

**PageHeader:**
- Title: "Audit log".
- Context: "Every action is chained by SHA-256. N events."
- Primary: "Verify chain integrity" (fetches `[...qk.audit, "verify"]` on demand plus the browser recompute in `audit/chain.ts`).
- Secondary (admin): "Create signed checkpoint" (`api.checkpoint`).

**Layout:**
1. **Verification result**, after verify. One `Callout`:
   - success: "Chain intact: N events, head hash `Digest`, verified in the browser and on the server";
   - danger: the first broken sequence with a link to it.

   Below it, checkpoints go in a `DescriptionList` (signed checkpoint, time, key).
2. **Events.** `Panel title="Events" padding="none"`:
   - `Toolbar`: `SearchInput` and a family `Select` (counts in the option text).
   - `DataTable` density compact, columns: # (seq), Action (label, raw action as `Code` in `text-xs`), Actor (name, role), Object, Application (link), Time (relative, absolute in title), Hash (`Digest`, first 10).
   - Row click opens a `Drawer` (width 520) with the details as a `DescriptionList`, the previous hash and the own hash (`Digest`), and a mismatch `Callout` if any.
   - "Show more" in the panel footer, 60 rows at a time.

**Removed:**
- the ChainStrip of up to 1000 tabbable 11 px buttons (WCAG 2.4.3 and 2.5.8);
- the family legend (it repeats the select counts);
- the rAF "walk", the flash ring and the hover scale;
- the five detail chips per row (they move into the drawer);
- the tabbable HashChips and `<time>`.

**Acceptance:**
- Verify shows intact.
- An admin creates a checkpoint and it appears.
- Keyboard: Tab reaches the toolbar, then the rows' first cells.
- The drawer opens on Enter.

### 2.5 Platform (`/platform`, officer and admin)

**Frame.** `Page width="default"`.

**PageHeader:**
- Title: "Platform".
- Context: `MetaList` of database kind and "N runs in progress", plus a link "Audit log".
- No primary.

**Layout.** A grid of Panels, two columns at xl:
- **Runs:** a `DescriptionList` (mode, workers, running now); recent runs as a compact `DataTable` linking to `workspacePath(id, "activity")`.
- **Sandbox:** On/Off as a `StatusBadge`; a `DescriptionList` of the four facts. The four stat tiles become one `StatGroup`-like row inside the panel; build that as a small local `MiniStats` using a `grid grid-cols-4 gap-px bg-line` pattern, without nesting `Panel`. Idle workers as a number, not a BlockMeter. Recently stopped as a list.
- **Keys:** a `DescriptionList`.
- **Sign-in:** a `DescriptionList`.
- **Retention**, full width:
  - the policy table as a `DataTable` compact;
  - the dry run as plain numbers in a `DescriptionList layout="stacked" columns={4}`;
  - admin only: "Purge now" as a danger button opening a `Dialog` that requires a reason (at least 10 characters) and shows what will be removed.

**Polling:** `qk.platform` keeps its 5 s refetch. Show no spinner on refetch.

**Acceptance:**
- Values update without layout shift.
- An officer sees no Purge.
- Purge requires a reason.

### 2.6 Command palette (`src/shell/CommandPalette.tsx`)

Restyle to v2:
- a `Dialog`-like overlay at the top third, 560 px wide;
- the input row at `h-12 text-base`;
- group headings `text-xs font-medium text-ink-3` in sentence case;
- rows at `h-9 text-sm` with the icon at 16 px and the hint in `text-ink-3`;
- the selected row `bg-brand-soft`;
- the footer key hints using `Kbd`.

Groups:
- **Recent**, at most 5.
- **Pages**, from `navFor(role)`. Labels: "Review queue", "Analyse a document", and so on.
- **Applications**: label = institution name, hint = `Code` application id plus status label. On selection, navigate to `workspacePath(id)` with nav state.
- **Actions**: theme, sign out.

Keep the fuzzy search, the 12-result cap, the arrow keys, Enter and Esc. Allow Tab to move focus out (do not trap it beyond the dialog). The palette is not mounted for institutions (the AppShell already does this).

**Acceptance:**
- Ctrl K opens it and Esc closes it.
- Typing "konkan" finds APP-2026-000103.
- Enter navigates.
- Focus returns to the trigger on close.

### 2.7 Not found

`Page width="narrow"` with an `EmptyState`:
- title "Page not found";
- description "The link may be old. Workspace links from before the redesign still redirect.";
- a `ButtonLink variant="primary"` to `homePath(role)`.

It renders outside the AppShell for anonymous users, so keep it working with v1 tokens there.

## 3. Package B: the application workspace

**Route:** `/applications/:appId/:tab?`, owned by `ApplicationWorkspace.tsx`. `:tab` is a v2 section id (`findings`, `documents`, `comparisons`, `activity`), or absent for Summary.

**Context and queries.** Keep the existing `WorkspaceContext`, with `app`, `run`, `findings`, `docs`, `role` and `openDoc`. Keep the queries `useApplication`, `useRun`, `useFindings`, `useVerifications` and `useValidation`.

Use one definition of "open":

```ts
const OPEN_REVIEW = new Set(["open", "acknowledged", "evidence_requested"])
```

Put it in `pages/application/data.ts` and import it everywhere. RectifyDialog stops using its own wider set; its selection rules are below.

### 3.1 Legacy redirect

At the top of `ApplicationWorkspace`:
- If `params.tab` is a key of `LEGACY_TABS` (from `shell/nav.ts`), render `<Navigate replace to={workspacePath(appId, m.section, { ...Object.fromEntries(searchParams), view: m.view })} />`.
- An unknown tab redirects to Summary.

Old deep links must land correctly:
- `findings?finding=` (unchanged);
- `documents?doc=&page=&hl=&hlabel=&panel=&rev=`;
- `verification?attempt=` becomes `documents?view=verification&attempt=`;
- `runs?a=&b=` becomes `activity?view=runs&a=&b=`;
- `campus` becomes `comparisons?view=campus`.

Replace `TABS`, `isTab` and `appPath` in `data.ts` with section equivalents, and update every in-workspace link. The inventory lists them: RunPanel, ChecklistTab, DocumentsTab, RelationshipsTab, RunsTab, SinceLastYear, WatchCard, PhotoCard, AskPanel and ViewerSheet. Use `workspacePath` for all of them.

### 3.2 Header (`Header.tsx`, rebuilt)

Build it with `PageHeader`:
- `title`: the institution name, `text-xl`. Drop the shared `layoutId` and `font-display`.
- `status`: `<ApplicationStatusBadge status={app.status} />`.
- `context`: `<MetaList items={[<Code>{aicte_id}</Code>, <Code>{app.id}</Code>, categoryLabel, \`AY ${ay}, round ${round}\`, \`${district}, ${state}\`]} />`.
- `secondary` (officer): Button "Ask why" with a `MessageSquareText` icon. It toggles the Ask drawer.
- `menu`:
  - "Run validation again", for officer, verifier and admin (`useValidation().start`);
  - "Replay latest run", for officer and admin, hidden without `latest_run`. It opens ReplayDialog;
  - "Export evidence pack", officer only. It opens EvidencePackDialog;
  - "View audit trail", with `to: workspacePath(id, "activity", { view: "audit" })`.
- `primary`, officer only: `<ActionMenu trigger="button" variant="primary" label="Decide" width={300} items=[...]>` with two items:
  - "Request rectification", with the description "Send a deficiency letter. The institution corrects and resubmits." It opens `RectifyDialog`, whose "Draft deficiency letter" continues to `LetterEditor` as today.
  - "Record scrutiny outcome", with the description "Record the authority's decision with a reason. Starts the re-verification watch." It opens `OutcomeDialog`, exported from `history/WatchCard.tsx`. Lift its open state into the workspace, and remove the button from WatchCard.
- Verifier and admin: no Decide; Run validation is in the menu.
- `children`: the section `Tabs`. They are route links built from `WORKSPACE_SECTIONS` with `href: workspacePath(id, s.id)`. Only Findings gets `count` = open findings, plus `attention` when any open finding is high or critical. The tab bar is not sticky and has no glass.

**Removed:**
- the run strip (moves to Activity);
- the category, AY and round pills (moved into the context line);
- the four staggered entrances;
- the magnetic button;
- the sticky glass tab bar and the tab crossfade.

### 3.3 Live run

`useValidation` and `useLiveRun` stay. When a run is active, render one `Callout tone="info" role="status"` directly under the header:
- title "Validation is running";
- body: the current real stage name and "x of N documents read";
- action: a Button "View progress".

That button opens a `Drawer` (width 560, right) titled "Validation run". It hosts `LiveRunView`, restyled:
- stages as a vertical `Stepper` built from `run.stages`, using real names and ms;
- the document by step grid as a compact table;
- verification checks as rows with `VerificationBadge`;
- the tiles reduced to one `DescriptionList layout="stacked" columns={4}`;
- no shimmer and no `animate-ping`.

On finish:
- the Callout becomes `tone="success"` "Run complete: 2 new findings, 1 resolved", with the action "View findings", and is dismissible;
- a toast says the same.

On failure: `tone="danger"`, the message, and the action "Run again" (`retryRun`).

"Re-read N documents" stays as a Callout action when documents were cached. Delete `RunPanel`'s in-page panel.

### 3.4 Summary (`/applications/:id`)

**Layout:** `grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]`.

**Main column, in order:**
1. **Needs attention.** `Panel title="Needs attention" padding="none"` with the action link "All findings" (to `findings`).
   - The list is the top 5 open findings sorted by severity rank, then evidence level.
   - Each row is a `Link` to `workspacePath(id, "findings", { finding })`: `SeverityIndicator` (label shown), title, and on a second line a `MetaList` of document type label and category label. Use `divide-y`.
   - Empty: `EmptyState size="sm"` "No open findings" with the description "Record the scrutiny outcome when you are ready."
2. **Checks.** `Panel title="Checks" padding="none"` with three rows. Each row is a link: a label on the left, a plain-text breakdown in the middle, and a chevron.
   - "Rules": "25 met, 1 not met, 2 could not decide" from `run.checklist`, linking to `findings?view=checklist`.
   - "Verification": "8 verified, 1 mismatch, 2 awaiting manual confirmation" from `useVerifications` latest-run attempts, linking to `documents?view=verification`. Add `SimulatedTag` if any attempt used a simulated issuer.
   - "Documents": "8 read, 0 failed" from `docs` (processing_status), linking to `documents`.
   - Under the panel, a `text-xs text-ink-3` line: "Last validated 19 min ago against ruleset `aicte-aph-2024-27@2026-27.2`. Details in Activity." The word Activity links to `activity`. This is the only place run metadata appears outside Activity.
3. **Changes since last year.** One line inside a `Panel` with no title: "3 changes since last year need a look", linking to `comparisons`. Use the `useSinceLastYear` indicator count. Hide it when there is no prior year.
4. **After the decision.** `Panel title="After the decision"` (WatchCard rebuilt, `useWatch`, `useRunWatch`):
   - No outcome yet: one sentence, "No scrutiny outcome recorded yet. Use Decide to record one; certificates confirmed by issuers are then rechecked every 24 h."
   - Outcome recorded: a `DescriptionList` (Outcome, Reason, Recorded by, Date, Round, Next check, Watched certificates N); then "Events" as rows (`SeverityIndicator`, change, time, "Open finding" link); the panel action "Run watch now".
   - Watched items open in a `Drawer` from the link "View N watched certificates", as a `DataTable` (certificate, ref `Code`, issuer plus `SimulatedTag`, valid until, state `StatusBadge`, last checked, link to `/issuers?code=&ref=`).
   - Remove the dashed nested boxes and `IntervalBlocks`.

**Aside, at 2xl and stacked below otherwise:**
- `Panel title="Institution"`: a `DescriptionList` with Name, AICTE ID (mono), AISHE code (mono), Type, Women only (Yes/No), Society, Established, and Address with pincode.
- `Panel title="Declared figures"`: a `DescriptionList` of the `app.declared` scalars, then a native `<details>` "Programmes (N)" revealing the programmes table as a compact `DataTable` (code, name, approved, proposed, NBA).

**Removed:**
- the Glance tiles and Counters (they duplicate the tab count, the checklist and the documents);
- the review sort key tile (the queue shows the order);
- TrustLadder (it becomes the evidence-class `Select` filter in Findings);
- PipelineTimeline (moves to the Activity run drawer);
- the Resolved list (moves to the Activity run diff);
- the InstitutionCard mini map (Campus has the map).

### 3.5 Findings (`/findings?view=findings|checklist&finding=&q=&sev=&ev=&status=&rule=&outcome=`)

**Section header:** a `Toolbar` with the `SegmentedControl` (label "View") on the left: "Findings" with the count of open findings, and "Checklist" with the count of rules. These counts appear only here.

**Findings view.**

Toolbar filters, each synced to the URL with `replace`:
- `SearchInput` (`q`);
- `Select` for severity (`sev`), evidence class (`ev`, options "E1 Cryptographic" and so on) and review status (`status`, default "Open"; also "All" and each status).

**Layout at 1280 px and above:** `grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6`.

- **Left:** a list grouped by category. Each group is a `Section level={3}` titled with the category label and a count in `text-ink-3`, holding a `Panel padding="none"`. One `Panel` per category is allowed because they are siblings, not nested.
  - Each row is a button with `aria-pressed` for the selection:
    - `SeverityIndicator showLabel={false}` under a visually hidden column context;
    - the title in `text-sm font-medium`;
    - a second line in `text-xs text-ink-3` with a `MetaList` of document type and `EvidenceClassLabel showName={false}`;
    - a `ReviewBadge` on the right, only when the status is not "open".
  - The selected row uses `bg-brand-soft`.
- **Right:** `Panel` sticky `top-20` holding `FindingDetail` for `?finding=`.
- **Below 1280 px:** the detail opens in a `Drawer` (width 560).

**FindingDetail, rebuilt:**
1. Title (`text-md font-semibold`), then a `MetaList`: `SeverityIndicator`, `EvidenceClassLabel`, `Code` rule code, category and outcome.
2. The message, as plain `text-sm`.
3. Limitation: `Callout tone="neutral"`, only if present.
4. "Rule": `CitationCard` (restyled: quote in `text-sm`, source line in `text-xs`, no card shadow; a bordered block is allowed inside a panel only as a `border-l-2 border-line-2 pl-3` quote, not a box).
5. "Evidence": `EvidenceList`. Each item is a row with an action link ("Show on page" opens the viewer drawer at `doc/page/hl`; "View revisions" goes to `documents?doc=&panel=revisions&rev=`; "Open other application"; `SealCompare`; `GeoFigure`; `ComparisonTable`).
6. "Inputs": `TraceInputs`, collapsed under `<details>`.
7. "History": `api.findingHistory`, as a compact list.
8. Footer, for officer and verifier: review actions.
   - "Acknowledge" is the secondary button.
   - "Request evidence", "Accept flag", "Escalate for inspection", "Dismiss" and "Resolve" go in an `ActionMenu label="Review"`.
   - Each opens a small `Dialog` with a required reason (at least 10 characters) and calls `useReview`.
   - Officers also get "Include in a rectification request", which opens RectifyDialog preselected.
   - Add "Ask about this finding", which opens the Ask drawer prefilled.

**Keyboard:**
- Remove the global `j`, `k` and `a` listeners.
- Arrow Up and Down move between rows while focus is inside the list; Enter opens.
- No single-key action without confirmation (WCAG 2.1.4).

**Checklist view.**
- Toolbar: `SearchInput` (`q`) and an outcome `Select` (`outcome`: All, Met, Not met, Could not decide, Not applicable).
- `Panel padding="none"` with a `DataTable` density compact. Columns:
  - Outcome: `RuleOutcomeBadge`, using `RULE_OUTCOME_LABEL`;
  - Rule: title plus `Code` rule id on the second line;
  - Category;
  - Severity: `SeverityIndicator`;
  - Finding: a link "Open" when a finding exists.
- Row click with `?rule=` opens the same right panel or drawer, showing the rule detail: `CitationCard`, `TraceInputs`, `EvidenceList` and a link to the finding.
- Remove the summary card, the `OutcomeBar` and the triple counts.

### 3.6 Documents (`/documents?view=documents|verification&doc=&page=&hl=&hlabel=&panel=&rev=&attempt=`)

**Toolbar:** `SegmentedControl` "Documents" or "Verification".

**Documents view, without `?doc`.**

`Panel padding="none"` with a `DataTable`. Columns:
- Document: type label, then filename in `text-xs` mono. This is the link column, which sets `?doc=`.
- Read: "Read" or "Failed" text, plus the text source.
- Verification: a `VerificationBadge` with the document's best status from `run.document_status`.
- Open findings: a number.
- Uploaded: relative time.

Show superseded documents under a `<details>` "Earlier versions (N)".

**Document detail, with `?doc`.**
- A back link "All documents" (removes `doc`).
- Below it, `grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6`:
  - **Left:** an `EvidenceFrame` with title = type label, `meta` = `MetaList` of filename, pages and text source, plus a `VerificationBadge`. A mismatch between declared and detected type shows as a `Callout tone="warning"` above the frame, once. The `toolbar` holds page navigation, the layer toggles (Fields, Findings, QR, Rows, Instruction) and zoom. The child is `DocViewer`, minus the scan-line sweep (keep the single focus pulse on locate, which is orientation).
  - **Right:** a `Panel padding="none"` with in-page `Tabs` (`idBase="doc"`, synced to `?panel=`):
    - Fields: rows with name, value (mono), raw, method and confidence, and a Locate button.
    - Verification: attempts for this document, as rows with `VerificationBadge`, channel, `SimulatedTag` and a link to `?view=verification&attempt=`.
    - Forensics: officer only. Signals with `SeverityIndicator`, then file facts as a `DescriptionList`.
    - Revisions: `RevisionPanel`, with `RevisionStage` replacing the left frame's content while it is active.
    - Extraction: `ModelPanel`.
  - Below the tabs: "Findings on this document", as rows linking to `findings?finding=`.

**Verification view.**

`Panel padding="none"` with a `DataTable`:
- rows are documents;
- columns are Issuer signature, Applicant signature, Signed QR, Issuer registry, Content credentials and Manual confirmation;
- each cell is a `VerificationBadge` (or "Not applicable" text) and is a button setting `?attempt=`;
- a header `Tooltip` gives each channel's meaning.

Above the table, one line of counts: "8 verified, 1 mismatch, 2 awaiting manual confirmation".

`?attempt=` opens a `Drawer` (560) with `AttemptDetail`:
- channel plus `SimulatedTag`, a `VerificationBadge` and the meaning;
- the document link;
- signer, role, trust anchor, coverage and revocation as a `DescriptionList`;
- `ComparisonTable`;
- follows and followed-by;
- `ManualForm` (officer and verifier, `useManualVerification`, reason required).

The applicant-signature caution ("Proves who uploaded the file, not who issued it") appears only here, in the drawer, for applicant_signature attempts. Remove it from DocumentsTab and TimeMachine.

**Removed:** the DocChip grid, DocHeader chips, the nested viewer card, the gradient sticky, the stagger and the animated bars.

### 3.7 Comparisons (`/comparisons?view=since-last-year|related|campus&node=`)

**Toolbar:** `SegmentedControl` "Since last year", "Related applications" and "Campus". Each view is one column of Panels.

- **Since last year** (`useSinceLastYear`):
  1. `Panel title="Years compared"`: a two-column `DescriptionList layout="stacked" columns={2}` (last year, this application). This replaces the two YearBand cards.
  2. `Panel title="Indicators"`: rows with `SeverityIndicator`, title, `EvidenceClassLabel`, "Show on the page" and "Open finding". The citation and caution appear inside the row's `<details>`.
  3. `Panel title="Figures"`: the ScalarTable, as a `DataTable` compact.
  4. `Panel title="Programmes"`.
  5. `Panel title="Faculty roster"`: replaced share as text ("4 of 30 replaced"); the changed IDs as a `Code` list.
  6. `Panel title="Labs"`, then `Panel title="Certificates"`.

  No eyebrows, no roster block animation. Empty: "No earlier application to compare with."
- **Related applications** (`run.graph`): `grid xl:grid-cols-[minmax(0,1fr)_340px]`. Left, a `Panel padding="none"` with the d3 graph. Remove the dot-grid gradient background and the depth stagger. Keep drag and add keyboard selection of nodes through the side list. Right, a `Panel`: with no selection, "Links found" by code; with a selection, the node details, "Open other application" (`workspacePath(other, "comparisons", { view: "related" })`) and the related findings. Escape clears the selection.
- **Campus** (`qk.campus`, officer, verifier and admin):
  - `Panel title="Location"` with a Map or Plot `SegmentedControl size="sm"` in the actions, then `CampusMap` or `CampusPlot`, the list of points and distances, and one `Callout tone="neutral"` for the caution;
  - then one `Panel` per photo (`PhotoCard` restyled): image with boxes and the Switch, a `DescriptionList` for EXIF, reuse, `Credentials` and the room panel.

  Drop the "Officer only" eyebrow.

### 3.8 Activity (`/activity?view=runs|audit&a=&b=`)

**Runs view** (`qk.runs`):
- `Panel padding="none"` with a `DataTable`. Columns:
  - Round;
  - Status: a `StatusBadge` "Complete", "Failed" or "Running", with "Latest" and "Replay" as plain text after it;
  - Started: absolute;
  - Actor;
  - As of;
  - Findings: a number plus a severity breakdown text;
  - Ruleset: `Code`;
  - Report digest: `Digest`;
  - row actions: an `ActionMenu` with "Compare with latest" (sets `a` and `b`), "Replay this run" and "Export evidence pack".
- Two checkbox selections set `?a=&b=`, and the compare result renders below in a `Panel title="Compare runs"`: three "Same or Changed" lines for ruleset, inputs and report, then the Appeared, Resolved and Persisted lists.
- Row click opens a run `Drawer` with stage timings (the old PipelineTimeline, as rows with ms) and resolved since previous.
- Remove the flying A/B `layoutId` slots and the timeline dots.

**Audit view** (`qk.appAudit`):
- `Panel title="Audit trail" padding="none"`, with the panel action "Verify chain" (officer and admin, `api.verifyAudit`). The result is one `Callout`: intact, or broken at #N.
- Events go in a `DataTable` compact: seq, action, actor and role, time, hash `Digest`. Row click opens a `Drawer` with the details, the previous hash and the own hash.
- Gaps (events from other applications) render as a single muted row, "N events from other applications".
- Remove the shake, scale and walk animations, the gloss strip and the Summary card (its content is the Callout).

### 3.9 Dialogs and drawers

- **RectifyDialog** (`useRectification`, `useLetters`):
  - a list of open findings with `Checkbox`, `SeverityIndicator`, title and code;
  - only `completeness`, `compliance` and `validity` findings are selectable;
  - `forensic`, `consistency` and `verification` findings are listed disabled under a `PanelDivider label="Not shared with institutions"` with the note "Forensic and cross-application indicators stay with officials. Describe what to correct in the message instead.";
  - "Select all" selects only the eligible findings;
  - message `Textarea`;
  - footer: Cancel (ghost), "Draft deficiency letter" (secondary), "Resume saved draft" (shown only when a draft exists), and "Send request" (primary, requires the message or at least one item).
- **LetterEditor** (officerApi `draftLetter`, `letter`, `updateLetter`, `finaliseLetter`):
  - a `Dialog size="lg"` or a full-height `Drawer` (width 860);
  - subject and intro fields;
  - items as rows with number, title, description, clause `Select` with a quote preview (reuse `CitationCard`, deleting `ClauseQuote`), what to submit, respond-by date, and move up, move down or remove as `IconButton`s;
  - confirm stage: a reason is required;
  - preview: the PNG page in an `EvidenceFrame`; PDF download as a secondary button;
  - sent: a `DescriptionList` (SHA-256 `Digest`, finalised time, reason).
- **EvidencePackDialog** (`officerApi.exportPack`):
  - a contents list;
  - an "Include original files" `Checkbox` with the description "Contains personal data. Share only with authorised officials.";
  - progress as a `role="status"` line, without the BlockProgress, with the elapsed time read only on completion (do not live-announce the 500 ms timer);
  - result: filename, size, "Download ZIP" (primary), then manifest, ZIP and key digests in a `DescriptionList`, and the file list in a `<details>`.
- **ReplayDialog:**
  - ruleset, as of, and "Inputs identical" or "Inputs changed";
  - two `Digest`s (original report, replayed report);
  - one `StatusBadge`: verified "Reproduced identically" or mismatch "Differs";
  - remove the 64-cell grids and the rotating icon.
- **Ask why drawer** (`useAsk`):
  - a `Drawer` (width 440, right), not the fixed portal with `2xl:pr-[440px]` page padding;
  - header: "Ask why", with the description "Answers cite the latest run only. Model output, evidence class E7.", 12 px `text-ink-3`;
  - suggested questions as ghost buttons;
  - each turn: the question as plain text in `text-ink-3`, the answer sentences with citation links, the mode and latency in the meta line, and dropped sentences under `<details>`;
  - live region on the newest answer only.
- **ViewerSheet:**
  - a `Drawer` (width 880) with an `EvidenceFrame` inside and the footer link "Open in Documents".

**Acceptance for package B:**
- A7: every section renders.
- Old URLs redirect: `/applications/APP-2026-000107/checklist`, `/verification?attempt=...`, `/since-last-year`, `/runs`, `/campus`.
- Decide and Request rectification open the rectify dialog with forensic findings disabled; Draft deficiency letter opens the editor; Send works and the status becomes Rectification requested.
- Decide and Record scrutiny outcome require a reason; the watch appears on Summary.
- Run validation again shows the live Callout and the drawer streams real stages.
- Ask why answers with citations.
- The evidence pack downloads.
- Replay shows "Reproduced identically".
- The time machine scrubs revisions from a finding's "View revisions".
- A10: the campus map renders.
- Verifier: no Decide, review actions available. Admin: Replay available, no Decide.

## 4. Package C: the institution portal

All pages use `Page width="narrow"`. There is no sidebar (the AppShell already handles this) and no command palette. Primary buttons use `size="lg"` (40 px, Fitts).

### 4.1 Applications (`/portal`)

**PageHeader:**
- Title: "Your applications".
- Context: `MetaList` of the institution name, AICTE ID and district.
- Primary: `ButtonLink variant="primary" size="lg" to="/portal/new"`, "Start a new application".

**Body:** a `Panel padding="none"` with a `DataTable`, with rows linking to `/portal/applications/:id`. Columns:
- Application: category label, then the application ID in `text-xs` mono;
- Academic year;
- Status: `ApplicationStatusBadge`;
- Next step: one plain sentence from the Next step table in 4.3, in `text-ink-2`;
- Updated: relative.

**Empty state:** title "No applications yet", with the description "Start an application, upload the documents on the checklist, then submit it for AICTE review." and the primary action.

**Removed:** the cards grid, the CompactStepper, the "How an application moves" strip and the staggers.

### 4.2 New application (`/portal/new`)

**PageHeader:** title "New application", context "Four short steps. You can upload documents after the draft is created.", and back to `/portal`. There is no header primary; the step buttons are the actions.

**Body:** `grid lg:grid-cols-[200px_minmax(0,1fr)] gap-8`.
- **Left:** a vertical `Stepper` (label "New application steps") with "Category and year", "Programmes", "Declared figures" and "Review".
- **Right:** one `Panel` per current step, with the title equal to the step name:
  1. **Category and year.** Categories as a native radio group, one bordered row per category, with label, `Code` code, "N required, N optional documents" and the checklist source in `text-xs`. Arrow keys work natively. The academic year is a `Select`.
  2. **Programmes.** `ProgrammesEditor`, restyled as a table-like form: one row per programme with inputs and checkboxes, and "Add programme" as a secondary button. The intake delta appears as plain text: "+60 seats".
  3. **Declared figures.** `NumbersEditor`, as `Field`s in a two-column grid with units in the hint.
  4. **Review.** A `DescriptionList` of the category, year and declared figures, plus the programmes table.

  The panel footer has Back (ghost) and Continue (primary, `size="lg"`). On the last step the primary is "Create draft" (`api.createApplication`, then a toast, then navigation).

Keep validation messages inline with `FieldError`. Remove the slide transition (or keep a 150 ms fade at most), the spotlight and the magnetic effect.

### 4.3 Application (`/portal/applications/:id`)

**Data:**
- `qk.application(id)`, `qk.activeRun(id)`, `qk.findings(id)` (for the deficiency list only) and `useLetters`;
- `api.submit`, `api.updateDeclared`;
- the upload XHR in `UploadSlot`;
- `useLiveRun` for progress.

**PageHeader:**
- Title: the category label.
- Status: `ApplicationStatusBadge`.
- Context: `MetaList` of `Code` app ID, "AY 2026-27", "Round 2" and "Submitted 10 Dec 2025".
- Back: "Applications" to `/portal`.
- No primary in the header; the primary lives in the Next step panel.

**Order of the page:**

1. **Stepper**, horizontal, label "Application progress". The steps are Details, Documents, Submitted, AICTE review and Decision. Map every status:

   | Status | Details | Documents | Submitted | AICTE review | Decision |
   |---|---|---|---|---|---|
   | draft, required docs missing | complete | current ("N missing") | upcoming | upcoming | upcoming |
   | draft, all uploaded | complete | complete | current ("Ready to submit") | upcoming | upcoming |
   | submitted, validating | complete | complete | current ("Being checked") | upcoming | upcoming |
   | under_review | complete | complete | complete | current | upcoming |
   | rectification_requested | complete | attention ("Corrections requested, round N") | complete | upcoming | upcoming |
   | rectified | complete | complete | complete ("Resubmitted, round N") | current | upcoming |
   | closed | complete | complete | complete | complete | complete ("Closed") |
   | withdrawn | complete | complete | upcoming | upcoming | complete ("Withdrawn") |

   An unknown status renders all steps upcoming with a neutral description, never as Draft. Repeated rounds show the round in the description.

2. **Next step.** `Panel` with the title "Next step". One sentence, then the one primary action (`size="lg"`):

   | State | Sentence | Primary |
   |---|---|---|
   | draft, missing | "Upload N required documents to continue." | "Go to documents" (scrolls to and focuses the first missing slot) |
   | draft, complete | "Every required document is uploaded. Check your declared figures, then submit." | "Submit for review" (opens the Submit dialog) |
   | submitted, validating | `SubmissionProgress` (below) | none |
   | under_review | "AICTE is reviewing your application. You will see any request for corrections here." | none |
   | rectification_requested | "AICTE asked you to correct N items. Upload corrected documents or fix your figures, then resubmit." | "Resubmit" (enabled when every required slot is filled; otherwise explain why it is disabled in the hint) |
   | rectified | "Resubmitted on date. AICTE is reviewing the corrections." | none |

3. **Deficiency letter**, only when a rectification is open. `Panel` with the title "Deficiency letter" and the description "Round N, issued date". Contents:
   - a `DescriptionList`: Issued, Respond by, Items, Notice SHA-256 (`Digest`);
   - the panel action "Download PDF" (secondary, `/api/letters/{id}/pdf`);
   - the officer's message as plain text;
   - the items as a numbered list, with title and message only. Do not render `code`; do not render severity.

   Merge `RectificationLetter` and the amber "What AICTE asked you to fix" panel into this one panel.

4. **Documents.** `Panel title="Documents"`, with the description "PDF, JPG or PNG. A new upload replaces the earlier file." and the checklist source as a `text-xs` line. Slots are rows divided by `divide-y`, required first. `UploadSlot`, rebuilt:
   - **Left:** the label, then "Required" or "Optional" as `text-xs text-ink-3` text (not a pill), then the description.
   - **Uploaded:** the filename (mono), size, pages, "uploaded 7 min ago" and the `Digest` of the SHA-256.
   - **Right:** "Upload" (primary only for the first missing required slot, secondary otherwise), or "Replace" (secondary) when uploaded and editable.
   - **Uploading:** a 4 px native-looking progress bar with the real percentage text ("Uploading, 42 percent") and Cancel.
   - **Processing:** "Checking file type" text.
   - **Rejected:** a `Callout tone="danger"` with "Not accepted: reason" and the action "Try another file".
   - **`processing_status === "failed"`:** a `Callout tone="warning"` "This file could not be read: processing_error. Upload a clearer copy."
   - Drag and drop on the row stays.
   - An `aria-live="polite"` region is always mounted per slot and announces "Uploaded filename" on success.
   - Remove the 24-segment shimmer, the icon spin and the stagger.

5. **Declared figures.** `Panel` with the action "Edit", shown only when status is draft or rectification_requested.
   - Read mode: `DeclaredView` as a `DescriptionList`, plus the programmes table.
   - Edit mode: the editors inline, with Cancel and Save (primary within the panel is acceptable because the page has no other visible primary while editing; hide the Next step primary in edit mode).
   - Saving uses `api.updateDeclared`.

6. **Automatic check.** `Panel title="Automatic check"`, a short history: one row per run with Round, Status (`StatusBadge` "Complete", "Failed" or "Running"), Finished and Duration. No ruleset IDs.

7. **Items for your attention**, shown only when status is rectification_requested or under_review **and** at least one finding has review_status `evidence_requested`. Title and message rows only. Remove "Shared with you" and "Gaps that AICTE has shared" (inaccurate before an officer has reviewed). The heading is "Items AICTE asked about".

**Submit dialog:**
- title "Submit for review" (or "Resubmit");
- description "After you submit, documents and figures are locked unless AICTE asks for corrections.";
- body: missing required documents as a list, if any (Submit disabled); otherwise "All N required documents are uploaded.";
- footer: Cancel, then "Submit" (primary);
- errors in a `Callout tone="danger"`;
- no Readiness meter (the stepper and the Next step panel already say this).

**SubmissionProgress**, inside the Next step panel:
- a vertical `Stepper` with the four real steps: Received, Reading documents ("x of N documents read"), Checking against the handbook ("x of 5 check groups done"), and Ready for AICTE review;
- one `role="status"` line with the elapsed seconds, updated at most every 5 s for screen readers;
- failure: `Callout tone="danger"` "The check stopped. Nothing is lost; AICTE staff can restart it.";
- remove the glossy bevel strips.

**Acceptance for package C:**
- inst1: the list shows one row; the application page shows the stepper at AICTE review and the Next step sentence, and no codes, severities or forensic words anywhere.
- inst3 (APP-2026-000103 after the officer requests rectification): the deficiency letter panel with a PDF download, items without codes, and Resubmit gated correctly.
- Upload a replacement for one slot: the percentage shows and success is announced.
- The New application wizard creates a draft; the draft page asks to upload documents.

## 5. Definition of done (every package)

- [ ] Light and dark themes checked at 1280x800 and 1920x1080; no horizontal page scroll; nothing clipped.
- [ ] One primary button per screen; header actions follow PageHeader order; decisive actions require a reason.
- [ ] No banned classes or components (section 0, item 6). Running `grep -rn "eyebrow\|font-display\|text-\[\|bg-sky\|StatusCube\|CubeStrip\|BlockProgress\|Counter\|magnetic\|stagger" <your folder>` returns nothing.
- [ ] Keyboard path: Tab order follows reading order; every row and action is reachable; Esc closes menus, drawers and dialogs, and focus returns to the trigger; focus rings are visible.
- [ ] Automated accessibility checks are clean: labelled inputs, a caption on every table, no `aria-label` on non-interactive divs, no nested interactive elements, and colour is never the only signal.
- [ ] Text is at least 12 px; contrast is AA in both themes (use tokens only, no hex).
- [ ] Reduced motion: nothing moves except progress indicators.
- [ ] Copy: sentence case, glossary terms, no em dashes, no emojis, no forged, fake, fraudulent or genuine, and SIMULATED wherever simulator data appears.
- [ ] Every hook, mutation and URL parameter from the inventory still works; old links redirect.
- [ ] `pnpm build` passes from `frontend/`; commits are small and conventional with no attribution; pushed to the package branch.
