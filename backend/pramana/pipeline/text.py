"""Text with word-level geometry, so every extracted value can point at a page region.

Coordinates are in page units with a top-left origin: PDF points for PDFs, pixels for images.
Digital text layers are read directly; pages without one are rendered and sent to OCR.
"""

import io
from dataclasses import asdict, dataclass, field

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image

OCR_DPI = 200
MIN_DIGITAL_CHARS = 25


@dataclass
class Word:
    text: str
    x0: float
    top: float
    x1: float
    bottom: float
    font: str | None = None
    size: float | None = None
    conf: float | None = None


@dataclass
class Line:
    words: list[Word]
    text: str = ""
    starts: list[int] = field(default_factory=list)

    def __post_init__(self):
        parts, pos = [], 0
        self.starts = []
        for w in self.words:
            self.starts.append(pos)
            parts.append(w.text)
            pos += len(w.text) + 1
        self.text = " ".join(parts)

    def span_words(self, start: int, end: int) -> list[Word]:
        out = []
        for w, s in zip(self.words, self.starts, strict=True):
            if s < end and s + len(w.text) > start:
                out.append(w)
        return out


@dataclass
class PageText:
    page_no: int
    width: float
    height: float
    source: str
    words: list[Word]
    mean_conf: float | None = None
    lines: list[Line] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(ln.text for ln in self.lines)

    def words_json(self) -> list[list]:
        return [[w.text, round(w.x0, 2), round(w.top, 2), round(w.x1, 2), round(w.bottom, 2), w.font, w.size, w.conf]
                for w in self.words]

    def as_dict(self) -> dict:
        d = asdict(self)
        d.pop("lines")
        return d


def bbox_of(words: list[Word]) -> list[float] | None:
    if not words:
        return None
    return [
        round(min(w.x0 for w in words), 2),
        round(min(w.top for w in words), 2),
        round(max(w.x1 for w in words), 2),
        round(max(w.bottom for w in words), 2),
    ]


def group_lines(words: list[Word]) -> list[Line]:
    """Cluster words into reading-order lines by vertical overlap."""
    if not words:
        return []
    ws = sorted(words, key=lambda w: ((w.top + w.bottom) / 2, w.x0))
    lines: list[list[Word]] = []
    for w in ws:
        mid = (w.top + w.bottom) / 2
        h = max(w.bottom - w.top, 1.0)
        if lines:
            cur = lines[-1]
            cmid = sum((x.top + x.bottom) / 2 for x in cur) / len(cur)
            if abs(mid - cmid) < 0.5 * h:
                cur.append(w)
                continue
        lines.append([w])
    out = []
    for ln in lines:
        ln.sort(key=lambda w: w.x0)
        out.append(Line(ln))
    return out


def render_pdf_page(data: bytes, page_index: int, dpi: int = 110) -> Image.Image:
    pdf = pdfium.PdfDocument(data)
    try:
        page = pdf[page_index]
        img = page.render(scale=dpi / 72).to_pil()
        page.close()
        return img.convert("RGB")
    finally:
        pdf.close()


def _ocr_page(img: Image.Image, scale: float, page_no: int, width: float, height: float) -> PageText:
    from .ocr import ocr_image

    result = ocr_image(img)
    if result is None:
        return PageText(page_no, width, height, "unreadable", [])
    words = [
        Word(t, x0 / scale, top / scale, x1 / scale, bottom / scale, None, None, conf)
        for t, x0, top, x1, bottom, conf in result
    ]
    confs = [w.conf for w in words if w.conf is not None]
    pt = PageText(page_no, width, height, "ocr", words, sum(confs) / len(confs) if confs else None)
    pt.lines = group_lines(words)
    return pt


def extract_pdf(data: bytes) -> list[PageText]:
    pages: list[PageText] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for i, page in enumerate(pdf.pages):
            raw = page.extract_words(extra_attrs=["fontname", "size"], keep_blank_chars=False)
            words = [
                Word(w["text"], w["x0"], w["top"], w["x1"], w["bottom"], w.get("fontname"), round(w.get("size", 0), 2))
                for w in raw
            ]
            n_chars = sum(len(w.text) for w in words)
            if n_chars >= MIN_DIGITAL_CHARS:
                pt = PageText(i + 1, float(page.width), float(page.height), "digital", words)
                pt.lines = group_lines(words)
            else:
                img = render_pdf_page(data, i, OCR_DPI)
                pt = _ocr_page(img, OCR_DPI / 72, i + 1, float(page.width), float(page.height))
            pages.append(pt)
    return pages


def extract_image(data: bytes) -> list[PageText]:
    with Image.open(io.BytesIO(data)) as im:
        img = im.convert("RGB")
    return [_ocr_page(img, 1.0, 1, float(img.width), float(img.height))]
