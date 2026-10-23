"""Child side of the parser sandbox: parses untrusted files and answers in plain JSON.

Started by pramana.sandbox as `python -m pramana.sandbox_worker`. Requests and replies are length-prefixed
frames on stdin and stdout. Nothing is unpickled on either side, so a parser that misbehaves can only return
data, never code, and the server decides what to do with it.
"""

import io
import json
import os
import struct
import sys
import time
from dataclasses import asdict
from datetime import date, datetime
from typing import Any

MAX_FRAME = 256 * 1024 * 1024


def _default(o: Any) -> Any:
    if isinstance(o, datetime | date):
        return o.isoformat()
    if isinstance(o, set | tuple):
        return list(o)
    if isinstance(o, bytes):
        return o.decode("latin-1")
    raise TypeError(f"not serialisable: {type(o).__name__}")


def encode(obj: Any) -> bytes:
    return json.dumps(obj, default=_default, separators=(",", ":")).encode()


def read_exact(f, n: int) -> bytes | None:
    buf = bytearray()
    while len(buf) < n:
        chunk = f.read(n - len(buf))
        if not chunk:
            return None
        buf += chunk
    return bytes(buf)


def read_frame(f, limit: int = MAX_FRAME) -> bytes | None:
    head = read_exact(f, 4)
    if head is None:
        return None
    (n,) = struct.unpack(">I", head)
    if n > limit:
        raise ValueError(f"frame of {n} bytes exceeds the {limit} byte limit")
    return read_exact(f, n)


def write_frame(f, payload: bytes) -> None:
    f.write(struct.pack(">I", len(payload)) + payload)


# Operations. Each takes the file bytes first and returns (JSON-able result, optional binary blob).


def op_pages(data: bytes, mime: str):
    from .pipeline.text import extract_image, extract_pdf

    pages = extract_pdf(data) if mime == "application/pdf" else extract_image(data)
    return [{"page_no": p.page_no, "width": p.width, "height": p.height, "source": p.source, "mean_conf": p.mean_conf,
             "words": [[w.text, w.x0, w.top, w.x1, w.bottom, w.font, w.size, w.conf] for w in p.words],
             "ocr": p.ocr}
            for p in pages], None


def op_qr(data: bytes, mime: str, page_count: int):
    from .verification.signed_qr import decode_qr

    out = []
    if mime == "application/pdf":
        from .pipeline.text import render_pdf_page

        for i in range(min(page_count, 3)):
            # Dense signed tokens need more pixels per module; stop at the first resolution that decodes
            for dpi in (150, 220, 300):
                found = decode_qr(render_pdf_page(data, i, dpi))
                if found:
                    scale = dpi / 72
                    out.extend({"page": i + 1, "text": t, "bbox": [round(v / scale, 2) for v in box]}
                               for t, box in found)
                    break
    else:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as im:
            for text, box in decode_qr(im):
                out.append({"page": 1, "text": text, "bbox": [round(v, 2) for v in box]})
    return out, None


def op_fingerprints(data: bytes, mime: str, text: str):
    from .forensics import fingerprints

    return fingerprints.compute(data, mime, text), None


def op_forensics(data: bytes, mime: str, issue_date: str | None, campus: list[float] | None):
    if mime == "application/pdf":
        from .forensics import pdf_struct

        signals, facts = pdf_struct.analyse(data, datetime.fromisoformat(issue_date) if issue_date else None)
    else:
        from .forensics import image as img_forensics

        signals, facts = img_forensics.analyse(data, tuple(campus) if campus else None)
    return {"signals": [asdict(s) for s in signals], "facts": facts}, None


def op_seal_images(data: bytes):
    from .forensics import seals

    return seals.image_fingerprints(data), None


def op_font_check(data: bytes, fields: list[dict[str, Any]], facts: dict[str, Any] | None):
    from types import SimpleNamespace

    from .forensics import fonts

    signals = fonts.font_mismatches(data, [SimpleNamespace(**f) for f in fields], facts)
    return [asdict(s) for s in signals], None


def op_render(data: bytes, mime: str, page_index: int, dpi: int):
    from PIL import Image

    if mime == "application/pdf":
        from .pipeline.text import render_pdf_page

        img = render_pdf_page(data, page_index, dpi)
    else:
        with Image.open(io.BytesIO(data)) as im:
            img = im.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return {"width": img.width, "height": img.height}, buf.getvalue()


def op_intake(data: bytes, filename: str):
    from .pipeline.intake import UploadRejected, _validate_upload_local

    try:
        res = _validate_upload_local(filename, data)
    except UploadRejected as e:
        return {"rejected": str(e)}, None
    return {"mime": res.mime, "page_count": res.page_count, "active_content": res.active_content,
            "notes": res.notes}, None


