"""Reply text in English, Hindi and Hinglish, from templates only: no model writes what the user reads.

Every number comes from execute.Result, whose items are the records behind it. Empty results name the most recent
match, so "today" on the seeded data still says something useful.
"""

from datetime import UTC, date, datetime
from typing import Any

from . import periods
from .glossary import HOWTOS, TERMS

HI_MONTHS = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"]

CATEGORY = {
    "en": {"EOA": "EoA", "INCREASE_INTAKE": "increase-in-intake"},
    "hi": {"EOA": "EoA", "INCREASE_INTAKE": "इंटेक वृद्धि"},
    "hinglish": {"EOA": "EoA", "INCREASE_INTAKE": "intake increase"},
}
CATEGORY_KEY = {"eoa": "EOA", "increase_intake": "INCREASE_INTAKE"}
STATUS = {
    "en": {"under_review": "under review", "rectification_requested": "awaiting rectification",
           "rectified": "resubmitted after rectification", "closed": "closed", "withdrawn": "withdrawn",
           "draft": "a draft", "submitted": "submitted"},
    "hi": {"under_review": "समीक्षा में", "rectification_requested": "सुधार के लिए लौटाया गया",
           "rectified": "सुधार के बाद दोबारा जमा", "closed": "बंद", "withdrawn": "वापस लिया गया",
           "draft": "ड्राफ़्ट", "submitted": "जमा"},
    "hinglish": {"under_review": "review mein", "rectification_requested": "rectification ke liye lautaya gaya",
                 "rectified": "rectify karke dobara submit", "closed": "closed", "withdrawn": "withdraw kiya gaya",
                 "draft": "draft", "submitted": "submit hua"},
}
SEVERITY = {
    "en": {"critical": "high", "high": "high", "medium": "medium", "low": "low", "info": "info"},
    "hi": {"critical": "उच्च", "high": "उच्च", "medium": "मध्यम", "low": "कम", "info": "सूचना"},
    "hinglish": {"critical": "high", "high": "high", "medium": "medium", "low": "low", "info": "info"},
}
TOPIC = {
    "en": {"fire_safety": "fire safety", "building": "the building", "land": "land", "faculty": "faculty",
           "fees": "fees", "signature": "signatures", "qr": "QR codes", "photo": "photos", "seal": "seals",
           "edits": "edits to documents", "accounts": "accounts", "intake": "intake", "bandwidth": "bandwidth"},
    "hi": {"fire_safety": "अग्नि सुरक्षा", "building": "इमारत", "land": "ज़मीन", "faculty": "फैकल्टी", "fees": "शुल्क",
           "signature": "हस्ताक्षर", "qr": "QR कोड", "photo": "फ़ोटो", "seal": "मुहर", "edits": "दस्तावेज़ों में बदलाव",
           "accounts": "खाते", "intake": "इंटेक", "bandwidth": "बैंडविड्थ"},
    "hinglish": {"fire_safety": "fire safety", "building": "building", "land": "land", "faculty": "faculty",
                 "fees": "fees", "signature": "signature", "qr": "QR", "photo": "photo", "seal": "seal",
                 "edits": "document edits", "accounts": "accounts", "intake": "intake", "bandwidth": "bandwidth"},
}
DOC_HI = {"affidavit_2": "शपथपत्र 2", "ter_receipt": "TER भुगतान रसीद", "occupancy_certificate": "अधिभोग / पूर्णता प्रमाणपत्र",
          "structural_stability": "संरचनात्मक स्थिरता प्रमाणपत्र", "fire_noc": "अग्नि सुरक्षा प्रमाणपत्र",
          "satellite_map": "उपग्रह मानचित्र", "audited_accounts": "लेखा-परीक्षित खाते", "faculty_list": "फैकल्टी सूची",
          "nba_certificate": "NBA मान्यता पत्र", "infrastructure_photo": "इन्फ्रास्ट्रक्चर फ़ोटो"}
DOC_SHORT = {"affidavit_2": "Affidavit 2", "ter_receipt": "TER receipt", "occupancy_certificate": "Occupancy certificate",
             "structural_stability": "Structural stability certificate", "fire_noc": "Fire safety certificate",
             "satellite_map": "Satellite map", "audited_accounts": "Audited accounts", "faculty_list": "Faculty roster",
             "nba_certificate": "NBA letter", "infrastructure_photo": "Infrastructure photo"}
