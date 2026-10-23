"""Bilingual (Hindi and English) fixture documents with a deliberately broken text layer.

Devanagari is shaped with HarfBuzz (uharfbuzz) using Noto Sans Devanagari (SIL OFL 1.1) and drawn glyph by
glyph at the shaped positions, so the page looks right. The embedded font is a renamed copy whose cmap also
gives every glyph a Private Use Area code point, as legacy Hindi fonts do: conjuncts and contextual forms
copy out as PUA characters and vowel signs come out in visual order. A reader of the text layer gets
nonsense; the page has to be read from the image.
"""

import re
from pathlib import Path

import uharfbuzz as hb
from fetch_assets import FONT_DIR, fetch_fonts
from fontTools.ttLib import TTFont as FTFont
from reportlab.lib.colors import HexColor, black
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont

W, H = A4
RUN = re.compile(r"([ऀ-ॿ]+(?:[ ‌‍]+[ऀ-ॿ]+)*)")
_cache: dict[str, "Deva"] = {}


def _legacy_copy(src: Path, dst: Path, family: str) -> None:
    f = FTFont(str(src))
    order = f.getGlyphOrder()
    for t in f["cmap"].tables:
        if t.isUnicode():
            for gid, name in enumerate(order):
                if gid and 0xE000 + gid <= 0xF8FF:
                    t.cmap.setdefault(0xE000 + gid, name)
    for rec in f["name"].names:
        if rec.nameID in (1, 3, 4, 6, 16):
            rec.string = family
    f.save(str(dst))


class Deva:
    """One weight of Noto Sans Devanagari: shaping, measuring and drawing with a legacy-style text layer."""

    def __init__(self, weight: str = "Regular"):
        fetch_fonts()
        src = FONT_DIR / f"NotoSansDevanagari-{weight}.ttf"
        self.name = f"PramanaLegacyDeva-{weight}"
        dst = FONT_DIR / f"{self.name}.ttf"
        if not dst.exists():
            _legacy_copy(src, dst, self.name)
        pdfmetrics.registerFont(TTFont(self.name, str(dst)))
        self.font = hb.Font(hb.Face(hb.Blob.from_file_path(str(src))))
        self.upem = self.font.face.upem
        tt = FTFont(str(src))
        self.nominal: dict[int, str] = {}
        for cp, gname in sorted(tt.getBestCmap().items()):
            self.nominal.setdefault(tt.getGlyphID(gname), chr(cp))

    def shape(self, text: str):
        buf = hb.Buffer()
        buf.add_codepoints([ord(ch) for ch in text])
        buf.guess_segment_properties()
        hb.shape(self.font, buf, {})
        return buf.glyph_infos, buf.glyph_positions

    def width(self, text: str, size: float) -> float:
        _, pos = self.shape(text)
        return sum(p.x_advance for p in pos) * size / self.upem

    def draw(self, c, x: float, y: float, text: str, size: float) -> float:
        infos, pos = self.shape(text)
        starts = sorted({i.cluster for i in infos}) + [len(text)]
        s = size / self.upem
        pen = x
        for info, p in zip(infos, pos, strict=True):
            k = starts.index(info.cluster)
            span = text[info.cluster:starts[k + 1]]
            ch = self.nominal.get(info.codepoint)
            if ch is None or ch not in span:
                ch = chr(0xE000 + info.codepoint)
            t = c.beginText(pen + p.x_offset * s, y + p.y_offset * s)
            t.setFont(self.name, size)
            t.textOut(ch)
            c.drawText(t)
            pen += p.x_advance * s
        return pen - x


def deva(weight: str = "Regular") -> Deva:
    if weight not in _cache:
        _cache[weight] = Deva(weight)
    return _cache[weight]


def mixed_width(text: str, size: float, weight: str = "Regular", latin: str = "Helvetica") -> float:
    return sum(deva(weight).width(r, size) if RUN.fullmatch(r) else stringWidth(r, latin, size)
               for r in RUN.split(text) if r)


def mixed(c, x: float, y: float, text: str, size: float, weight: str = "Regular", latin: str = "Helvetica") -> float:
    """Draw text that mixes Devanagari and Latin runs; returns the width drawn."""
    pen = x
    for r in RUN.split(text):
        if not r:
            continue
        if RUN.fullmatch(r):
            pen += deva(weight).draw(c, pen, y, r, size)
        else:
            c.setFont(latin, size)
            c.drawString(pen, y, r)
            pen += stringWidth(r, latin, size)
    return pen - x


