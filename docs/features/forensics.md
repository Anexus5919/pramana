# Font check, seal reuse, Hindi OCR and scan to verify

Four additions to Pramana's document checks. Each one reports an indicator with an evidence class and a page
region; none of them decides anything. Officials review and decide.

| Check | Finding code | Evidence class | Who sees it | Seeded in |
|---|---|---|---|---|
| Font check | `FX-FONT-MISMATCH` | structural | officials | A7 fire NOC |
| Seal reuse | `FX-SEAL-REUSED` (later submission), `FX-SEAL-REUSED-LATER` (earlier one, low note) | structural when pixel-identical, heuristic when only perceptually similar | officials | A8 fire NOC, A1 fire NOC |
| Hindi OCR | `DOC-SCRIPT-NOT-READ` when the model is missing | structural | officials and the institution | A2 occupancy certificate |
| Scan to verify | none (public page) | cryptographic, SIMULATED issuer keys | anyone, no login | printable samples in `fixtures/out/scan` |

Institutions do not see the font or seal findings: they are forensic and cross-application indicators,
which the API already trims for institution accounts.

## Evaluation

`scripts/evaluate.py` on the seeded world, deterministic mode (`PRAMANA_LLM_PROVIDERS=""`):

| | Before | After |
|---|---|---|
| Planted conditions found | 42 of 42 | 45 of 45 (adds `FX-FONT-MISMATCH` on A7, `FX-SEAL-REUSED` on A8, `FX-SEAL-REUSED-LATER` on A1) |
| False positives | 0 | 0 |
| Fields extracted | 323 of 328 | 323 of 328; A2's six occupancy certificate fields are now read through Hindi labels |

The shared emblem printed on every fire and municipal certificate, the bold labels, the rotated seal text
and the QR captions produce no font or seal findings. `scripts/eval_hindi.py` measures Hindi OCR (below).
Seeding is slower: A2's occupancy certificate is OCR'd by two recognisers, and each PDF's images are hashed.

## 1. Font check (`FX-FONT-MISMATCH`)

**What it does.** An issuer's template draws comparable values (numbers, dates, names) in one font and size.
For every value read from the text layer, the check collects the glyphs inside the value's region from
pdfplumber (font name with the subset tag removed, and size) and compares them with the other key values on
the same document. It reports a value when it contains at least three glyphs in a font that:

- no other key value on the document uses, and
- the template does not use elsewhere on the page (labels, headings, body text).

The second condition keeps a bold label that leaks into a value's box, seal text and QR captions from being
reported. A size that no other value and no other text on the page uses is reported the same way.

**Context.** When a revision diff, overlapping glyphs or a white box sit at the same spot, the message says
so and severity is high; on its own the signal is medium. The check does not need those signals.