PAGES = {
    "en": {"queue": "Review queue", "analyse": "Analyse a document", "integrity": "Integrity", "issuer_simulator":
           "Issuer simulator", "rules": "Rules", "audit": "Audit log", "platform": "Platform", "portal": "Applications"},
    "hi": {"queue": "समीक्षा कतार", "analyse": "दस्तावेज़ विश्लेषण", "integrity": "इंटीग्रिटी", "issuer_simulator":
           "जारीकर्ता सिम्युलेटर", "rules": "नियम", "audit": "ऑडिट लॉग", "platform": "प्लेटफ़ॉर्म", "portal": "आवेदन"},
    "hinglish": {"queue": "Review queue", "analyse": "Analyse a document", "integrity": "Integrity",
                 "issuer_simulator": "Issuer simulator", "rules": "Rules", "audit": "Audit log", "platform": "Platform",
                 "portal": "Applications"},
}
SECTIONS = {
    "en": {"summary": "Summary", "findings": "Findings", "documents": "Documents", "comparisons": "Comparisons",
           "activity": "Activity"},
    "hi": {"summary": "सारांश", "findings": "निष्कर्ष", "documents": "दस्तावेज़", "comparisons": "तुलना",
           "activity": "गतिविधि"},
}
ATTEMPT = {
    "en": {"source_unavailable": "source unavailable", "verification_pending": "verification pending",
           "manual_review_required": "manual review required"},
    "hi": {"source_unavailable": "स्रोत उपलब्ध नहीं", "verification_pending": "सत्यापन लंबित",
           "manual_review_required": "मैन्युअल समीक्षा ज़रूरी"},
    "hinglish": {"source_unavailable": "source unavailable", "verification_pending": "verification pending",
                 "manual_review_required": "manual review zaroori"},
}
CERT = {
    "en": {"expired_at_submission": "had expired by the submission date",
           "lapses_before_session": "lapses before the session starts", "expires_in_session": "expires during the session",
           "covers_session": "valid through the session", "unknown": "no validity date read"},
    "hi": {"expired_at_submission": "जमा करने की तारीख तक समाप्त हो चुका था",
           "lapses_before_session": "सत्र शुरू होने से पहले समाप्त", "expires_in_session": "सत्र के दौरान समाप्त",
           "covers_session": "पूरे सत्र तक वैध", "unknown": "वैधता की तारीख नहीं पढ़ी जा सकी"},
    "hinglish": {"expired_at_submission": "submission tak expire ho chuka tha",
                 "lapses_before_session": "session shuru hone se pehle khatam",
                 "expires_in_session": "session ke dauraan khatam", "covers_session": "poore session tak valid",
                 "unknown": "validity date nahi padhi ja saki"},
}
WORDS = {
    "open_workspace": {"en": "Open the workspace", "hi": "वर्कस्पेस खोलें", "hinglish": "Workspace kholiye"},
    "ask_why": {"en": "Ask why", "hi": "Ask why", "hinglish": "Ask why"},
    "open_application": {"en": "Open your application", "hi": "अपना आवेदन खोलें", "hinglish": "Apna application kholiye"},
    "decide_on": {"en": "Decide on {app}", "hi": "{app} पर Decide", "hinglish": "{app} par Decide"},
    "submitted_on": {"en": "submitted {d}", "hi": "{d} को जमा", "hinglish": "{d} ko submit"},
    "rect_by": {"en": "Rectification requested by {u}, {d}", "hi": "{u} ने रिक्टिफिकेशन माँगा, {d}",
                "hinglish": "{u} ne rectification maanga, {d}"},
    "outcome_by": {"en": "{o} by {u}, {d}", "hi": "{u} ने परिणाम दर्ज किया: {o}, {d}",
                   "hinglish": "{u} ne outcome record kiya: {o}, {d}"},
}
OUTCOMES = {
    "en": {"no_deficiency": "No deficiency", "deficiencies_recorded": "Deficiencies recorded",
           "referred_for_visit": "Referred for a visit"},
    "hi": {"no_deficiency": "कोई कमी नहीं", "deficiencies_recorded": "कमियाँ दर्ज", "referred_for_visit": "निरीक्षण के लिए भेजा"},
    "hinglish": {"no_deficiency": "koi kami nahi", "deficiencies_recorded": "kamiyan record hui",
                 "referred_for_visit": "visit ke liye bheja"},
}


def _l(lang: str) -> str:
    return lang if lang in ("en", "hi", "hinglish") else "en"


def t(key: str, lang: str, **kw: Any) -> str:
    return WORDS[key][_l(lang)].format(**kw)


def fmt_date(d: date | datetime | str | None, lang: str) -> str:
    if d is None:
        return ""
    if isinstance(d, str):
        d = date.fromisoformat(d[:10])
    if isinstance(d, datetime):
        d = (d if d.tzinfo else d.replace(tzinfo=UTC)).astimezone(periods.IST).date()
    if _l(lang) == "hi":
        return f"{d.day} {HI_MONTHS[d.month - 1]} {d.year}"
    return d.strftime("%d %b %Y").lstrip("0")


def category_label(cat: str, lang: str) -> str:
    return CATEGORY[_l(lang)].get(cat, cat)


def status_label(status: str, lang: str) -> str:
    return STATUS[_l(lang)].get(status, status.replace("_", " "))


def submitted_on(d: datetime, lang: str) -> str:
    return t("submitted_on", lang, d=fmt_date(d, lang))


def doc_label(doc_type: str | None, label: str, lang: str) -> str:
    if _l(lang) == "hi" and doc_type in DOC_HI:
        return DOC_HI[doc_type]
    return DOC_SHORT.get(doc_type or "", label)


def page_label(page: str, lang: str) -> str:
    return PAGES[_l(lang)].get(page, page)


def section_label(section: str | None, lang: str, institution: str) -> str:
    sec = SECTIONS["hi" if _l(lang) == "hi" else "en"].get(section or "summary", "")
    return f"{institution}: {sec}"


def finding_subtitle(institution: str, app_id: str, severity: str, lang: str) -> str:
    return f"{institution}, {app_id}, {SEVERITY[_l(lang)].get(severity, severity)}"


def attempt_subtitle(status: str, source: str, lang: str) -> str:
    return f"{ATTEMPT[_l(lang)].get(status, status.replace('_', ' '))}, {source}"


def cert_subtitle(c: dict[str, Any], lang: str) -> str:
    end = c["end"]["date"]
    what = CERT[_l(lang)].get(c["status"], c["status"])
    if not end:
        return what
    until = {"en": "valid until {d}", "hi": "{d} तक वैध", "hinglish": "{d} tak valid"}[_l(lang)].format(d=fmt_date(end, lang))
    return f"{until}, {what}"


def _when_dt(ts: datetime, lang: str) -> str:
    local = (ts if ts.tzinfo else ts.replace(tzinfo=UTC)).astimezone(periods.IST)
    return f"{fmt_date(local, lang)}, {local.strftime('%H:%M')}"


def decision_subtitle(kind: str, details: dict[str, Any], ts: datetime, actor: str, lang: str) -> str:
    d = _when_dt(ts, lang)
    if kind == "rectification":
        return t("rect_by", lang, u=actor, d=d)
    o = OUTCOMES[_l(lang)].get(details.get("outcome", ""), details.get("label") or "")
    return t("outcome_by", lang, o=o, u=actor, d=d)


def on_day(d: date | datetime, lang: str) -> str:
    """'today', 'yesterday' or 'on 22 Dec 2025', in the reply language."""
    if isinstance(d, datetime):
        d = (d if d.tzinfo else d.replace(tzinfo=UTC)).astimezone(periods.IST).date()
    lang = _l(lang)
    delta = (periods.today() - d).days
    if delta == 0:
        return {"en": "today", "hi": "आज", "hinglish": "aaj"}[lang]
    if delta == 1:
        return {"en": "yesterday", "hi": "कल", "hinglish": "kal"}[lang]
    return {"en": f"on {fmt_date(d, lang)}", "hi": f"{fmt_date(d, lang)} को", "hinglish": f"{fmt_date(d, lang)} ko"}[lang]


