"""Document life story: a chain of custody built only from evidence inside the file and Pramana's own records.

Every event says where its time comes from and how far that source can be trusted. Times written inside a file
(CreationDate, ModDate, EXIF) are claims by whatever software saved it. A signing time is asserted by the signer's
software unless a timestamp token backs it. Only Pramana's own records are a trusted clock here. Which revision a
signature covers comes from its signed byte range, not from any clock, so "changed after signing" rests on the
file's structure. Every anomaly is an indicator for an official to look at, never proof.
"""

import io
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import pikepdf
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import serializers as ser
from ..auth import OFFICIAL_ROLES, load_application, require_roles
from ..crypto import DocumentPurged, load_document, sha256_hex
from ..db import get_db
from ..forensics.pdf_struct import IST, editors_named, pdf_date, revision_offsets
from ..history.revisions import describe
from ..models import AuditEvent, Document, Finding, User, ValidationRun, VerificationAttempt, round_label
from ..rules.engine import active_ruleset

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["insights"])

# source -> (trust level, what an official reads next to the time)
TRUST = {
    "pramana": ("trusted", "Recorded by Pramana (trusted)"),
    "tsa": ("trusted", "Backed by a timestamp token (trusted time)"),
    "signer": ("self_asserted", "Self-asserted by the signer's software"),
    "device": ("self_asserted", "Stated in signed Content Credentials (the device's own clock)"),
    "metadata": ("editable", "From file metadata (editable)"),
    "exif": ("editable", "From the photo's EXIF (editable)"),
    "printed": ("claim", "Printed on the page (what the document claims)"),
    "structure": ("none", "No time recorded; placed in file order"),
}

# Printed dates that say when a document was issued, by field name, with how the page names them
ISSUE_FIELDS = {"issue_date": "Date of issue", "sworn_date": "Date of affirmation", "payment_date": "Payment date",
                "valid_from": "Valid from"}
MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
# Gazette mastheads print the date with the weekday: "New Delhi, Tuesday, January 7, 2025"
PRINTED_LONG_DATE = re.compile(rf"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+({MONTHS})\s+"
                               r"(\d{1,2}),\s*(\d{4})", re.I)
# The Gazette of India number carries the publication date: CG-DL-E-18062020-220000
GAZETTE_CODE = re.compile(r"CG-[A-Z]{2}-[A-Z]-(\d{2})(\d{2})(\d{4})-\d+")
# A save within this many seconds of a signature or the creation is the same moment, not a separate event
SAME_MOMENT_S = 120
# Created this long after the printed issue date: worth a neutral note, common for downloaded or re-issued copies
LONG_AFTER_ISSUE_DAYS = 180

LIMITATIONS = [
    "Times written inside a file are set by the software that saved it and can be changed by anyone who edits the "
    "file. Only times recorded by Pramana, or backed by a timestamp token, are trusted clocks.",
    "Which revision a signature covers comes from the bytes it signed, not from any clock, so a change after "
    "signing is shown even when every time in the file is wrong.",
    "An event with no recorded time is placed in file order between its neighbours.",
    "A gap or warning is an indicator to look at. Legitimate workflows also re-save, annotate and re-issue files.",
]


# ---------------------------------------------------------------- times


def _time(at: datetime | None, source: str, raw: str | None = None, *, zone: bool = True,
          precision: str = "second") -> dict[str, Any]:
    trust, label = TRUST[source]
    return {"at": at.astimezone(UTC).isoformat() if at else None, "raw": raw, "zone_recorded": zone,
            "precision": precision, "source": source, "trust": trust, "label": label}


def _iso(s: Any) -> datetime | None:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=IST)


def _exif(s: Any) -> datetime | None:
    try:
        return datetime.strptime(str(s).strip(), "%Y:%m:%d %H:%M:%S").replace(tzinfo=IST)
    except (TypeError, ValueError):
        return None


def span(seconds: float) -> str:
    """A duration in words, rounded to its largest sensible unit."""
    s = abs(seconds)
    if s < 1.5:
        return "1 second"
    if s < 90:
        return f"{round(s)} seconds"
    if s < 90 * 60:
        return f"{round(s / 60)} minutes"
    if s < 36 * 3600:
        h = round(s / 3600)
        return "1 hour" if h == 1 else f"{h} hours"
    days = round(s / 86400)
    if days < 60:
        return "1 day" if days == 1 else f"{days} days"
    months = round(days / 30.44)
    if months < 24:
        return f"{months} months"
    y, mo = divmod(months, 12)
    return f"{y} years" + (f" {mo} months" if mo else "")


