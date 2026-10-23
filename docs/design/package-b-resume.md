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

## Resume pass (2026-10-23, 21:05 to 22:30 IST): all done

- [x] 1280 shots reviewed. The verification table now drops channel columns no document used and keeps "Not applicable" on one line. Document detail splits 1:1 at xl and 1.4:1 from 2xl, so the tabs fit. The header context uses the short category label, as the queue does.
- [x] Dark theme checked at 1920 and 1280 for every section. No token issues found.
- [x] Dialogs and drawers checked: Decide, More actions, Rectify, LetterEditor, OutcomeDialog, EvidencePack, Replay, Ask why, the live run drawer, the attempt drawer, the run drawer, the audit event drawer, and the Show on page viewer.
- [x] Acceptance clickthrough passed:
  - all old URLs redirect;
  - rectify on A3 with the deficiency letter sets the status to Rectification requested;
  - the outcome on A6 shows the watch;
  - the evidence pack downloads (200, application/zip);
  - Replay shows "Reproduced identically";
  - the time machine opens at revision 3 from a finding;
  - Extraction on A11 shows the model report (with PRAMANA_LLM_PROVIDERS=ollama and a re-read);
  - A2 shows Hindi OCR provenance;
  - Show on page and Open in Documents keep the region;
  - manual confirmation works;
  - Run validation again streams to the Callout and the drawer;
  - Ask why answers, and the finding prefill works.
- [x] Role checks: the verifier gets no Decide and no Ask why, but has review actions. The admin gets Replay, but no Decide and no review actions.
- [x] Icon polish. "Show on page" and "Locate" use ScanSearch. Region evidence uses ScanText instead of the dashed square, which read as a checkbox.
- [ ] For Foundation: MetaList puts its separator dot at the start of a wrapped line.
- [ ] For package C: `RectificationItem.code` is no longer sent to institutions (`InstitutionApplicationPage.tsx` line 93 renders it).
- [ ] For package A:
  - `RevisionPanel` pads its own rows and expects a `Panel padding="none"`;
  - `DocViewer` renders its own frame and has new optional `title` and `meta` props.
- [ ] Backend copy, optional: the letter PDF heading still reads "Deficiency notice".

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