def _plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else many


# ---------------------------------------------------------------- periods


def when(w: periods.Window, lang: str, session: str | None = None) -> str:
    """'today', 'आज', 'aaj', 'between 1 Dec 2025 and 31 Dec 2025' ... or '' when there is no window."""
    lang = _l(lang)
    p = w.period
    if p == "this_session":
        return {"en": f"for the {session} session", "hi": f"{session} सत्र के लिए",
                "hinglish": f"{session} session ke liye"}[lang] if session else ""
    words = {
        "today": ("today", "आज", "aaj"), "yesterday": ("yesterday", "कल", "kal"),
        "this_week": ("this week", "इस हफ़्ते", "is hafte"), "last_week": ("last week", "पिछले हफ़्ते", "pichle hafte"),
        "last_7_days": ("in the last 7 days", "पिछले 7 दिनों में", "pichle 7 din mein"),
        "this_month": ("this month", "इस महीने", "is mahine"), "last_month": ("last month", "पिछले महीने", "pichle mahine"),
        "last_30_days": ("in the last 30 days", "पिछले 30 दिनों में", "pichle 30 din mein"),
    }
    i = {"en": 0, "hi": 1, "hinglish": 2}[lang]
    if p in words:
        return words[p][i]
    if w.first and w.last:
        if w.first == w.last:
            return {"en": f"on {fmt_date(w.first, lang)}", "hi": f"{fmt_date(w.first, lang)} को",
                    "hinglish": f"{fmt_date(w.first, lang)} ko"}[lang]
        a, b = fmt_date(w.first, lang), fmt_date(w.last, lang)
        return {"en": f"between {a} and {b}", "hi": f"{a} से {b} के बीच", "hinglish": f"{a} se {b} ke beech"}[lang]
    if w.first:
        a = fmt_date(w.first, lang)
        return {"en": f"since {a}", "hi": f"{a} से अब तक", "hinglish": f"{a} se ab tak"}[lang]
    if w.last:
        b = fmt_date(w.last, lang)
        return {"en": f"up to {b}", "hi": f"{b} तक", "hinglish": f"{b} tak"}[lang]
    return ""


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s


# ---------------------------------------------------------------- answers


def _apps_text(d: dict[str, Any], lang: str) -> str:
    f, n, w = d["filters"], d["n"], d["window"]
    cat = CATEGORY[lang].get(CATEGORY_KEY.get(f.category or "", ""), "")
    place, inst = f.place, f.institution
    st = " / ".join(status_label(s, lang) for s in (f.status or []))
    wh = when(w, lang, d["session"])
    dated = bool(wh) and d["session"] is None
    latest = d["latest"]
    if lang == "en":
        noun = " ".join(x for x in [cat, _plural(n, "application", "applications")] if x)
        quals = "".join([f" from {place}" if place else "", f" by {inst}" if inst else "", f" {st}" if st else ""])
        if n == 0:
            head = f"No {noun}{quals} " + (f"were submitted {wh}." if dated else (f"{wh}." if wh else "yet."))
            if latest:
                head += f" The latest was {on_day(latest['date'], lang)}: {latest['institution']}."
            return head
        if dated:
            return f"{n} {noun}{quals} {_plural(n, 'was', 'were')} submitted {wh}."
        if wh:
            return f"{n} {noun}{quals} {wh}."
        return f"There {_plural(n, 'is', 'are')} {n} {noun}{quals}."
    if lang == "hi":
        ke = "का" if n == 0 else "के"
        lead = "".join([f"{place} से " if place else "", f"{inst} {ke} " if inst else "", f"{cat} {ke} " if cat else ""])
        stx = f" ({st})" if st else ""
        if n == 0:
            head = (f"{wh} {lead}कोई आवेदन नहीं आया{stx}।" if dated else
                    f"{wh + ' ' if wh else ''}{lead}कोई आवेदन नहीं है{stx}।")
            if latest:
                head += f" सबसे हाल का आवेदन {on_day(latest['date'], lang)} आया था: {latest['institution']}।"
            return _cap(head)
        if dated:
            return f"{wh} {lead}{n} {_plural(n, 'आवेदन आया', 'आवेदन आए')}{stx}।"
        if st:
            return f"{wh + ' ' if wh else ''}{lead}{n} आवेदन {st} {_plural(n, 'है', 'हैं')}।"
        return f"{wh + ' ' if wh else ''}{lead}कुल {n} आवेदन {_plural(n, 'है', 'हैं')}।"
    lead = "".join([f"{place} se " if place else "", f"{inst} ke " if inst else ""])
    noun = " ".join(x for x in [cat, _plural(n, "application", "applications")] if x)
    stx = f" ({st})" if st else ""
    if n == 0:
        noun0 = " ".join(x for x in [cat, "application"] if x)
        head = (f"{wh} {lead}koi {noun0} nahi aaya{stx}." if dated else
                f"{wh + ' ' if wh else ''}{lead}koi {noun0} nahi hai{stx}.")
        if latest:
            head += f" Sabse latest {on_day(latest['date'], lang)} aaya tha: {latest['institution']}."
        return _cap(head)
    if dated:
        return _cap(f"{wh} {lead}{n} {noun} {_plural(n, 'aaya', 'aaye')}{stx}.")
    if st:
        return _cap(f"{wh + ' ' if wh else ''}{lead}{n} {noun} {st} {_plural(n, 'hai', 'hain')}.")
    return _cap(f"{wh + ' ' if wh else ''}{lead}total {n} {noun} {_plural(n, 'hai', 'hain')}.")