def _at(e: dict[str, Any]) -> datetime | None:
    return _iso((e.get("time") or {}).get("at"))


# ---------------------------------------------------------------- reading the file


def revision_infos(data: bytes, ends: list[int]) -> list[dict[str, str]]:
    """The document information dictionary as it stood at each revision (CreationDate, ModDate, Producer...)."""
    out = []
    for end in ends:
        try:
            with pikepdf.open(io.BytesIO(data[:end])) as pdf:
                info = {str(k).lstrip("/"): str(v) for k, v in pdf.docinfo.items()} if pdf.docinfo else {}
                if not info.get("CreationDate") or not info.get("Creator"):
                    try:
                        with pdf.open_metadata() as m:
                            info.setdefault("CreationDate", str(m.get("xmp:CreateDate") or "") or None)
                            info.setdefault("Creator", str(m.get("xmp:CreatorTool") or "") or None)
                    except Exception:  # noqa: BLE001  broken XMP leaves the Info dictionary as the only source
                        pass
        except Exception:  # noqa: BLE001  a truncated revision may not open on its own
            info = {}
        out.append({k: v for k, v in info.items() if v})
    return out


def _tool(info: dict[str, str]) -> str | None:
    creator, producer = info.get("Creator"), info.get("Producer")
    if creator and producer and creator != producer:
        return f"{creator}, {producer}"
    return creator or producer


def _short(text: str, n: int = 60) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1].rstrip() + "..."


def _change_line(c: dict[str, Any]) -> str:
    before, after = c.get("before_text") or c.get("removed_text"), c.get("after_text") or c.get("added_text")
    if c.get("text_underneath"):
        return f"'{_short(c.get('added_text') or '')}' was drawn over '{_short(c['text_underneath'])}' on page {c['page']}"
    if before and after and before != after:
        return f"'{_short(before)}' became '{_short(after)}' on page {c['page']}"
    if after:
        return f"'{_short(after)}' was added on page {c['page']}"
    return f"'{_short(before or '')}' was removed on page {c['page']}"


def _signer_word(role: str | None) -> str:
    return {"issuer": "the issuer", "applicant": "the applicant"}.get(role or "", "a signer")


# ---------------------------------------------------------------- the builder


class _Story:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self.anomalies: list[dict[str, Any]] = []
        self.coverage: list[dict[str, Any]] = []

    def add(self, kind: str, title: str, detail: str, time: dict[str, Any], **kw: Any) -> dict[str, Any]:
        e = {"id": f"e{len(self.events) + 1}", "kind": kind, "title": title, "detail": detail, "time": time,
             "origin": kw.pop("origin", "file"), "tone": kw.pop("tone", "neutral"), "actor": kw.pop("actor", None),
             "role": kw.pop("role", None), "tool": kw.pop("tool", None), "revision": kw.pop("revision", None),
             "link": kw.pop("link", None), "region": kw.pop("region", None), **kw}
        self.events.append(e)
        return e

    def flag(self, code: str, severity: str, title: str, detail: str, start: dict[str, Any] | None,
             end: dict[str, Any] | None, basis: str, interval: float | None = None) -> None:
        self.anomalies.append({"code": code, "severity": severity, "title": title, "detail": detail,
                               "from": start["id"] if start else None, "to": end["id"] if end else None,
                               "basis": basis, "interval_s": interval})


