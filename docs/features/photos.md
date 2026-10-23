# Photo evidence: campus map, Content Credentials, room and seat indicators

Three officer-only checks on infrastructure photos. None of them decides anything: each result is evidence for an officer, labelled with its evidence class and its limits.

## Where to see it in the demo

Log in as `officer` (password `Pramana@2026`), open an application from the dashboard and choose the **Campus** tab.

| Application | What it shows |
|---|---|
| A10 (APP-2026-000110) | The key scenario. The declared map point is 2.6 km from the campus on record, outside the 0.5 km map tolerance. The lab photo's geotag is 329 km away (Pune), and the photo is A1's photo recompressed. The far point is listed over the map; "Show all points" zooms out to it and "Back to the campus" returns. |
| A1 (APP-2026-000101) | A real lab photo with valid Content Credentials from a DEMO campus camera: intact, matching its signed hash, chaining to the demo capture CA. A later reuse by A10 is noted. |
| A7 (APP-2026-000107) | A lab photo whose pixels were edited after the camera signed its credentials. The Campus card says "Modified after capture", and the Findings tab has `PH-C2PA-MODIFIED-AFTER-SIGNING`. |
| A4 (APP-2026-000104) | A real lab photo declared as "Computer Lab 2 (EE)" with 60 workstations. The detector counts 11 visible workstations, so `PH-ROOM-FEW-WORKSTATIONS` is raised as a low model indicator. |

On each photo card, the **Detection boxes** switch draws the detector's boxes on the photo, and the object chips hide or show one group at a time. **Locate on map** pans to the photo's geotag. Points in the side list are buttons, so the map can be driven from the keyboard. The **Verification** tab shows Content Credentials as their own channel (C2PA column).

Institutions never see any of this. The campus and photo endpoints require an official role, and the document API strips forensic data for institutions.

## 1. Campus tab and map

**What it does.**
- Plots three kinds of point:
  - the campus on record (AICTE institution master; synthetic in the prototype);
  - the point declared on the application's uploaded satellite map;
  - each photo's EXIF geotag, shown as a thumbnail marker with a popup.
- Draws a ring at the geotag check's threshold (2 km, read from `forensics.image.analyse`) and a ring at the satellite map tolerance (0.5 km, read from rule `XD-SATMAP-LOCATION`).
- Labels each line with its distance, for example "2.6 km from campus on record".
- Points more than 15 km away stay out of the first view and are listed with distance and direction, for example "329 km south-west".
- Photo cards below the map show:
  - EXIF capture time, camera, software and geotag, with the distance to the campus on record and to the declared map point;
  - reuse matches from the cross-application check, with the other application and a thumbnail of the matching photo;
  - the Content Credentials result;
  - the room reading;
  - links to each finding on that photo.

**Evidence class.** The map adds no findings. It shows the evidence behind existing ones: `FX-IMG-GEOTAG-FAR` (heuristic), `XD-SATMAP-LOCATION` (rule) and `XA-PHOTO-REUSED` (heuristic).

**What it does not prove.** EXIF positions show only where the file says the camera was. They can be edited, stripped by messaging apps, or wrong indoors. Distances are straight lines. A near geotag does not prove the photo shows this campus.

**Map tiles and offline fallback.**
- Tiles come from OpenStreetMap through plain Leaflet; react-leaflet is deliberately not used.
- The OSM attribution is always visible. Tiles load only for the map in view, with no prefetching or bulk download.
- Tile requests carry a `strict-origin-when-cross-origin` referrer, as the OSM tile usage policy asks, even though the app sends `Referrer-Policy: no-referrer` elsewhere.
- If tiles fail (four errors with none loaded, or nothing loaded after 9 s), the tab switches to a plain SVG plot with the same points, rings and distances, and says why. The plot is also available from the Map / Plot switch.
- `PRAMANA_MAP_TILE_URL` can point at a self-hosted tile server. Setting it to an empty value disables tiles and shows only the plot.
- In dark mode the tiles are shown through a colour filter.

## 2. Content Credentials (C2PA)

**What it does.**
- Reads and validates any C2PA manifest embedded in an uploaded photo with the official open-source `c2pa-python` 0.38.0 (bundling `c2pa-rs` 0.91.0). It runs offline: remote manifests and OCSP are not fetched.
- Reports:
  - whether a manifest is present;
  - whether the claim signature validates;
  - the signer and its issuing certificate, and whether it chains to the trust list;
  - the claim generator;
  - the capture time stated in the signed `c2pa.created` action;
  - the recorded actions;
  - whether the file still matches the hash the manifest signed.
