"""Tamper lab: certificate edits made the way everyday tools make them.

Takes clean, issuer-signed certificates from the seeded fixtures and writes edited copies to
fixtures/out/tamper_lab, with variants.json describing how each was made:
- Edge "Add text" (a FreeText annotation with an appearance stream, incremental save, and the same with the
  whole file rewritten), a filled white rectangle plus a text box, white ink plus a text box, an image stamp,
  an ink scribble and a form field drawn over the value;
- a real Microsoft Word round-trip (open the PDF, change the text, save as PDF), when Word is installed;
- a LibreOffice-style edit (full rewrite, text replaced, new Producer, signature dropped), reproduced because
  LibreOffice is not installed here;
- a direct content edit saved incrementally and as a full save;
- the edited page printed to an image-only PDF, and photographed as a printout (JPG).

With --matrix every variant is uploaded into its application in a copy of the seeded world, as an institution
re-upload, processed and validated by the real pipeline; the findings and verification results per variant go
to fixtures/out/tamper_lab/matrix.json (or --out). The seeded world in var/ is not touched.

    python scripts/make_fixtures.py; python scripts/seed.py   # once
    python scripts/tamper_lab.py                              # variants only
    python scripts/tamper_lab.py --matrix [--out path.json]   # variants, then the matrix
    python scripts/tamper_lab.py --live-demo                  # the Edge live demo kit in fixtures/out/live_demo
"""

import argparse
import io
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
FIX = ROOT / "fixtures" / "out"
LAB = FIX / "tamper_lab"
WORLD = LAB / "world"
LITERAL_RE = re.compile(rb"\((?:[^()\\]|\\.)*\)")

# What each source certificate is, and the edit a person would make to it
SOURCES = {
    "a1_fire": {"app": "A1", "type": "fire_noc", "file": "A1/fire_noc.pdf", "label": "Valid Up To",
                "field": "valid_until", "old": "11-03-2028", "new": "11-03-2029"},
    "a1_oc": {"app": "A1", "type": "occupancy_certificate", "file": "A1/occupancy_certificate.pdf",
              "label": "Total Built-up Area", "field": "built_up_area_sqm", "old": "14,650", "new": "18,650"},
    "a3_fire": {"app": "A3", "type": "fire_noc", "file": "A3/fire_noc.pdf", "label": "Valid Up To",
                "field": "valid_until", "old": "30-09-2025", "new": "30-09-2027"},
}


# ---------------------------------------------------------------- locating the printed value


def locate(data: bytes, label: str, value: str) -> dict:
    """Page geometry of `value` on the line that starts with `label` (page 1, PDF coordinates)."""
    import pdfplumber

    with pdfplumber.open(io.BytesIO(data)) as pdf:
        page = pdf.pages[0]
        words = page.extract_words(extra_attrs=["fontname", "size"])
        lab = next(w for w in words if label.split()[0] in w["text"] and w["fontname"].endswith("Bold")
                   and any(label.split()[-1].rstrip(":") in v["text"] for v in words
                           if abs(v["top"] - w["top"]) < 1))
        hit = next(w for w in words if w["text"] == value and abs(w["top"] - lab["top"]) < 1)
        chars = [c for c in page.chars if hit["x0"] - 0.1 <= c["x0"] and c["x1"] <= hit["x1"] + 0.1
                 and abs(c["top"] - hit["top"]) < 1]
        h = float(page.height)
        return {"x0": hit["x0"], "x1": hit["x1"], "top": hit["top"], "bottom": hit["bottom"], "size": hit["size"],
                "font": hit["fontname"], "baseline": chars[0]["matrix"][5], "page_h": h}


def text_width(text: str, size: float) -> float:
    from reportlab.pdfbase.pdfmetrics import stringWidth

    return stringWidth(text, "Helvetica", size)


def pdf_date(dt: datetime | None = None) -> str:
    return (dt or datetime.now(UTC)).strftime("D:%Y%m%d%H%M%S+00'00'")


# ---------------------------------------------------------------- annotations, the way comment tools write them


def _g():
    from pyhanko.pdf_utils import generic

    return generic


def _name(n: str):
    return _g().NameObject(n)


def _num(v: float):
    g = _g()
    return g.FloatObject(round(v, 3)) if isinstance(v, float) else g.NumberObject(v)


def _arr(vals):
    return _g().ArrayObject([_num(v) for v in vals])


def _form(w, bbox: list[float], content: bytes, resources: dict | None = None):
    """An appearance stream: a Form XObject drawn into the annotation's /Rect."""
    g = _g()
    d = {_name("/Type"): _name("/XObject"), _name("/Subtype"): _name("/Form"), _name("/BBox"): _arr(bbox),
         _name("/Resources"): g.DictionaryObject(resources or {})}
    s = g.StreamObject(d, stream_data=content)
    s.compress()
    return w.add_object(s)


def _helv(w):
    g = _g()
    return w.add_object(g.DictionaryObject({
        _name("/Type"): _name("/Font"), _name("/Subtype"): _name("/Type1"), _name("/BaseFont"): _name("/Helvetica"),
        _name("/Encoding"): _name("/WinAnsiEncoding")}))


