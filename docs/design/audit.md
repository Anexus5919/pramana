# Design audit: signed-in application

Date: 2026-10-23. Scope: every screen after sign-in, for officer, verifier, admin and institution roles. The landing pages, login and the public /scan page are out of scope.

Method:
- Seeded data (11 applications, A7 = APP-2026-000107, A10 = APP-2026-000110, inst3 with a rectification requested).
- Headless screenshots at 1920x1080 (viewport) and 1280x800 (full page), saved as `before-*.png` in the session scratchpad `shots-redesign` folder.
- A file-by-file read of `frontend/src/pages/**`, `frontend/src/shell/**` and `frontend/src/ui/**`.

File pointers are relative to `frontend/src/`.

## 1. Summary

1. **There is no single place where work starts.**
   - On the dashboard (`before-officer-dashboard-1920.png`), a 450 px greeting hero, an isometric skyline and four KPI tiles push the review queue below the fold at 1920x1080. The queue starts at y = 900.
   - The officer's real job (open the next application, work its findings, decide) is the fourth thing on the page.
2. **The application workspace is too wide to hold in your head.** It has 10 tabs, 6 header actions, a 4-chip status row and a latest-run strip. Together they take about 325 px before any content starts (`before-officer-ws-overview-1920.png`).
   - "Record scrutiny outcome", the most consequential action, is not in the header. It is buried inside a watch card on Overview.
3. **The same numbers are repeated 3 to 8 times.**
   - The open findings count appears in 8 places.
   - Latest-run metadata appears in 5.
   - The Checklist tab states "28 rules, 1 failed" three ways on one screen.
   - The dashboard shows a high-severity count under two different definitions.
4. **The decorative layer reads as AI-generated:**
   - Sky gradients behind every page (`shell/AppShell.tsx:118`).
   - An isometric block skyline, plus 3D status cubes in place of status text.
   - Glossy bevel strips, a pulsing animated "cable", cursor spotlights, magnetic buttons and animated counters.
5. **Typography has no system.**
   - Three families: Inter, Inter Tight for display, and JetBrains Mono.
   - About 10 arbitrary pixel sizes, from `text-[9.5px]` to `text-[32px]`. The workspace alone has 50 uses of `text-[11px]`.
   - Uppercase tracked eyebrows over almost every card: about 42 in the workspace folder.
6. **Everything is a card, and cards sit inside cards.**
   - Panels inside panels: the institution rectification box goes three levels deep, and the document viewer is a card inside a card.
   - Four equal KPI tiles give no hierarchy.
7. **Motion is everywhere.**
   - Page transitions, tab crossfades, staggered list reveals and `layoutId` flourishes.
   - Per-block pops, an rAF "walk" along the audit chain, and a scan-line sweep over documents.
   - Little of it tells the user anything.
8. **The layout wastes the wide screen.**
   - At 1920 px the content column is centred at 1440 px inside the area to the right of the sidebar. That leaves a dead gutter of about 140 px between the sidebar and the content, and the breadcrumb floats in it.
   - Meanwhile, dense tools such as Findings and Documents are squeezed into the same 1440 px.

## 2. Navigation and flow problems

### Officer, verifier, admin

**The sidebar** has two groups, "Review" and "System", and spends its top 120 px on a "Workspace: AICTE scrutiny officer" box. That box repeats the role shown in the user menu two inches to the right.

**The dashboard**
- It has three competing entry points into an application: the skyline towers, the queue rows and the alerts feed. Each has its own visual language.
- "Open next in queue" is the right primary action, but it sits inside a decorative hero.

**The workspace**
- The tab labels are nouns about system internals (Verification, Relationships, Runs, Audit), not steps of a review.
- Three views split one concept:
  - Findings and Checklist are two views of the same rule outcomes.
  - Documents and Verification are two views of the same per-document checks.
  - Runs and Audit are both history.
- Header buttons are ordered by implementation, not by intent: Ask why, Evidence pack, Request rectification, Replay, Run validation.
  - "Run validation" is styled as the primary action (magnetic, glowing), but on an application that is already validated it is the least likely next step.
