# Edits made with everyday tools

People who change a certificate rarely use forensic-grade tools. They open it in Microsoft Edge and use Add
text, draw a white box in a PDF reader, convert it to Word and back, print it to PDF, or photograph a printout.
This feature reproduces those edits on clean, issuer-signed fixtures, runs every one through the real pipeline
as an institution's re-upload, records which checks fire, and closes the gaps that showed up.

Every result here is an indicator for review, with an evidence class and a page region. Nothing here decides
anything, and no wording calls a document anything but "modified after signing", "re-created" or "needs review".

| Check | Finding code | Evidence class | Severity | Who sees it |
|---|---|---|---|---|
| Annotation drawn over a key value | `FX-ANNOT-OVER-FIELD` | structural | high | officials |
| Annotation drawn over other printed text | `FX-ANNOT-OVER-TEXT` | structural | medium when it shows text or was added after a signature, else low | officials |
| Annotations could not be analysed | `FX-ANNOT-UNREAD` | heuristic | low | officials |
| Issuer-signed document type with no issuer signature | `VER-ISSUER-SIGNATURE-ABSENT` | structural | medium | officials |
| Issuer-signed document type as a photo, scan or print | `FX-IMAGE-ONLY-ISSUER-DOC` | structural | medium | officials |
| Desktop editor or converter in the metadata (now matches Word and ignores symbols) | `FX-PDF-EDITOR-PRODUCER` | heuristic | low | officials |
| A value edited in place now reads as before and after | `FX-FIELD-OVERWRITTEN`, `FX-PDF-REVISION-TEXT-CHANGE` | structural | high | officials |

Institutions do not see these: they are forensic and verification indicators, which the API already trims for
institution accounts. Page images in the evidence viewer and the revision time machine now also draw form
fields, so the officer sees what the institution's file shows; annotations were already drawn. An annotation
finding links to the time machine at the revision that added it.

## The tamper lab

`backend/scripts/tamper_lab.py` takes three clean, issuer-signed certificates from the seeded fixtures and edits
one key value in each, the way a person would:

- A1's fire NOC: "Valid Up To" 11-03-2027 changed to 11-03-2029;
- A1's occupancy certificate: "Total Built-up Area" 14,650 changed to 18,650;
- A3's fire NOC, which expired on 30-09-2025: "Valid Up To" changed to 30-09-2027 (the live demo case).

| Method | How the lab makes it |
|---|---|
| Edge Add text | A FreeText annotation over the value, with `/DA`, `/DS`, `/RC`, `/IT /FreeTextTypeWriter`, `/F 4` (print) and an appearance stream in Helvetica at the printed size, appended as an incremental update. Edge's own save format could not be inspected here, so the same annotation is also saved with the whole file rewritten. |
| Reader comment tools | A Square annotation filled and stroked white over the value, then a text box with the new value. |
| Edge Draw plus Add text | A thick white Ink annotation over the value, then a text box. |
| Stamp | A custom stamp made from an image of the new value (Acrobat: Stamps, Custom, Create from image): the appearance is a JPEG, with no text. |
| Ink scribble | Blue zig-zag Ink strokes across the value. |
| Form field | A text field (Widget) over the value whose appearance shows the new value on white. |
| Word round-trip | Real: Microsoft Word 2024 opens the PDF through PDF Reflow, Find and Replace changes the value, Save As PDF. Driven through COM from PowerShell. |
| LibreOffice-style | Reproduced, as LibreOffice is not installed and a full install was not quick: the value replaced in the content stream, the file rewritten as a whole with Producer "LibreOffice 24.8" and Creator "Draw", the signature field and XMP dropped. LibreOffice's font substitution (Liberation fonts) is not reproduced. |
| Direct content edit | The shown string replaced in the page content stream, as an editor's Edit text does: once appended as an incremental update (a new content stream), once as a full save. Metadata is left as it was. |
| Print to PDF | The box-and-text edit rendered at 200 DPI into an image-only PDF with Producer "Microsoft: Print To PDF". |
| Photo of a printout | The box-and-text edit rendered at 170 DPI, put on a table background with a perspective warp, uneven light, a slight blur and sensor noise, saved as a JPEG. |

Run it on a seeded world:

```
cd backend
.venv/Scripts/python scripts/tamper_lab.py              # the variants, in fixtures/out/tamper_lab
.venv/Scripts/python scripts/tamper_lab.py --matrix     # and the matrix, in fixtures/out/tamper_lab/matrix.json
.venv/Scripts/python scripts/tamper_lab.py --live-demo  # the Edge live demo kit, in fixtures/out/live_demo
```