def _decisions_text(d: dict[str, Any], lang: str) -> str:
    f, n, w, actor = d["filters"], d["n"], d["window"], d["actor"]
    wh = when(w, lang)
    latest = d["latest"]
    kind = f.decision_type
    if lang == "en":
        noun = {"rectification": ("rectification request", "rectification requests"),
                "outcome": ("scrutiny outcome", "scrutiny outcomes")}.get(kind, ("decision", "decisions"))
        by = " by you" if actor == "me" else (f" by {actor}" if actor else "")
        if n == 0:
            head = f"No {noun[1]}{by}{' ' + wh if wh else ''}."
            if latest:
                k = "rectification requested" if latest["kind"] == "rectification" else "outcome recorded"
                head += f" The latest was {on_day(latest['date'], lang)}: {latest['institution']}, {k}."
            return head
        return f"{n} {_plural(n, noun[0], noun[1])}{by}{' ' + wh if wh else ''}."
    if lang == "hi":
        noun, verb1, verbn = {"rectification": ("रिक्टिफिकेशन अनुरोध", "भेजा", "भेजे"),
                              "outcome": ("स्क्रूटिनी परिणाम", "दर्ज किया", "दर्ज किए")}.get(kind, ("फ़ैसले", "लिया", "लिए"))
        noun0 = "फ़ैसला" if kind is None else noun
        who = "आपने " if actor == "me" else (f"{actor} ने " if actor else "")
        lead = f"{wh} " if wh else ""
        if n == 0:
            head = f"{lead}{who}कोई {noun0} नहीं {verb1}।" if who else f"{lead}कोई {noun0} दर्ज नहीं है।"
            if latest:
                k = "रिक्टिफिकेशन माँगा गया" if latest["kind"] == "rectification" else "परिणाम दर्ज हुआ"
                head += f" सबसे हाल का {on_day(latest['date'], lang)} था: {latest['institution']}, {k}।"
            return _cap(head)
        if who:
            return f"{lead}{who}{n} {noun if n != 1 else noun0} {_plural(n, verb1, verbn)}।"
        return f"{lead}{n} {noun if n != 1 else noun0} दर्ज {_plural(n, 'है', 'हैं')}।"
    noun = {"rectification": "rectification requests", "outcome": "scrutiny outcomes"}.get(kind, "decisions")
    noun0 = {"rectification": "rectification request", "outcome": "scrutiny outcome"}.get(kind, "decision")
    verb = {"rectification": ("bheji", "bheji"), "outcome": ("record kiya", "record kiye")}.get(kind, ("liya", "liye"))
    happened = {"rectification": ("bheji gayi", "bheji gayi"), "outcome": ("record hua", "record hue")}.get(
        kind, ("hua", "hue"))
    who = "aapne " if actor == "me" else (f"{actor} ne " if actor else "")
    lead = f"{wh} " if wh else ""
    if n == 0:
        head = f"{lead}{who}koi {noun0} nahi {verb[0]}." if who else f"{lead}koi {noun0} nahi {happened[0]}."
        if latest:
            k = "rectification maanga gaya" if latest["kind"] == "rectification" else "outcome record hua"
            head += f" Sabse latest {on_day(latest['date'], lang)} tha: {latest['institution']}, {k}."
        return _cap(head)
    if who:
        return _cap(f"{lead}{who}{n} {noun0 if n == 1 else noun} {_plural(n, verb[0], verb[1])}.")
    return _cap(f"{lead}{n} {noun0 if n == 1 else noun} {_plural(n, happened[0], happened[1])}.")


def _sev_breakdown(by: dict[str, int], lang: str) -> str:
    parts = [f"{by[s]} {SEVERITY[lang][s]}" for s in ("high", "medium", "low", "info") if by.get(s)]
    return ", ".join(parts)


def _findings_text(d: dict[str, Any], lang: str) -> str:
    f, n = d["filters"], d["n"]
    sev = SEVERITY[lang].get(f.severity, "") if f.severity else ""
    topic = TOPIC[lang].get(f.topic, "") if f.topic else ""
    single = d["single"]
    breakdown = _sev_breakdown(d["by_severity"], lang) if not f.severity and n else ""
    ver = d["verification_only"]
    if lang == "en":
        noun = " ".join(x for x in ["open", sev, "verification" if ver else "", _plural(n, "finding", "findings")] if x)
        about = f" about {topic}" if topic else ""
        if single:
            where = f"{single['institution']} ({single['app_id']})"
            if n == 0:
                return f"{where} has no {noun}{about}."
            return f"{where} has {n} {noun}{about}" + (f": {breakdown}." if breakdown else ".")
        scope = f" from {f.place}" if f.place else ""
        if n == 0:
            return f"No {noun}{about}{scope}."
        return (f"{n} {noun}{about} across {d['apps']} {_plural(d['apps'], 'application', 'applications')}{scope}"
                + (f": {breakdown}." if breakdown else "."))
    if lang == "hi":
        noun = " ".join(x for x in ["खुले", sev, "सत्यापन" if ver else "", "निष्कर्ष"] if x)
        about = f"{topic} से जुड़े " if topic else ""
        if single:
            where = f"{single['institution']} ({single['app_id']})"
            if n == 0:
                return f"{where} में {about}कोई {noun.replace('खुले', 'खुला')} नहीं है।"
            return f"{where} में {n} {about}{noun} हैं" + (f": {breakdown}।" if breakdown else "।")
        scope = f"{f.place} के " if f.place else ""
        if n == 0:
            return f"{scope}{about}कोई {noun.replace('खुले', 'खुला')} नहीं है।"
        return f"{scope}{d['apps']} आवेदनों में {n} {about}{noun} हैं" + (f": {breakdown}।" if breakdown else "।")
    noun = " ".join(x for x in ["open", sev, "verification" if ver else "", _plural(n, "finding", "findings")] if x)
    about = f"{topic} wale " if topic else ""
    if single:
        where = f"{single['institution']} ({single['app_id']})"
        if n == 0:
            return f"{where} mein koi {about}{noun} nahi hai."
        return f"{where} mein {n} {about}{noun} hain" + (f": {breakdown}." if breakdown else ".")
    scope = f"{f.place} ke " if f.place else ""
    if n == 0:
        return _cap(f"{scope}koi {about}{noun} nahi hai.")
    return _cap(f"{scope}{d['apps']} applications mein {n} {about}{noun} hain" + (f": {breakdown}." if breakdown else "."))