def _issued(st: _Story, fields: list[dict[str, Any]], pages: list[dict[str, Any]]) -> dict[str, Any] | None:
    for name, label in ISSUE_FIELDS.items():
        f = next((x for x in fields if x.get("name") == name and x.get("value")), None)
        if not f:
            continue
        try:
            day = datetime.fromisoformat(str(f["value"])[:10]).replace(tzinfo=IST)
        except ValueError:
            continue
        region = {"page": f["page"], "bbox": f["bbox"]} if f.get("page") and f.get("bbox") else None
        return st.add("issued", "Issued (printed)", f"{label} printed on the page: {f.get('raw') or f['value']}. "
                      "This is what the document says about itself; the issuer can confirm it.",
                      _time(day, "printed", f.get("raw") or str(f["value"]), precision="day"),
                      link={"to": "region", **region} if region else None, region=region, field=name)
    text = next((p.get("text") or "" for p in pages if p.get("page_no") == 1), "")
    m = PRINTED_LONG_DATE.search(text[:3000])
    if m:
        try:
            day = datetime.strptime(f"{m.group(1).title()} {m.group(2)} {m.group(3)}", "%B %d %Y").replace(tzinfo=IST)
        except ValueError:
            day = None
        if day:
            return st.add("issued", "Dated (printed)", f"The masthead on page 1 reads '{_short(m.group(0), 80)}'. "
                          "This is the date the document states, read from the page text.",
                          _time(day, "printed", m.group(0), precision="day"), link={"to": "page", "page": 1})
    m = GAZETTE_CODE.search(text[:3000])
    if m:
        try:
            day = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)), tzinfo=IST)
        except ValueError:
            return None
        return st.add("issued", "Dated (printed)", f"The gazette number on page 1, {m.group(0)}, carries this "
                      "publication date. It was read from the page text.",
                      _time(day, "printed", m.group(0), precision="day"), link={"to": "page", "page": 1})
    return None


def _pdf_events(st: _Story, data: bytes, revisions: dict[str, Any] | None, sig_responses: dict[str, dict[str, Any]],
                fields: list[dict[str, Any]], pages: list[dict[str, Any]], issuer_doc: bool) -> None:
    ends = revision_offsets(data) or [len(data)]
    infos = revision_infos(data, ends)
    revs = (revisions or {}).get("revisions") or []
    sigs = (revisions or {}).get("signatures") or []
    count = len(ends)
    first = infos[0] if infos else {}

    issued = _issued(st, fields, pages)
    created_at, zone = pdf_date(first.get("CreationDate"))
    tool = _tool(first)
    tool_line = f"The creating tool recorded is {tool}." if tool else "No creating tool is recorded."
    created = st.add(
        "created", "Created", f"{tool_line} That tool also wrote the creation time, so both are claims made by the "
        "software, not proof." + ("" if zone or not created_at else " No time zone was recorded; read as IST."),
        _time(created_at, "metadata" if created_at else "structure", first.get("CreationDate"), zone=zone),
        tool=tool, revision=1, link={"to": "revision", "rev": 1} if count > 1 else {"to": "page", "page": 1},
        thumb={"rev": 1, "page": 1})

    sig_events: dict[int, list[dict[str, Any]]] = {}
    for n in range(1, count + 1):
        r = revs[n - 1] if n - 1 < len(revs) else {}
        info, prev = infos[n - 1] if n - 1 < len(infos) else {}, infos[n - 2] if n >= 2 and n - 2 < len(infos) else {}
        for s in [x for x in sigs if x.get("revision") == n]:
            resp = sig_responses.get(s.get("field") or "", {})
            role = s.get("role") or resp.get("signer_role") or "unknown"
            when = _iso(s.get("signing_time") or resp.get("signing_time"))
            tsa = "timestamp token" in str(resp.get("time_source") or "")
            who = s.get("signer") or resp.get("signer") or "an unnamed signer"
            through = "revision 1" if n == 1 else f"revisions 1 to {n}"
            status = s.get("status")
            e = st.add(
                "signed", {"issuer": "Issuer signed", "applicant": "Applicant signed"}.get(role, "Signed"),
                f"{who} signed revision {n} of {count}. The signature covers {through}"
                + (", the whole file." if n == count else f"; the revision{'s' if count - n > 1 else ''} after it "
                   f"{'are' if count - n > 1 else 'is'} not covered.")
                + ("" if when else " The signature records no signing time."),
                _time(when, "tsa" if tsa else "signer" if when else "structure", s.get("signing_time")),
                actor=who, role=role, revision=n, status=status, field=s.get("field"),
                link={"to": "signature", "field": s.get("field"), "rev": n}, thumb={"rev": n, "page": 1},
                tone="attention" if status == "mismatch" else "neutral")
            sig_events.setdefault(n, []).append(e)
            st.coverage.append({"field": s.get("field"), "signer": who, "role": role, "through_revision": n,
                                "revision_count": count, "event": e["id"], "from_event": created["id"]})
        if n == 1:
            continue
        changes = r.get("changes") or []
        # A signature brings its own widget annotation; only annotations beyond it are an event
        annots = bool(r.get("adds_annotations")) and n not in sig_events
        if not changes and not annots and n in sig_events:
            continue
        mod, mzone = pdf_date(info.get("ModDate"))
        pmod, _ = pdf_date(prev.get("ModDate"))
        timed = mod is not None and (pmod is None or abs((mod - pmod).total_seconds()) >= 1)
        new_tool = info.get("Producer") if info.get("Producer") != prev.get("Producer") else None
        after = bool(r.get("after_last_signature")) or any(k < n for k in sig_events)
        if changes:
            kind, title = "edited", f"Edited, revision {n}"
            detail = "; ".join(_change_line(c) for c in changes[:2]) + ("" if len(changes) <= 2 else
                                                                        f"; {len(changes) - 2} more changes") + "."
        elif annots:
            kind, title = "annotated", f"Annotated, revision {n}"
            detail = ("An annotation was added. Annotations draw on top of the page and do not change its text "
                      "layer, so the time machine shows what it looks like.")
        else:
            kind, title = "updated", f"Re-saved, revision {n}"
            detail = "The file was saved again with no visible text change, typical of metadata or form updates."
        detail += (f" The saving tool recorded is {new_tool}." if new_tool else "")
        detail += "" if timed else " This revision did not record a new modification time."
        first_change = next((c for c in changes if c.get("bbox")), None)
        region = {"page": first_change["page"], "bbox": first_change["bbox"]} if first_change else None
        st.add(kind, title, detail,
               _time(mod if timed else None, "metadata" if timed else "structure", info.get("ModDate") if timed else None,
                     zone=mzone),
               tool=new_tool, revision=n, region=region, link={"to": "revision", "rev": n},
               thumb={"rev": n, "page": (first_change or {}).get("page") or 1, "box": region},
               tone="warning" if after and (changes or annots) else "attention" if after else "neutral",
               after_signature=after)

    # One-revision files: a last save that is not the creation or a signature is its own event
    if count == 1:
        mod, mzone = pdf_date(first.get("ModDate"))
        near = [t for t in (_at(e) for e in st.events if e["kind"] in ("created", "signed")) if t]
        if mod and not any(abs((mod - t).total_seconds()) <= SAME_MOMENT_S for t in near):
            st.add("updated", "Last modified", "The file's modification time. Saving a file again updates it without "
                   "changing the content, so it says little on its own.",
                   _time(mod, "metadata", first.get("ModDate"), zone=mzone), tool=first.get("Producer"), revision=1,
                   link={"to": "page", "page": 1})

    _pdf_anomalies(st, created, issued, tool, issuer_doc)