`--matrix` copies `var/` (database, documents, keys, simulated registries) to
`fixtures/out/tamper_lab/world` and works there, so the seeded world and its evaluation are untouched. For each
variant it does what an institution re-upload and a validation do: the intake check, a new document that
supersedes the current one of that type in the right application, the parser-sandboxed processing, and a full
validation run. It then records the findings and verification results tied to the new document, and restores
the original. A clean copy of each certificate is uploaded first; a variant counts as caught when it raises a
medium or high finding that the clean copy does not.

## The matrix

Measured on 23 Oct 2026, deterministic mode. "Shows new value" means a finding's message states the new value
(for example "the page shows '11-03-2029'"), so the officer learns what was changed, not only that something
was. The before column is the code at the start of this branch.

| # | Edit (tool) | Document | Before: medium or high signals | Before: shows new value | After: medium or high signals | After: shows new value |
|---|---|---|---|---|---|---|
| 1 | Clean issuer copy re-uploaded (control) | A1 fire noc | - | - | - | - |
| 2 | Edge Add text: FreeText annotation over the date, incremental save (Microsoft Edge, reproduced) | A1 fire noc | `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | no | `FX-ANNOT-OVER-FIELD`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | yes |
| 3 | Edge Add text, the whole file rewritten on save (Microsoft Edge, reproduced) | A1 fire noc | `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | no | `FX-ANNOT-OVER-FIELD`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | yes |
| 4 | White filled rectangle (Square) over the date plus a text box with the new date (Acrobat Reader comment tools, reproduced) | A1 fire noc | `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | no | `FX-ANNOT-OVER-FIELD`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | yes |
| 5 | Edge Draw in white over the date plus Add text (Microsoft Edge, reproduced) | A1 fire noc | `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | no | `FX-ANNOT-OVER-FIELD`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | yes |
| 6 | Custom stamp made from an image of the new date, placed over the date (Acrobat Reader Stamp tool, reproduced) | A1 fire noc | `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | no | `FX-ANNOT-OVER-FIELD`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | yes |
| 7 | Ink scribble over the date (Microsoft Edge Draw, reproduced) | A1 fire noc | `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | no | `FX-ANNOT-OVER-FIELD`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | no |
| 8 | Text form field (Widget with an appearance) over the date (form editor, reproduced) | A1 fire noc | `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | no | `FX-ANNOT-OVER-FIELD`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | yes |
| 9 | Word round-trip: open the PDF in Word, change the date, save as PDF (Microsoft Word, real) | A1 fire noc | `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes | `VER-ISSUER-SIGNATURE-ABSENT`, `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes |
| 10 | LibreOffice-style edit: full rewrite, date replaced, new Producer, signature dropped (LibreOffice, reproduced (not installed here)) | A1 fire noc | `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes | `VER-ISSUER-SIGNATURE-ABSENT`, `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes |
| 11 | Direct content edit: date replaced in the content stream, incremental save (PDF editor Edit text, reproduced) | A1 fire noc | `FX-FIELD-OVERWRITTEN`, `FX-PDF-REVISION-TEXT-CHANGE`, `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes | `FX-FIELD-OVERWRITTEN`, `FX-PDF-REVISION-TEXT-CHANGE`, `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes |
| 12 | Direct content edit: date replaced in the content stream, full save (PDF editor Edit text, reproduced) | A1 fire noc | `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes | `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes |
| 13 | Box and text edit, then printed to an image-only PDF (Microsoft Print to PDF, reproduced) | A1 fire noc | `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes | `FX-IMAGE-ONLY-ISSUER-DOC`, `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes |
| 14 | Box and text edit, printed and photographed (perspective, blur, JPEG noise) (phone camera, reproduced) | A1 fire noc | `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes | `FX-IMAGE-ONLY-ISSUER-DOC`, `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-SIGNED_QR-MISMATCH_DETECTED` | yes |
| 15 | Clean issuer copy re-uploaded (control) | A1 occupancy certificate | - | - | - | - |
| 16 | Edge Add text: FreeText annotation over the built-up area, incremental save (Microsoft Edge, reproduced) | A1 occupancy certificate | `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | no | `FX-ANNOT-OVER-FIELD`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | yes |
| 17 | White filled rectangle over the area plus a text box with the new area (Acrobat Reader comment tools, reproduced) | A1 occupancy certificate | `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | no | `FX-ANNOT-OVER-FIELD`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | yes |
| 18 | Direct content edit of the area, full save (PDF editor Edit text, reproduced) | A1 occupancy certificate | `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | yes | `VER-ISSUER_REGISTRY-MISMATCH_DETECTED`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | yes |
| 19 | Box and text edit of the area, then printed to an image-only PDF (Microsoft Print to PDF, reproduced) | A1 occupancy certificate | `VER-ISSUER_REGISTRY-MISMATCH_DETECTED` | yes | `FX-IMAGE-ONLY-ISSUER-DOC`, `VER-ISSUER_REGISTRY-MISMATCH_DETECTED` | yes |
| 20 | Clean, expired issuer copy re-uploaded (control) | A3 fire noc | - | - | - | - |
| 21 | Expired certificate: Edge Add text puts a later date over the expiry, incremental save (Microsoft Edge, reproduced) | A3 fire noc | `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | no | `FX-ANNOT-OVER-FIELD`, `VER-ISSUER_SIGNATURE-MISMATCH_DETECTED` | yes |