def _common(page_ref, rect: list[float], subtype: str, flags: int = 4) -> dict:
    g = _g()
    now = pdf_date()
    return {_name("/Type"): _name("/Annot"), _name("/Subtype"): _name(subtype), _name("/Rect"): _arr(rect),
            _name("/F"): g.NumberObject(flags), _name("/P"): page_ref, _name("/M"): g.TextStringObject(now),
            _name("/CreationDate"): g.TextStringObject(now), _name("/NM"): g.TextStringObject(str(uuid.uuid4())),
            _name("/T"): g.TextStringObject("User")}


def free_text(w, page_ref, loc: dict, text: str, size: float | None = None) -> dict:
    """Edge "Add text" and Acrobat's typewriter tool: a FreeText annotation with /DA, /DS, /RC and an /AP."""
    g = _g()
    size = size or loc["size"]
    x0, base = loc["x0"] - 2, loc["baseline"]
    rect = [x0, base - 4, x0 + text_width(text, size) + 4, base + size + 1]
    wd, ht = rect[2] - rect[0], rect[3] - rect[1]
    font = _helv(w)
    ap = _form(w, [0, 0, wd, ht], f"/Tx BMC q BT 0 0 0 rg /Helv {size:g} Tf 1 0 0 1 2 4 Tm ({text}) Tj ET Q EMC"
               .encode(), {_name("/Font"): g.DictionaryObject({_name("/Helv"): font})})
    d = _common(page_ref, rect, "/FreeText")
    d.update({
        _name("/Contents"): g.TextStringObject(text),
        _name("/DA"): g.TextStringObject(f"0 0 0 rg /Helv {size:g} Tf"),
        _name("/DS"): g.TextStringObject(f"font: Helvetica,sans-serif {size:g}pt; text-align:left; color:#000000"),
        _name("/RC"): g.TextStringObject(
            '<?xml version="1.0"?><body xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/'
            f'xfa-data/1.0/" xfa:APIVersion="Acrobat:23.0.0" xfa:spec="2.0.2"><p>{text}</p></body>'),
        _name("/IT"): _name("/FreeTextTypeWriter"),
        _name("/BS"): g.DictionaryObject({_name("/W"): g.NumberObject(0)}),
        _name("/AP"): g.DictionaryObject({_name("/N"): ap}),
    })
    return d


def white_square(w, page_ref, loc: dict, pad: float = 1.5) -> dict:
    """Acrobat Reader's rectangle tool with fill and border set to white."""
    g = _g()
    rect = [loc["x0"] - pad, loc["baseline"] - 3.5, loc["x1"] + pad, loc["baseline"] + loc["size"] + 0.5]
    wd, ht = rect[2] - rect[0], rect[3] - rect[1]
    ap = _form(w, [0, 0, wd, ht], f"1 1 1 rg 1 1 1 RG 0 0 {wd:.2f} {ht:.2f} re B".encode())
    d = _common(page_ref, rect, "/Square")
    d.update({_name("/C"): _arr([1, 1, 1]), _name("/IC"): _arr([1, 1, 1]),
              _name("/BS"): g.DictionaryObject({_name("/W"): g.NumberObject(1)}),
              _name("/Subj"): g.TextStringObject("Rectangle"), _name("/AP"): g.DictionaryObject({_name("/N"): ap})})
    return d


def ink(w, page_ref, loc: dict, color: tuple[float, float, float], width: float, passes: int) -> dict:
    """Edge's Draw tool: an Ink annotation, here zig-zag strokes across the value."""
    g = _g()
    x0, x1 = loc["x0"] - 2, loc["x1"] + 2
    y0, y1 = loc["baseline"] - 2, loc["baseline"] + loc["size"] - 1
    r = random.Random(int(x0 * 10))
    pts = []
    for i in range(passes * 2 + 1):
        pts += [x0 + (x1 - x0) * i / (passes * 2) + r.uniform(-0.6, 0.6), (y0 if i % 2 == 0 else y1) + r.uniform(-0.5, 0.5)]
    rect = [x0 - width, y0 - width, x1 + width, y1 + width]
    path = f"{pts[0] - rect[0]:.2f} {pts[1] - rect[1]:.2f} m " + " ".join(
        f"{pts[i] - rect[0]:.2f} {pts[i + 1] - rect[1]:.2f} l" for i in range(2, len(pts), 2))
    rgb = " ".join(f"{c:g}" for c in color)
    ap = _form(w, [0, 0, rect[2] - rect[0], rect[3] - rect[1]], f"{rgb} RG {width:g} w 1 J 1 j {path} S".encode())
    d = _common(page_ref, rect, "/Ink")
    d.update({_name("/InkList"): g.ArrayObject([_arr(pts)]), _name("/C"): _arr(list(color)),
              _name("/BS"): g.DictionaryObject({_name("/W"): _num(float(width))}),
              _name("/AP"): g.DictionaryObject({_name("/N"): ap})})
    return d