**Evidence.** Two page regions: the odd glyphs, labelled with their font and size (for example "valid until
drawn in ArialMT 10.5 pt"), and a comparable value in the usual font ("comparable value (noc number) in
Helvetica 10.5 pt"). The message names both fonts.

**Demo.** Sign in as `officer`, open A7 (Panchganga Institute), Findings, "Valid until drawn in a different
font". Show on page 1 jumps to the redrawn date. The A7 fixture now redraws `30-06-2027` in ArialMT with
Helvetica widths, so on screen the date looks the same; only the font name differs.

**What it does not prove.** Who changed the value, when, or whether the issuer did it. A different font is a
reason to look closely at the region.

**Limitations.**
- Only text-layer values are compared; scanned pages carry no font information.
- Templates sometimes set one value in bold or another size on purpose. If such a font appears nowhere else
  on the page it will be reported; the limitation text on the finding says this.
- A document retyped from scratch in one font, or two values redrawn in the same new font, is not caught.
- Fonts named differently but visually identical (Arial and Helvetica) are treated as different. That is
  intended: the name is what the editing tool left behind.

## 2. Seal reuse (`FX-SEAL-REUSED`)

**What it does.** Issuers stamp certificates with a seal or logo, often a raster image inside the PDF. A
copied certificate tends to carry the image lifted from a real one.

1. Every embedded image on the first three pages is located with pdfplumber and decoded with pikepdf.
2. Only seal-sized images are kept: at least 28 pt a side, at most 12% of the page, aspect ratio between
   1:2 and 2:1. QR codes are dropped (they share finder patterns, and signed QRs are verified elsewhere), as
   are flat colour blocks.
3. Each image gets a SHA-256 of its decoded pixels and two 256-bit perceptual hashes (pHash and dHash).
4. At validation, the application's images are compared with every other institution's documents in the same
   academic year. Two images match when the pixels are identical, or when both hashes are within 8 of 256
   bits. Seals of one template differ only in their text: in the fixtures, rescaling and recompression move a
   seal by about 4 bits and different offices' seals sit 10 or more apart.
5. A match is reported only when the two documents name different issuers. The issuer is the organisation
   in the `issuing_authority` value (the part after the signatory's title, so "Chief Fire Officer, Pune Fire
   Brigade" and "Divisional Fire Officer, Pune Fire Brigade" are one issuer). The same issuer reusing its own
   seal is normal. An image that appears under three or more distinct issuers
   is shared artwork, such as a state emblem, and is ignored. The fixtures print one shared emblem on every
   fire and municipal certificate to keep this rule honest.

**Who gets which finding.** As with reused photos, the later submission gets `FX-SEAL-REUSED` (high when the
pixels are identical, medium when only the hashes agree) and the earlier one a low note
`FX-SEAL-REUSED-LATER`, because the files cannot say which one the image came from.

**Evidence.** A region on this document (the seal box), the peer document with its seal box, and an
`image_match` item with both issuers and the distance. The finding view shows both seals side by side, cut
out of the rendered pages.

**Demo.** Officer, A8 (Deccan Institute, Hyderabad), Findings, "Seal image of a different issuer". The
Hyderabad fire NOC carries the Pune fire brigade's seal, lifted from A1's certificate; the comparison shows
"PUNE" in both seals. A1 carries the low note.

**What it does not prove.** Who copied the image, or that the applicant did. It shows that the same picture
is on two certificates that name different issuers.

**Limitations.**
- Documents whose issuer could not be read are not compared.
- Cropping, rotating or re-photographing a seal defeats perceptual hashes; a feature-matching approach
  (ORB keypoints) would be the next step.
- Vector seals (drawn as text and paths, not images) are not covered.
- Comparison is across institutions in one academic year, like the other cross-application checks.

## 3. Hindi OCR

**What it does.** The default PP-OCR recogniser reads Latin script and digits; on Devanagari it returns
fragments or nothing. Pramana now reads such pages with the PP-OCRv5 Devanagari recogniser as well.

**When a page is read as Devanagari.**
- Its text layer is 3% or more Private Use Area code points. Legacy Hindi fonts map conjuncts to the PUA, so
  copying the text gives nonsense; intake already routed these pages to OCR.
- Its text layer has Devanagari whose vowel signs start words. Many generators store glyphs in visual order,
  so the extracted text is out of order (the real e-Gazette sample does this).
- A first pass finds Devanagari: lines the default recogniser scored below its threshold, or read as one- and
  two-letter fragments, are re-read with the Devanagari recogniser, and six or more Devanagari letters at
  confidence 0.7 or above mark the page. This costs a few small recognitions, not a second detection pass.

**Does the Devanagari model read digits and Latin?** Yes: its character set includes ASCII, and on the
fixture it reads reference numbers and dates. But it confuses `O` with `0` and `I` with `l` (it read
`NAS/BP/0C/2010/00941` and `lssue`). So both recognisers read the page and, per text line, Devanagari words
come from the Devanagari model and other words from the default model whenever its reading of that span is
confident (0.8 or more); when both agree, the higher confidence is kept.

**Model file.** `devanagari_PP-OCRv5_rec_mobile.onnx` (7.9 MB) from the RapidOCR v3.10.0 model zoo, pinned
SHA-256 `d6f0a906580e3fa6b324a318718f1f31f268b6ea8ef985f91c2012a37f52c91e`. It is fetched on first use into
`var/models` (gitignored; setting `PRAMANA_MODELS_DIR`), or ahead of time with
`python scripts/fetch_assets.py`. `PRAMANA_FETCH_MODELS=false` stops runtime fetching. Without the file the
page keeps the default reading, the document records that its Hindi text was not read, and validation adds
`DOC-SCRIPT-NOT-READ` (medium, manual review).

**Extraction.** The ruleset's occupancy, structural stability and fire certificate types gain Hindi label
patterns and keywords: प्रमाणपत्र संख्या, जारी करने की तिथि, दिनांक, संस्था का नाम, कुल निर्मित क्षेत्रफल,
प्रमाणपत्र का प्रकार, जारीकर्ता प्राधिकारी, वैध तिथि, अनापत्ति प्रमाणपत्र. Patterns accept the Devanagari
visarga as a colon and match labels on stable prefixes (`क्ष...`, `जारीक...`), because OCR drops parts of
conjuncts (क्षेत्रफल read as क्षे्रफल, जारीकर्ता as जारीकता). Every value keeps its word boxes, so the viewer
draws provenance boxes as for any other field.

**Fixture.** A2's occupancy certificate (Nashik Municipal Corporation) is a bilingual certified copy: Hindi
labels, English values, a Hindi paragraph and an English summary. It is rendered with Noto Sans Devanagari,
shaped by HarfBuzz, through a renamed font copy whose cmap maps every non-nominal glyph to a PUA code point,
the way legacy Hindi fonts behave. The text layer reads `माणप संया` for प्रमाणपत्र संख्या. A2's planted
condition (a building over 30 years old needs a structural stability certificate) depends on the issue date
read from this page.

**Demo.** Officer, A2, Documents, Occupancy certificate. The Fields panel opens with "Hindi text read by
OCR" and the reason; each value shows the Hindi line it was read from, and Locate draws its box. The
simulated municipal registry confirms the certificate number, date, area and name read from the page.

**Accuracy, measured** (`python scripts/eval_hindi.py`; synthetic, clean rendering at 200 dpi):

- Fields: 6 of 6 occupancy certificate values read exactly from Hindi labels (certificate number, issue
  date, institution name, built-up area, certificate type, issuing authority), each confidence 0.99 or more.
  Before the per-line combination the certificate number came back as `NAS/BP/0C/...`.
- Characters: 99.0% of characters on the 13 printed lines that contain Devanagari, 98.8% of the 406
  Devanagari characters alone. The errors are a dropped half-letter in conjuncts (क्षेत्रफल read as
  क्षे्रफल, जारीकर्ता as जारीकता, द्वारा as द्वरा) and one vowel sign (शैक्षणिक read as शेक्षणिक).
- Real document spot check: page 1 of the DSC-signed e-Gazette sample has a Devanagari text layer stored in
  visual order (18 words start with a vowel sign), so it is routed to the Devanagari recogniser. All 7 Hindi
  lines checked by eye (असाधारण, प्राधिकार से प्रकाशित, the date line, रेल मंत्रालय, the bracketed department,
  अधिसूचना, the place and date) were read character for character; on the date line the line grouping also
  pulled in the issue number from the left column.

These are upper bounds. The fixture is a clean digital rendering, not a phone photo or a fax.

**What it does not prove.** OCR reads what is printed; it says nothing about whether the content is true.

**Limitations.**
- Only Devanagari is added (Hindi, Marathi and other languages in that script). Other Indian scripts would
  need their own recognisers (RapidOCR lists Tamil and Telugu models too).
- Kruti Dev style fonts that map Devanagari glyphs to ASCII letters leave no PUA or Devanagari trace in the
  text layer; such a page is read as digital text and its Hindi labels are not found. Detecting that needs a
  font-name list or a language model of the garbage, not done here.
- A whole page in Hindi with no Latin anchor may still be missed by the first-pass probe if the default
  recogniser returns nothing for every line; text-layer hints catch most digital documents.
- Hindi values (for example a Hindi institution name) are extracted as Hindi and are not transliterated, so
  comparing them with English records would need transliteration.

## 4. Scan to verify (public page `/scan`)

**What it does.** Anyone holding a certificate photographs its issuer-signed QR. The page sends the photo to
`POST /api/public/scan`, which decodes the QR (the multi-scale cv2 approach of the pipeline, now with the
ArUco detector as a fallback) and verifies the JWS EdDSA token against the published issuer keys.

**Results the page explains.**

| Status | Meaning |
|---|---|
| Signature verified | The issuer's key signed exactly these values, and the validity they state includes today. |
| Signature verified, validity ended | Signed, but the signed validity ended before today. |
| Signature verified, not yet in force | Signed, validity starts later. |
| Signature does not match | The QR content changed after signing, or another key signed it. Values are shown as unverified. |
| Signed with an unknown key | The key ID is not among the published keys. Values are shown as unverified. |
| Not an issuer-signed QR | A link or plain text; nothing to verify. |
| No QR code found | With tips for a better photo. |

The page then shows:
- the issuer-signed values, each with "Same on paper" and "Different" buttons. Any "Different" turns into a
  plain warning to rely on the signed values and ask the issuer;
- what this proves: the data was signed with issuer X's key, with these validity dates;
- what it does not prove: that the paper in your hand matches, that the certificate was not withdrawn later,
  or anything about the premises;
- an optional registry lookup, labelled SIMULATED, which only accepts a validly signed token
  (`POST /api/public/scan/registry`), so it cannot be used to probe reference numbers.

**Privacy and abuse.** No login and no cookies. The photo is decoded in memory and never stored; the audit
trail records only its SHA-256, the number of QRs and the status. Uploads are limited to 10 MB, JPEG, PNG or
WebP (checked by magic bytes, Pillow's decompression-bomb guard applies), and 20 scans per minute per client
plus 600 per minute in total (`pramana.ratelimit`). The page shrinks photos to 2400 px on the device before
upload.

**Links.** From the login page ("Holding a certificate with a QR code?") and from Verify a PDF.

**Printable samples.** `make_fixtures.py` writes `fixtures/out/scan/scan_samples.pdf` and one PNG per QR:
1. as issued (A1's fire NOC): verified, every value matches the paper;
2. same QR, printed validity changed to 11-03-2029: verified, and the comparison shows the paper differs;
3. A3's NOC: validity ended 30-09-2025;
4. QR payload edited after signing: signature does not match;
5. signed with an unpublished key: unknown key.

The keys are generated on every fixture run, so print the samples after the last `make_fixtures.py` and
`seed.py`.

**Opening it on a phone.**
1. Build the frontend once: `cd frontend; pnpm build`.
2. Start the backend on all interfaces: `cd backend; .venv\Scripts\python -m uvicorn pramana.main:app --host 0.0.0.0 --port 8000`.
3. Windows shows a firewall prompt the first time; allow Python on Private networks. If it was dismissed,
   allow the port in Windows Defender Firewall, inbound rules.
4. Find the laptop's address with `ipconfig` (IPv4 of the Wi-Fi adapter), and on a phone on the same Wi-Fi
   open `http://<that address>:8000/scan`.
5. "Take a photo of the QR" opens the camera. It uses a file input with `capture="environment"`, not
   `getUserMedia`, so it works over plain http.

**What it does not prove.** That the paper matches the QR (the user compares), that the certificate is still
in force beyond its signed dates, or that a real authority issued it: the issuer keys are SIMULATED.

## Licences of what this adds

| Item | Use | Licence |
|---|---|---|
| PP-OCRv5 Devanagari recogniser (ONNX, RapidOCR model zoo v3.10.0) | OCR at runtime, fetched with pinned SHA-256 | Apache-2.0 |
| Noto Sans Devanagari v2.007 (Regular, Bold) | drawing the synthetic bilingual fixture, fetched with pinned SHA-256 | SIL Open Font License 1.1 (OFL.txt saved next to the fonts) |
| uharfbuzz 0.56 (bundles HarfBuzz) | shaping Devanagari for the fixture (dev dependency) | Apache-2.0 (HarfBuzz: Old MIT) |
| fontTools 4.67 | reading glyphs and writing the renamed legacy-cmap font copy (dev dependency) | MIT |
| Aileron Regular (bundled in Pillow) | text on the generated seals | CC0 1.0 |

The seals, emblem and every certificate are generated from seeds; nothing is copied from a real authority.
All data is synthetic.