- Trust is checked only against the **Pramana demo capture CA (not a real trust list)**, kept in `backend/trust/demo-c2pa/`. It is deliberately separate from `trust/demo/` so that it never becomes a PDF signature anchor. Every result is labelled DEMO.

**Results and evidence classes.**

| Case | Result | Evidence class |
|---|---|---|
| Valid manifest, matching hash, signer chains to the demo CA | Verification attempt `content_credentials: verified`, marked DEMO; no finding | cryptographic |
| Valid manifest and hash, signer not on the demo list | Verification attempt `manual_review_required`; no finding | cryptographic |
| Signature valid but the file no longer matches its signed hash | `PH-C2PA-MODIFIED-AFTER-SIGNING` (medium) and a `mismatch_detected` attempt | cryptographic: a signed hash compared with the file, like a PDF signature that no longer covers the bytes |
| Manifest present but unreadable, or its signature does not validate | `PH-C2PA-MANIFEST-INVALID` (medium) | structural |
| No manifest | "No content credentials" on the card; no finding | none |

Missing credentials are not an indicator: most cameras and apps do not add them yet.

**What it does not prove.**
- Valid credentials show that the file is unchanged since the holder of the signing key signed it, and that the key chains to the demo CA. They do not show that the scene is this campus, or that the device clock was right.
- "Modified after capture" means something in the file changed after signing. A harmless metadata rewrite also breaks the hash, so compare with the original capture.
- Credentials are easy to strip, so a photo without them is simply unchecked.
- No timestamp authority or revocation check is used, so signing time is the signer's claim.

**Fixtures.**
- `make_fixtures.py` creates the demo CA and one DEMO campus camera certificate per institution (EC P-256, `emailProtection` EKU).
- It signs A1's lab photo and A7's lab photo.
- For A7 it then re-encodes A7's photo with a copy-move pixel edit and carries the original manifest over unchanged, as a careless editor would.

## 3. Room type and seat counting

**What it does.**
- Runs YOLOX-M (COCO, ONNX, Apache-2.0) on the CPU through onnxruntime, with the preprocessing of the official ONNX demo: 640 px letterbox, BGR, no normalisation, score of at least 0.3, per-class NMS.
- Counts:
  - screens (COCO "tv" and "laptop", merged when one monitor is read as both);
  - keyboards;
  - chairs or benches;
  - tables or desks (COCO "dining table");
  - books;
  - people, counted for context and never boxed.
- Visible workstations are the larger of screens and keyboards.
- Reads the room type from the mix of objects:
  - 3 or more workstations: computer lab;
  - otherwise 12 or more books: library;
  - otherwise 6 or more seats and tables with at most 1 workstation: classroom;
  - anything else: unclear.
- Compares the reading with the declared facility the photo belongs to. Each entry in the application's `declared.facilities` names its `photo`, `room_type` and `workstations`.
  - `PH-ROOM-FEW-WORKSTATIONS`: fewer than a third of the declared workstations are visible. Example: "Counted 11 visible workstations in 'lab_photo.jpg'; the declaration lists 60 for Computer Lab 2 (EE). A photo may not show the whole room."
  - `PH-ROOM-TYPE-DIFFERS`: the reading is a different known room type from the declared one. The reading "unclear" never raises it.
- The ruleset has no lab or seating norm (its norms cover only the faculty-student ratio and bandwidth), so the comparison is against the declaration only.
- If a photo cannot be analysed, because the model is not installed, its hash does not match, or the image is unreadable, the card says "Not analysed" with the reason. Nothing is guessed.

**Evidence class.** `model`, severity `low`, outcome `indicator`. Detector output never decides anything and is never worded as a shortfall.

**What it does not prove.**
- One photo rarely shows a whole room.
- People and partitions hide furniture.
- COCO has no desk, monitor or bench-desk class, and cubicle partitions are often read as chairs.
- Counts are indicators to confirm during inspection.

**Sample photos.**
- The synthetic lab drawings defeat the detector, so three openly licensed photos from Wikimedia Commons are used as demo lab photos.
- Each photo is resized to 1600 px and given synthetic EXIF capture data and GPS near the right campus. Its attribution is written into EXIF Artist and Copyright and shown on the card.
- The A1 to A10 photo reuse still works because A10's photo is A1's, recompressed.

## API