def stamp(w, page_ref, loc: dict, text: str) -> dict:
    """A custom stamp made from an image of the new value (Acrobat: Stamps, Custom, Create from image)."""
    from PIL import Image, ImageDraw, ImageFont

    g = _g()
    size = loc["size"]
    wd, ht = text_width(text, size) + 6, size + 6
    scale = 4
    im = Image.new("RGB", (int(wd * scale), int(ht * scale)), "white")
    try:
        font = ImageFont.truetype("arial.ttf", int(size * scale))
    except OSError:
        font = ImageFont.load_default()
    ImageDraw.Draw(im).text((3 * scale, 1.5 * scale), text, fill="black", font=font)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=92)
    img = w.add_object(g.StreamObject({
        _name("/Type"): _name("/XObject"), _name("/Subtype"): _name("/Image"), _name("/Width"): g.NumberObject(im.width),
        _name("/Height"): g.NumberObject(im.height), _name("/ColorSpace"): _name("/DeviceRGB"),
        _name("/BitsPerComponent"): g.NumberObject(8), _name("/Filter"): _name("/DCTDecode")},
        encoded_data=buf.getvalue()))
    rect = [loc["x0"] - 3, loc["baseline"] - 4, loc["x0"] - 3 + wd, loc["baseline"] - 4 + ht]
    ap = _form(w, [0, 0, wd, ht], f"q {wd:.2f} 0 0 {ht:.2f} 0 0 cm /Im0 Do Q".encode(),
               {_name("/XObject"): g.DictionaryObject({_name("/Im0"): img})})
    d = _common(page_ref, rect, "/Stamp")
    d.update({_name("/Name"): _name("/Image"), _name("/Subj"): g.TextStringObject("Stamp"),
              _name("/AP"): g.DictionaryObject({_name("/N"): ap})})
    return d


def form_field(w, page_ref, loc: dict, text: str) -> dict:
    """A text form field placed over the value, with an appearance that shows the new text."""
    g = _g()
    size = loc["size"]
    rect = [loc["x0"] - 2, loc["baseline"] - 4, loc["x1"] + 8, loc["baseline"] + size + 1]
    wd, ht = rect[2] - rect[0], rect[3] - rect[1]
    font = _helv(w)
    ap = _form(w, [0, 0, wd, ht], f"1 1 1 rg 0 0 {wd:.2f} {ht:.2f} re f /Tx BMC q BT 0 g /Helv {size:g} Tf "
               f"2 4 Td ({text}) Tj ET Q EMC".encode(), {_name("/Font"): g.DictionaryObject({_name("/Helv"): font})})
    d = _common(page_ref, rect, "/Widget")
    d.update({_name("/FT"): _name("/Tx"), _name("/T"): g.TextStringObject("Text1"),
              _name("/V"): g.TextStringObject(text), _name("/DA"): g.TextStringObject(f"/Helv {size:g} Tf 0 g"),
              _name("/MK"): g.DictionaryObject({_name("/BG"): _arr([1, 1, 1])}),
              _name("/AP"): g.DictionaryObject({_name("/N"): ap})})
    return d


def add_annotations(data: bytes, makers, full_save: bool = False) -> bytes:
    """Append annotations to page 1 in an incremental update, as viewers save comments.

    With full_save the result is rewritten as a whole new file afterwards, as an app that does not append."""
    from pyhanko.pdf_utils import generic
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter

    w = IncrementalPdfFileWriter(io.BytesIO(data))
    page_ref = w.root["/Pages"]["/Kids"][0]
    page = page_ref.get_object()
    annots = page.get("/Annots")
    refs = [w.add_object(generic.DictionaryObject(m(w, page_ref))) for m in makers]
    if annots is None:
        page[_name("/Annots")] = generic.ArrayObject(refs)
        w.update_container(page)
    else:
        raw = page.raw_get("/Annots")
        arr = annots if isinstance(annots, generic.ArrayObject) else generic.ArrayObject(annots)
        arr.extend(refs)
        if isinstance(raw, generic.IndirectObject):
            w.mark_update(raw)
        else:
            page[_name("/Annots")] = arr
            w.update_container(page)
    widgets = [r for r in refs if r.get_object().get("/Subtype") == "/Widget"]
    if widgets:
        acro = w.root.get("/AcroForm")
        if acro is None:
            w.root[_name("/AcroForm")] = generic.DictionaryObject({_name("/Fields"): generic.ArrayObject(widgets)})
        else:
            acro.get_object()["/Fields"].extend(widgets)
            w.update_container(acro.get_object())
        w.update_root()
    out = io.BytesIO()
    w.write(out)
    return rewrite(out.getvalue()) if full_save else out.getvalue()


def rewrite(data: bytes, **kw) -> bytes:
    """A full save: every object written again into one new revision."""
    import pikepdf

    with pikepdf.open(io.BytesIO(data)) as pdf:
        buf = io.BytesIO()
        pdf.save(buf, **kw)
        return buf.getvalue()


# ---------------------------------------------------------------- content edits


def _swap(body: bytes, old: str, new: str) -> tuple[bytes, int]:
    """Replace `old` inside the literal strings a content stream shows."""
    n = 0

    def sub(m: re.Match) -> bytes:
        nonlocal n
        n += m.group(0).count(old.encode())
        return m.group(0).replace(old.encode(), new.encode())

    return LITERAL_RE.sub(sub, body), n


def replace_in_content(pdf, old: str, new: str) -> int:
    """Replace a shown string in page 1's content streams; returns the number of replacements."""
    import pikepdf

    streams = pdf.pages[0].obj["/Contents"]
    streams = list(streams) if isinstance(streams, pikepdf.Array) else [streams]
    total = 0
    for s in streams:
        body, n = _swap(s.read_bytes(), old, new)
        if n:
            s.write(body)
            total += n
    return total


