# Scan link: verify a certificate from any phone camera

Issuer-signed QR codes now carry a link instead of a bare token. Point any phone camera at the certificate, tap the link it offers, and the public scan page opens and checks the signature at once. Nothing to install and no photo to upload.

The photo, upload and drag-and-drop path of `/scan` is unchanged, and bare-token QR codes printed before this change still verify everywhere.

## 1. What the QR holds

```
{PRAMANA_PUBLIC_BASE_URL}/scan#t={JWS}
```

For example `http://192.168.0.103:8000/scan#t=eyJhbGciOiJFZERTQSIs...`. The token is the same compact JWS as before: EdDSA over Ed25519 (RFC 7515 and RFC 8037), with the certificate number, holder, issue date and validity in its payload.

Every place that reads a QR accepts both forms:
- the bare token, as before;
- a link carrying `t` in the fragment (`#t=`), which is the printed form;
- a link carrying `t` in the query (`?t=`), accepted for robustness. When both are present, the fragment wins.

A link without `t`, or with a `t` that is not a signed token, is treated like any other unsigned QR: "not signed", nothing to verify.

The forms are handled in one place, `pramana.verification.signed_qr`:
- `scan_link(token)` builds the link from the setting;
- `link_parts(text)` returns the token and the host the link points at;
- `verify_token()` accepts either form.

So the document pipeline (the sandbox `qr` op, then `validate.py`), the public photo scan, the token endpoint and the registry lookup all take links without further changes.

## 2. Trust model

The decision comes only from the signature, checked against the issuer keys this service publishes (`var/sim/issuer_keys.json`, all SIMULATED in the prototype). The host in the link is:
- never trusted: the same token verifies identically behind any host, and a tampered token fails behind any host;
- never fetched or contacted;
- reported back, as `link_host`, so a person can judge it. When a photographed QR turns out to be a link, the result says where it points and that Pramana did not open it.

The link itself proves nothing. Anyone can print a QR that links to a lookalike page that shows "verified" for anything. The result page says so plainly:

> The link only carries the data. The issuer's signature, checked against its published key, is what proves it. A link can point anywhere, so in production make sure this page is on the issuer's or AICTE's official domain.

The page also shows the host it is running on, tagged as the prototype server.

What a verified signature does not prove is unchanged from the photo path: the paper may differ from the signed values, which is why the comparison step stays; the issuer may have withdrawn the certificate; and nothing is said about the premises. See `docs/features/forensics.md`, section 4.

## 3. Why the token rides in the fragment

The part after `#` is never sent in an HTTP request. Opening the link therefore:
- requests only `/scan`, so the token never appears in the server's access log, a proxy's log or any analytics on the page request;
- leaves the token out of `Referer` headers, since browsers strip fragments from referrers (the server also sends `Referrer-Policy: no-referrer`).

The page reads the token in the browser and sends it once, in the body of `POST /api/public/scan/token`. The audit trail records only its SHA-256.

The token is not secret, since it is printed on the paper. The fragment keeps the certificate's contents out of logs that nobody asked to keep. The `?t=` form gives up that property, so issuers should print the fragment form.

## 4. The token endpoint

`POST /api/public/scan/token` with JSON `{"token": "<link or bare JWS>"}`.

**Response.** The same shape and states as `POST /api/public/scan`:
- statuses: verified, expired, not yet valid, bad signature, unknown key, unsupported, not signed;
- the same `results` entries, plus `"source": "link"` and `token_sha256` in place of `image_sha256`.

Both endpoints now add `link_host` to each result. The photo endpoint also returns `"source": "image"`.

**Limits.**
- No login and no cookies.
- The body is read as a stream and refused with 413 past 8 KB, and the token past 4096 characters.
- An empty token or malformed JSON gets 422.
- Rate limits: 30 checks a minute per client, plus the 600 a minute shared with photo scans (`pramana.ratelimit`).