- There are two rectification entry points (the header, and a link in finding detail). There is no visible decision step that ties review to outcome.
- Tools that matter in a demo hide in different places:
  - The time machine is a sixth segment in the Documents side panel.
  - Ask why is a header link.
  - The re-verification watch is a card on Overview.

**Cross-links are missing.** There are no links from the workspace to Rules, Analyse or the global Audit log, although findings cite rules and runs write audit events.

**Breadcrumbs repeat the page title on every page.** The workspace crumb also repeats the active tab.

### Institution

**The shell is built for officials.** The institution gets a two-item sidebar, a command palette and a breadcrumb trail for what is a linear, one-application flow. In the palette, every entry has the same label (their own institution name), so it cannot tell applications apart.

**My applications** (`before-inst1-portal-1920.png`)
- A single card floats in a three-column grid.
- Status is shown three ways: a pill, a dot stepper and a next-step sentence.
- A three-step explainer strip sits below it permanently, not only when the list is empty.

**Application page** (`before-inst3-app-rectification-1920.png`)
- Status is shown three times: header pill, stepper, and the run card pill.
- The resubmit action is in a sticky side column, separated from the documents it depends on.
- The rectification request (an amber box with a message box, a letter card and item cards) pushes the documents below the fold.
- There is no single "what to do next" statement.

**StatusStepper**
- It shows Rectification and Rectified as optional dashed steps.
- It cannot show a second rectification round.
- It renders closed or withdrawn applications as "Draft".

**New application wizard** (`before-inst1-new-1920.png`)
- It is reasonable, but category cards carry decorative block meters.
- The "Create draft" button is magnetic.
- The wizard sits in a narrower column than every other page.

### Admin and tools

**Rules** (`before-officer-rules-1920.png`) opens with a sky-gradient hero. The hero's three large stats (29 rules, 10 document types, 2 checklists) repeat the tab counts directly below it.

**Audit log** (`before-officer-audit-1920.png`)
- The total "123 events" appears three times.
- The hash chain renders up to 1000 tiny buttons.
- Every row carries prev and hash chips plus up to 5 detail chips.

**Issuer simulator** (`before-officer-issuers-1920.png`)
- The SIMULATED label appears six times above the fold.
- Three different source pickers do overlapping jobs:
  - the action form;
  - the lookup panel;
  - each card's toggle.
- Each card has an animated 14-block cable.

**Analyse** (`before-officer-analyse-1920.png`) leads with a dashed sky drop zone, a tilting file illustration and three equal-weight explainer cards. "Not filed" appears in the header tags, the drop zone copy and the intro.

**Grouping.** Platform sits in the same "System" group as Rules and the Issuer simulator, although only admins act on it.

## 3. Repeated information