What fires after the fixes, beyond the clean copy (all severities). The signature, QR and registry columns are
the verification status of the uploaded file:

| # | Edit | Issuer signature | Signed QR | Registry | Text read by | font | revision diff | overlay | white box | metadata | annotation | issuer copy |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | fire_clean | verified | verified | verified | digital | - | - | - | - | - | - | - |
| 2 | fire_edge_add_text | mismatch | verified | verified | digital | - | - | - | - | - | FX-ANNOT-OVER-FIELD (high) | - |
| 3 | fire_edge_add_text_full | mismatch | verified | verified | digital | - | - | - | - | - | FX-ANNOT-OVER-FIELD (high) | - |
| 4 | fire_box_and_text | mismatch | verified | verified | digital | - | - | - | - | - | FX-ANNOT-OVER-FIELD (high) | - |
| 5 | fire_white_ink_and_text | mismatch | verified | verified | digital | - | - | - | - | - | FX-ANNOT-OVER-FIELD (high) | - |
| 6 | fire_stamp | mismatch | verified | verified | digital | - | - | - | - | - | FX-ANNOT-OVER-FIELD (high) | - |
| 7 | fire_ink_scribble | mismatch | verified | verified | digital | - | - | - | - | - | FX-ANNOT-OVER-FIELD (high) | - |
| 8 | fire_form_field | mismatch | verified | verified | digital | - | - | - | - | - | FX-ANNOT-OVER-FIELD (high) | - |
| 9 | fire_word | none | mismatch | mismatch | mixed | - | - | - | - | FX-PDF-EDITOR-PRODUCER (low) | - | VER-ISSUER-SIGNATURE-ABSENT (medium) |
| 10 | fire_libreoffice | none | mismatch | mismatch | digital | - | - | - | - | FX-PDF-EDITOR-PRODUCER (low) | - | VER-ISSUER-SIGNATURE-ABSENT (medium) |
| 11 | fire_content_incremental | mismatch | mismatch | mismatch | digital | - | FX-FIELD-OVERWRITTEN (high), FX-PDF-REVISION-TEXT-CHANGE (high) | - | - | - | - | - |
| 12 | fire_content_full | mismatch | mismatch | mismatch | digital | - | - | - | - | - | - | - |
| 13 | fire_print_to_pdf | none | mismatch | mismatch | ocr | - | - | - | - | FX-PDF-EDITOR-PRODUCER (low) | - | FX-IMAGE-ONLY-ISSUER-DOC (medium) |
| 14 | fire_photo | none | mismatch | mismatch | ocr | - | - | - | - | - | - | FX-IMAGE-ONLY-ISSUER-DOC (medium) |
| 15 | oc_clean | verified | not found | verified | digital | - | - | - | - | - | - | - |
| 16 | oc_edge_add_text | mismatch | not found | verified | digital | - | - | - | - | - | FX-ANNOT-OVER-FIELD (high) | - |
| 17 | oc_box_and_text | mismatch | not found | verified | digital | - | - | - | - | - | FX-ANNOT-OVER-FIELD (high) | - |
| 18 | oc_content_full | mismatch | not found | mismatch | digital | - | - | - | - | - | - | - |
| 19 | oc_print_to_pdf | none | not found | mismatch | ocr | - | - | - | - | FX-PDF-EDITOR-PRODUCER (low) | - | FX-IMAGE-ONLY-ISSUER-DOC (medium) |
| 20 | expired_clean | verified | expired | expired | digital | - | - | - | - | - | - | - |
| 21 | expired_edge_add_text | mismatch | expired | expired | digital | - | - | - | - | - | FX-ANNOT-OVER-FIELD (high) | - |