# Self-test operations used by the test suite and the overhead benchmark to prove the limits hold.


def op_selftest_sleep(_data: bytes | None, seconds: float):
    time.sleep(seconds)
    return {"slept": seconds}, None


def op_selftest_alloc(_data: bytes | None, mb: int):
    block = bytearray(mb * 1024 * 1024)
    for i in range(0, len(block), 4096):
        block[i] = 1
    return {"allocated_mb": mb}, None


def op_selftest_exit(_data: bytes | None, code: int):
    os._exit(code)


def op_selftest_echo(data: bytes | None):
    return {"bytes": len(data or b""), "pid": os.getpid()}, None


OPS = {
    "pages": op_pages,
    "qr": op_qr,
    "fingerprints": op_fingerprints,
    "forensics": op_forensics,
    "seal_images": op_seal_images,
    "font_check": op_font_check,
    "render": op_render,
    "intake": op_intake,
    "selftest_sleep": op_selftest_sleep,
    "selftest_alloc": op_selftest_alloc,
    "selftest_exit": op_selftest_exit,
    "selftest_echo": op_selftest_echo,
}


def run_op(op: str, args: list[Any], data: bytes | None) -> tuple[dict[str, Any], bytes | None]:
    """Run one operation and shape the reply; ordinary parser exceptions come back as errors."""
    fn = OPS.get(op)
    if fn is None:
        return {"ok": False, "kind": "error", "error": f"unknown operation {op}"}, None
    try:
        result, blob = fn(data, *args)
        return {"ok": True, "result": result, "blob": blob is not None}, blob
    except MemoryError:
        return {"ok": False, "kind": "memory", "error": "the parser ran out of its memory allowance"}, None
    except Exception as e:  # noqa: BLE001  reported to the server, which routes the file to manual review
        return {"ok": False, "kind": "error", "error": f"{type(e).__name__}: {e}"[:600]}, None


def _posix_limits(mem_mb: int) -> None:
    import resource

    if mem_mb > 0:
        cap = mem_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (cap, cap))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    if sys.platform.startswith("linux"):
        import ctypes
        import signal

        # Die with the server instead of lingering as an orphan
        ctypes.CDLL(None).prctl(1, signal.SIGKILL)


def windows_full_speed() -> None:
    """Opt out of EcoQoS power throttling, which Windows applies to windowless background processes."""
    import ctypes
    from ctypes import wintypes

    class _Throttle(ctypes.Structure):
        _fields_ = [("Version", wintypes.ULONG), ("ControlMask", wintypes.ULONG), ("StateMask", wintypes.ULONG)]

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.GetCurrentProcess.restype = wintypes.HANDLE
    k32.SetProcessInformation.argtypes = [wintypes.HANDLE, ctypes.c_int, wintypes.LPVOID, wintypes.DWORD]
    state = _Throttle(1, 0x1, 0)  # version 1, control EXECUTION_SPEED, state off
    k32.SetProcessInformation(k32.GetCurrentProcess(), 4, ctypes.byref(state), ctypes.sizeof(state))


def main() -> None:
    if os.name == "nt":
        windows_full_speed()
    ipc = os.fdopen(os.dup(sys.stdout.fileno()), "wb", buffering=0)
    # Libraries that print would corrupt the reply channel, so ordinary stdout goes to stderr from here on
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout = sys.stderr
    inp = sys.stdin.buffer
    if os.name != "nt":
        _posix_limits(int(os.environ.get("PRAMANA_SANDBOX_MEMORY_MB", "0") or 0))
    import logging

    logging.basicConfig(level=logging.WARNING)
    for noisy in ("pdfminer", "RapidOCR", "fontTools", "PIL"):
        logging.getLogger(noisy).setLevel(logging.ERROR)
    # Import the parsers before saying ready, so the first real request does not pay for it
    from .forensics import fingerprints, pdf_struct  # noqa: F401
    from .pipeline import intake, text  # noqa: F401

    # On Windows the server assigns the Job Object before it reads this line; untrusted bytes only arrive after
    write_frame(ipc, encode({"ready": True, "pid": os.getpid()}))
    while True:
        head = read_frame(inp)
        if head is None:
            return
        req = json.loads(head)
        data = read_frame(inp) if req.get("blob") else None
        reply, blob = run_op(req.get("op", ""), req.get("args", []), data)
        try:
            payload = encode(reply)
        except (TypeError, ValueError) as e:
            payload, blob = encode({"ok": False, "kind": "error", "error": f"unserialisable result: {e}"}), None
        write_frame(ipc, payload)
        if blob is not None:
            write_frame(ipc, blob)


if __name__ == "__main__":
    main()