def _pdf_anomalies(st: _Story, created: dict[str, Any], issued: dict[str, Any] | None, tool: str | None,
                   issuer_doc: bool) -> None:
    signed = [e for e in st.events if e["kind"] == "signed"]
    for e in st.events:
        if e["kind"] not in ("edited", "annotated", "updated") or not e.get("after_signature"):
            continue
        before = [s for s in signed if s["revision"] < e["revision"]]
        if not before:
            continue
        s = next((x for x in reversed(before) if x["role"] == "issuer"), before[-1])
        who = (s["actor"] or "the signer").split(",")[0]
        t0, t1 = _at(s), _at(e)
        gap = (t1 - t0).total_seconds() if t0 and t1 else None
        when = (f" By the file's own clocks this was {span(gap)} after {who} signed (signing time self-asserted, "
                "edit time from editable metadata)." if gap is not None and gap >= 0 else
                " No trustworthy time says how long after." if gap is None else
                " The file's clocks put this before the signing time, so at least one of them is wrong.")
        what = {"edited": "Visible text changed", "annotated": "An annotation was added",
                "updated": "The file was saved again"}[e["kind"]]
        sev = ("high" if s["role"] == "issuer" else "medium") if e["kind"] != "updated" else "info"
        title = {"edited": "Changed after", "annotated": "Annotated after", "updated": "Saved again after"}[e["kind"]]
        title += f" {_signer_word(s['role'])} signed" if s["role"] in ("issuer", "applicant") else " signing"
        st.flag("STORY-AFTER-SIGNING", sev, title,
                f"{what} in revision {e['revision']}, after {who} signed revision {s['revision']}. The signature "
                f"covers revisions 1 to {s['revision']} only, so this change is outside it." + when,
                s, e, "structure", gap)

    if issuer_doc and signed and all(s["role"] == "applicant" for s in signed):
        s = signed[0]
        st.flag("STORY-APPLICANT-ONLY", "medium", "Signed only by the applicant",
                f"The only signature is the applicant's own ({s['actor'] or 'unnamed signer'}), from the institution that submits the file. "
                "It shows the institution vouches for this copy, not that the issuer issued it. The issuer's "
                "signature, register or signed QR is what confirms the issue.", s, s, "structure")

    if issuer_doc and not signed:
        st.flag("STORY-NO-SIGNATURE", "info", "No digital signature in the file",
                "Nothing in the file ties it to a signer, so every time and tool it records is a claim that anyone "
                "re-saving it could change. The issuer's register or signed QR can still confirm the document.",
                created, created, "structure")

    editors = editors_named(tool or "")
    if issuer_doc and editors:
        st.flag("STORY-EDITOR-CREATED", "medium", "Made with a desktop editor or converter",
                f"The creating tool recorded in the file is {tool}. An issuer's own system usually produces its "
                "certificates, so this file may be a copy re-made or converted from the original. Ask for the "
                "original or confirm it with the issuer. The tool name is metadata and can be absent or changed.",
                created, created, "metadata")

    c, i = _at(created), _at(issued) if issued else None
    if c and i:
        c_ist = c.astimezone(IST).date()
        days = (c_ist - i.astimezone(IST).date()).days
        if days < 0:
            st.flag("STORY-CREATED-BEFORE-ISSUE", "medium", "File created before its printed issue date",
                    f"The file's creation time ({c_ist.strftime('%d %b %Y')}) is {span(-days * 86400)} before the "
                    f"issue date printed on it ({i.strftime('%d %b %Y')}). A template prepared in advance can explain "
                    "this; the creation time is metadata and can be wrong. Confirm the issue date with the issuer.",
                    created, issued, "metadata")
        elif days > LONG_AFTER_ISSUE_DAYS:
            st.flag("STORY-CREATED-LONG-AFTER-ISSUE", "info", "File created long after its printed issue date",
                    f"The file was created {span(days * 86400)} after the issue date printed on it. This is common "
                    "for copies downloaded or re-issued later, and is not a concern on its own. The original issue "
                    "can be confirmed with the issuer.", issued, created, "metadata")


