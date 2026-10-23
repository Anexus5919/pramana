# Information architecture v2

Status: authoritative for every signed-in screen. Pairs with `frontend/DESIGN-v2.md` (visual system) and `docs/design/screens.md` (per-screen build specs). The landing pages, `/login` and `/scan` are out of scope.

## Principles

1. **Work starts in one place.** Officials land on the review queue. Institutions land on their applications list. Everything else is one click from there.
2. **One primary action per screen.** It is the violet button at the top right of the page header. Everything else is a secondary button (two at most) or sits in the "More actions" menu.
3. **Each fact appears once per screen.** A count may appear again elsewhere only as a link to the place that explains it.
4. **Progressive disclosure.** Summary first, then the list, then the detail in a drawer or a side panel, then the raw evidence (document page, hash, revision).
5. **The URL is the state.** Sections, views, the selected finding, the open document and the open attempt are all URL parameters, so every view can be linked, reloaded and shown in the demo.

## Global navigation

### Officials (officer, verifier, admin)

Left sidebar, 232 px, collapsible to 56 px. Top bar with breadcrumbs, search (Ctrl K) and the user menu.

| Group | Item | Route | Roles |
|---|---|---|---|
| (none) | Review queue | `/dashboard` | officer, verifier, admin |
| Tools | Analyse a document | `/analyse` | officer, verifier, admin |
| Tools | Issuer simulator | `/issuers` | officer, verifier, admin |
| Governance | Rules | `/rules` | officer, verifier, admin |
| Governance | Audit log | `/audit` | officer, admin |
| Governance | Platform | `/platform` | officer, admin |

Six items in three groups: the order of work (the queue), the tools used during review, then reference and system pages. No item is hidden behind a hover. Source of truth: `frontend/src/shell/nav.ts` (`NAV`, `NAV_GROUP_LABEL`).

Breadcrumbs: `Review queue / <Institution> / <Section>` inside the workspace, `Tools / Analyse a document` and similar elsewhere. The page title is not repeated in the breadcrumb on narrow screens (only the last crumb shows).

Command palette (Ctrl K): Pages, Applications (label: institution name, hint: application ID and status), Actions (theme, sign out). It is the fast path for experienced users, never the only path.

### Institutions

No sidebar. A single top bar: Pramana mark, one link "Applications", theme toggle, user menu. Content is one centred column, 960 px wide. The command palette is not mounted for institutions (they have one or two applications; search adds nothing).

## Officer flow

```
Review queue  ->  Application: Summary  ->  Findings (list + detail)  ->  Evidence (document drawer, page region, revision)
                                         ->  Decide: Request rectification (deficiency letter) or Record scrutiny outcome
```

1. **Review queue** (`/dashboard`). Primary action: **Open next application** (the first row that needs attention). A four-figure summary strip, the applications table in review-priority order (row click opens the application), and a "Needs attention" list of high-severity findings and issuer checks that link straight to the finding or attempt.
2. **Application workspace** (`/applications/:id/:section?`). Five sections, see below. Primary action: **Decide**.
3. **Finding detail** opens in a side panel inside Findings (`?finding=`). Its evidence links open the document drawer at the exact page region (`documents?doc=&page=&hl=`) or the time machine (`documents?doc=&panel=revisions&rev=`).
4. **Decide** (GitHub "Review changes" pattern): a menu with two decisive actions, each with a one-line explanation and each requiring a reason:
   - Request rectification: opens the rectification dialog, then the deficiency letter editor.
   - Record scrutiny outcome: opens the outcome dialog, which also starts the re-verification watch.

## Application workspace: 11 tabs and 6 header actions become 5 sections and 1 primary action

| v2 section | URL | What it answers | Merges v1 | Views inside (SegmentedControl, `?view=`) |
|---|---|---|---|---|
| Summary | `/applications/:id` | What needs my attention and what is the state? | Overview, watch card, institution card, declared figures | none |
| Findings | `/findings` | What did the checks find, and what does each rest on? | Findings, Checklist | `findings` (default), `checklist` |
| Documents | `/documents` | What was submitted, what was read, what was verified? | Documents, Verification | `documents` (default), `verification` |
| Comparisons | `/comparisons` | How does this compare with last year, other applications and the ground? | Since last year, Relationships, Campus | `since-last-year` (default), `related`, `campus` |
| Activity | `/activity` | What ran, when, and is the record intact? | Runs, Audit | `runs` (default), `audit` |