`matrix.json` holds every finding message and the field values read; `docs/features/edits-matrix.json` keeps
both runs in compact form.

## What the matrix showed

- **Comment-tool edits were caught but not explained.** Every annotation edit broke the issuer signature
  ("modified after signing"), and nothing else fired. Text extraction reads the content stream, not
  annotations, so the extracted value, the signed QR comparison and the issuer registry all saw the printed
  value and reported it as verified, while the page in any viewer showed the new value. On a document without
  a signature nothing would have fired at all, since the edit changes no text the checks read (every source in
  the lab is signed, so that case follows from the code rather than from a run).
- **Re-created files carried no indicator of their own.** The Word, LibreOffice-style, print and photo copies
  were caught only because the issuer-signed QR and the simulated registry disagreed with the new value. The
  missing issuer signature raised nothing, and Word's Producer "Microsoft® Word 2024" was not on the editor
  list. Without a signed QR or a registry entry, these copies would have raised nothing above a low metadata
  note.
- **The OCR path already compared values.** For the printed and photographed copies, the values read by OCR
  were compared with the signed QR (decoded from the image) and with the registry, and both reported the new
  date. Nothing needed fixing there; the image-only copy now also says so in its own finding.
- **An in-place edit was misdescribed.** A direct content edit changes one glyph ("7" to "9"), so the revision
  diff said "drew '9' over that position" and "checks use the original '11-03-2029'", which was wrong. It now
  says the value read 11-03-2027 and reads 11-03-2029.
- **Form fields were invisible to the officer.** PDFium draws widgets only when forms are initialised, so a form
  field drawn over the date showed the old date in Pramana's page image while every viewer showed the new one.
  Page renders now initialise forms.

## 1. Annotations over a value (`FX-ANNOT-OVER-FIELD`, `FX-ANNOT-OVER-TEXT`)

**What it does.** `forensics/annotations.py`, run in the parser sandbox as the `annotations` operation:

1. Reads every annotation on the first five pages with pikepdf and keeps the kinds whose appearance can hide or
   replace what is under it: FreeText, Square, Circle, Polygon, PolyLine, Line, Ink, Stamp, Redact, and Widgets
   that are not signature fields. Links, Popups, sticky-note icons, highlights, underlines and strike-outs are
   ignored, as are hidden annotations and those shown neither on screen nor in print.
2. Finds the revision that added each one, by opening the file at each `%%EOF` and matching annotations by
   page, type and rectangle, and places it before or after each signature's `/ByteRange`.
3. Draws each page three ways with PDFium: with annotations, without them, and the annotations alone on an
   emptied page. An annotation covers a value when its rectangle covers at least 30% of the value's box and at
   least 2% of the pixels there change or are painted. So a white box over text counts, and a box over empty
   paper does not.