| Information | Where it appears | Fix |
|---|---|---|
| Open findings count | Tab badge (`ApplicationWorkspace.tsx:137,146`), Overview Glance tile (`OverviewTab.tsx:317-326`), TrustLadder per class (`OverviewTab.tsx:33`), per-document badge (`DocumentsTab.tsx:650`), Findings category group counts, RunCard count and severity bar (`RunsTab.tsx`), live "Findings so far" (`LiveRunView.tsx:269`), Since-last-year tab badge | One count on the Findings section label. The Summary lists the top items, not the number again |
| Definition of "open" | Four different filters: `ApplicationWorkspace.tsx:61`, `OverviewTab.tsx:24`, `DocumentsTab.tsx:650` inline, `RectifyDialog.tsx:14` (adds accepted and escalated) | One shared `isOpen()` helper |
| Latest run metadata (ruleset, as of, triggered by, digest, time) | Header strip (`Header.tsx:111-133`), RunCard (`RunsTab.tsx:82-118`), Checklist eyebrow (`ChecklistTab.tsx:194`), RunPanel sync line (`RunPanel.tsx:262`), ReplayDialog (`ReplayDialog.tsx:104-105`) | Shown once, in Activity. The Summary carries one muted line: "Validated 2 min ago against ruleset X" |
| Rule outcome counts | Tab badge (`ApplicationWorkspace.tsx:147`), Glance Rules tile (`OverviewTab.tsx:329-336`), Checklist heading, OutcomeBar and Segmented counts, all on one screen (`ChecklistTab.tsx:195-210`), live tiles (`LiveRunView.tsx:276-279`), RunPanel summary (`RunPanel.tsx:209`) | Counts live only in the filter control of the checklist view |
| Document list and status | Glance CubeStrip (`OverviewTab.tsx:339-342`), DocChip grid and DocHeader (`DocumentsTab.tsx:552,655`), Verification matrix rows (`VerificationTab.tsx:376`), live document grid, Documents and Campus tab badges | One documents table, with verification as a column |
| Verification results | Verification tab matrix, Documents verification panel (`DocumentsTab.tsx:275-319`), EvidenceList items (`parts.tsx:394-409`), live CheckRows, WatchCard issuer states | One per-document verification panel. Findings link to it |
| "Applicant signature proves who uploaded" caution | `DocumentsTab.tsx:303`, `VerificationTab.tsx:195`, `TimeMachine.tsx:511` | One tooltip on the channel name |
| Resolved since previous run | Overview `Resolved` (`OverviewTab.tsx:159-196`), RunPanel Summary (`RunPanel.tsx:170,201`), RunDiff (`RunsTab.tsx:205`) | Run comparison in Activity only |
| Stage timings | PipelineTimeline (`OverviewTab.tsx:115`), RunPanel BlockProgress (`RunPanel.tsx:273`), LiveRunView (`LiveRunView.tsx:209`) | Live progress while running, then in the run detail only |
| Revision diffs | Forensics "Revision changes" (`DocumentsTab.tsx:229-250`), EvidenceList revision_diff (`parts.tsx:410-430`), RevisionItem (`TimeMachine.tsx:546-571`) | Time machine is the single home |
| Institution identity (name, AICTE id, place) | Workspace header (`Header.tsx:61-69`), InstitutionCard (`OverviewTab.tsx:209-219`), breadcrumb | Header only. Address and codes go in a details list |
| Academic year and round | Header chips (`Header.tsx:79-81`), YearBand (`SinceLastYearTab.tsx:71`), RunCard (`RunsTab.tsx:70`), WatchCard (`WatchCard.tsx:270`) | One context line under the title |
| Programmes and declared figures | Overview `Declared` (`OverviewTab.tsx:256-312`), Since-last-year tables (`SinceLastYearTab.tsx:125-197`) | Declared in Summary details. The year comparison shows only the differences |
| Rule citation look | CitationCard in FindingDetail, Checklist, IndicatorCard and AskPanel; re-implemented as ClauseQuote (`LetterEditor.tsx:56-78`) | One Citation component |
| Location | InstitutionCard mini-map (`OverviewTab.tsx:225`), GeoFigure (`parts.tsx:242`), Campus map and plot, PhotoCard geotag | Campus map only |
| High-severity count (dashboard) | Hero "41 high-severity findings" counts alerts (`Hero.tsx:112`), KPI tile sums `open_high` (`KpiTiles.tsx:84`), AlertsFeed Findings filter count | One metric, one definition |
| Verification mix (dashboard) | KPI tile stacked bar, VerificationBlocks (`VerificationBlocks.tsx`), ReviewQueue legend plus a CubeStrip on every row | One summary figure. Per-row detail stays inside the application |
| Queue (dashboard) | Skyline towers (`Hero.tsx:24-105`) and ReviewQueue rows show the same applications, ranking and navigation. ReviewQueue renders its pills twice, as mobile and desktop markup | Keep the table only |
| Status mix (dashboard) | KPI badges and per-row StatusPill | Status column only |
| Portal application status | Header pill, StatusStepper, RunCard pill | Stepper plus one badge |
| Portal readiness and missing count | SubmitCard, submit Dialog (`InstitutionApplicationPage.tsx:154,485`), slot tags | One next-step panel |
| "An AICTE officer reviews..." copy | RunCard, SubmissionProgress, toast, `MyApplicationsPage.tsx:166` | Once, in the status step description |
| Rectification items | RectificationPanel items, then again as Deficiencies (the same findings, now evidence_requested) | One deficiency letter block |
| Rules counts | RulesetCard stats and tab counts | Tab counts only |
| Audit event total | Chain title, timeline header, "All" filter | Filter count only |
| Issuer state and SIMULATED tag | Header cubes and every card; SIMULATED 4 or more times per view | Page-level SIMULATED banner once, plus a tag only where a single result is shown out of context |
| Platform runs in progress | Header meta and the Runs card | Runs panel only |
| Analyse "Not filed" and PKI note | Header tags, DropZone, Intro; header meta and Signatures description | Once, in the page context line |
| Theme and Sign out | Topbar and command palette | Keep both (a familiar pattern), but the palette entry is secondary |