def _photo_events(st: _Story, facts: dict[str, Any], photo: dict[str, Any]) -> None:
    c2pa = photo.get("c2pa") or {}
    original, saved = facts.get("DateTimeOriginal"), facts.get("DateTime")
    camera = " ".join(x for x in (facts.get("Make"), facts.get("Model")) if x) or None
    taken = _exif(original)
    captured = None
    if taken or camera:
        captured = st.add(
            "captured", "Captured", (f"The camera recorded as {camera}." if camera else "No camera is recorded.")
            + " EXIF capture times are written by the camera or app and record no time zone; read as IST.",
            _time(taken, "exif" if taken else "structure", original, zone=False), actor=camera,
            link={"to": "photo"}, thumb={"photo": True})
    signed = None
    if c2pa.get("present") and c2pa.get("readable"):
        who = (c2pa.get("signer") or {}).get("common_name") or "an unnamed signer"
        org = (c2pa.get("signer") or {}).get("organization")
        when = _iso(c2pa.get("signed_time") or c2pa.get("capture_time"))
        signed = st.add(
            "credentials", "Credentials signed",
            f"{who}{f' ({org})' if org else ''} signed a manifest describing the capture"
            + (f", made with {c2pa['claim_generator']}" if c2pa.get("claim_generator") else "") + ". "
            + ("The signature validates." if c2pa.get("signature_valid") else "The signature does not validate.")
            + " Trust is checked against a DEMO capture list only.",
            _time(when, "device" if when else "structure", c2pa.get("signed_time") or c2pa.get("capture_time")),
            actor=who, link={"to": "credentials"}, simulated=True,
            tone="neutral" if c2pa.get("signature_valid") else "attention")
        for a in c2pa.get("actions") or []:
            if a.get("action") in ("c2pa.created", "c2pa.opened"):
                continue
            label = str(a.get("action") or "action").removeprefix("c2pa.").replace("_", " ")
            st.add("c2pa_action", f"Credentials: {label}",
                   f"The signed manifest records the action '{label}'"
                   + (f" by {a['software']}" if a.get("software") else "") + ". Recorded actions are disclosed edits.",
                   _time(_iso(a.get("when")), "device" if a.get("when") else "structure", a.get("when")),
                   tool=a.get("software"), link={"to": "credentials"})
        if captured and c2pa.get("signature_valid"):
            st.coverage.append({"field": c2pa.get("manifest_label"), "signer": who, "role": "device",
                                "through_revision": 1, "revision_count": 1, "event": signed["id"],
                                "from_event": captured["id"]})
        if c2pa.get("hash_matches") is False:
            mod = st.add("modified", "Modified later",
                         "The image no longer matches the hash its Content Credentials signed, so its pixels or "
                         "metadata changed after the camera signed it. The file records no time for that change.",
                         _time(None, "structure"), link={"to": "credentials"}, tone="warning", after_signature=True)
            st.flag("STORY-PHOTO-MODIFIED", "high", "Photo modified after capture",
                    "The Content Credentials were signed at capture and still validate, but the file no longer "
                    "matches what they signed. Ask for the original photo or retake it during inspection.",
                    signed, mod, "structure")
    later = _exif(saved)
    software = facts.get("Software")
    if later and taken and (later - taken).total_seconds() > SAME_MOMENT_S:
        e = st.add("saved", f"Saved by {software}" if software else "Saved again",
                   "EXIF records a later save time than the capture time. Both are written by software and can be "
                   "edited.", _time(later, "exif", saved, zone=False), tool=software, link={"to": "photo"},
                   tone="attention")
        st.flag("STORY-PHOTO-SAVED-LATER", "low", "Saved after capture",
                f"EXIF says the photo was saved{f' by {software}' if software else ''} {span((later - taken).total_seconds())}"
                " after it was captured. Cropping or resizing is common and harmless; compare with the scene on site.",
                captured, e, "metadata", (later - taken).total_seconds())