def _expiring_text(d: dict[str, Any], lang: str) -> str:
    n, s = d["n"], d["session"] or ""
    if d["by_session"]:
        if lang == "en":
            if n == 0:
                return f"No certificate ends before or during the {s} session."
            return f"{n} {_plural(n, 'certificate ends', 'certificates end')} before or during the {s} session."
        if lang == "hi":
            if n == 0:
                return f"कोई प्रमाणपत्र {s} सत्र से पहले या उसके दौरान समाप्त नहीं होता।"
            return f"{n} {_plural(n, 'प्रमाणपत्र', 'प्रमाणपत्र')} {s} सत्र से पहले या उसके दौरान समाप्त {_plural(n, 'होता है', 'होते हैं')}।"
        if n == 0:
            return f"Koi certificate {s} session se pehle ya uske dauraan khatam nahi hota."
        return f"{n} {_plural(n, 'certificate', 'certificates')} {s} session se pehle ya uske dauraan khatam {_plural(n, 'hota hai', 'hote hain')}."
    wh = when(d["window"], lang)
    if lang == "en":
        return f"No certificate expires {wh}." if n == 0 else f"{n} {_plural(n, 'certificate expires', 'certificates expire')} {wh}."
    if lang == "hi":
        return f"{wh} कोई प्रमाणपत्र समाप्त नहीं होता।" if n == 0 else f"{wh} {n} प्रमाणपत्र समाप्त {_plural(n, 'होता है', 'होते हैं')}।"
    return _cap(f"{wh} koi certificate expire nahi hota." if n == 0 else
                f"{wh} {n} {_plural(n, 'certificate expire hota hai', 'certificates expire hote hain')}.")


def _awaiting_text(d: dict[str, Any], lang: str) -> str:
    n = d["n"]
    if lang == "en":
        return "Nothing is waiting for manual confirmation." if n == 0 else \
            f"{n} verification {_plural(n, 'item is', 'items are')} waiting for manual confirmation."
    if lang == "hi":
        return "कोई सत्यापन मैन्युअल पुष्टि की प्रतीक्षा में नहीं है।" if n == 0 else \
            f"{n} सत्यापन मैन्युअल पुष्टि की प्रतीक्षा में {_plural(n, 'है', 'हैं')}।"
    return "Koi item manual confirmation ke liye pending nahi hai." if n == 0 else \
        f"{n} verification {_plural(n, 'item', 'items')} manual confirmation ke liye pending {_plural(n, 'hai', 'hain')}."


def _round(r: int, lang: str) -> str:
    if r <= 1:
        return {"en": "first submission", "hi": "पहली बार जमा", "hinglish": "first submission"}[lang]
    return {"en": f"correction round {r - 1}", "hi": f"सुधार राउंड {r - 1}", "hinglish": f"correction round {r - 1}"}[lang]


def _summary_text(d: dict[str, Any], lang: str) -> str:
    head = f"{d['institution']}, {d['app_id']}: {status_label(d['status'], lang)}, {_round(d['round'], lang)}."
    n, bd = d["open"], _sev_breakdown(d["by_severity"], lang)
    if lang == "en":
        if not d["has_run"]:
            body = " It has not been validated yet."
        elif n == 0:
            body = " No open findings."
        else:
            body = f" {n} open {_plural(n, 'finding', 'findings')}: {bd}." + (" The top ones are below." if n > 1 else "")
        tail = " Ask why explains each finding with its evidence." if d["why"] else ""
    elif lang == "hi":
        if not d["has_run"]:
            body = " इसका सत्यापन अभी नहीं हुआ है।"
        elif n == 0:
            body = " कोई खुला निष्कर्ष नहीं है।"
        else:
            body = f" {n} खुले निष्कर्ष: {bd}।" + (" सबसे अहम नीचे हैं।" if n > 1 else "")
        tail = " Ask why हर निष्कर्ष को उसके साक्ष्य के साथ समझाता है।" if d["why"] else ""
    else:
        if not d["has_run"]:
            body = " Iska validation abhi nahi hua hai."
        elif n == 0:
            body = " Koi open finding nahi hai."
        else:
            body = f" {n} open {_plural(n, 'finding', 'findings')}: {bd}." + (" Top wale neeche hain." if n > 1 else "")
        tail = " Ask why har finding ko uske evidence ke saath samjhata hai." if d["why"] else ""
    return head + body + tail