| Endpoint | Roles | Returns |
|---|---|---|
| `GET /api/applications/{id}/campus` | officer, verifier, admin | Campus on record, declared map point, thresholds, photos with EXIF, distances, reuse, credentials, room reading and finding links, and the tile settings |
| `GET /api/documents/{id}/photo.jpg?size=thumb\|preview` | officer, verifier, admin | Upright JPEG preview (360 or 1280 px), cached |

Other institutions' objects return 404 through `load_application`. Institution accounts get 403 from the role check.

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `PRAMANA_MODELS_DIR` | `backend/models` (gitignored) | Where `yolox_m.onnx` is stored |
| `PRAMANA_MAP_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Tile source for the Campus map; empty for plot only |

Fetch the downloaded assets with `python backend/scripts/fetch_photo_assets.py`; `make_fixtures.py` also calls it. Each file is checked against its pinned SHA-256. Offline, the photo scenarios that need these assets are left out of the fixtures and their expected findings, rather than faked.

## Licences and attributions

| Item | Licence | Source |
|---|---|---|
| c2pa-python 0.38.0 (bundles c2pa-rs 0.91.0) | MIT OR Apache-2.0 | PyPI, py3-none-win_amd64 wheel. Pinned because 0.38.1 ships no Windows wheel. Its dependencies toml, requests and cryptography are MIT, Apache-2.0 and Apache-2.0 or BSD. |
| YOLOX-M ONNX weights, release 0.1.1rc0 | Apache-2.0 | github.com/Megvii-BaseDetection/YOLOX; SHA-256 `21ff6cfdeb53b013bac2249599e55f00bff3cfdfdab37ed7a4620818c1d15b3f` |
| Leaflet 1.9.4 | BSD-2-Clause | npm |
| @types/leaflet 1.9.22 | MIT | npm (dev only) |
| Map data and tiles | ODbL data, OSM tile usage policy | © OpenStreetMap contributors, attribution shown on the map |
| `cmi_computer_lab.jpg`: "Computer lab in Chennai Mathematical Institute" by Kprateek88 | CC BY-SA 3.0 (also GFDL) | commons.wikimedia.org/wiki/File:Computer_lab_in_Chennai_Mathematical_Institute.JPG; SHA-256 `ef8cb33e588c9efa05378ac24afb46e306ad2d260a2c507bd4ea3afc6f2bfdee` |
| `baramati_computer_lab.jpg`: "Baramati, Maharashtra, India. Computers in a lab" by Fredericknoronha | CC BY-SA 4.0 | commons.wikimedia.org/wiki/File:Baramati,_Maharashtra,_India._Computers_in_a_lab.jpg; SHA-256 `9fac3df9dc6289ae4b5c3c7edc107b2972a90c8f35833fbdcbdaa0e0912f081f` |
| `kmclu_computer_lab.jpg`: "Computer Lab KMCLU Urdu Department" by Doorwaytoknowledge | CC0 1.0 | commons.wikimedia.org/wiki/File:Computer_Lab_KMCLU_Urdu_Department.jpg; SHA-256 `ed31de0bd0882d9c1b2e6b8d2bd16ee24b0849a61a659ed4593ed208f8130ada` |

The licence of each photo was read from its Commons file page (licence template in the page wikitext) on 23 Oct 2026. The photos are not committed; they are downloaded into gitignored `fixtures/real/photos/` together with an `ATTRIBUTION.md`. The fixture copies are adaptations: resized, with synthetic metadata, and A7's photo has a copy-move edit. CC BY-SA adaptations stay under the same licence.

## Measured

Measured on 23 Oct 2026 on the team laptop (i5-12450HX, 16 GB, CPU only), shared with other jobs.

| Metric | Result |
|---|---|
| Planted conditions, deterministic mode | 44 / 44 found, 0 false positives (before this feature: 42 / 42, 0 false positives) |
| Added planted conditions | `PH-ROOM-FEW-WORKSTATIONS` (A4), `PH-C2PA-MODIFIED-AFTER-SIGNING` (A7) |
| Tests | 32 passed (22 existing and 10 new in `tests/test_photos.py`) |
| Detector inference per photo (1600 x 1200, 4 threads) | median 0.32 to 0.41 s over 5 runs per photo. It rose to several seconds while other heavy jobs shared the CPU. |
| Detector model load, including the SHA-256 check | about 0.6 to 0.7 s, once per process |
| Content Credentials read and validate | 2 to 13 ms per photo |
| Workstations counted on the fixture photos | A1 6 (declared 15), A4 11 (declared 60), A7 9, A10 5 (A1's photo at 75% scale) |