## 4. Clutter and "AI-generated" tells

### Decorative gradients and texture
- `bg-sky` and `grain` on the dashboard hero (`dashboard/Hero.tsx:119`).
- A fixed `bg-sky-soft` wash behind every signed-in page (`shell/AppShell.tsx:118`).
- `bg-sky-soft` on:
  - the Rules hero (`rules/RulesPage.tsx:35,61`);
  - VerificationBlocks (`dashboard/VerificationBlocks.tsx:37-49`);
  - the Analyse DropZone (`verify/DropZone.tsx:149`);
  - nine EmptyStates in the workspace, e.g. `ChecklistTab.tsx:171`, `FindingsTab.tsx:184`, `RunsTab.tsx:257`.
- Glass blur on the topbar, the sidebar and the workspace tab bar (`ApplicationWorkspace.tsx:182`).
- A radial dot grid behind the relationship graph (`RelationshipsTab.tsx:325-329`).

### Gimmicky motifs standing in for information
- **Isometric skyline** (`dashboard/Hero.tsx:24-105`, `iso.tsx:33-36`): cubes drop in. The legend needs three lines to explain it ("one block per 2 findings").
- **StatusCube** (a 3D cube per status) is used everywhere a word or dot would do. CubeStrip rows of cubes appear on every queue row and the Documents tile.
- **Glossy bevel strips** (`bg-white/40` top highlight) on:
  - `StatusStepper.tsx:38`
  - `SubmissionProgress.tsx:63`
  - `InstitutionApplicationPage.tsx:132`
  - `rules/Checklists.tsx:26`
  - `issuers/Cable.tsx:36`
  - `audit/parts.tsx:87`
- **Blocks used as ornament:**
  - BlockProgress, OutcomeBar and TrustLadder blocks with gloss strips.
  - Category cards with block meters (`before-inst1-new-1920.png`).
  - Sidebar "Workspace" box.
- **Infinite pulse:** the animated 14-block `Cable` on every issuer card (`issuers/Cable.tsx:11-85`, pulse at :43).
- **Cursor effects:**
  - Spotlight on every interactive card (`ui/Card.tsx:44-63`, hand-copied in `NewApplicationPage.tsx:92-106`).
  - Magnetic buttons: `Hero.tsx:172`, `Header.tsx:104`, `NewApplicationPage.tsx:283`, `AuditLogPage.tsx:272`, `LookupPanel.tsx:236`.
  - A cursor-following label on the DropZone (`verify/DropZone.tsx:78-88,220`).
- **Animated counters** on KPI tiles, Glance tiles and RunPanel (`KpiTiles.tsx:44-46`, `OverviewTab.tsx:352-372`, `RunPanel.tsx:180-189`).
- **Gradient avatar** with an inset highlight (`shell/Topbar.tsx:148`). The theme toggle rotates (`shell/theme.tsx:36-44`).