def content_edit_full(data: bytes, old: str, new: str) -> bytes:
    """A desktop editor's "Edit text": the shown string changed in place, file saved as a whole."""
    import pikepdf

    with pikepdf.open(io.BytesIO(data)) as pdf:
        assert replace_in_content(pdf, old, new) == 1
        buf = io.BytesIO()
        pdf.save(buf)
        return buf.getvalue()


def content_edit_incremental(data: bytes, old: str, new: str) -> bytes:
    """The same edit appended as an incremental update: a new content stream for the page."""
    from pyhanko.pdf_utils import generic
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter

    w = IncrementalPdfFileWriter(io.BytesIO(data))
    page_ref = w.root["/Pages"]["/Kids"][0]
    page = page_ref.get_object()
    contents = page["/Contents"]
    parts = list(contents) if isinstance(contents, generic.ArrayObject) else [contents]
    body = b"\n".join(p.get_object().data for p in parts)
    assert body.count(f"({old})".encode()) == 1
    s = generic.StreamObject(stream_data=body.replace(f"({old})".encode(), f"({new})".encode()))
    s.compress()
    page[_name("/Contents")] = w.add_object(s)
    w.update_container(page)
    out = io.BytesIO()
    w.write(out)
    return out.getvalue()


def libreoffice_style(data: bytes, old: str, new: str) -> bytes:
    """LibreOffice Draw's PDF import and export: a new file with its own Producer and no signature."""
    import pikepdf

    with pikepdf.open(io.BytesIO(data)) as pdf:
        assert replace_in_content(pdf, old, new) == 1
        page = pdf.pages[0]
        if "/Annots" in page.obj:
            keep = [a for a in page.obj.Annots if a.get("/FT") != "/Sig"]
            page.obj.Annots = pikepdf.Array(keep)
        for k in ("/AcroForm", "/Perms", "/Metadata"):
            if k in pdf.Root:
                del pdf.Root[k]
        now = pdf_date()
        pdf.docinfo = pdf.make_indirect(pikepdf.Dictionary(
            Creator=pikepdf.String("Draw"), Producer=pikepdf.String("LibreOffice 24.8"),
            CreationDate=pikepdf.String(now)))
        buf = io.BytesIO()
        pdf.save(buf, static_id=False, object_stream_mode=pikepdf.ObjectStreamMode.generate)
        return buf.getvalue()


# ---------------------------------------------------------------- printing and photographing


def render(data: bytes, dpi: int):
    import pypdfium2 as pdfium

    doc = pdfium.PdfDocument(data)
    try:
        return doc[0].render(scale=dpi / 72).to_pil().convert("RGB")
    finally:
        doc.close()


def print_to_pdf(data: bytes, title: str) -> bytes:
    """Printed to a PDF printer that rasterises: one image per page, no text layer, the printer's Producer."""
    import pikepdf

    img = render(data, 200)
    buf = io.BytesIO()
    img.save(buf, "PDF", resolution=200)
    with pikepdf.open(io.BytesIO(buf.getvalue())) as pdf:
        pdf.docinfo = pdf.make_indirect(pikepdf.Dictionary(
            Producer=pikepdf.String("Microsoft: Print To PDF"), Title=pikepdf.String(title),
            CreationDate=pikepdf.String(pdf_date())))
        out = io.BytesIO()
        pdf.save(out)
        return out.getvalue()


def photo_of_printout(data: bytes, seed: int = 5) -> bytes:
    """A phone photo of the printout: perspective, slight blur, uneven light, sensor noise, JPEG."""
    import cv2
    import numpy as np

    page = np.array(render(data, 170))
    h, w = page.shape[:2]
    canvas_w, canvas_h = int(w * 1.18), int(h * 1.12)
    r = np.random.default_rng(seed)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[canvas_w * 0.07, canvas_h * 0.05], [canvas_w * 0.93, canvas_h * 0.035],
                      [canvas_w * 0.955, canvas_h * 0.96], [canvas_w * 0.045, canvas_h * 0.95]])
    m = cv2.getPerspectiveTransform(src, dst)
    table = np.full((canvas_h, canvas_w, 3), (92, 74, 58), np.uint8)
    warped = cv2.warpPerspective(page, m, (canvas_w, canvas_h), dst=table, borderMode=cv2.BORDER_TRANSPARENT)
    yy, xx = np.mgrid[0:canvas_h, 0:canvas_w]
    light = 0.86 + 0.16 * (1 - ((xx - canvas_w * 0.3) ** 2 + (yy - canvas_h * 0.25) ** 2) / (canvas_w ** 2 + canvas_h ** 2))
    img = np.clip(warped.astype(np.float32) * light[..., None], 0, 255)
    img = cv2.GaussianBlur(img, (0, 0), 0.9)
    img = np.clip(img + r.normal(0, 5.0, img.shape), 0, 255).astype(np.uint8)
    ok, enc = cv2.imencode(".jpg", cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 82])
    assert ok
    return enc.tobytes()


# ---------------------------------------------------------------- a real Word round-trip

WORD_PS1 = r"""
param([string]$In, [string]$Out, [string]$Old, [string]$New)
$ErrorActionPreference = "Stop"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $word.Documents.Open($In, $false, $false, $false)
$find = $doc.Content.Find
$find.ClearFormatting()
$find.Replacement.ClearFormatting()
$ok = $find.Execute($Old, $false, $false, $false, $false, $false, $true, 1, $false, $New, 2)
if (-not $ok) { throw "text not found in the converted document" }
$doc.SaveAs2($Out, 17)
$doc.Close([ref]0)
$word.Quit()
"""