4. Reads what the annotation shows by flattening the annotations alone into the emptied page and extracting
   the glyphs (only annotations whose appearance draws text claim them); otherwise the annotation's own text
   (`/Contents`, `/RC`, a field's `/V`); for an image stamp, OCR of the stamp alone.
5. Reports each covered key value once, high: "On page 1 the page shows '11-03-2029' in a text box annotation
   (FreeText) drawn over the printed '11-03-2027' (valid until), together with a rectangle annotation (Square)
   covering the printed value. The annotations were added in revision 3, after the signature 'IssuerSignature'
   (revision 2). Text extraction, the signed QR comparison and the issuer registry read the printed
   '11-03-2027'; a person reading the file sees '11-03-2029'." Evidence: the annotation's region and the printed
   value's region. Annotations over other printed text are `FX-ANNOT-OVER-TEXT`.

When the file was rewritten as a whole after signing, the signature's byte range no longer ends at a revision
boundary; the finding then says it cannot place the annotation before or after signing.

**What it proves.** That the file, as any viewer shows it, displays something other than its printed text at
that spot, what that is, and in which saved revision it appeared.

**What it does not prove.** Who added the annotation, or why. Reviewers annotate files and issuers sometimes
stamp their own; an annotation saved before an issuer signature may be the issuer's. The remedy is the
issuer's original.

## 2. No issuer signature (`VER-ISSUER-SIGNATURE-ABSENT`)

**What existed.** Signer classification already separated issuer from applicant signatures, and recorded a
`not_checked` issuer signature when there was none, but `not_checked` never becomes a finding.

**What it does.** `verification/issuer_copy.py`, called once per document in the verification stage. For a
document type whose ruleset entry names `issuer_signers` (the fire NOC and the occupancy certificate), when no
issuer signature is present at all, it raises a medium indicator: "The Fire Safety Certificate is issued as a
PDF signed by the issuing authority (Fire and Emergency Services), but this file carries only the applicant's
own signature (...). No issuer signature: the file may have been re-created; ask for the issuer's original."
When the Producer or Creator names a desktop editor or converter, the message names it. It also states what
the values were compared with and the result (signed QR, issuer registry). A present but broken issuer
signature is left to the signature check, which already reports it.

**Seeded effect.** A5 (retyped fire NOC signed with the applicant's DSC) and A8 (fabricated fire NOC with the
applicant chairman's DSC) now carry it; the manifest expects it, so the planted conditions go from 51 to 53.

**What it does not prove.** That the content differs from the issuer's. Saving a signed file in any editor
drops the signature without changing a word, and some issuers still send unsigned PDFs. Where an issuer does
not sign, its document type should not list `issuer_signers`.

## 3. Image-only copy (`FX-IMAGE-ONLY-ISSUER-DOC`)

For the same document types, a photo or scanned image, or a PDF with no fonts at all whose pages had to be
read by OCR, and with no issuer signature, raises one medium indicator in place of the one above: "this copy
arrived as an image-only PDF, as a scan or a print to PDF produces: it has no text layer and no issuer
signature. Its metadata names 'Microsoft: Print To PDF'. Its values were read by OCR and compared with the
issuer-signed QR (mismatch detected) and the issuer registry (mismatch detected)."

**What it does not prove.** An issuer may hand out a scan, and a photo of an untouched paper certificate looks
the same. Only the registry, the signed QR or the original confirm the values.

## 4. Editor in the metadata (`FX-PDF-EDITOR-PRODUCER`)

The existing low indicator now matches names after removing case, punctuation and symbols, so "Microsoft® Word
2024" and "Microsoft: Print To PDF" match, and the list gains Word, OpenOffice, WPS Office and online tools
(PDF24, Online2PDF, PDF Candy, Soda PDF, PDF2Go, DocFly) next to iLovePDF, Smallpdf and Sejda. It stays low on
its own: metadata is easy to strip or set. On an issuer document without an issuer signature, the
`VER-ISSUER-SIGNATURE-ABSENT` or `FX-IMAGE-ONLY-ISSUER-DOC` message names the editor, which carries the medium
weight.

## 5. Values edited in place

`diff_revisions` now records the whole words at a changed spot before and after the revision. When glyphs were
removed and nothing lies underneath (an edit in place, not a cover-and-overwrite), `FX-FIELD-OVERWRITTEN` says
"Revision 3 changed the valid until in place: it read '11-03-2027' and now reads '11-03-2029'", and
`FX-PDF-REVISION-TEXT-CHANGE` adds the same before and after. The A7 cover-and-overwrite message is unchanged.

## Evaluation

`scripts/evaluate.py` on a fresh `make_fixtures.py` and `seed.py`, deterministic mode, 23 Oct 2026:

| | Before | After |
|---|---|---|
| Planted conditions found | 51 of 51 | 53 of 53 (adds `VER-ISSUER-SIGNATURE-ABSENT` on A5 and A8) |
| False positives | 0 | 0; no annotation, image-only or editor finding on any seeded document |
| Fields extracted | 323 of 328 | 323 of 328 |
| Validation time per application | mean 1.09 s | mean 1.16 s, max 1.34 s (shared laptop) |
| Benign controls | 5, all clean | 8, all clean: the original five plus a link over a value, a highlight over a value and a comment away from the values |
| Everyday-editor controls | none | 18 edits, all caught; 17 of 18 state the new value (the ink scribble has none); the 3 clean copies stay clean |
| Automated tests | 73 | 86: the 73 existing ones and 13 in `tests/test_edits.py` |

The everyday-editor controls run the whole tamper lab matrix (about 1 minute 45 seconds including the Word
round-trip); `--skip-editors` leaves them out. The annotation scan costs nothing on a file without annotations
(it stops after listing them) and about 0.1 to 0.6 s on the lab's annotated files; an image stamp adds an OCR
call, about 3 s when the OCR model is not yet loaded in the worker.

## Live demo kit

`python scripts/tamper_lab.py --live-demo` writes `fixtures/out/live_demo/`:

- `A3_fire_noc_clean.pdf`: A3's issuer-signed fire certificate, byte for byte as seeded (expired 30-09-2025);
- `A3_fire_noc_edge_reproduction.pdf`: the lab's reproduction of Edge's Add text, for rehearsal or as a fallback;
- `README.md`: the presenter's steps.

Run it after the last `make_fixtures.py` and `seed.py`, on the machine that serves the demo: the demo keys
change on every fixture run. The steps:

1. Copy the clean file to `A3_fire_noc_edited.pdf` and open the copy in Microsoft Edge.
2. Add text, click exactly on the printed date after "Valid Up To:", type 30-09-2027 at about the printed size,
   black. Optionally paint over the old date with Draw in white first. Ctrl+S.
3. Officer (`officer`): A3, Request rectification, select the fire certificate finding, send.
4. Institution (`inst3`): open the application, drop the edited file on the Fire Safety Certificate slot,
   Submit.
5. Officer: "Valid until covered by an annotation" (high) says the page shows 30-09-2027 drawn over the printed
   30-09-2025, added in revision 3 after the issuer signature; the issuer signature reports a modification
   after signing; the expiry findings remain, because the rule, the QR and the registry read 30-09-2025.

`test_edits.py` runs this path through the API with the reproduction. **A real Edge edit has not been tested
here** (Edge's interface cannot be scripted); please make one before the demo. If Edge rewrites the whole file
instead of appending, the finding says so and is still raised; if Edge wrote no appearance stream, the
annotation's own text is used and the page image would not show it.

## Limitations and what still slips through

- **Edge is reproduced, not observed.** The lab's FreeText follows the PDF specification and Acrobat's
  typewriter annotations. Edge may differ in fonts, flags, appearance or save mode; the check reads appearance
  glyphs, falls back to the annotation's text, and handles both incremental and full saves.
- **Placement matters.** An annotation next to a value, rather than over it, is not tied to the value. If it
  lies over other printed text it is `FX-ANNOT-OVER-TEXT`; on blank paper it raises nothing of its own, and only
  a broken signature reports the change.
- **Unsigned documents without a QR or registry entry.** An annotation over a value is still reported, but a
  document re-created in Word with no signature, no signed QR and no registry entry raises only the
  no-issuer-signature indicator, which cannot say what changed.
- **Flattened edits.** A tool that burns annotations into the page content leaves an ordinary text or image
  change: a revision diff, overlay or white box if saved incrementally, and otherwise only the QR, the registry
  or the missing signature.
- **Photos.** OCR on the synthetic photo read every field but the issue date; real phone photos will be worse,
  and a QR that cannot be decoded means no QR comparison. Handwriting drawn with Ink is not read (OCR of
  scribbles produced noise, so Ink shows no value).
- **Scope of the scan.** First five pages; rotated pages are not handled; an annotation on a page whose fields
  were not extracted can only be `FX-ANNOT-OVER-TEXT`.
- **The ruleset decides which types are issuer-signed.** Today the fire NOC and the occupancy certificate. A
  state whose fire service issues unsigned PDFs would see `VER-ISSUER-SIGNATURE-ABSENT` on every copy until its
  configuration changes.
- **LibreOffice was reproduced**, not run; its font substitution might add a font indicator in reality.
- **Synthetic data.** Three certificates, one layout family, one edited value each. The matrix shows the checks
  work on these edits; it is not a measured detection rate.

## Files

- New: `backend/pramana/forensics/annotations.py`, `backend/pramana/verification/issuer_copy.py`,
  `backend/scripts/tamper_lab.py`, `backend/tests/test_edits.py`, `docs/features/edits.md`,
  `docs/features/edits-matrix.json`.
- Shared files, small additive edits: `pramana/sandbox.py` and `sandbox_worker.py` (the `annotations`
  operation), `pipeline/process.py` (calls it), `pipeline/validate.py` (calls `issuer_copy`, in-place wording),
  `pipeline/text.py` (renders initialise forms), `forensics/pdf_struct.py` (editor names, before and after
  words), `scripts/make_fixtures.py` (A5 and A8 expect the new indicator), `scripts/evaluate.py` (controls),
  `frontend/src/pages/application/history/TimeMachine.tsx` (time machine link).