def _summary_institution_text(d: dict[str, Any], lang: str) -> str:
    app, st = d["app_id"], d["status"]
    s = status_label(st, lang)
    if lang == "en":
        head = f"Your application {app} is {s}."
        if st in ("draft", "rectification_requested"):
            k = d.get("fix", 0)
            if k == 0:
                return head + f" Nothing is missing: all {d.get('met', 0)} checked requirements are met."
            when_ = "before submitting" if st == "draft" else "before you resubmit"
            return head + f" {k} {_plural(k, 'item', 'items')} to fix {when_}:"
        if d.get("asked"):
            return head + f" AICTE asked for {d['asked']} {_plural(d['asked'], 'correction', 'corrections')}."
        nxt = {"submitted": "AICTE will review it; nothing is needed from you right now.",
               "under_review": "AICTE is reviewing it; nothing is needed from you right now.",
               "rectified": "Your corrections are with AICTE for review.",
               "closed": "Processing of this application has concluded.",
               "withdrawn": "You withdrew this application."}.get(st, "")
        return f"{head} {nxt}".strip()
    if lang == "hi":
        head = f"आपका आवेदन {app} {s} है।"
        if st in ("draft", "rectification_requested"):
            k = d.get("fix", 0)
            if k == 0:
                return head + f" कुछ भी कम नहीं है: जाँची गई सभी {d.get('met', 0)} आवश्यकताएँ पूरी हैं।"
            when_ = "जमा करने से पहले" if st == "draft" else "दोबारा जमा करने से पहले"
            return head + f" {when_} {k} {_plural(k, 'बात', 'बातें')} ठीक करनी {_plural(k, 'है', 'हैं')}:"
        if d.get("asked"):
            return head + f" AICTE ने {d['asked']} सुधार माँगे हैं।"
        nxt = {"submitted": "AICTE इसकी समीक्षा करेगा; अभी आपसे कुछ नहीं चाहिए।",
               "under_review": "AICTE इसकी समीक्षा कर रहा है; अभी आपसे कुछ नहीं चाहिए।",
               "rectified": "आपके सुधार AICTE के पास समीक्षा में हैं।",
               "closed": "इस आवेदन की प्रक्रिया पूरी हो चुकी है।",
               "withdrawn": "आपने यह आवेदन वापस ले लिया है।"}.get(st, "")
        return f"{head} {nxt}".strip()
    head = f"Aapka application {app} {s} hai."
    if st in ("draft", "rectification_requested"):
        k = d.get("fix", 0)
        if k == 0:
            return head + f" Kuch missing nahi hai: saari {d.get('met', 0)} checked requirements poori hain."
        when_ = "submit karne se pehle" if st == "draft" else "dobara submit karne se pehle"
        return head + f" {_cap(when_)} {k} {_plural(k, 'cheez', 'cheezein')} theek karni {_plural(k, 'hai', 'hain')}:"
    if d.get("asked"):
        return head + f" AICTE ne {d['asked']} corrections maange hain."
    nxt = {"submitted": "AICTE ise review karega; abhi aapse kuch nahi chahiye.",
           "under_review": "AICTE ise review kar raha hai; abhi aapse kuch nahi chahiye.",
           "rectified": "Aapke corrections AICTE ke paas review mein hain.",
           "closed": "Is application ka process poora ho chuka hai.",
           "withdrawn": "Aapne yeh application withdraw kar liya hai."}.get(st, "")
    return f"{head} {nxt}".strip()


def _action_text(d: dict[str, Any], lang: str) -> str:
    # Never echoes the requested verb: Drishti names who decides, not what it will not do
    app, inst, officer = d["app_id"], d["institution"], d["officer"]
    if lang == "en":
        text = "Officials decide in Pramana, not Drishti."
        if app:
            text += f" The decision on {app} ({inst}) is yours." if officer else \
                f" The decision on {app} ({inst}) rests with the AICTE scrutiny officer."
        if officer:
            text += " Use Decide on the application to record it." if app else " Open the application and use Decide."
        return text
    if lang == "hi":
        text = "Pramana में फ़ैसला अधिकारी लेते हैं, Drishti नहीं।"
        if app:
            text += f" {app} ({inst}) पर फ़ैसला आपका है।" if officer else \
                f" {app} ({inst}) पर फ़ैसला AICTE के जाँच अधिकारी का है।"
        if officer:
            text += " इसे आवेदन के Decide मेनू से दर्ज करें।" if app else " आवेदन खोलकर Decide इस्तेमाल करें।"
        return text
    text = "Pramana mein faisla officials lete hain, Drishti nahi."
    if app:
        text += f" {app} ({inst}) par faisla aapka hai." if officer else \
            f" {app} ({inst}) par faisla AICTE ke scrutiny officer ka hai."
    if officer:
        text += " Ise application ke Decide menu se record kijiye." if app else " Application kholkar Decide use kijiye."
    return text


SCOPE = {
    "en": "I can only help with Pramana: applications, findings, certificates, decisions, rules and using the app.",
    "hi": "मैं सिर्फ़ Pramana के काम में मदद कर सकती हूँ: आवेदन, निष्कर्ष, प्रमाणपत्र, फ़ैसले, नियम और ऐप का इस्तेमाल।",
    "hinglish": "Main sirf Pramana ke kaam mein madad kar sakti hoon: applications, findings, certificates, decisions, "
                "rules aur app ka use.",
}
CLARIFY = {
    "vague": {"en": "Could you say a little more? You can ask about applications, findings, certificates or decisions.",
              "hi": "थोड़ा और बताइए? आप आवेदन, निष्कर्ष, प्रमाणपत्र या फ़ैसलों के बारे में पूछ सकते हैं।",
              "hinglish": "Thoda aur batayiye? Aap applications, findings, certificates ya decisions ke baare mein pooch sakte hain."},
    "which_app": {"en": "Which application? Give its ID, such as A7, or the institution's name.",
                  "hi": "कौन सा आवेदन? उसका ID (जैसे A7) या संस्थान का नाम बताइए।",
                  "hinglish": "Kaunsa application? Uska ID (jaise A7) ya institution ka naam batayiye."},
    "which_page": {"en": "Which page should I open?", "hi": "कौन सा पेज खोलूँ?", "hinglish": "Kaunsa page kholun?"},
    "no_list": {"en": "Which one? Ask for a list first, then say \"open the first one\".",
                "hi": "कौन सा? पहले कोई सूची माँगिए, फिर कहिए \"पहला वाला खोलो\"।",
                "hinglish": "Kaunsa? Pehle koi list maangiye, phir kahiye \"pehla wala kholo\"."},
    "not_found": {"en": "I could not find {app_id}.", "hi": "{app_id} नहीं मिला।", "hinglish": "{app_id} nahi mila."},
    "model_off": {"en": "I did not follow that. Try one of these:", "hi": "यह समझ नहीं आया। इनमें से कुछ पूछकर देखिए:",
                  "hinglish": "Yeh samajh nahi aaya. Inmein se kuch poochiye:"},
}
REFUSE = {
    "refuse_role": {"en": "That is for scrutiny officers and administrators. Here you can ask what is awaiting "
                          "confirmation, about verification findings, or for one application's summary.",
                    "hi": "यह जानकारी स्क्रूटिनी अधिकारियों और प्रशासकों के लिए है। आप पुष्टि की प्रतीक्षा वाले सत्यापन, "
                          "सत्यापन निष्कर्ष या किसी एक आवेदन का सारांश पूछ सकते हैं।",
                    "hinglish": "Yeh scrutiny officers aur administrators ke liye hai. Aap confirmation pending items, "
                                "verification findings ya kisi ek application ka summary pooch sakte hain."},
    "refuse_own": {"en": "I can only show your own application.",
                   "hi": "मैं सिर्फ़ आपका अपना आवेदन दिखा सकती हूँ।",
                   "hinglish": "Main sirf aapka apna application dikha sakti hoon."},
    "refuse_page": {"en": "That page is for scrutiny officers and administrators.",
                    "hi": "वह पेज स्क्रूटिनी अधिकारियों और प्रशासकों के लिए है।",
                    "hinglish": "Woh page scrutiny officers aur administrators ke liye hai."},
}