### Badge, chip and pill overload
- **Workspace header:** status pill, then category, AY and Round pills, then a ruleset Tag, a Digest and a "Replay" Tag in the run strip (`Header.tsx:76-133`).
- **Finding row:** severity meter, evidence class chip, review pill, document chip (`FindingsTab.tsx:82-89`).
- **Finding detail:** four chips and a code tag before the title, and six review buttons (`FindingDetail.tsx:83-105,215-220`; `before-officer-ws-findings-1920.png`).
- **DocHeader:** up to five chips (`DocumentsTab.tsx:550-578`).
- **Queue row:** order key, pill, severity meter, cube strip (`ReviewQueue.tsx:138-189`).
- **Audit row:** seq badge, raw action, 5 detail chips, prev and hash chips (`audit/parts.tsx:136-152`).
- **RuleCard:** id, version tag, severity, category tags, document chip (`RuleCard.tsx:111-139`).

### Inconsistent type
- **Three families:** Inter for body, Inter Tight for display (26 `font-display` uses in the workspace, including SectionCard h2 and numbers), and JetBrains Mono.
- **Arbitrary sizes in the workspace alone:**
  - `text-[11px]` x50, `[12.5px]` x11, `[11.5px]` x10, `[13px]` x9, `[12px]` x8.
  - `[10.5px]` x5, `[15px]` x4, `[14px]` x3, `[9.5px]` x2, `[32px]` x1.
- **Elsewhere:** `text-[9px]` (`AnalysePage.tsx:150`), `text-[10px]` (`ReviewQueue.tsx:141`), `text-[16px]` and `text-[17px]` (`RuleCard.tsx:115`, `IssuerCard.tsx:58`).
- **Eyebrows:** uppercase, `0.12em` tracked eyebrows over nearly every SectionCard; about 42 in the workspace. Since last year has 10 on one page. Even the ReviewQueue column headers are eyebrows (`ReviewQueue.tsx:268-276`).
- **Tight negative tracking on display titles** makes headings look like a marketing site, for example `Header.tsx:19-21` at `-0.025em` and 32 px.

### Cards inside cards
- **Institution rectification:** a panel containing a message box, a letter card and item cards (`InstitutionApplicationPage.tsx:69,82,83,86`).
- **DocViewer** card inside the document panel card, with stat tiles inside a box inside the panel (`DocumentsTab.tsx:437,672`).
- **WatchCard:** dashed boxes inside a SectionCard (`WatchCard.tsx:262-319`; `before-officer-ws-overview-1920.png`).
- **IndicatorCard:** a CitationCard and a CautionNote nested inside (`SinceLastYearTab.tsx:87-120`).
- **Other pages:**
  - Analyse: SectionCards inside a Section (`analyse/FileSections.tsx:72-123`).
  - Audit: cards inside a SectionCard (`AuditLogPage.tsx:93,118`).
  - Platform: Stat tiles inside cards (`PlatformPage.tsx:31-39`).

### Over-animation
- **Page transitions** on every route (`AppShell.tsx` pageTransition), plus a **tab crossfade and slide** (`ApplicationWorkspace.tsx:186-192`, `RulesPage.tsx:295-302`).
- **Staggered reveals:**
  - Header (4 steps), Glance, TrustLadder (per block), Findings list, Checklist blocks, document chips.
  - My applications cards, queue rows, Impact rows, Platform rows, issuer cards, audit rows.
  - Analyse sections via `whileInView`.
- **`layoutId` flourishes:** h1 shared layout (`Header.tsx:19`), Findings selection bar, document selection, Runs A/B slots that fly, time machine markers.
- **Audit and Replay:**
  - Shake, scale and flash animations, an rAF "walk" along the chain, and `hover:scale-150` on chain blocks (`AuditLogPage.tsx:54,211-222`, `audit/parts.tsx:69-78`).
  - 64 per-character animated digest cells (`ReplayDialog.tsx:24-47`).
- **Document viewer:** scan-line sweep and focus pulse (`DocViewer.tsx:324-398`).
- **Other loops:** `animate-ping` in RunPanel (`RunPanel.tsx:161`), and a 24-segment shimmer bar plus spinning icon on each upload (`UploadSlot.tsx:74-91,199-216`).

