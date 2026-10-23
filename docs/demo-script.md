# Pramana: 5-minute demo video script (SIH 2026, PS 26261)

**Setup, once before recording:**
1. Open a terminal in `backend/` and run `.venv\Scripts\python scripts\seed.py`. This resets the demo data and takes about 2 minutes. Ollama must be running so `pramana-extract` is used.
2. Start the server with `.venv\Scripts\python -m uvicorn pramana.main:app --port 8000`.
3. Open http://127.0.0.1:8000 in Chrome at 1920x1080, zoom 100%. Hide the bookmarks bar.
4. Have these files ready:
   - `fixtures/real/egazette_2025_260000.pdf` (fetched by `backend/scripts/fetch_real_samples.py`) (real DSC-signed e-Gazette);
   - `fixtures/out/rectification/A3_fire_noc_renewed.pdf`.
5. Use two browser profiles or one normal and one incognito window: one for the officer, one for the institution (inst3).

Every account's password is `Pramana@2026`, and the login page has one-click demo cards. Speak calmly; one idea per scene. Cut waits in editing; validation takes about 1 to 2 s, an institution's full submit up to 30 s.

| Time | Screen and actions | Say |
|---|---|---|
| 0:00 to 0:25 | **Landing hero.** Move the cursor slowly; the voxel eye follows it. Click once on the blocks (scan pulse). Scroll; the eye closes. | "Pramana means a valid means of knowledge. The first is the eye. AICTE checks thousands of approval applications; Pramana reads every document against its evidence, and shows its work." |
| 0:25 to 0:45 | **What slips through today**, then **See through edits.** Run the cursor lens over the certificate's date. | "353 teachers listed at several colleges at once. Forged fire NOCs. These pass document-by-document review. This certificate looks valid until 2027. Under the lens, the signed original says 2025." |
| 0:45 to 1:00 | **Login.** Click "Open the workspace", then the Scrutiny officer demo card. | "Officials sign in. Everything here is synthetic demo data." |
| 1:00 to 1:20 | **Dashboard.** Point at the queue skyline: the tallest red-capped tower. Hover the first queue row to preview its findings. Click Panchganga Institute of Technology. | "Each tower is an application; red caps are open high-severity findings. The queue is ordered for attention; it decides nothing." |
| 1:20 to 2:10 | **A7 Findings.** Click "Valid until was overwritten". Click "Show on page": the box draws and pulses. Then "Visible text changed in a later revision" and the issuer signature finding. Click Escalate for inspection, type a reason, confirm. | "Four independent signals. The text layer still holds 30-06-2025; revision 3 drew 30-06-2027 over it after the fire officer signed. The issuer signature reports modified after signing. The signed QR still certifies 2025. Each finding cites its APH clause and page. The officer decides, and every decision needs a reason." |
| 2:10 to 2:30 | **Relationships tab** (open A6 Krishna Valley from the dashboard or the search, Ctrl+K "Krishna"). Hover a faculty node, click it. | "One application looks fine. Two tell the truth: three faculty IDs appear at Krishna Valley and Panchganga, registered at Panchganga. This mirrors the real ghost-faculty cases." |
| 2:30 to 2:55 | **A11 Documents, AI extraction tab.** Point at the amber instruction overlay and the panel: 5 asked, 4 grounded. | "This issuer uses a layout our rules have never seen. Our own fine-tuned model, 1.7 billion parameters on this laptop, proposes the values. Pramana keeps a value only if it is found on the page. This line tries to instruct the AI to report 2099. It is flagged and never used. A general model was fooled by it; ours was not, and grounding would have stopped it anyway." |
| 2:55 to 3:20 | **Verify a PDF.** Drop the e-Gazette PDF. The hash computes, then the chain draws to India PKI (CCA). | "This is a real Government of India gazette, digitally signed. Pramana validates it against the CCA India root, offline. Not simulated. Note it says revocation was not checked; it never claims more than it checked." |
| 3:20 to 4:10 | **Rectification loop.** In A3 Konkan (officer), click Request rectification, select the fire certificate finding, add a message, send. Switch to the institution window: sign in as inst3 (Konkan) and open the application. Show "What AICTE asked you to fix". Drop `A3_fire_noc_renewed.pdf` on the Fire Safety Certificate slot (progress, then received with hash). Submit. Back to the officer: Run validation if not refreshed. | "The institution sees what AICTE asked, uploads a renewed certificate and resubmits. The expiry is resolved. If they had quietly changed anything else, Pramana would flag it as outside the requested scope." |
| 4:10 to 4:35 | **Replay and Audit.** In A7 click Replay: the digests settle to "Reproduced identically". Audit tab: Verify chain integrity; blocks turn green. | "Every run pins the rules, inputs and report digest, so any past result can be reproduced. Every action is in a tamper-evident hash chain." |
| 4:35 to 5:00 | **Back to the landing**, "Honest numbers" section (42 of 42, the fine-tune bars), then the footer line. | "42 of 42 planted conditions found, no false alarms, about a second per application, all free and open source. Decision support only: officials decide, Pramana shows the proof." |

**If short of time, cut in this order:**
1. Relationships (keep the line in narration over the dashboard);
2. Replay;
3. the landing lens.

**Do not say:** forged, fake or genuine about a document in the app. Say "modified after signing", "not found in the issuer registry", "indicator", "needs review".