Legacy tab URLs redirect, keeping every other search parameter (`frontend/src/shell/nav.ts`, `LEGACY_TABS`): `overview` to Summary, `checklist` to Findings view checklist, `verification` to Documents view verification, `relationships`, `campus` and `since-last-year` to Comparisons views, `runs` and `audit` to Activity views. `findings?finding=`, `documents?doc=`, `verification?attempt=` and `runs?a=&b=` keep working.

Tab counts: only Findings shows a count (open findings), in the attention colour when any open finding is high or critical. No other tab carries a number (Von Restorff: one signal, not nine).

### Header (one per workspace, never repeated in sections)

- Title: institution name. Beside it: one `ApplicationStatusBadge`.
- One context line (`MetaList`): AICTE ID, application ID, category label, AY and round, district and state.
- Right side, in this order: **Ask why** (secondary, opens the Ask drawer, officer only), **More actions** menu, **Decide** (primary, officer only; verifiers and admins see no Decide).
- More actions menu: Run validation again (officer, verifier, admin), Replay latest run (officer, admin; only with a latest run), Export evidence pack (officer), View audit trail (link to Activity, audit view).
- Removed from the header: the latest-run strip (ruleset, digest, as of, triggered by). It lives once, in Activity, with a one-line "Last validated 2 h ago against ruleset X" on Summary.
- While a run is in progress, a single `Callout` (role status) sits under the header: "Validation is running: reading 3 of 8 documents" with "View progress" opening the live run drawer. It replaces the old in-page run panel and never moves the layout after it finishes; the summary of new and resolved findings appears in a toast plus the Callout turning into a dismissible success state.

### Where the tools live

| Tool | Home | Also reachable from |
|---|---|---|
| Time machine | Documents, document detail, "Revisions" panel tab | Finding evidence "View revisions"; Analyse report |
| Ask why | Header secondary button, right drawer | A finding detail "Ask about this finding" link prefills the question |
| Evidence pack | More actions menu, dialog | Activity, runs view, per-run row action |
| Deficiency letter | Decide, Request rectification, then letter editor | Summary shows the sent letter once a rectification exists |
| Replay | More actions menu (latest run) | Activity, runs view, per-run row action |
| Run validation | More actions menu | Live progress Callout "Run again" after failure |
| Re-verification watch | Summary, "After the decision" panel | Issuer simulator "Run re-verification watch now" |
| Campus map | Comparisons, campus view | Finding evidence for photo and geotag findings |
| Since last year | Comparisons, default view | Summary "Changes since last year" line links here |
| Manual confirmation | Documents, verification view, attempt drawer | Needs attention list on the review queue |
| Review actions with reasons | Finding detail panel footer | none (one place only) |

## Institution flow

```
Applications  ->  Application (stepper)  ->  the one next action
                    Details -> Documents -> Submit -> AICTE review -> (Rectification -> Resubmit)
```

1. **Applications** (`/portal`). Primary: **Start a new application**. A simple table: application, AY, status badge, next step (plain sentence), last updated. Empty state explains the three steps once.
2. **New application** (`/portal/new`). A four-step wizard with a `Stepper`: Category and year, Programmes, Declared figures, Review and create. Primary on each step: Continue, then Create draft.
3. **Application** (`/portal/applications/:id`). Header with title (category), status badge and one context line. A horizontal `Stepper` reflecting the real status. Directly under it, one **Next step** panel holding the only primary action for the current state:

| Status | Next step panel says | Primary action |
|---|---|---|
| draft, documents missing | "Upload N required documents" | Scroll to and focus the first missing slot |
| draft, complete | "Everything required is uploaded" | Submit for review |
| submitted, validating | Live submission progress (4 real steps) | none (progress only) |
| under_review | "AICTE is reviewing your application" | none |
| rectification_requested | "AICTE asked you to correct N items" plus the deficiency letter (download PDF) | Resubmit, enabled once items are addressed |
| rectified | "Resubmitted on date, AICTE is reviewing" | none |

Below the Next step panel: Documents (checklist slots), then Declared figures (read-only list with an Edit button while editable), then Run history (one line per round). No sidebar, no aside column, no repeated readiness meter.

Institutions never see forensic signals, severities, evidence classes or rule codes. Deficiency items show the title and the plain message only.

## Admin and tools

- **Analyse a document** (Tools): a standalone single-file check. Primary: Choose a file. The report is one column with a sticky in-page section index on wide screens.
- **Issuer simulator** (Tools): labelled SIMULATED in the page header. Primary: Look up a record. Admin-only availability switches sit in the issuers table.
- **Rules** (Governance): tabs Rules, Checklists, Change impact (officer and admin). Primary on Change impact: Recheck applications.
- **Audit log** (Governance): Primary: Verify chain integrity. Admin secondary: Create signed checkpoint.
- **Platform** (Governance): read-only status, no primary except admin "Purge now" inside Retention, which needs a confirmation with a reason.

## Design laws, and where each is applied

| Law or heuristic | Where it shows up |
|---|---|
| Hick's law | Sidebar cut to 6 items in 3 groups; workspace 11 tabs to 5 sections; header 6 actions to 1 primary, 1 secondary and a menu; institutions get no sidebar at all. |
| Fitts's law | Primary action always top right of the page header at 32 px (40 px for institutions); whole table rows are click targets; the Next step panel puts the institution's action directly under the stepper. |
| Miller's law and chunking | Summary strip of 4 figures; context line of at most 5 facts; Findings grouped by category; Analyse report chunked into 5 sections with an index. |
| Jakob's law | Left sidebar and Ctrl K (Linear, GitHub); Decide menu modelled on GitHub "Review changes"; GOV.UK-style linear task flow and Next step panel for institutions; Stripe-style summary strip and tables. |
| Gestalt: proximity | Label and value pairs in DescriptionList; actions grouped at the header's right; filters directly above the table they filter. |
| Gestalt: similarity | One StatusBadge style everywhere; one SeverityIndicator; one table style. |
| Gestalt: common region | Panels are the only boxes, and they never nest; hairline dividers inside panels instead of cards in cards. |
| Progressive disclosure | Summary, then list, then detail drawer, then raw evidence; More actions menu; views inside sections; collapsed declared figures. |
| Visual hierarchy | Type scale 24 / 16 / 14 / 13 / 12 with three weights; one violet element per screen; status colour only on status. |
| Von Restorff | Only the high-or-critical figure is red on the queue; only the Findings tab count can turn red; one primary button. |
| Doherty threshold | No page transitions or staggered reveals; skeletons in under 100 ms; live progress streams real stage names. |
| Aesthetic-usability | Calm neutral surfaces, crafted details (tabular numerals, hairlines, consistent radii) make the dense evidence feel trustworthy. |
| Tesler's law | Complexity the system can hold, it holds: the redirect map keeps old links working; the Decide menu explains each choice so the official does not have to remember the process. |
| Nielsen: visibility of system status | Live run Callout; eye mark as global activity; toasts state what changed. |
| Nielsen: match with the real world | AICTE vocabulary: application, deficiency letter, rectification, scrutiny outcome. |
| Nielsen: user control and freedom | Every dialog cancellable; review actions reversible through history; Esc closes menus and drawers. |
| Nielsen: consistency and standards | One term per concept (see DESIGN-v2 copy glossary). |
| Nielsen: error prevention | Decisive actions need a reason; Submit disabled until required documents exist, with the reason shown. |
| Nielsen: recognition over recall | Breadcrumbs, visible section names, recent items in the palette, evidence linked from every finding. |
| Nielsen: help users recover from errors | Upload rejections say why and offer "Try another file"; failed runs offer "Run again". |