def _word_pids() -> set[int]:
    out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq WINWORD.EXE", "/FO", "CSV", "/NH"], capture_output=True,
                         text=True).stdout
    return {int(line.split(",")[1].strip('"')) for line in out.splitlines() if line.startswith('"WINWORD')}


def word_roundtrip(data: bytes, old: str, new: str) -> tuple[bytes | None, str]:
    """Open the PDF in Microsoft Word (PDF Reflow), replace the text, save as PDF. Needs Word on Windows."""
    if os.name != "nt" or not shutil.which("powershell"):
        return None, "Microsoft Word is not available on this machine"
    before = _word_pids()
    # Word can hold the input for a moment after it is killed; a leftover temp file must not stop the matrix
    with tempfile.TemporaryDirectory(prefix="pramana-word-", ignore_cleanup_errors=True) as td:
        src, dst, ps1 = Path(td) / "in.pdf", Path(td) / "out.pdf", Path(td) / "roundtrip.ps1"
        src.write_bytes(data)
        ps1.write_text(WORD_PS1, encoding="utf-8")
        try:
            p = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps1),
                                "-In", str(src), "-Out", str(dst), "-Old", old, "-New", new],
                               capture_output=True, text=True, timeout=240)
            note = (p.stderr or p.stdout).strip()[:300]
        except subprocess.TimeoutExpired:
            note = "Word did not finish within 240 s"
        finally:
            # Only the Word instance this run started
            for pid in _word_pids() - before:
                subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True)
        if dst.exists():
            return dst.read_bytes(), "Microsoft Word, real round-trip"
        return None, f"Word round-trip failed: {note or 'no output'}"


# ---------------------------------------------------------------- the variants


def variants() -> list[dict]:
    """Each variant: id, source, method, tool, and a maker taking (data, src_spec, loc) -> (bytes | None, note)."""

    def ann(*makers, full=False):
        return lambda data, s, loc: (add_annotations(data, [lambda w, p, m=m: m(w, p, s, loc) for m in makers],
                                                     full_save=full), None)

    def ft(w, p, s, loc):
        return free_text(w, p, loc, s["new"])

    def sq(w, p, s, loc):
        return white_square(w, p, loc)

    def white_ink(w, p, s, loc):
        return ink(w, p, loc, (1, 1, 1), loc["size"] * 0.9, 3)

    def scribble(w, p, s, loc):
        return ink(w, p, loc, (0.05, 0.1, 0.55), 1.4, 6)

    def stp(w, p, s, loc):
        return stamp(w, p, loc, s["new"])

    def fld(w, p, s, loc):
        return form_field(w, p, loc, s["new"])

    def boxed(data, s, loc):
        return add_annotations(data, [lambda w, p: sq(w, p, s, loc), lambda w, p: ft(w, p, s, loc)])

    return [
        {"id": "fire_clean", "source": "a1_fire", "control": True, "tool": "none",
         "method": "Clean issuer copy re-uploaded (control)", "make": lambda d, s, loc: (d, None)},
        {"id": "fire_edge_add_text", "source": "a1_fire", "tool": "Microsoft Edge, reproduced",
         "method": "Edge Add text: FreeText annotation over the date, incremental save", "make": ann(ft)},
        {"id": "fire_edge_add_text_full", "source": "a1_fire", "tool": "Microsoft Edge, reproduced",
         "method": "Edge Add text, the whole file rewritten on save", "make": ann(ft, full=True)},
        {"id": "fire_box_and_text", "source": "a1_fire", "tool": "Acrobat Reader comment tools, reproduced",
         "method": "White filled rectangle (Square) over the date plus a text box with the new date",
         "make": ann(sq, ft)},
        {"id": "fire_white_ink_and_text", "source": "a1_fire", "tool": "Microsoft Edge, reproduced",
         "method": "Edge Draw in white over the date plus Add text", "make": ann(white_ink, ft)},
        {"id": "fire_stamp", "source": "a1_fire", "tool": "Acrobat Reader Stamp tool, reproduced",
         "method": "Custom stamp made from an image of the new date, placed over the date", "make": ann(stp)},
        {"id": "fire_ink_scribble", "source": "a1_fire", "tool": "Microsoft Edge Draw, reproduced",
         "method": "Ink scribble over the date", "make": ann(scribble)},
        {"id": "fire_form_field", "source": "a1_fire", "tool": "form editor, reproduced",
         "method": "Text form field (Widget with an appearance) over the date", "make": ann(fld)},
        {"id": "fire_word", "source": "a1_fire", "tool": "Microsoft Word, real",
         "method": "Word round-trip: open the PDF in Word, change the date, save as PDF",
         "make": lambda d, s, loc: word_roundtrip(d, s["old"], s["new"])},
        {"id": "fire_libreoffice", "source": "a1_fire", "tool": "LibreOffice, reproduced (not installed here)",
         "method": "LibreOffice-style edit: full rewrite, date replaced, new Producer, signature dropped",
         "make": lambda d, s, loc: (libreoffice_style(d, s["old"], s["new"]), None)},
        {"id": "fire_content_incremental", "source": "a1_fire", "tool": "PDF editor Edit text, reproduced",
         "method": "Direct content edit: date replaced in the content stream, incremental save",
         "make": lambda d, s, loc: (content_edit_incremental(d, s["old"], s["new"]), None)},
        {"id": "fire_content_full", "source": "a1_fire", "tool": "PDF editor Edit text, reproduced",
         "method": "Direct content edit: date replaced in the content stream, full save",
         "make": lambda d, s, loc: (content_edit_full(d, s["old"], s["new"]), None)},
        {"id": "fire_print_to_pdf", "source": "a1_fire", "tool": "Microsoft Print to PDF, reproduced",
         "method": "Box and text edit, then printed to an image-only PDF",
         "make": lambda d, s, loc: (print_to_pdf(boxed(d, s, loc), "fire_noc.pdf"), None)},
        {"id": "fire_photo", "source": "a1_fire", "tool": "phone camera, reproduced", "ext": "jpg",
         "method": "Box and text edit, printed and photographed (perspective, blur, JPEG noise)",
         "make": lambda d, s, loc: (photo_of_printout(boxed(d, s, loc)), None)},
        {"id": "oc_clean", "source": "a1_oc", "control": True, "tool": "none",
         "method": "Clean issuer copy re-uploaded (control)", "make": lambda d, s, loc: (d, None)},
        {"id": "oc_edge_add_text", "source": "a1_oc", "tool": "Microsoft Edge, reproduced",
         "method": "Edge Add text: FreeText annotation over the built-up area, incremental save", "make": ann(ft)},
        {"id": "oc_box_and_text", "source": "a1_oc", "tool": "Acrobat Reader comment tools, reproduced",
         "method": "White filled rectangle over the area plus a text box with the new area", "make": ann(sq, ft)},
        {"id": "oc_content_full", "source": "a1_oc", "tool": "PDF editor Edit text, reproduced",
         "method": "Direct content edit of the area, full save",
         "make": lambda d, s, loc: (content_edit_full(d, s["old"], s["new"]), None)},
        {"id": "oc_print_to_pdf", "source": "a1_oc", "tool": "Microsoft Print to PDF, reproduced",
         "method": "Box and text edit of the area, then printed to an image-only PDF",
         "make": lambda d, s, loc: (print_to_pdf(boxed(d, s, loc), "occupancy_certificate.pdf"), None)},
        {"id": "expired_clean", "source": "a3_fire", "control": True, "tool": "none",
         "method": "Clean, expired issuer copy re-uploaded (control)", "make": lambda d, s, loc: (d, None)},
        {"id": "expired_edge_add_text", "source": "a3_fire", "tool": "Microsoft Edge, reproduced",
         "method": "Expired certificate: Edge Add text puts a later date over the expiry, incremental save",
         "make": ann(ft)},
    ]