def _greeting_text(d: dict[str, Any], role: str, lang: str, thanks: bool) -> str:
    if thanks:
        return {"en": "You're welcome. Anything else?", "hi": "आपका स्वागत है। और कुछ?",
                "hinglish": "Koi baat nahi! Aur kuch?"}[lang]
    name = (d.get("name") or "").split("(")[0].strip()
    name = f" {name}" if name and role != "institution" else ""
    what = {
        "officer": ("applications, findings, certificates and decisions", "आवेदनों, निष्कर्षों, प्रमाणपत्रों और फ़ैसलों",
                    "applications, findings, certificates aur decisions"),
        "admin": ("applications, findings, certificates, decisions and the audit log",
                  "आवेदनों, निष्कर्षों, प्रमाणपत्रों, फ़ैसलों और ऑडिट लॉग",
                  "applications, findings, certificates, decisions aur audit log"),
        "verifier": ("items awaiting confirmation, verification findings and application summaries",
                     "पुष्टि की प्रतीक्षा वाले सत्यापनों, सत्यापन निष्कर्षों और आवेदन सारांश",
                     "confirmation pending items, verification findings aur application summary"),
        "institution": ("your application: its status, what is missing, and what terms mean",
                        "अपने आवेदन, उसकी स्थिति, कमियों और शब्दों के अर्थ",
                        "aapka application: status, kya missing hai, aur terms ka matlab"),
    }.get(role, ("Pramana", "Pramana", "Pramana"))
    if lang == "en":
        return f"Hello{name}. I am Drishti. Ask me about {what[0]}, in English, Hindi or Hinglish."
    if lang == "hi":
        return f"नमस्ते{name}। मैं दृष्टि हूँ। {what[1]} के बारे में अंग्रेज़ी, हिंदी या हिंग्लिश में पूछिए।"
    return f"Namaste{name}! Main Drishti hoon. {_cap(what[2])} ke baare mein English, Hindi ya Hinglish mein poochiye."


def _term_text(d: dict[str, Any], lang: str) -> str:
    e = TERMS[d["term"]]
    if lang == "hi":
        return f"{e.title_hi}: {e.text_hi}"
    if lang == "hinglish":
        return f"{e.title} ka matlab: {e.text}"
    return f"{e.title}: {e.text}"


def _howto_text(d: dict[str, Any], lang: str) -> str:
    h = HOWTOS[d["howto"]]
    if not d["allowed"]:
        return {"en": f"That step ({h.title[:1].lower()}{h.title[1:]}) is done by {h.done_by} in Pramana.",
                "hi": f"Pramana में यह काम {h.done_by_hi} करते हैं: {h.title_hi}।",
                "hinglish": f"Pramana mein yeh kaam {h.done_by} karte hain: {h.title}."}[lang]
    steps = h.steps_hi if lang == "hi" else h.steps
    lines = " ".join(f"{i}. {s}" for i, s in enumerate(steps, 1))
    title = h.title_hi if lang == "hi" else h.title
    lead = {"en": f"{title}: ", "hi": f"{title}: ", "hinglish": f"{title}, aise: "}[lang]
    return lead + lines


def text(res, role: str, lang: str, *, thanks: bool = False) -> str:
    lang = _l(lang)
    d, key = res.data, res.key
    if key == "apps":
        return _apps_text(d, lang)
    if key == "decisions":
        return _decisions_text(d, lang)
    if key == "findings":
        return _findings_text(d, lang)
    if key == "expiring":
        return _expiring_text(d, lang)
    if key == "awaiting":
        return _awaiting_text(d, lang)
    if key == "summary":
        return _summary_text(d, lang)
    if key == "summary_institution":
        return _summary_institution_text(d, lang)
    if key == "action":
        return _action_text(d, lang)
    if key == "navigate":
        return {"en": f"Here is the link: {d['label']}.", "hi": f"लिंक यह है: {d['label']}।",
                "hinglish": f"Link yeh raha: {d['label']}."}[lang]
    if key == "term":
        return _term_text(d, lang)
    if key == "howto":
        return _howto_text(d, lang)
    if key == "greeting":
        return _greeting_text(d, role, lang, thanks)
    if key == "out_of_scope":
        return SCOPE[lang]
    if key in CLARIFY:
        return CLARIFY[key][lang].format(**d)
    if key in REFUSE:
        return REFUSE[key][lang]
    return CLARIFY["vague"][lang]


# ---------------------------------------------------------------- suggestion chips

