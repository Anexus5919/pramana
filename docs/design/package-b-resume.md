# Package B resume notes

Branch `feat/redesign-b`. Stopped on 2026-10-23 evening because the laptop had to shut down. `pnpm build` passes at the last commit.

## Done

- Backend: rectification scope guard (`backend/pramana/api/applications.py`, `officer/common.py`, `officer/letter.py`, `officer/routes.py`). Forensic, consistency and verification findings are refused with 422. Institutions get only neutral titles and messages, never codes. Tests are in `backend/tests/test_rectification_scope.py`. The full pytest suite passed (114 tests) and ruff check is clean.
- Workspace shell (`ApplicationWorkspace.tsx`):
  - five sections, with old tab URLs redirected via `LEGACY_TABS` and their search params kept;
  - an unknown tab goes to Summary;
  - every dialog's open state lives in the workspace and is exposed as `WorkspaceCtx.actions` (ask, rectify, replay, exportPack, recordOutcome, validate).
- `data.ts`: `OPEN_REVIEW`, `isOpenFinding`, `RECTIFIABLE_CATEGORIES`, `isRectifiable`, `useParam`, `useSetParams` and `isPathSection`. `TABS`, `isTab` and `appPath` are removed.
- Header: `PageHeader` with the status badge and the context line; Ask why as the secondary action; More actions (Run validation again, Replay latest run, Export evidence pack, View audit trail); the Decide menu (Request rectification, Record scrutiny outcome); route Tabs with the open findings count on Findings only.
- Live run: `live/RunCallout.tsx` (Callout plus a "Validation run" drawer), `live/useValidation.ts` and `LiveRunView` restyled. `RunPanel.tsx` is deleted.
- Summary (`sections/SummarySection.tsx`): Needs attention, Checks, the last validated line, the since last year line, After the decision (`history/WatchCard.tsx`), and an aside with Institution and Declared figures. `OutcomeDialog` is lifted into the workspace.
- Findings (`sections/FindingsSection.tsx`, `sections/findings/FindingDetail.tsx`): the list with a side panel (a drawer below 1280), review actions that need a reason, the checklist view with `?rule=`, and list-scoped arrow keys. `parts.tsx` and `SealCompare.tsx` are restyled. `RectifyDialog` allows only eligible categories.
- Documents (`sections/DocumentsSection.tsx`, `sections/documents/*`): the table; document detail with the Fields, Verification, Forensics, Revisions and Extraction tabs; the verification table with an attempt drawer and the manual confirmation form. `DocViewer`, `ViewerSheet`, `TimeMachine` and `ScriptNote` are restyled.
- Comparisons (`sections/ComparisonsSection.tsx`, `sections/comparisons/*`): Since last year, Related applications (graph plus a keyboard side list) and Campus (map or plot, photos, Content Credentials, room check). The section is lazy loaded.
- Activity (`sections/ActivitySection.tsx`): runs table with compare, replay and pack, a run drawer, and the audit trail with Verify chain and an event drawer.
- `ReplayDialog`, `EvidencePackDialog` and `LetterEditor` (now a drawer) are rebuilt.
- Light screenshots of every section at 1920 and some at 1280 are in the scratchpad `shots-redesign-b` folder (`r1-*`, `r2-*`). They looked clean.

## Remaining checklist

- [ ] Review the 1280 screenshots `r2-*` (taken, not yet reviewed) and fix clipping or alignment.
- [ ] Dark theme screenshots of every section at 1920 and 1280; fix any token issues.
- [ ] Screenshots of the dialogs and drawers:
  - [ ] the Decide menu, Rectify on A3 and the LetterEditor;
  - [ ] Record outcome on A6, then the watch on Summary;
  - [ ] EvidencePack, Replay and Ask why;
  - [ ] the live run drawer (Run validation again);
  - [ ] the attempt drawer (`documents?view=verification&attempt=`).
- [ ] Clickthrough of the acceptance list in `docs/design/screens.md` 3.9:
  - [ ] old URLs redirect (checklist, `verification?attempt=`, since-last-year, runs, campus);
  - [ ] Send rectification on A3 sets the status to Rectification requested;
  - [ ] the evidence pack downloads;
  - [ ] Replay shows "Reproduced identically";
  - [ ] the time machine opens from a finding;
  - [ ] A11 shows the Extraction tab and A2 the Hindi OCR note.
- [ ] Verifier and admin check: no Decide; review actions for the verifier; Replay for the admin.
- [ ] Polish noted: the evidence rows in the finding detail use the `SquareDashed` icon both as the row icon and on "Show on page"; consider dropping the row icon.
- [ ] Tell package C that `RectificationItem.code` is no longer sent to institutions (`InstitutionApplicationPage.tsx` line 93 renders it).
- [ ] Tell package A:
  - `RevisionPanel` now pads its own rows and expects a `Panel padding="none"`;
  - `DocViewer` renders its own frame and gained optional `title` and `meta` props.

## Known state

- The build passes. No known broken feature, but the browser clickthrough above has not been done.
- Commit `2f212b0` (replay dialog) also carries the deletions of `RunPanel.tsx`, `tabs/OverviewTab.tsx`, `tabs/FindingsTab.tsx`, `tabs/ChecklistTab.tsx` and `tabs/FindingDetail.tsx`, because they were staged at the same time.
- The runs table passes `className="overflow-visible!"` to `DataTable`, so its row menus are not clipped. The audit table is a hand-built table in DataTable styling, to allow the "N events from other applications" row.

## Next steps

1. Backend:
   ```
   cd backend
   PRAMANA_LLM_PROVIDERS="" .venv/Scripts/python scripts/seed.py
   .venv/Scripts/python -m uvicorn pramana.main:app --port 8033
   ```
2. Frontend:
   ```
   cd frontend
   PRAMANA_API_URL=http://127.0.0.1:8033 pnpm exec vite --port 5213 --strictPort
   ```
3. Screenshots: `node tools/mkcfg-b.mjs <prefix> officer <cfg.json> light,dark 1920,1280 '<pages json>'`, then `node tools/shot.mjs <cfg.json>`. Both scripts are in the scratchpad `tools` folder.
4. Work through the checklist above. Commit small fixes and push to `feat/redesign-b`.