def wrap(text: str, size: float, width: float) -> list[str]:
    lines, line = [], ""
    for w in text.split():
        t = (line + " " + w).strip()
        if mixed_width(t, size) > width and line:
            lines.append(line)
            line = w
        else:
            line = t
    return lines + ([line] if line else [])


def occupancy_hindi(doc_cls, inst: dict, city_hi: str, cert: str, issue: str, area: int,
                    seal: bytes) -> tuple[bytes, dict]:
    """A municipal occupancy certificate with Hindi labels and English values, as many bilingual offices print.

    Returns the PDF and its ground truth: the printed field values and every line with Devanagari."""
    doc = doc_cls()
    c = doc.c
    green = HexColor("#14532d")
    doc.frame(f"{inst['city']} Municipal Corporation (SIMULATED ISSUER)",
              "Building Permission and Development Control Department  |  Synthetic issuer", "#14532d")
    c.setFillColor(green)
    head = f"{city_hi} महानगरपालिका  |  भवन अनुज्ञा एवं विकास नियंत्रण विभाग"
    mixed(c, (W - mixed_width(head, 10)) / 2, H - 100, head, 10)
    lines = [head]
    c.setFillColor(black)
    doc.y = H - 132
    title = "अधिभोग प्रमाणपत्र / OCCUPANCY CERTIFICATE"
    mixed(c, (W - mixed_width(title, 13, "Bold", "Helvetica-Bold")) / 2, doc.y, title, 13, "Bold", "Helvetica-Bold")
    lines.append(title)
    doc.y -= 30
    rows = [
        ("प्रमाणपत्र संख्या", cert, "certificate_no"),
        ("जारी करने की तिथि", issue, "issue_date"),
        ("स्वामी / आवेदक", inst["society"], None),
        ("संस्था का नाम", inst["name"], "institution_name"),
        ("भवन का उपयोग", "शैक्षणिक (तकनीकी संस्थान)", None),
        ("कुल निर्मित क्षेत्रफल", f"{area:,} वर्ग मीटर", "built_up_area_sqm"),
        ("प्रमाणपत्र का प्रकार", "पूर्ण (Full)", "certificate_type"),
        ("स्थल का पता", f"Main campus, {inst['city']} {inst['pin']}", None),
        ("जारीकर्ता प्राधिकारी", f"City Engineer, {inst['city']} Municipal Corporation", "issuing_authority"),
    ]
    for label, value, key in rows:
        x = 70 + mixed(c, 70, doc.y, f"{label}: ", 11, "Bold")
        mixed(c, x, doc.y, value, 10.5)
        if key:
            doc.marks[key] = (x, doc.y, value, 10.5)
        lines.append(f"{label}: {value}")
        doc.y -= 21
    doc.gap(6)
    para = ("स्वीकृत नक्शे के अनुसार निर्मित भवन, जिसके पूर्ण होने का प्रमाणन लाइसेंसधारी वास्तुकार एवं संरचना अभियंता "
            "द्वारा किया गया है, में अधिभोग की अनुमति प्रदान की जाती है। भवन का उपयोग केवल ऊपर बताए गए प्रयोजन के "
            "लिए किया जाएगा।")
    for line in wrap(para, 10, W - 140):
        mixed(c, 70, doc.y, line, 10)
        lines.append(line)
        doc.y -= 16
    doc.gap(6)
    doc.para("English summary: permission is granted to occupy the building constructed as per the sanctioned "
             "plan. The building shall be used only for the purpose stated above.", size=9)
    doc.signature(70, 200, "City Engineer", f"{inst['city']} Municipal Corporation (simulated)", seed=len(cert))
    doc.seal_image(seal, 330, 215)
    doc.emblem()
    fields = {"certificate_no": cert, "issue_date": issue, "institution_name": inst["name"],
              "built_up_area_sqm": f"{area:,}", "certificate_type": "Full",
              "issuing_authority": f"City Engineer, {inst['city']} Municipal Corporation"}
    return doc.bytes(), {"fields": fields, "lines": lines}