def _order(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Time order where a time is known; an event with none stays after the event before it in file order."""
    keyed: list[tuple[datetime, int, dict[str, Any]]] = []
    last: datetime | None = None
    first_known = next((t for t in (_at(e) for e in events) if t), None)
    for i, e in enumerate(events):
        t = _at(e)
        if t is not None:
            last = t
        key = t or last or first_known or datetime.now(UTC)
        keyed.append((key, i, e))
    keyed.sort(key=lambda k: (k[0], k[1]))
    for n, (key, _, e) in enumerate(keyed):
        e["seq"] = n
        e["sort_at"] = key.astimezone(UTC).isoformat()
    return [k[2] for k in keyed]


def build_story(*, mime: str, data: bytes | None, fields: list[dict[str, Any]] | None = None,
                pages: list[dict[str, Any]] | None = None, facts: dict[str, Any] | None = None,
                photo: dict[str, Any] | None = None, revisions: dict[str, Any] | None = None,
                signatures: list[dict[str, Any]] | None = None, own: list[dict[str, Any]] | None = None,
                issuer_doc: bool = False) -> dict[str, Any]:
    """The life story of one file. Shared by the document route and Analyse.

    signatures are validation responses (field, signer, signer_role, signing_time, time_source); own lists
    Pramana's own events as dicts for _Story.add with origin "pramana".
    """
    st = _Story()
    pdf = mime == "application/pdf"
    if pdf and data:
        responses = {str(s.get("field")): s for s in signatures or [] if s.get("field")}
        _pdf_events(st, data, revisions, responses, fields or [], pages or [], issuer_doc)
    elif photo is not None:
        _photo_events(st, facts or {}, photo)
    for o in own or []:
        o = dict(o)
        st.add(o.pop("kind"), o.pop("title"), o.pop("detail"), o.pop("time"), origin="pramana", **o)
    events = _order(st.events)
    sev_rank = {"high": 0, "medium": 1, "low": 2, "info": 3}
    anomalies = sorted(st.anomalies, key=lambda a: sev_rank.get(a["severity"], 9))
    known = [t for t in (_at(e) for e in events) if t]
    worst = next((a for a in anomalies if a["severity"] != "info"), None)
    return {
        "kind": "pdf" if pdf else "photo",
        "events": events,
        "anomalies": anomalies,
        "coverage": st.coverage,
        "revision_count": len(revision_offsets(data) or [b""]) if pdf and data else None,
        "first_at": min(known).isoformat() if known else None,
        "last_at": max(known).isoformat() if known else None,
        "headline": worst["title"] if worst else "No gap or warning in this file's story",
        "trust_levels": [{"source": k, "trust": v[0], "label": v[1]} for k, v in TRUST.items()],
        "limitations": LIMITATIONS,
    }


def pramana_event(kind: str, title: str, detail: str, at: datetime | None, **kw: Any) -> dict[str, Any]:
    return {"kind": kind, "title": title, "detail": detail, "time": _time(at, "pramana" if at else "structure"), **kw}


# ---------------------------------------------------------------- the document route


def _own_events(db: Session, doc: Document, data: bytes) -> list[dict[str, Any]]:
    out = []
    up = db.scalars(select(AuditEvent).where(AuditEvent.action == "document.uploaded", AuditEvent.object_id == doc.id)
                    .order_by(AuditEvent.seq)).first()
    who = None
    if doc.uploaded_by:
        u = db.get(User, doc.uploaded_by)
        who = u.display_name or u.username if u else None
    who = who or (up.actor if up else None)
    same = sha256_hex(data) == doc.sha256
    out.append(pramana_event(
        "uploaded", "Uploaded", f"Uploaded{f' by {who}' if who else ''} as {doc.original_filename}. Pramana recorded "
        f"its SHA-256 ({doc.sha256[:12]}) at upload"
        + ("; the stored file still matches it." if same else ", and the stored file no longer matches it."),
        doc.uploaded_at, actor=who, link={"to": "audit"}, sha256=doc.sha256, tone="neutral" if same else "warning"))
    runs = db.scalars(select(ValidationRun).where(ValidationRun.application_id == doc.application_id,
                                                  ValidationRun.round >= doc.round,
                                                  ValidationRun.started_at >= doc.uploaded_at - timedelta(seconds=5))
                      .order_by(ValidationRun.started_at)).all()
    if runs:
        src = {"digital": "its text layer", "ocr": "OCR", "mixed": "its text layer and OCR"}.get(doc.text_source or "",
                                                                                                 "the pipeline")
        hindi = any(n.get("script") == "devanagari" for n in (doc.analysis or {}).get("ocr_scripts") or [])
        what = ("Capture metadata, Content Credentials and the room were read" if doc.mime.startswith("image/") else
                f"Read with {src}{', including Hindi lines through Devanagari OCR' if hindi else ''}, "
                f"{doc.page_count} page{'s' if doc.page_count != 1 else ''}")
        out.append(pramana_event(
            "read", "Read", f"{what}.", runs[0].started_at, link={"to": "fields"}))
    for r in runs[-3:]:
        if r.status != "complete" or not r.finished_at:
            continue
        count = len(db.scalars(select(Finding.id).where(Finding.run_id == r.id, Finding.document_id == doc.id)).all())
        out.append(pramana_event(
            "checked", f"Checked, {round_label(r.round)}",
            f"Validation run {r.id} checked this file with ruleset {r.ruleset_id}: "
            + (f"{count} finding{'s point' if count != 1 else ' points'} at it." if count else "no finding points at it."),
            r.finished_at, link={"to": "findings"}, run_id=r.id, findings=count))
    return out


def story_for_document(db: Session, doc: Document) -> dict[str, Any]:
    data = load_document(doc.storage_name)
    an = doc.analysis or {}
    detail = ser.document(doc, detail=True)
    attempts = db.scalars(select(VerificationAttempt).where(VerificationAttempt.document_id == doc.id)
                          .order_by(VerificationAttempt.started_at.desc())).all()
    pdf = doc.mime == "application/pdf"
    revisions = describe(doc, data, attempts) if pdf else None
    sig_responses = [a.response or {} for a in attempts
                     if a.channel in ("issuer_signature", "applicant_signature", "pdf_signature")]
    spec = active_ruleset().doc_types.get(doc.declared_type or doc.detected_type or "", {})
    vspec = spec.get("verification") or {}
    story = build_story(mime=doc.mime, data=data, fields=detail["fields"], pages=detail["pages"],
                        facts=an.get("forensic_facts") or {}, photo=an.get("photo") or {}, revisions=revisions,
                        signatures=sig_responses, own=_own_events(db, doc, data),
                        issuer_doc=bool(vspec.get("issuer") or vspec.get("issuer_signers")))
    return {"document_id": doc.id, "application_id": doc.application_id, "filename": doc.original_filename, **story}


@router.get("/documents/{doc_id}/story")
def document_story(doc_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)), db: Session = Depends(get_db)):
    """The document's life story. Officials only: it reads like forensics and institutions never see it."""
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    load_application(db, user, doc.application_id)
    try:
        return story_for_document(db, doc)
    except DocumentPurged as e:
        raise HTTPException(410, "The file was purged under the retention policy, so its story cannot be read.") from e
