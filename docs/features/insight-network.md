# Integrity network and faculty overlaps

Single-document review cannot see that two institutions list the same professor, reuse one fire NOC number or submit the same photo. Validation already records each such link as a cross-application finding on each application. The Integrity page puts those findings together for the whole cycle, so an official sees the pattern at once instead of one application at a time.

Two views, officials only (officer, verifier, admin). Institutions never see them: both endpoints answer 403 to an institution account and 401 without a session.

Wording rule: a shared item is an indicator that needs confirmation. Nothing here calls a document or a person anything, and nothing decides. Faculty names are synthetic.

## How to see it

1. Sign in as `officer` (password `Pramana@2026`).
2. Review queue: the **Linked applications** block at the top of the right column shows "2 linked clusters across 6 applications" with a small drawing of the clusters. Select a cluster sentence or **Open the integrity network**.
3. Sidebar, Tools, **Integrity**:
   - **Integrity network** tab: the network, a cluster list beside it and a table of every shared item under it.
   - **Faculty overlaps** tab: the ghost-faculty radar.
4. In any application, **Comparisons**, **Related applications** now draws the same graph style for that one application, with **Whole cycle** linking back to the network.

## Integrity network

`GET /api/insights/network` (and `?dataset=synthetic`).

**Data.** For every application of the latest academic year, the endpoint reads the cross-application findings of its current run:

| Finding code | Shared item |
|---|---|
| `XA-FACULTY-MULTIPLE-INSTITUTIONS` | Faculty ID |
| `XA-SHARED-CERTIFICATE-NUMBER` | Certificate number (fire NOC, occupancy certificate, ...) |
| `XA-IDENTICAL-FILE` | Identical file (SHA-256) |
| `XA-PHOTO-REUSED`, `XA-PHOTO-REUSED-LATER` | Photo (perceptual hash) |
| `FX-SEAL-REUSED`, `FX-SEAL-REUSED-LATER` | Seal image |
| `XA-NEAR-DUPLICATE-DETAILS` | Certificate details (matching extracted values) |

Each finding is matched back to the entity it was recorded for through its fingerprint (`_fp("xa", code, entity)`, or `_fp(fp, message)` for a repeated one), so no message parsing decides membership. Image and value matches carry one entity per side; their documents are joined with a union-find, so one photo shared by two applications is one item, not two. Only items in two or more applications are drawn.

**Clusters.** Applications are the nodes of a networkx graph with an edge wherever they share an item; connected components of two or more applications are clusters, largest first. Each cluster gets a plain sentence, for example "Sahyadri, Krishna Valley and Panchganga are linked through 3 faculty IDs, 1 fire NOC number and 1 set of certificate details", plus one sentence per linked pair.

**Drawing.** Cytoscape.js with a preset, deterministic layout (no physics), so the same data always looks the same:

- each cluster sits in its own frame; when its links form a chain, applications sit on a line with the items they share stacked between them; when links branch, applications sit on a ring with items between the applications that share them;
- applications that share nothing sit in a quiet row at the bottom, so the picture covers the whole cycle;
- nodes are Neo4j-style circles with a glyph: building (application), person (faculty ID), hash (certificate number), files (identical file), image (photo), stamp (seal), copy (certificate details); labels sit under the node and never overlap;
- links are curved and labelled with the relationship ("lists faculty", "carries NOC no.", "same seal"); line style says what kind of match it is: solid for the same identifier, dashed for an image match, dotted for matching values;
- **Applications only** collapses the items into weighted application-to-application links (line weight is the number of shared items);
- hovering or selecting a node dims everything else; the side panel then lists the shared items or the applications that carry an item, each with its findings and a **Show on page** link to the highlighted region;
- zoom in, zoom out and fit-to-view buttons; wheel zoom is off so the page still scrolls;
- the canvas is `role="img"` with a text summary; the cluster list and the **Shared items** table are the keyboard and screen-reader route to every item.

Colours: six categorical slots in a fixed order, stepped separately for light and dark (validated for colour-vision deficiency), on design system v2 surfaces. Colour is never the only signal: every node has a glyph and a label, every link a line style and a label.

**Synthetic world (optional).** `scripts/network_snapshot.py` freezes the network of a random evaluation run into `backend/pramana/insights/synthetic_network.json`. When the file exists, the page offers **This cycle (11)** and **Synthetic world (30)**. The synthetic view is labelled as such; its findings live in that run's own database, so it shows counts and titles without links.

