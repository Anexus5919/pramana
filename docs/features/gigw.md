# GIGW 3.0: standard pages, display options, Hindi portal and accessibility scan

Pramana is built to the Guidelines for Indian Government Websites and Apps (GIGW 3.0, NIC and MeitY). It is a prototype and has not been audited. GIGW 3.0 itself says (section 2.1) that the guidelines "form the basis for obtaining the Website Quality Certification from the STQC Directorate", and section 5.3.1 asks for a security audit by NIC, STQC or a CERT-In or STQC empanelled laboratory before production hosting. So the honest phrasing is: **built to GIGW 3.0; formal compliance needs STQC Website Quality Certification.** Pramana does not claim to be GIGW compliant.

This document lists what was added for GIGW, then each relevant GIGW 3.0 checkpoint with its status in Pramana and where it lives in the code.

## Source

- Downloaded on 28 Oct 2026 from the "GIGW Manual 3.0 (Download)" link on https://guidelines.india.gov.in/, which points to `https://cdnbbsr.s3waas.gov.in/s3c92a10324374fac681719d63979d00fe/uploads/2026/07/2026072438.pdf` (HTTP 200, `application/pdf`, 15,190,996 bytes).
- SHA-256 `8e3dc8c9c48e6958cd49145e43463e1d26aee77ab0931a8bb4667ff80daad1b4`.
- 121 PDF pages (printed pages 1 to 119). The PDF is not committed; the team copy is in `Downloads/SIH26261_Pramana/gigw/GIGW_3.0.pdf`, with a text extraction beside it.
- Every section number below was read in that document. Chapter 5 holds the checkpoints: 5.1 Quality (5.1.1 to 5.1.25), 5.2 Accessibility (5.2.1 to 5.2.50, one per WCAG 2.1 A and AA success criterion, in order), 5.3 Cybersecurity (5.3.1 to 5.3.3) and 5.4 Lifecycle management (5.4.1 to 5.4.10). GIGW 3.0 does not label individual checkpoints mandatory or advisory; section 2.2 says government websites and apps must comply with the guidelines.

## What was added