### Weak hierarchy
- Four KPI tiles of equal weight above the queue. "Review sort key 175" gets the same visual weight as "Open findings 13" (`before-officer-ws-overview-1920.png`).
- Primary buttons appear more than once per view. On Overview, "Run validation" and "Record scrutiny outcome" are both solid violet.
- Section descriptions explain the visual encoding ("Each block is one rule", "One block per 2 findings"). That is a sign the encoding is not self-evident.

## 5. Accessibility issues

| Issue | Where | WCAG | Fix |
|---|---|---|---|
| Clickable div and dl with no role or key handler | `RunsTab.tsx:59-65,107`; clickable `<tr>` rows at `DocumentsTab.tsx:344-349`; background click deselects at `RelationshipsTab.tsx:342` | 2.1.1, 4.1.2 | Real buttons or links. Table rows get a link in the first cell |
| Global single-key shortcuts j, k, a with no way to turn them off; `a` acknowledges without confirmation | `FindingsTab.tsx:140-168` | 2.1.4 | Scope to the focused list, add a modifier or a toggle, confirm decisive actions |
| Up to 1000 tabbable 11 px chain buttons; `role="listitem"` overrides the button role; labels only via `title` | `AuditLogPage.tsx:41-61` | 2.4.3, 4.1.2 | One focusable strip with arrow-key roving, or a non-interactive summary |
| Extra tab stops on non-interactive spans (tooltips, hash chips, time) | `DocumentsTab.tsx:106,113,564`; `VerificationTab.tsx:454` (6 column headers); `audit/parts.tsx:24-27,98-99`; `WatchCard.tsx:284`; `TimeMachine.tsx:532` | 2.4.3 | Tooltips on real controls only |
| Every overlay rectangle in the viewer is `tabIndex=0` | `DocViewer.tsx:289` | 2.4.3 | Only finding boxes focusable, or a list of regions beside the page |
| Skyline links with `outline-none`, no visible focus; Enter only | `Hero.tsx:52-68` | 2.4.7, 2.1.1 | Remove the skyline |
| Two h1 elements on the dashboard | `DashboardPage.tsx:44`, `Hero.tsx:131` | 1.3.1 | One h1 per page |
| Queue header row is `aria-hidden`, so rows have no column context; hover-only preview tooltip not referenced | `ReviewQueue.tsx:74,264` | 1.3.1, 1.4.13 | Real `<table>` with `<th scope="col">` |
| Status by colour only: amber "waiting" dot, outcome pill hidden on mobile, campus swatches, replay vs run dots, CubeStrip | `VerificationTab.tsx:343`, `ChecklistTab.tsx:83`, `CampusTab.tsx:21-29`, `RunsTab.tsx:58`, `ReviewQueue` CubeStrip | 1.4.1 | A text label or icon shape with every colour |
| Text below 12 px, and ink-4 at 10 to 11 px (low contrast) | 9.5 px at `OverviewTab.tsx:237`, `VerificationTab.tsx:347`; 10.5 px at `TimeMachine.tsx:111`, `AskPanel.tsx:61`, `DocViewer.tsx:424`; 11 px ink-4 at `AskPanel.tsx:217`, `InstitutionApplicationPage.tsx:169`, `UploadSlot.tsx:318`, `RectificationLetter.tsx:31` | 1.4.3 | 12 px minimum, ink-3 minimum for text |
| Readiness anchors 12 px tall | `InstitutionApplicationPage.tsx:118-135` | 2.5.8 | 24 px targets or plain text |
| Focusable inside focusable | CompactStepper `tabIndex=0` inside a Link (`StatusStepper.tsx:56`, `MyApplicationsPage.tsx:44-70`); overlay buttons under tabbable tooltips (`RuleCard.tsx:96-106`, `IssuerCard.tsx:47-53`) | 4.1.2 | One interactive element per row |
| `role="radio"` without arrow-key roving | `NewApplicationPage.tsx:87-91` | 2.1.1 | Native radio inputs |
| Upload success is never announced (live region exists only while busy) | `UploadSlot.tsx:235` | 4.1.3 | A persistent polite live region |
| Chatty live regions: elapsed timer re-renders every 500 ms inside `aria-live`; the whole Ask scroll area is live | `EvidencePackDialog.tsx:200-206`, `AskPanel.tsx:222,254-257` | 4.1.3 | Announce start and finish only |
| `aria-label` on elements with no role | `RunsTab.tsx:33`, `DocumentsTab.tsx:368`, `VerificationTab.tsx:351`, `OverviewTab.tsx:227` | 4.1.2 | Use `role="img"` or visible text |
| Infinite opacity pulse ignores reduced motion (`MotionConfig` does not stop it) | `issuers/Cable.tsx:42-43` | 2.3.3 | Remove the loop |