def make_variants(only: set[str] | None = None) -> list[dict]:
    LAB.mkdir(parents=True, exist_ok=True)
    out = []
    for v in variants():
        if only and v["id"] not in only:
            continue
        s = SOURCES[v["source"]]
        data = (FIX / s["file"]).read_bytes()
        loc = locate(data, s["label"], s["old"])
        made, note = v["make"](data, s, loc)
        ext = v.get("ext", "pdf")
        rec = {k: v[k] for k in ("id", "source", "method", "tool")} | {
            "control": bool(v.get("control")), "app": s["app"], "declared_type": s["type"], "field": s["field"],
            "printed": s["old"], "new": None if v.get("control") else s["new"], "file": None, "note": note}
        if made is not None:
            name = f"{v['id']}.{ext}"
            (LAB / name).write_bytes(made)
            rec["file"] = name
        out.append(rec)
        print(f"{v['id']:26} {'written' if made else 'NOT PRODUCED'}  {note or ''}")
    (LAB / "variants.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    return out


# ---------------------------------------------------------------- the matrix

GROUPS = [
    ("issuer signature", ("VER-ISSUER_SIGNATURE-", "VER-APPLICANT_SIGNATURE-", "VER-ISSUER-SIGNATURE-")),
    ("signed QR", ("VER-SIGNED_QR-",)),
    ("issuer registry", ("VER-ISSUER_REGISTRY-",)),
    ("font check", ("FX-FONT-",)),
    ("revision diff", ("FX-PDF-REVISION-", "FX-FIELD-OVERWRITTEN")),
    ("overlay", ("FX-PDF-OVERLAID-",)),
    ("white box", ("FX-PDF-WHITEOUT",)),
    ("metadata and producer", ("FX-PDF-EDITOR-", "FX-PDF-MODIFIED-", "FX-PDF-CREATED-")),
    ("annotation over a field", ("FX-ANNOT-",)),
    ("image-only copy", ("FX-IMAGE-ONLY-",)),
    ("rules", ("APH-", "ADD", "XD-", "XR-")),
    ("cross-application", ("XA-", "FX-SEAL-")),
]


def group_of(code: str) -> str:
    return next((g for g, prefixes in GROUPS if code.startswith(prefixes)), "other")


def prepare_world() -> None:
    """A copy of the seeded world for the lab runs, so var/ and its evaluation stay as seeded."""
    src = ROOT / "var"
    if not (src / "pramana.db").exists():
        sys.exit("var/pramana.db missing: run scripts/make_fixtures.py and scripts/seed.py first")
    shutil.rmtree(WORLD, ignore_errors=True)
    WORLD.mkdir(parents=True)
    for name in ("documents", "keys", "sim", "rulesets"):
        if (src / name).exists():
            shutil.copytree(src / name, WORLD / name)
    for f in src.glob("pramana.db*"):
        shutil.copyfile(f, WORLD / f.name)


def run_matrix(recs: list[dict]) -> list[dict]:
    os.environ["PRAMANA_DATA_DIR"] = str(WORLD)
    os.environ["PRAMANA_LLM_PROVIDERS"] = ""
    os.environ["PRAMANA_BACKGROUND_RUNS"] = "false"
    sys.path.insert(0, str(BACKEND))
    import hashlib
    import logging

    logging.basicConfig(level=logging.WARNING)
    for n in ("pyhanko", "pyhanko_certvalidator", "pdfminer", "RapidOCR", "pramana.pipeline.validate"):
        logging.getLogger(n).setLevel(logging.CRITICAL)
    from sqlalchemy import select

    from pramana import sandbox
    from pramana.crypto import store_document
    from pramana.db import SessionLocal
    from pramana.models import Application, Document, Finding, VerificationAttempt
    from pramana.pipeline.intake import validate_upload
    from pramana.pipeline.process import process_document
    from pramana.pipeline.validate import run_validation
    from pramana.rules.engine import active_ruleset

    m = json.loads((FIX / "manifest.json").read_text(encoding="utf-8"))
    app_ids = {a["key"]: a["id"] for a in m["applications"]}
    rs = active_ruleset()
    db = SessionLocal()
    rows = []
    baseline: dict[tuple[str, str], set[str]] = {}
    try:
        for r in recs:
            row = {k: r[k] for k in ("id", "method", "tool", "control", "app", "declared_type", "field", "printed",
                                     "new", "file", "note")}
            if not r["file"]:
                row.update({"processed": False, "caught": None, "findings": [], "verification": []})
                rows.append(row)
                continue
            data = (LAB / r["file"]).read_bytes()
            app = db.get(Application, app_ids[r["app"]])
            orig = db.scalars(select(Document).where(Document.application_id == app.id,
                                                     Document.declared_type == r["declared_type"],
                                                     Document.superseded.is_(False))).one()
            res = validate_upload(r["file"], data)
            orig.superseded = True
            doc = Document(application_id=app.id, round=app.round, declared_type=r["declared_type"],
                           original_filename=r["file"], sha256=hashlib.sha256(data).hexdigest(), size_bytes=len(data),
                           mime=res.mime, page_count=res.page_count, storage_name=f"{uuid.uuid4().hex}.bin",
                           uploaded_by=None, analysis={"active_content": res.active_content})
            store_document(doc.storage_name, data)
            db.add(doc)
            db.flush()
            inst = app.institution
            try:
                process_document(db, doc, rs, (inst.latitude, inst.longitude))
            except Exception as e:  # noqa: BLE001  recorded as a failed processing, as the pipeline would
                doc.processing_status, doc.processing_error = "failed", str(e)[:500]
            db.flush()
            run = run_validation(db, app, "tamper-lab", "system")
            fs = [f for f in db.scalars(select(Finding).where(Finding.run_id == run.id))
                  if f.document_id == doc.id or any(e.get("document_id") == doc.id for e in f.evidence or [])]
            vs = db.scalars(select(VerificationAttempt).where(VerificationAttempt.run_id == run.id,
                                                              VerificationAttempt.document_id == doc.id)).all()
            key = (r["app"], r["declared_type"])
            codes = {f.code for f in fs if f.severity in ("medium", "high")}
            if r["control"]:
                baseline[key] = codes
            new_codes = codes - baseline.get(key, set())
            shown = [x for x in (r["new"] or "", iso(r["new"]), (r["new"] or "").replace(",", "")) if x]
            row.update({
                "processed": doc.processing_status == "processed", "mime": doc.mime, "text_source": doc.text_source,
                "fields": {f.name: f.raw for f in doc.fields},
                "findings": [{"code": f.code, "severity": f.severity, "group": group_of(f.code), "title": f.title,
                              "message": f.message} for f in sorted(fs, key=lambda f: f.code)],
                "verification": [{"channel": v.channel, "status": v.status, "detail": v.detail} for v in vs],
                "signals": sorted({group_of(c) for c in new_codes}),
                "new_codes": sorted(new_codes),
                "caught": bool(new_codes) if not r["control"] else None,
                "control_clean": (not codes - {"APH-617I-FIRE-VALID", "VER-SIGNED_QR-EXPIRED",
                                               "VER-ISSUER_REGISTRY-EXPIRED"}) if r["control"] else None,
                "shows_edit": any(s in (f.message or "") for f in fs for s in shown) if not r["control"] else None,
            })
            rows.append(row)
            print(f"{r['id']:26} caught={row['caught']!s:5} shows_edit={row['shows_edit']!s:5} "
                  f"{', '.join(sorted(new_codes)) or '-'}")
            doc.superseded, orig.superseded = True, False
            db.commit()
    finally:
        db.close()
        sandbox.shutdown()
    return rows


def iso(dmy: str | None) -> str | None:
    if not dmy or dmy.count("-") != 2:
        return None
    d, mth, y = dmy.split("-")
    return f"{y}-{mth}-{d}"


LIVE_README = """# Live demo: a certificate edited in Microsoft Edge

Generated by `python scripts/tamper_lab.py --live-demo` on {generated}. Regenerate this kit after the last
`make_fixtures.py` and `seed.py`: every fixture run makes new demo keys, and the certificate must match them.

## Files

- `{clean}`: the issuer-signed fire certificate of application A3 ({institution}), exactly as seeded. It
  expired on {old}. Edit a copy of this file in Edge.
- `{repro}`: the same edit made by Pramana's tamper lab (a FreeText annotation saved as an incremental
  update, as Edge's Add text writes it), for rehearsal or as a fallback if Edge is not at hand.

## 1. Edit the date in Edge (about 30 seconds)

1. Copy `{clean}` to `A3_fire_noc_edited.pdf`, right-click the copy, Open with, Microsoft Edge.
2. In Edge's PDF toolbar choose **Add text** (or right-click the page and choose Add text).
3. Click exactly on the printed date after **Valid Up To:** ({old}) and type **{new}**. Set the text size
   close to the printed text and keep the colour black. The new text must sit over the old date.
   Optional, for a cleaner look: first choose **Draw**, pick white and the thickest stroke, and paint over
   the old date; then Add text.
4. Press **Ctrl+S** to save (Edge saves into the same file).

## 2. Upload it as the institution (two browser windows)

1. Officer window, sign in as `officer` / `Pramana@2026`. Open application A3 ({app_id}), choose
   **Request rectification**, select the fire certificate finding, add a message and send.
2. Institution window, sign in as `{inst_user}` / `Pramana@2026`. Open the application, drop
   `A3_fire_noc_edited.pdf` on the **Fire Safety Certificate** slot, then **Submit**.
3. Officer window: the run completes on its own (or press Run validation).

## 3. What Pramana shows the officer

- **Valid until covered by an annotation** (high, structural): "On page 1 the page shows '{new}' in a text box
  annotation (FreeText) drawn over the printed '{old}' (valid until). The annotation was added in revision 3,
  after the signature 'IssuerSignature' (revision 2). Text extraction, the signed QR comparison and the issuer
  registry read the printed '{old}'; a person reading the file sees '{new}'."
- **Issuer signature: mismatch detected**: the signature is valid for the revision it signed, but the file was
  modified after signing.
- The expiry findings remain: the validity rule, the signed QR and the issuer registry still read {old}.
- The page image in the evidence viewer shows the typed date, as the institution's file does, with the
  annotation's region marked.
- The institution sees only the deficiency it must fix, never the indicators.

If Edge rewrites the whole file instead of appending to it, the finding says the file was "rewritten as a
whole after the signature" and the signature check reports that the signed bytes no longer match. If the new
text does not sit over the old date, the annotation check does not report the date; the signature check still
reports the modification.

This kit was checked with the tamper lab's reproduction of Edge's Add text. One real edit in Edge, made as
above, is the final proof; please try it once before the demo.
"""


def live_demo() -> Path:
    """A clean issuer-signed certificate for a presenter to edit in Edge, with the steps and the expected result."""
    m = json.loads((FIX / "manifest.json").read_text(encoding="utf-8"))
    s = SOURCES["a3_fire"]
    app = next(a for a in m["applications"] if a["key"] == s["app"])
    inst = next(i for i in m["institutions"] if i["key"] == app["institution"])
    user = next(u["username"] for u in m["demo_accounts"] if u.get("institution") == inst["key"])
    out = FIX / "live_demo"
    out.mkdir(parents=True, exist_ok=True)
    data = (FIX / s["file"]).read_bytes()
    clean, repro = "A3_fire_noc_clean.pdf", "A3_fire_noc_edge_reproduction.pdf"
    (out / clean).write_bytes(data)
    loc = locate(data, s["label"], s["old"])
    (out / repro).write_bytes(add_annotations(data, [lambda w, p: free_text(w, p, loc, s["new"])]))
    (out / "README.md").write_text(LIVE_README.format(
        generated=datetime.now(UTC).strftime("%d %b %Y %H:%M UTC"), clean=clean, repro=repro, old=s["old"],
        new=s["new"], institution=inst["name"], app_id=app["id"], inst_user=user), encoding="utf-8")
    print(f"wrote {out}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--live-demo", action="store_true", help="write the Edge live demo kit to fixtures/out/live_demo")
    ap.add_argument("--matrix", action="store_true", help="run every variant through the pipeline")
    ap.add_argument("--reuse", action="store_true", help="use the variants already in fixtures/out/tamper_lab")
    ap.add_argument("--only", nargs="*", help="variant ids")
    ap.add_argument("--out", type=Path, help="where to write the matrix JSON")
    a = ap.parse_args()
    if a.live_demo:
        live_demo()
        return
    if a.reuse and (LAB / "variants.json").exists():
        recs = json.loads((LAB / "variants.json").read_text(encoding="utf-8"))
        if a.only:
            recs = [r for r in recs if r["id"] in set(a.only)]
    else:
        recs = make_variants(set(a.only) if a.only else None)
    if not a.matrix:
        return
    prepare_world()
    rows = run_matrix(recs)
    out = {"generated": datetime.now(UTC).isoformat(timespec="seconds"), "rows": rows}
    path = a.out or LAB / "matrix.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