| Piece | What it does | Code |
|---|---|---|
| Standard pages | Privacy policy, Terms of use, Copyright policy, Hyperlinking policy, Accessibility statement (screen readers, display options, keyboard shortcuts, known gaps), Help, Contact and feedback, Sitemap. Public, readable signed in or out, at `/privacy-policy`, `/terms-of-use`, `/copyright-policy`, `/hyperlinking-policy`, `/accessibility-statement`, `/help`, `/contact` (`/feedback` redirects there) and `/sitemap`. | `frontend/src/pages/info/` |
| Site footer | The eight pages, the decision-support line, the ownership line ("a prototype for AICTE ... not an official AICTE or Government of India website") and "Last updated". On the signed-in shell (replacing the old disclaimer line), sign-in, information, scan and not-found pages; the landing footer has the same links in its own style. | `frontend/src/site/SiteFooter.tsx`, `frontend/src/landing/sections/LandingFooter.tsx` |
| Last updated date | The date of the last git commit, injected at build time through Vite `define`; `PRAMANA_BUILD_DATE=YYYY-MM-DD` overrides it for builds without git history (the Docker image). Never hand-typed. | `frontend/build-info.ts`, `frontend/src/site/build.ts` |
| Display options | One accessibility button in the top bar (signed-in shell, sign-in page, information pages): text size A-, A, A+ (87.5%, 100%, 118.75% of the root size), Standard or High contrast, Light or Dark. Keyboard operable radio groups, Escape closes and returns focus. Kept per browser in localStorage (wrapped in try/catch) and applied before first paint by `index.html`. | `frontend/src/a11y/`, `frontend/index.html` |
| Rem type scale | The design tokens and the few fixed pixel text sizes are now in rem, so the text size option scales type and spacing together, like browser zoom. Identical at the default size. | `frontend/src/index.css` |
| High contrast | A token set for the light and the dark theme: near-black or near-white text, dark borders, darker status colours, a 3 px focus ring, links in running text underlined. Works through the existing design tokens, so no screen was restyled. | `frontend/src/index.css` (`html[data-contrast="high"]`) |
| Hindi for institutions | A हिंदी / English switch in the portal's top bar and on the sign-in page; 488 English and Hindi pairs. See [Hindi](#hindi-for-the-institution-portal). | `frontend/src/i18n/` |
| Page titles | Each signed-in page's tab title is its breadcrumb trail ("Findings \| Konkan Institute ... \| Review queue \| Pramana"); information and sign-in pages name themselves. | `frontend/src/shell/Topbar.tsx`, `frontend/src/pages/info/InfoLayout.tsx` |
| Skip links | "Skip to content" is the first Tab stop on the shell, the sign-in page, the information pages and now the landing page. | `AppShell.tsx`, `LoginPage.tsx`, `InfoLayout.tsx`, `LandingV3.tsx` |
| Accessibility scan | axe-core 4.14 driven through puppeteer-core and the installed Chrome or Edge, against the `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` tags. See [Automated scan](#automated-wcag-21-aa-scan). | `frontend/scripts/a11y-scan.mjs` |

The policies describe what this software does, read from its code and settings (`backend/pramana/config.py`, `auth.py`, `retention.py`, `crypto.py`, `audit.py`, `drishti/api.py`, `deploy/`): one HttpOnly, SameSite=Strict session cookie (`__Host-` and Secure over HTTPS) lasting 8 hours, Argon2 password hashes, per-document AES-256-GCM envelope encryption, the hash-chained audit trail, retention periods (documents 730 days after closing, previews 30, run events 180, sessions 7 days after expiry), Drishti not storing question text, the in-memory rate limits, OpenStreetMap tiles on the Campus view, and the public demo's nightly reset at 03:00 IST. They are written as "Pramana, a prototype for AICTE built for Smart India Hackathon 2026", never as an AICTE or Government of India policy, and the State Emblem of India is not used (its use is restricted by the State Emblem of India (Prohibition of Improper Use) Act, 2005, which GIGW 3.0 cites under 5.1.1).

**Contact address.** The Contact and feedback page shows a `mailto:` link only when the build sets `VITE_CONTACT_EMAIL` (for example in `frontend/.env.local`, which git ignores). Without it the page says that no address is set for this deployment. No feedback form was built: the public demo restores its data every night, so stored feedback would be erased.

## Checklist

Status: **Done**, **Partial**, **Not applicable** to a prototype, or **Needs audit** (only an STQC, CERT-In or NIC audit, or the owning organisation, can settle it).

### Identity, ownership and standard pages

| GIGW 3.0 | Requirement (paraphrased) | Status | In Pramana |
|---|---|---|---|
| 5.1.1 | Emblem or logo on the homepage; State Emblem use governed by the 2005 Act | Not applicable | Pramana shows its own wordmark. The State Emblem is deliberately not used, since Pramana is not a government website. |
| 5.1.2 | Ownership in the header or footer of every important page | Done | Ownership line in `SiteFooter` and `LandingFooter` on every page. |
| 5.1.5 | Last updated or reviewed date on the homepage and entry pages | Done | Footer "Last updated", from the last commit (`build-info.ts`). |
| 5.1.9 | About us page | Partial | The landing page explains the product; there is no separate About page. |
| 5.1.10 | Contact us page linked from the homepage and relevant places | Partial | `/contact`, linked from every footer. Names no functionaries; the address depends on `VITE_CONTACT_EMAIL`. |
| 5.1.11 | Feedback through online forms with timely response | Partial | Feedback by `mailto:` when configured; no stored form (nightly reset). |
| 5.1.12 | Prominent link to the National Portal (india.gov.in) | Not applicable | Belongs on the owning organisation's website. Pramana links to AICTE's website for real applications. |
| 5.1.14 | Help linked from all pages | Done | `/help` in every footer. |
| 5.1.18 | Minimum homepage content and per-page title, home link, parent link, ownership and contact | Partial | Every page has a home link, ownership and Contact in the footer; information pages have a breadcrumb. No National Portal link and no public site search (see 5.2.31). |
| 5.1.3, 5.1.4 | Cite the source of reproduced material; permission for copyrighted content | Done | Rules quote the Approval Process Handbook with clause and page; `/copyright-policy` lists third-party material and its licences. |
| 5.1.6 | Downloads show title, format and size | Partial | The deficiency letter link says PDF, but not its size. |
| 5.1.21 | Hosted on a gov.in or nic.in domain | Not applicable | The public demo runs on an Azure test address. |
| 5.2.31 | Search box or link on every page, plus a sitemap | Partial | `/sitemap` linked from every footer; officials have search (Ctrl+K); there is no public site search. |
| 5.3.3 | Security policy, privacy policy and contingency plan; citizen-facing copyright, privacy and terms published | Partial | Privacy policy, terms of use and copyright policy published. Security measures are documented in `docs/verification-and-security.md`; there is no contingency management plan. |
| 5.4.3 | Copyright, CMAP, content archival, content review, hyperlinking, terms, monitoring plan approved by the Web Information Manager | Partial | Copyright, hyperlinking and terms pages exist. CMAP, archival, content review and monitoring plans need an owning organisation and a content management workflow. |
| 5.4.1 | A Web Information Manager, with contact details shown | Not applicable | Needs the owning organisation. |
| 5.4.4 | Clear indication when a link leads to a non-government website | Partial | External links open in a new tab and say so to screen readers; there is no visible notice. |
| 5.4.8 | No "under construction" pages | Done | None. |

### Accessibility

| GIGW 3.0 | Requirement (WCAG 2.1) | Status | In Pramana |
|---|---|---|---|
| 2.1, 4.2.2 | Built on WCAG 2.1 level AA | Partial | Built to it; the automated scan finds no serious or critical issue on the scanned screens. Not audited. |
| 5.2.1 | Text alternatives (1.1.1) | Done (automated) | No axe findings on the scanned screens. |
| 5.2.7 | Info and relationships (1.3.1) | Done (automated) | Landing certificate card list fixed (`definition-list`, `dlitem`). |
| 5.2.14 | Text contrast 4.5:1, or a control that switches to sufficient contrast; the evaluator checks for a high contrast mode | Done | Landing secondary ink darkened (`--lp-ink-3` to #6f6679); scroll-story steps fade to 75% instead of 32% (none with reduced motion); High contrast option for light and dark. |
| 5.2.15 | Text resizable to 200% without loss; on-page size controls allowed as an alternative | Partial | A-, A, A+ and rem-based type; browser zoom works. 200% zoom has not been checked on every screen. |
| 5.2.17 | Reflow at 320 CSS px without two-dimensional scrolling (1.4.10) | Partial | Every scanned screen also at 390 px; wide tables scroll sideways inside a focusable, named region. 320 px not checked. |
| 5.2.18 | Non-text contrast 3:1 (1.4.11) | Partial | High contrast meets it. In the standard colours some field and card borders are lighter than 3:1 (stated in the accessibility statement). |
| 5.2.21, 5.2.22, 5.2.29, 5.2.33 | Keyboard, no trap, focus order, visible focus | Partial | The new controls and pages were checked by hand; scrollable tables are now focusable (`scrollable-region-focusable`). Not checked screen by screen. |
| 5.2.24 | Time limits can be turned off, adjusted or extended (2.2.1) | Not done | The 8-hour session ends without a warning. Stated in the accessibility statement. |
| 5.2.27 | Bypass blocks: a link to the main content | Done | Skip links on every layout, including the landing page. |
| 5.2.28 | Descriptive page titles (2.4.2) | Done | Tab titles from the breadcrumb trail and on the sign-in and information pages. |
| 5.2.36 | Label in name (2.5.3) | Done (automated) | The search button is named from its visible word (`label-content-name-mismatch`); the A- and A+ options read "A- smaller" and "A+ larger". |
| 5.2.38 | Page language (3.1.1) | Done | `<html lang>` follows the screen: `hi` on the Hindi portal and sign-in page, otherwise `en`. |
| 5.2.39 | Language of parts (3.1.2) | Partial | The language switch and the Hindi notice on English-only pages carry `lang`; English text from the server inside Hindi screens is not marked. |
| 5.2.49, 5.2.50 | Name, role, value; status messages (4.1.2, 4.1.3) | Done (automated) | No axe findings; toasts and the submission progress use status and alert roles. Landing field grid is now a labelled group, not an image holding buttons (`nested-interactive`). |

### Language

| GIGW 3.0 | Requirement | Status | In Pramana |
|---|---|---|---|
| 5.4.10 | Bilingual, with a prominent language selection and Unicode; choice of language before entering | Partial | Institution portal and sign-in page in Hindi and English, Unicode Devanagari, switch in the top bar. Officials' screens, the landing page and the information pages are English. No language prompt before entering. |
| 5.4.6 | Language versions updated together; status of untranslated content shown | Partial | English-only information pages show "यह पृष्ठ अभी केवल अंग्रेज़ी में उपलब्ध है।" to viewers who chose Hindi. Server-sent text stays English (see below). |
| 5.1.13 | Hindi fonts tested across layouts; Unicode | Done | IBM Plex Sans Devanagari (self-hosted, loaded only for Devanagari text), checked at 1440 and 390 px in light, dark and high contrast. |
| 5.1.17 | Title, language attribute and keywords and description metadata | Partial | `lang`, per-page titles and the meta description in `index.html`; no keywords metadata. |

### Security, hosting and certification

| GIGW 3.0 | Requirement | Status | In Pramana |
|---|---|---|---|
| 5.3.1 | Security audit clearance before production hosting; OWASP; Secure and HttpOnly cookies; CAPTCHA on login; strong passwords and MFA; RBAC; logging | Needs audit | In place: Secure, HttpOnly, SameSite=Strict `__Host-` cookie; Argon2 hashes; role checks on the signed-in API; hash-chained audit log; sign-in throttling; sandboxed parsing (`docs/features/platform.md`). Not in place: CAPTCHA, MFA, an audit clearance. |
| 5.3.2 | Secure hosting: HTTPS only with HSTS, valid certificate, hosting in India, WAF, log retention | Partial | HTTPS with HSTS through Caddy and Let's Encrypt on an Azure region in India. No WAF; server log retention not configured. |
| 5.1.15 | Responsive layout tested on devices | Done | Every scanned screen at 1440 and 390 px. |
| 5.1.22 | Integration with India Portal, DigiLocker, Aadhaar, SSO and others | Not applicable | Issuer and DigiLocker integration is future scope; issuer registries are simulated and labelled SIMULATED. |
| 2.1 | STQC Website Quality Certification | Needs audit | Not applied for. |

## Automated WCAG 2.1 AA scan

`frontend/scripts/a11y-scan.mjs` signs in as each demo user, opens each screen in four modes (light, dark, high contrast light, high contrast dark) at two widths (1440 x 900 and 390 x 844), with reduced motion so animations do not leave elements half faded, and runs axe-core with the `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` tags. A scan that cannot run counts as a critical problem. The exit code is non-zero when anything serious or critical remains.

```bash
# server running with the seeded demo (backend/scripts/seed.py), then:
cd frontend
node scripts/a11y-scan.mjs --base http://127.0.0.1:8000 --out a11y-report.json
# options: --only landing,login  --modes light,contrast  --widths phone ; CHROME_PATH if Chrome is elsewhere
```

Screens: the landing page, sign-in (English and Hindi), the eight information pages, the officer review queue, the application workspace (summary, findings, an open finding drawer, the rectification section), the Drishti panel open, the institution portal (applications list, application page with the deficiency letter and threads, recorded outcome), the same three portal screens in Hindi, and the display options menu open.

**Before and after** (28 Oct 2026, axe-core 4.14.0, Chrome 156). "Before" is the UI of `origin/main` at 7b9bb0c served against the same seeded data, in light and dark at both widths (it had no high contrast mode). "After" is this branch in all four modes at both widths. Counts are affected elements (axe nodes).

| Screen | Before: scans | Before: serious or critical | Before: rules | After: scans | After: serious or critical | After: moderate or minor |
|---|---|---|---|---|---|---|
| `landing` | 4 | 156 | `color-contrast`, `definition-list`, `dlitem`, `nested-interactive` | 8 | 0 | 0 |
| `login` | 4 | 0 | none | 8 | 0 | 0 |
| `privacy-policy` | new | | | 8 | 0 | 0 |
| `terms-of-use` | new | | | 8 | 0 | 0 |
| `copyright-policy` | new | | | 8 | 0 | 0 |
| `hyperlinking-policy` | new | | | 8 | 0 | 0 |
| `accessibility-statement` | new | | | 8 | 0 | 0 |
| `help` | new | | | 8 | 0 | 0 |
| `contact` | new | | | 8 | 0 | 0 |
| `sitemap` | new | | | 8 | 0 | 0 |
| `review-queue` | 4 | 2 | `label-content-name-mismatch` | 8 | 0 | 0 |
| `workspace-summary` | 4 | 2 | `label-content-name-mismatch` | 8 | 0 | 0 |
| `workspace-findings` | 4 | 2 | `label-content-name-mismatch` | 8 | 0 | 0 |
| `workspace-finding-drawer` | 4 | 4 | `label-content-name-mismatch`, `scrollable-region-focusable` | 8 | 0 | 0 |
| `workspace-rectification` | 4 | 2 | `label-content-name-mismatch` | 8 | 0 | 0 |
| `drishti-open` | 4 | 2 | `label-content-name-mismatch` | 8 | 0 | 0 |
| `portal-applications` | 4 | 0 | none | 8 | 0 | 0 |
| `portal-application-letter` | 4 | 0 | none | 8 | 0 | 0 |
| `portal-outcome` | 4 | 0 | none | 8 | 0 | 0 |
| `portal-applications-hi` | new | | | 8 | 0 | 0 |
| `portal-application-letter-hi` | new | | | 8 | 0 | 0 |
| `portal-outcome-hi` | new | | | 8 | 0 | 0 |
| `login-hi` | new | | | 8 | 0 | 0 |
| `display-options-open` | new | | | 8 | 0 | 0 |
| **Total** | 44 | 170 | | 192 | 0 | 0 |

Fixes: the search button is named from its visible word, with the key hint hidden from the accessible name; wide tables that scroll sideways on phones (the finding drawer's comparison table, the policy tables) are focusable regions with a name; on the landing page the secondary ink tone meets 4.5:1, the certificate card's field list is one valid `dl`, the field grid that holds buttons is a labelled group instead of an image, and scroll-story steps no longer fade below readable contrast.

What the scan cannot tell:
- axe reports text over images and gradients as "needs review", not as a violation; those were not counted.
- The scan emulates reduced motion. Without it, landing scroll-story steps that are not centred fade to 75%, which keeps their body text above 4.5:1 but not every step number.
- Automated tools find only part of WCAG problems. Keyboard use was checked by hand on the new controls and pages, not on every screen; screen readers were not tested.

## Hindi for the institution portal

- **Where.** Every screen an institution account sees: the applications list, new application, the application page (next step, progress, documents, declared figures, readiness check, submit dialog, run history, outcome), the deficiency letter and its threads and composer, the notification bell, the shell pieces (top bar, account menu, display options, footer) and the sign-in page. `document.documentElement.lang` is `hi` or `en` to match. Officials' screens are English: the provider returns English for any other role and route, so shared components call the same `t()`.
- **How.** `frontend/src/i18n/index.tsx` (provider, `useT`, `tn` for plurals, Hindi date and relative-time helpers, the switch) and `frontend/src/i18n/hi.ts` (488 pairs keyed by the English text; a missing key falls back to English). No i18n library.
- **Style.** Formal administrative Hindi in Unicode, with Drishti's terms (`backend/pramana/drishti/glossary.py`): आवेदन application, निष्कर्ष finding, निर्णय decision, प्रमाणपत्र certificate, सुधार correction, कमी पत्र deficiency letter, सुधार राउंड correction round, तैयारी जाँच readiness check, स्क्रूटिनी परिणाम scrutiny outcome. "Pramana", "AICTE", IDs and file formats stay in Latin script. The AICTE Scrutiny Cell is "AICTE स्क्रूटिनी सेल".
- **What stays English, honestly.** Text that comes from the server is shown as sent: deficiency letter items and the officer's message, the outcome label, reasons and next steps, notification bodies, thread messages, readiness item wording, checklist and category names from the ruleset, and API error messages. Translating these needs the backend to store Hindi versions, which this prototype does not do. The deficiency letter PDF, the landing page, the information pages, the scan page and Drishti's window are English (Drishti already answers in Hindi and Hinglish).
- **Proofreading.** `node frontend/scripts/hindi-review.mjs <output.md>` writes every pair as a table; the team copy is `Downloads/SIH26261_Pramana/gigw/hindi_strings_review.md`. Corrections go into `hi.ts`.

## Left out

- A feedback form (the nightly reset would erase it), a National Portal link, an About page and public site search.
- A warning before the session expires (WCAG 2.2.1, GIGW 5.2.24).
- Standard-theme border contrast (1.4.11); High contrast covers it.
- Hindi for officials' screens, the landing page, the information pages, server-sent text and the letter PDF.
- Screen reader testing, 200% zoom and 320 px checks on every screen.
- Everything that needs an owner or an auditor: STQC certification, the security audit clearance, the Web Information Manager, CMAP and archival policies.