## 6. Product-rule and copy risks

**Forensic signals can reach institutions (confirmed).**
- `RectifyDialog.tsx:35` lists every open finding, including forensic and consistency ones.
- The backend `request_rectification` (`backend/pramana/api/applications.py:384-392`) copies `code`, `title` and `message` verbatim.
- The institution page renders them, code included (`InstitutionApplicationPage.tsx:85-94`).
- So a finding such as "Valid until was overwritten" can be sent to the institution.
- The officer UI must restrict rectification items to completeness, compliance and validity findings, and hide internal codes from institutions.

**Premature "shared" copy.** The institution's Deficiencies list appears as soon as the automatic run finishes (`sharesFindings = !!app.latest_run`, line 398). Its copy, "Gaps that AICTE has shared with the institution" (`InstitutionApplicationPage.tsx:232-233`), is inaccurate: no official has reviewed anything yet. The list also shows severity and rule codes.

**Missing SIMULATED labels.** Simulated issuer outcomes have no tag in these places:
- the dashboard alerts ("Source unavailable", `AlertsFeed.tsx:16`);
- the Hero sentence (`Hero.tsx:156`);
- the KPI verification tile and VerificationBlocks;
- the queue CubeStrip;
- the LookupPanel "unavailable" and "not found" results (`LookupPanel.tsx:62,77`);
- the Checklists issuer chip, where the label is in the tooltip only (`Checklists.tsx:98-106`);
- the revoked/suspended state in IssuerActions (`IssuerActions.tsx:125`).

**Accusatory sample copy.** "a date drawn over the signed one" (`AnalysePage.tsx:66`) states intent. Use the backend's neutral wording instead: "a later revision changes the date the signature covers".

**StatusStepper bug.** `stepIndex` returns 0 for unknown statuses (`StatusStepper.tsx:16-20`), so closed and withdrawn applications render as "Draft". A second rectification round cannot be shown.

**Copy checks that passed.** No use of forged, fake, fraudulent or genuine was found in scope, and no em or en dashes. "Approve, reject" appears only in the disclaimer, which is correct.

## 7. What is worth keeping

- **Evidence-linked findings.** Every finding carries its rule citation, trace inputs and evidence, and can jump to the exact page region. This is the product's core and it works.
- **Real progress.** Live validation uses the real stage names and timings from the server (SSE with a polling fallback). It never shows a fake percentage.
- **The document viewer.** Its overlays (fields, findings, QR, rows) have layer toggles and counts, and "Show on page" deep links work.
- **Citations.** CitationCard shows the handbook clause, page and quote with a source link.
- **The time machine.** It scrubs revisions with signature-coverage bands. It is a strong demonstration and deserves a calm, findable home.
- **Accountability features.** Replay with digest comparison, the hash-chained audit log with signed checkpoints, and the evidence pack with manifest digests.
- **The command palette.** Ctrl K, recent items, application search and full keyboard support.
- **Accessibility groundwork.** Visible focus rings, the skip link, `MotionConfig reducedMotion="user"`, the reduced-motion CSS guard, and tokens for every colour, so dark mode works without per-component overrides.
- **Product voice.** Decision-support wording, the disclaimer footer, a reason required for decisive actions, and SIMULATED tags on the issuer pages.