STARTERS = {
    "officer": {
        "en": ["How many intake applications came today?", "Decisions by me yesterday",
               "Which certificates expire this session?", "What is rectification?"],
        "hi": ["आज कितने इंटेक आवेदन आए?", "कल मेरे फ़ैसले दिखाओ", "इस सत्र में कौन से प्रमाणपत्र समाप्त होंगे?",
               "रिक्टिफिकेशन क्या है?"],
        "hinglish": ["Aaj kitne intake applications aaye?", "Kal mere decisions dikhao",
                     "Is session kaunse certificates expire honge?", "Panchganga ka summary dikhao"],
    },
    "admin": {
        "en": ["How many applications are under review?", "Decisions this week", "Open the audit log",
               "How do I check the audit chain?"],
        "hi": ["कितने आवेदन समीक्षा में हैं?", "इस हफ़्ते के फ़ैसले दिखाओ", "ऑडिट लॉग खोलो", "ऑडिट चेन कैसे जाँचें?"],
        "hinglish": ["Kitne applications review mein hain?", "Is hafte ke decisions dikhao", "Audit log kholo",
                     "Audit chain kaise check karein?"],
    },
    "verifier": {
        "en": ["What is awaiting manual confirmation?", "High verification findings", "Summary of A9",
               "How do I record a manual confirmation?"],
        "hi": ["कौन से सत्यापन पुष्टि की प्रतीक्षा में हैं?", "उच्च सत्यापन निष्कर्ष दिखाओ", "A9 का सारांश",
               "मैन्युअल पुष्टि कैसे दर्ज करें?"],
        "hinglish": ["Kaunse items manual confirmation ke liye pending hain?", "High verification findings dikhao",
                     "A9 ka summary", "Manual confirmation kaise record karein?"],
    },
    "institution": {
        "en": ["What is missing in my application?", "What is the status of my application?", "What is rectification?",
               "How do I submit?"],
        "hi": ["मेरे आवेदन में क्या कमी है?", "मेरे आवेदन की स्थिति क्या है?", "रिक्टिफिकेशन क्या है?",
               "आवेदन कैसे जमा करें?"],
        "hinglish": ["Mere application mein kya kami hai?", "Mere application ka status kya hai?",
                     "Rectification kya hai?", "Application kaise submit karein?"],
    },
}
FOLLOW = {
    "and_yesterday": {"en": "And yesterday?", "hi": "और कल?", "hinglish": "Aur kal?"},
    "and_today": {"en": "And today?", "hi": "और आज?", "hinglish": "Aur aaj?"},
    "only_intake": {"en": "Only intake", "hi": "सिर्फ़ इंटेक वाले", "hinglish": "Sirf intake wale"},
    "list_them": {"en": "List them", "hi": "सूची दिखाओ", "hinglish": "List dikhao"},
    "how_many": {"en": "How many?", "hi": "कितने?", "hinglish": "Kitne?"},
    "only_rect": {"en": "Only rectification requests", "hi": "सिर्फ़ रिक्टिफिकेशन अनुरोध",
                  "hinglish": "Sirf rectification requests"},
    "only_outcomes": {"en": "Only outcomes", "hi": "सिर्फ़ परिणाम", "hinglish": "Sirf outcomes"},
    "only_high": {"en": "Only high", "hi": "सिर्फ़ उच्च वाले", "hinglish": "Sirf high wale"},
    "open_first": {"en": "Open the first one", "hi": "पहला वाला खोलो", "hinglish": "Pehla wala kholo"},
    "its_findings": {"en": "Its findings", "hi": "उसके निष्कर्ष", "hinglish": "Uske findings"},
    "why_flagged": {"en": "Why is it flagged?", "hi": "यह क्यों फ़्लैग हुआ?", "hinglish": "Yeh flag kyun hua?"},
    "how_rectify": {"en": "How do I request rectification?", "hi": "रिक्टिफिकेशन कैसे माँगें?",
                    "hinglish": "Rectification kaise maangein?"},
    "how_confirm": {"en": "How do I record a manual confirmation?", "hi": "मैन्युअल पुष्टि कैसे दर्ज करें?",
                    "hinglish": "Manual confirmation kaise record karein?"},
    "coverage": {"en": "What is the coverage calendar?", "hi": "कवरेज कैलेंडर क्या है?",
                 "hinglish": "Coverage calendar kya hai?"},
}


RELATED_HOWTO = {"rectification": "request_rectification", "deficiency_letter": "request_rectification",
                 "correction_round": "request_rectification", "scrutiny_outcome": "record_outcome",
                 "audit_chain": "check_audit_chain", "proof_strength": "read_proof_ladder", "ask_why": "use_ask_why",
                 "evidence_pack": "export_evidence_pack", "signed_qr": "verify_qr_by_phone",
                 "readiness_check": "fix_readiness_items", "time_machine": "analyse_document"}


def howto_question(h, lang: str) -> str:
    if _l(lang) == "hi":
        return f"{h.title_hi}?"
    if _l(lang) == "hinglish":
        return f"{h.title} kaise karein?"
    return f"How do I {h.title[:1].lower()}{h.title[1:]}?"


def starters(role: str, lang: str) -> list[str]:
    return STARTERS.get(role, STARTERS["officer"])[_l(lang)]


def suggestions(res, role: str, lang: str) -> list[str]:
    lang = _l(lang)
    d, key = res.data, res.key
    pick: list[str] = []
    if key == "apps":
        f = d["filters"]
        pick = ["and_yesterday" if f.period == "today" else "and_today"]
        if not f.category:
            pick.append("only_intake")
        if d["n"]:
            pick.append("list_them" if d["mode"] == "count" else "how_many")
        if res.items:
            pick.append("open_first")
    elif key == "decisions":
        f = d["filters"]
        pick = ["and_yesterday" if f.period == "today" else "and_today"]
        pick += ["only_outcomes"] if f.decision_type == "rectification" else ["only_rect"]
        if res.items:
            pick.append("open_first")
    elif key == "findings":
        if not d["filters"].severity:
            pick.append("only_high")
        if d["n"]:
            pick.append("open_first")
        if role == "officer":
            pick.append("how_rectify")
    elif key == "expiring":
        pick = ["open_first"] if d["n"] else []
        pick.append("coverage")
    elif key == "awaiting":
        pick = ["open_first"] if d["n"] else []
        pick.append("how_confirm")
    elif key == "summary":
        pick = (["its_findings"] + ([] if d["why"] else ["why_flagged"])) if d["open"] else []
        if role == "officer":
            pick.append("how_rectify")
    if pick:
        return [FOLLOW[k][lang] for k in pick if k][:4]
    chips = starters(role, lang)
    if key in ("term", "howto"):
        # A related how-to first, then starters that do not ask the same thing again
        related = HOWTOS.get(RELATED_HOWTO.get(d.get("term") or "", ""))
        own = TERMS[d["term"]].aliases if d.get("term") else HOWTOS[d["howto"]].aliases
        rest = [c for c in chips if not any(a in c.lower() for a in own if len(a) > 3)]
        lead = [howto_question(related, lang)] if related and role in related.roles else []
        return (lead + rest)[:3]
    return chips[:3] if key in ("out_of_scope", "refuse_role", "refuse_own", "refuse_page") else chips[:4]