```bash
cd backend
.venv/Scripts/python scripts/random_eval.py --seed 4242 --n 30
.venv/Scripts/python scripts/network_snapshot.py --data ../var/random-eval/seed-4242-n30/data --seed 4242
```

## Faculty overlaps (ghost-faculty radar)

`GET /api/insights/faculty-overlaps`.

**Data.** Every row of every current faculty list (faculty ID, name, designation, joining date, page and box of the row), the AICTE faculty registry records (`ReferenceRecord`, type `faculty`) and last year's rosters (`previous_application` records). A faculty ID is shown when two or more institutions list it this year, or when one institution lists it and the registry records it against another.

**Per person.**
- One lane per institution, from the joining date on that institution's roster to today (or to a leaving date where one is recorded).
- The stretch where two or more rosters list the person at once is drawn in amber and shaded across the lanes, with the headline "Listed by 2 institutions at once since Aug 2024, 2 years 3 months".
- A **Registry** mark shows which institution the registry records; a registry-only lane is drawn dashed.
- One neutral sentence reads the evidence: "Panchganga, where the AICTE registry records this ID, lists it from 17 Sep 2013 and did last year; Krishna Valley lists this ID from 1 Aug 2024."
- Each bar opens the roster page with the row highlighted; **Finding** opens the related finding.

**Ranking.** Longest overlap first, then the number of institutions. Overlap is computed by a sweep over joining and leaving dates, so only concurrent time counts.

**Header.** Honest counts: "3 faculty IDs claimed by 2 or more institutions across 2 applications", rows checked, applications involved, registry mismatches and the longest overlap. A callout says what to confirm (appointment letters, salary records, the registry) because visiting and adjunct arrangements exist.

**Fixture change.** A6 (Krishna Valley) now gives its three shared faculty recent joining dates of its own (Aug 2024, Aug 2024, Jan 2025) while A7 (Panchganga) and the registry keep them at Panchganga for years. No rule reads joining dates, so findings are unchanged; the radar can now show the overlap starting.

## Per-application related view

**Comparisons, Related applications** keeps its API (`RelatedView()` with no props, the `?node=` deep link) and its keyboard side list, and now uses the same Cytoscape canvas in a column layout:

- this application on the left;
- the shared items in the middle, grouped by type, ordered so links to the right do not cross;
- the other applications on the right, each level with the items it shares.

Item labels are the identifiers as printed (`FID-10004574`, `FES/KAR/2025/04502`), read back from the findings. Labels sit on the left links at rest; tracing a node shows all of them. Cytoscape is loaded lazily, only when this view or the Integrity page opens.

## Files

| Path | What |
|---|---|
| `backend/pramana/insights/network.py` | Network and radar builders, `/api/insights` router |
| `backend/scripts/network_snapshot.py` | Freezes a random world's network as the synthetic dataset |
| `backend/tests/test_insight_network.py` | Clusters, item merging, summaries, radar lanes and ranking, overlap sweep, access |
| `frontend/src/pages/integrity/` | `IntegrityPage`, `NetworkView`, `FacultyRadar`, `GraphCanvas` (Cytoscape), `layout.ts`, `graphTheme.ts`, `legend.tsx`, `NetworkSummaryBlock` |
| `frontend/src/pages/application/sections/comparisons/RelatedView.tsx` | Per-application column graph |

Shared files touched, additively: `backend/pramana/main.py` (router), `frontend/src/App.tsx` (lazy route `/integrity/:view?`), `frontend/src/shell/nav.ts` (Tools, Integrity), `frontend/src/api.ts` (two calls, two query keys), `frontend/src/pages/dashboard/DashboardPage.tsx` (the block), `backend/scripts/make_fixtures.py` (three joining dates).

## Dependencies

| Package | Version | Licence |
|---|---|---|
| `cytoscape` | 3.34.3 (pinned) | MIT |

No layout extension is used: layouts are computed in `layout.ts` and handed to Cytoscape as preset positions. Glyphs are lucide icon paths (ISC) drawn as SVG data URIs.

## Limitations

- The network is as complete as the cross-application checks behind it; it adds no new detection.
- Joining dates are as each institution typed them; rosters carry no leaving date, so lanes run to today.
- A faculty ID shared by two rosters can be a visiting or adjunct arrangement, or a roster that lags a move; the view says so and asks for confirmation.