**Audit.** The event is `public.scan_token` with `{sha256, form, status, kid}`:
- `sha256` is the hash of the bare token;
- `form` is `link` or `token`.

The token itself is never written.

## 5. The scan page

Opening `/scan#t=...`:
1. The page reads `t` from the fragment, or from the query if the fragment has none, and checks it straight away. A skeleton result says "Checking the signature" while the check runs.
2. The usual result follows: the verdict, signer, validity track, "Compare with the paper", what it proves and does not prove, and the simulated registry lookup. A "The link only carries the data" panel sits under the verdict, and the footer shows the token fingerprint ("Link not stored").
3. A link with an empty `t` explains that the link carries no token and offers the photo path. A link whose `t` is not a signed token shows "Nothing signed in this link".
4. **Check another certificate by photo** clears the token from the address bar, so a reload starts a fresh scan, and returns to the photo intake. A new link opened in the same tab (`hashchange`) is checked as well.

**Layout.**
- On a phone (390 x 844), the verdict starts right under a short heading, with no camera block above it.
- On a desktop, the left column shows a small "From the QR link" frame with the photo buttons beneath it.

## 6. QR density and decoding

**Density.** The link adds about 33 characters: a fire NOC token of 337 characters becomes a link of about 370.

| | Before | Now |
|---|---|---|
| Content | bare token, 337 bytes | link, about 370 bytes |
| Error correction | L (7%) | M (15%) |
| Version and modules | 12, 65 x 65 | 15, 77 x 77 |
| Printed size | 140 pt | 170 pt |
| Module size | about 0.72 mm | about 0.74 mm |

M survives smudges, creases and glare on paper. The larger print keeps the module size where it was, so the denser code is no harder to read.

The layout still fits:
- on the fire NOC, the code sits right-aligned beside the seal, clear of the signature and the text;
- on the NBA letter, it sits under the text.

The caption under the code now reads "Scan with a phone camera to verify (issuer-signed)".

**Measured.** A fire NOC was rendered with each setting and degraded like a phone photo (perspective warp, blur, uneven light, sensor noise, JPEG at quality 80), then read with the scan page's decoder:

| Setting | Module | Pipeline (PDF) | Photos, blur sigma up to 2 | Photos, blur sigma 3 | Screenshot 400 px wide |
|---|---|---|---|---|---|
| Link, L, 140 pt | 0.68 mm | yes | 20 of 20 | 0 of 4 | yes (fails at 430) |
| Link, M, 140 pt | 0.61 mm | yes | 20 of 20 | 0 of 4 | no |
| Link, M, 160 pt | 0.70 mm | yes | 20 of 20 | 0 of 4 | yes |
| **Link, M, 170 pt (chosen)** | 0.74 mm | yes | 20 of 20 | 3 of 4 | yes |
| Link, L, 170 pt | 0.82 mm | yes | 20 of 20 | 3 of 4 | yes |

The regenerated fixtures were then checked QR by QR: see section 8.

**Low-resolution images.** A certificate exported from an editor or captured as a screenshot at about 470 px wide draws a dense QR at under two pixels per module, and no detector reads it. A real upload of this kind came back with no QR at all. `decode_qr` now retries such images:
- at 2x, 3x and 4x with bicubic upscaling, and Otsu-binarised;
- only while the upscaled long side stays within 4000 px, so large pages and photos cost nothing extra.

Transparent PNGs are flattened on white first.

PDF pages are still rendered at 150, 220 and 300 DPI. A low-resolution image placed on the page, such as a screenshot saved as PDF, is only smoothed by rendering, so the pipeline now also decodes images drawn at under 150 DPI at their own pixels. The real upload, a 468 x 664 PNG, now decodes in about 0.6 s in the pipeline.

## 7. Demo: set the address and regenerate

The address is baked into every printed QR, so set it before generating the fixtures:

```powershell
cd backend
$env:PRAMANA_PUBLIC_BASE_URL = "http://192.168.0.103:8000"   # the laptop's Wi-Fi IPv4 from ipconfig
.venv\Scripts\python scripts\make_fixtures.py
.venv\Scripts\python scripts\seed.py
.venv\Scripts\python -m uvicorn pramana.main:app --host 0.0.0.0 --port 8000
```

You can instead put `PRAMANA_PUBLIC_BASE_URL=http://192.168.0.103:8000` in `backend/.env`.

`make_fixtures.py` also makes new issuer keys and demo trust anchors, so always reseed and restart the server after it. Then print or show `fixtures/out/scan/scan_samples.pdf` or any fire NOC or NBA letter. The PNGs in `fixtures/out/scan/` hold the bare QR codes.

**On the phone**, which must be on the same Wi-Fi:
1. Open the camera and point it at the QR. The camera offers the link (`192.168.0.103`). Tap it.
2. The browser opens `/scan`, shows "Checking the signature" for a moment, then the verdict: "Signature verified" with the signed values, "Signature verified, validity ended" for sample 3, or "Signature does not match" for sample 4.

The browser may mark plain `http` as not secure. That is expected on the LAN.

**If the laptop's address changes** (a new network, or DHCP hands out another IP):
- printed QR codes still point to the old address, so regenerate the fixtures with the new address, reseed, restart and reprint;
- a DHCP reservation on the router keeps the address stable between rehearsals and the demo;
- a sheet printed from an older fixture run fails either way, because its tokens were signed with keys that no longer exist.

## 8. Tests and evaluation

`backend/tests/test_scan_link.py` covers:
- the bare form, the `#t=` and `?t=` forms, fragment precedence and links without a token;
- a tampered token inside a link, and the same token behind different hosts;
- every state of the token endpoint, its 413 and 422 answers, the hash-only audit and the rate limit;
- the registry lookup taking a link;
- a perspective-warped, blurred photo of a link QR through the photo endpoint, which verifies, and of a tampered one, which gives bad signature;
- a 468 px screenshot whose QR fails without the upscaled retry and decodes with it, as a PNG and embedded in a PDF;
- a link QR's signed values compared with printed ones, where the edited validity date is flagged.

The full suite passes (80 tests). With the regenerated fixtures, the deterministic evaluation still finds 51 of 51 planted conditions with 0 false positives.

Every QR in the regenerated fixtures was also checked one by one: 11 documents (fire NOCs, A1's NBA letter and A3's renewed NOC) plus the 5 pages of `scan_samples.pdf`.
- All 16 decode in the pipeline as links.
- All 64 phone-like photos decode through the scan page's decoder: 4 framings per code, from close-up to the whole page at 1000 to 1200 px, each with perspective warp, blur sigma 1 to 2.5, uneven light, noise and JPEG.
- All 32 whole-page screenshots at 468 and 600 px wide decode.
- All 5 scan sample PNGs decode.

## 9. Limitations

- **The host is not authenticated.** A swapped sticker or a lookalike site can show anything, which is why the page tells people to check the domain. In production the page must be served over HTTPS from the issuer's or AICTE's official domain. Someone in doubt can open that known page and photograph the QR there; the check does not depend on where the link points.
- **The address is printed.** Moving the server needs a reprint. Production needs a stable domain, not a LAN address.
- **History.** The token stays in the phone's browser history with the link. It is not secret (it is printed on the paper), but it is there.
- **Size and blur.** The denser code needs the larger print. Prints smaller than 170 pt, heavily blurred photos (blur sigma 4 failed in every setting measured) and screenshots narrower than about 400 px can still fail; the photo path then says no QR was found.
- **Cost.** The upscaled retry adds up to about 2 s for a small image that has no QR. It is bounded by the 4000 px cap.
- **The `?t=` form.** It is accepted, but it would reach server logs. Only the fragment form is printed.
- **What the signature covers.** As before, a verified link proves that the issuer signed the data. It proves nothing about the paper, about later withdrawal, or that a real authority issued anything: the issuer keys are SIMULATED.
