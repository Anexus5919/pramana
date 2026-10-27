"""Deterministic parser for common phrasings in English, Hindi and Hinglish, including follow-ups.

It returns a complete intent or None; None sends an in-scope message on to the model. Order matters: requests to
act come first, then navigation, glossary and help, the institution's own application, the data questions and
finally refinements of the previous question.
"""

import re
from dataclasses import dataclass, field
from datetime import date

from .glossary import HOWTOS, TERMS
from .guard import Catalog, Entities, fold, is_greeting
from .intents import Filters, Intent, Target

DEV = chr(0x900) + "-" + chr(0x97F)


def rx(*roman: str, deva: tuple[str, ...] = ()) -> re.Pattern[str]:
    """Roman alternatives as whole words; Devanagari ones bounded by non-Devanagari characters."""
    alts = []
    if roman:
        alts.append(r"\b(?:" + "|".join(roman) + r")\b")
    if deva:
        # \w does not match Devanagari vowel signs, so a word's suffix is spelled as a Devanagari run
        deva = tuple(d.replace(r"\w*", f"[{DEV}]*") for d in deva)
        alts.append(rf"(?<![{DEV}])(?:" + "|".join(deva) + rf")(?![{DEV}])")
    return re.compile("|".join(alts), re.I)


def dx(*deva: str) -> tuple[str, ...]:
    # Devanagari words that may take a vowel sign or suffix: matched as prefixes
    return tuple(d + rf"[{DEV}]*" for d in deva)


PERIODS = [
    ("last_7_days", rx(r"(?:last|past|pichle|pichhle)\s+(?:7|seven|saat)\s+(?:days|din)",
                       deva=(r"पिछले\s*(?:7|सात)\s*दिन[ों]*",))),
    ("last_30_days", rx(r"(?:last|past|pichle|pichhle)\s+(?:30|thirty|tees)\s+(?:days|din)",
                        deva=(r"पिछले\s*(?:30|तीस)\s*दिन[ों]*",))),
    ("last_week", rx(r"(?:last|previous|pichle|pichhle)\s+(?:week|hafte|hafta)",
                     deva=(r"पिछले\s*(?:हफ्ते|हफ़्ते|सप्ताह)",))),
    ("this_week", rx(r"(?:this|is|current)\s+(?:week|hafte|hafta)", deva=(r"इस\s*(?:हफ्ते|हफ़्ते|सप्ताह)",))),
    ("last_month", rx(r"(?:last|previous|pichle|pichhle)\s+(?:month|mahine|mahina)", deva=(r"पिछले\s*महीने",))),
    ("this_month", rx(r"(?:this|is|current)\s+(?:month|mahine|mahina)", deva=(r"इस\s*महीने",))),
    ("this_session", rx(r"(?:this|is|current|the|coming|upcoming)\s+(?:academic\s+)?(?:session|year)", r"session",
                        deva=(r"इस\s*(?:सत्र|सेशन|साल)", "सत्र"))),
    ("yesterday", rx(r"yesterday", r"kal", r"yday", deva=("कल",))),
    ("today", rx(r"today", r"todays", r"today's", r"aaj", deva=("आज",))),
    ("all", rx(r"all\s+time", r"ever", r"so\s+far", r"till\s+(?:now|date)", r"ab\s+tak", r"abhi\s+tak", r"overall",
               deva=(r"अब\s*तक",))),
]
CATEGORY = [
    ("increase_intake", rx(r"increased?\s+(?:in\s+)?intake", r"intake\s+increase", r"intake", r"seats?\s+badh\w*",
                           deva=("इंटेक", r"सीट[ें]*\s*बढ़\w*"))),
    ("eoa", rx(r"eoa", r"extension\s+of\s+approval", r"extensions?", deva=("ईओए",))),
]
STATUS = [
    ("rectification_requested", rx(r"awaiting\s+rectification", r"rectification\s+requested",
                                   r"sent\s+(?:back\s+)?for\s+rectification", r"in\s+rectification")),
    ("rectified", rx(r"rectified", r"resubmitted")),
    ("under_review", rx(r"under\s+review", r"in\s+review", r"pending", r"review\s+(?:mein|me)",
                        deva=("समीक्षाधीन", r"जा[ंँ]च\s*में", "लंबित"))),
    ("closed", rx(r"closed")),
    ("withdrawn", rx(r"withdrawn", r"withdrew", deva=(r"वापस\s*लि\w*",))),
    ("draft", rx(r"drafts?", deva=("ड्राफ्ट", "ड्राफ़्ट"))),
]
ROUND = [
    ("first", rx(r"first\s+(?:round|submission)", r"pehl[ae]\s+round", deva=(r"पहल[ाे]\s*राउंड",))),
    ("correction", rx(r"correction\s+rounds?", r"resubmissions?", r"second\s+round", deva=(r"सुधार\s*राउंड",))),
]
SEVERITY = [
    ("high", rx(r"high", r"serious", r"critical", r"major", r"severe", r"gambhir", deva=("गंभीर", "हाई"))),
    ("medium", rx(r"medium", r"moderate", deva=("मध्यम", "मीडियम"))),
    ("low", rx(r"low", r"minor", deva=(r"कम\s*गंभीर",))),
]
TOPICS = [
    ("fire_safety", rx(r"fire", r"noc", deva=("अग्नि", "फायर", "एनओसी"))),
    ("building", rx(r"building", r"occupancy", r"structural", r"built[- ]up", deva=("इमारत", "भवन"))),
    ("land", rx(r"land", r"acres?", r"satellite", deva=("ज़मीन", "जमीन", "भूमि"))),
    ("faculty", rx(r"faculty", r"faculties", r"teachers?", r"roster", r"staff", deva=("फैकल्टी", "संकाय", "शिक्षक"))),
    ("fees", rx(r"fees?", r"ter", r"payment", deva=("शुल्क", "फीस"))),
    ("signature", rx(r"signatures?", r"dsc", r"signed", deva=dx("हस्ताक्षर"))),
    ("qr", rx(r"qr", deva=("क्यूआर",))),
    ("photo", rx(r"photos?", r"images?", r"pictures?", deva=("फ़ोटो", "फोटो", "तस्वीर"))),
    ("seal", rx(r"seals?", r"stamps?", deva=("मुहर",))),
    ("edits", rx(r"edit(?:s|ed|ing)?", r"overwritten", r"altered", r"tamper\w*", r"modified", r"whiteout",
                 deva=("बदलाव",))),
    ("accounts", rx(r"accounts", r"balance\s+sheet", deva=("खाते",))),
    ("bandwidth", rx(r"bandwidth", r"internet", deva=("इंटरनेट",))),
    ("intake", rx(r"intake", r"seats?", deva=("इंटेक", "सीट"))),
]
ACTOR_ME = rx(r"by\s+me", r"my", r"mine", r"i\s+(?:made|took|recorded|did|requested|sent|decided|raised)", r"mere",
              r"mera", r"meri", r"maine", deva=("मेरे", "मेरा", "मेरी", "मैंने"))
OPEN_ONLY = rx(r"open\s+findings?", r"unresolved", r"pending\s+findings?", r"khule")

HOW_SHAPE = rx(r"how\s+(?:do|can|should|to|would|does)", r"how\s+i", r"steps?\s+(?:to|for)", r"process\s+(?:to|for)",
               r"kaise", r"guide\s+me", deva=("कैसे",))
TERM_SHAPE = rx(r"what\s+(?:is|are|does|do)", r"what'?s", r"meaning", r"means?", r"explain", r"define", r"definition",
                r"kya\s+(?:hai|hain|hota|hoti|hote)", r"matlab", r"samjhao", r"samjha\s+do",
                deva=(r"क्या\s*(?:है|हैं|होता|होती|होते)", "मतलब", "समझाओ", "समझाइए", "अर्थ"))
ACTION = [
    ("approve", rx(r"approve", r"sanction", r"(?:approve|manjoor|manzoor|sanction|pass)\s+(?:karo|kar\s+do|kardo|kijiye|kar\s+dijiye)",
                   deva=(r"स्वीकृत\s*कर\w*", r"मंज़?ूर\s*कर\w*", r"अप्रूव\s*कर\w*"))),
    ("reject", rx(r"reject", r"deny", r"disapprove", r"(?:reject|cancel)\s+(?:karo|kar\s+do|kardo|kijiye)",
                  deva=(r"अस्वीकार\s*कर\w*", r"रिजेक्ट\s*कर\w*"))),
    ("rectify", re.compile(r"^\W*(?:please\s+|pls\s+|kindly\s+)?(?:request|send|raise|issue|start)\s+(?:a\s+|the\s+)?"
                           r"rectification\b|\brectification\s+(?:request\s+)?(?:bhejo|bhej\s+do|maango|mango|karo|kar\s+do)\b"
                           r"|रिक्टिफिकेशन\s*(?:भेजो|माँगो|मांगो)", re.I)),
    ("outcome", re.compile(r"^\W*(?:please\s+|kindly\s+)?(?:record|enter|mark)\s+(?:a\s+|an\s+|the\s+)?(?:scrutiny\s+)?"
                           r"outcome\b|\boutcome\s+(?:record|darj)\s+(?:karo|kar\s+do)\b", re.I)),
]
NAV = rx(r"open", r"go\s+to", r"goto", r"take\s+me", r"navigate", r"jump\s+to", r"le\s+chalo", r"kholo", r"khol\s+do",
         r"kholiye", r"khole", r"khol", deva=("खोलो", "खोलें", "खोलिए", r"ले\s*चलो", r"पर\s*जाओ"))
PAGE_WORD = rx(r"page", r"screen", r"tab", deva=("पेज", "पृष्ठ"))
PAGES = [
    ("audit", rx(r"audit(?:\s+log)?", deva=("ऑडिट",))),
    ("queue", rx(r"(?:review\s+)?queue", r"dashboard", r"home(?:\s*page)?", deva=("डैशबोर्ड", "कतार"))),
    ("analyse", rx(r"analy[sz](?:e|is|er)", r"verify\s+(?:a\s+)?pdf", deva=("विश्लेषण",))),
    ("integrity", rx(r"integrity", r"network", r"faculty\s+overlaps?", deva=("इंटीग्रिटी",))),
    ("issuer_simulator", rx(r"issuers?", r"simulator", r"issuer\s+simulator", deva=("सिम्युलेटर",))),
    ("rules", rx(r"rules?", r"ruleset", deva=("नियम",))),
    ("platform", rx(r"platform", deva=("प्लेटफ़ॉर्म", "प्लेटफॉर्म"))),
    ("portal", rx(r"portal", r"my\s+applications", deva=("पोर्टल",))),
]
SECTIONS = [
    ("findings", rx(r"findings?", deva=("निष्कर्ष",))),
    ("documents", rx(r"documents?", r"docs", deva=dx("दस्तावेज"))),
    ("comparisons", rx(r"comparisons?", r"compare", deva=("तुलना",))),
    ("activity", rx(r"activity", r"history", r"audit\s+trail", deva=("गतिविधि",))),
    ("summary", rx(r"summary", deva=("सारांश",))),
]
ORDINALS = [
    (1, rx(r"first", r"1st", r"pehla", r"pehli", r"pehle", r"pahla", r"pahli", deva=("पहला", "पहली", "पहले"))),
    (2, rx(r"second", r"2nd", r"doosra", r"dusra", r"doosri", r"dusri", deva=("दूसरा", "दूसरी"))),
    (3, rx(r"third", r"3rd", r"teesra", r"tisra", r"teesri", deva=("तीसरा", "तीसरी"))),
    (-1, rx(r"last\s+one", r"aakhri", r"akhri", deva=("आखिरी", "आख़िरी"))),
]
ORDINAL_NOUN = rx(r"one", r"wala", r"wali", r"waala", r"waali", r"item", r"result", r"application", r"row",
                  r"entry", r"college", deva=("वाला", "वाली", "आवेदन"))
ITS = rx(r"its", r"it's", r"uska", r"uski", r"uske", r"iska", r"iski", r"iske", r"that\s+one'?s?", r"this\s+one'?s?",
         deva=("उसका", "उसकी", "उसके", "इसका", "इसकी", "इसके"))
WHY = rx(r"why", r"kyu", r"kyun", r"kyon", deva=("क्यों",))
READINESS = rx(r"missing", r"kami\w*", r"baaki", r"baki", r"bacha", r"readiness", r"next\s+steps?",
               r"what\s+(?:should|do|must)\s+i\s+do", r"aage\s+kya", r"fix", r"ready", r"status", r"sthiti",
               r"my\s+application", r"mer[ai]\s+(?:application|aavedan|avedan)", r"what\s+is\s+pending",
               deva=dx("कमी", "स्थिति", "बाकी") + (r"अगला\s*कदम", r"मेर[ाे]\s*आवेदन"))
EXPIRING = rx(r"expir\w*", r"laps\w*", r"validity", r"valid\s+(?:till|until|upto)", r"khatam", r"khatm", r"samaapt",
              deva=dx("समाप्त", "ख़त्म", "खत्म", "वैधता"))
AWAIT = rx(r"awaiting\s+(?:manual\s+)?confirmation", r"manual\s+confirmations?", r"waiting\s+for\s+(?:manual\s+)?confirmation",
           r"needs?\s+(?:manual\s+)?confirmation", r"to\s+(?:be\s+)?confirmed", r"pending\s+verifications?",
           r"verifications?\s+pending", r"verification\s+queue", r"confirmation\s+queue", r"unconfirmed", r"pushti",
           r"confirmation\s+(?:\w+\s+){0,3}pending", r"pending\s+(?:manual\s+)?confirmations?",
           deva=dx("पुष्टि"))
DECISIONS = rx(r"decisions?", r"decided", r"faisl\w*", r"faisle", r"outcomes?\s+(?:recorded|by)", r"recorded\s+outcomes?",
               r"rectification\s+requests?", r"(?:i|maine)\s+requested\s+rectification", r"requested\s+rectification",
               r"actions?\s+by", r"only\s+outcomes", r"sirf\s+outcomes",
               deva=dx("फैसल", "फ़ैसल", "निर्णय") + (r"रिक्टिफिकेशन\s*अनुरोध", r"सिर्फ़?\s*परिणाम"))
ABOUT_US = rx(r"pramana", r"drishti", deva=("दृष्टि",))
# "Open" as an adjective ("open findings") is not a request to navigate
OPEN_ADJ = re.compile(r"\bopen\s+(?:findings?|issues?|items?|cases?|applications?|ones|rectifications?|concerns?)\b",
                      re.I)
FINDINGS = rx(r"findings?", r"flags?", r"flagged", r"issues?", r"problems?", r"red\s+flags?", r"concerns?", r"missing",
              r"kami\w*", r"ghost\s+faculty", r"faculty\s+overlaps?", r"shared\s+faculty", deva=dx("कमी", "निष्कर्ष", "फाइंडिंग", "समस्या"))
SUMMARY = rx(r"summary", r"status", r"details?", r"overview", r"sthiti", r"haal", r"about", r"batao", r"tell\s+me",
             r"kya\s+hua", r"update", deva=dx("स्थिति", "सारांश", "बताओ", "बताइए") + (r"के\s*बारे",))
COUNT = rx(r"how\s+many", r"count", r"number\s+of", r"no\.?\s+of", r"kitn[eai]", r"total", deva=dx("कितन", "संख्या"))
LIST = rx(r"list", r"show", r"dikha\w*", r"which", r"kaun\s*se", r"kaunse", r"konse", r"kaun\s*si", r"give\s+me",
          r"batao", r"sab", r"saare", r"sare", r"all", deva=dx("दिखा", "बताओ", "सभी", "सारे", "सूची") + (r"कौन\s*स[ेी]",))
APPS_NOUN = rx(r"applications?", r"apps", r"colleges?", r"institutions?", r"institutes?", r"requests?", r"proposals?",
               r"cases?", r"submissions?", r"aavedan", r"avedan", deva=dx("आवेदन", "कॉलेज", "संस्थान", "अनुरोध"))
FOLLOW = re.compile(rf"^\W*(?:and|aur|also|what\s+about|how\s+about|only|just|sirf|bas|now|ab|और|सिर्फ|सिर्फ़|अब)\b"
                    rf"|^\W*(?:और|सिर्फ|सिर्फ़|अब)(?![{DEV}])", re.I)
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
DATE_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
DATE_DMY = re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b")
DATE_TEXT = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})\b")
SINCE = rx(r"since", r"after", r"from", r"se\s+(?:ab|lekar)")
UNTIL = rx(r"until", r"till", r"before", r"upto", r"up\s+to", r"tak")


@dataclass
class Context:
    role: str
    language: str = "en"
    previous: Intent | None = None
    last_items: list[dict] = field(default_factory=list)
    # The application open in the workspace when the message was sent
    page_application: str | None = None
    # An institution's own applications, newest last
    own_applications: list[str] = field(default_factory=list)


@dataclass
class Parsed:
    intent: Intent
    # A request to act ("approve A7"): answered with "officials decide" and a link to Decide
    action: str | None = None
    # "Open the first one": the remembered item it points at
    item: dict | None = None
    # "Why is this flagged": a short summary plus a link to Ask why
    why: bool = False
    # An institution asking what is missing or what to do next
    readiness: bool = False


def _first(table, t: str):
    for key, pattern in table:
        if pattern.search(t):
            return key
    return None


def _dates(t: str) -> tuple[str | None, str | None]:
    found: list[tuple[int, date]] = []
    for m in DATE_ISO.finditer(t):
        try:
            found.append((m.start(), date(int(m[1]), int(m[2]), int(m[3]))))
        except ValueError:
            pass
    for m in DATE_DMY.finditer(t):
        try:
            found.append((m.start(), date(int(m[3]), int(m[2]), int(m[1]))))
        except ValueError:
            pass
    for m in DATE_TEXT.finditer(t):
        mon = MONTHS.get(m[2][:3])
        if mon:
            try:
                found.append((m.start(), date(int(m[3]), mon, int(m[1]))))
            except ValueError:
                pass
    if not found:
        return None, None
    found.sort()
    days = [d.isoformat() for _, d in found]
    if len(days) >= 2:
        return days[0], days[-1]
    pre = t[:found[0][0]]
    if SINCE.search(pre[-20:]):
        return days[0], None
    if UNTIL.search(pre[-20:]) or UNTIL.search(t[found[0][0]:found[0][0] + 30]):
        return None, days[0]
    return days[0], days[0]


def _apps_of(cat: Catalog, inst_id: str) -> list[str]:
    return sorted(a for a, i in cat.applications.items() if i == inst_id)


def _application(ents: Entities, cat: Catalog, ctx: Context, *, use_page: bool = True) -> str | None:
    """The one application a message is about: an ID, a named institution's latest, the page, or an
    institution's own."""
    if ents.applications:
        return ents.applications[0]
    if ents.unknown_applications:
        return ents.unknown_applications[0]
    if len(ents.institutions) == 1:
        apps = _apps_of(cat, ents.institutions[0].id)
        if apps:
            return apps[-1]
    if use_page and ctx.page_application:
        return ctx.page_application
    if ctx.role == "institution" and ctx.own_applications:
        return ctx.own_applications[-1]
    # The application the conversation was last about
    if ctx.previous and ctx.previous.filters.application:
        return ctx.previous.filters.application
    return None


def _filters(t: str, ents: Entities, ctx: Context, *, findings: bool = False) -> dict:
    """Every filter the message states, as Filters fields."""
    f: dict = {}
    d_from, d_to = _dates(t)
    if d_from or d_to:
        f["date_from"], f["date_to"] = d_from, d_to
    else:
        p = _first(PERIODS, t)
        if p:
            f["period"] = p
    topic = _first(TOPICS, t)
    cat = _first(CATEGORY, t)
    if findings:
        if topic:
            f["topic"] = topic
    else:
        if cat:
            f["category"] = cat
    st = _first(STATUS, t)
    if st:
        f["status"] = [st]
    r = _first(ROUND, t)
    if r:
        f["round"] = r
    sev = _first(SEVERITY, t)
    if sev:
        f["severity"] = sev
    if ACTOR_ME.search(t):
        f["actor"] = "me"
    else:
        m = re.search(r"\bby\s+([a-z0-9_.-]+)", t)
        if m and m.group(1) in ents.usernames:
            f["actor"] = m.group(1)
    if OPEN_ONLY.search(t):
        f["open_only"] = True
    if ents.places:
        f["place"] = ents.places[0]
    if len(ents.institutions) == 1 and not ents.applications:
        f["institution"] = ents.institutions[0].name
    if ents.applications:
        f["application"] = ents.applications[0]
    return f


def _intent(name: str, ctx: Context, filters: dict | None = None, **kw) -> Intent:
    return Intent(intent=name, filters=Filters(**(filters or {})), language=ctx.language, **kw)


def _alias_hit(t: str, table: dict) -> str | None:
    """The key whose longest alias appears in the text."""
    best, size = None, 0
    for key, entry in table.items():
        for a in entry.aliases:
            pattern = rx(re.escape(a).replace(r"\ ", r"\s+")) if re.match(r"[a-z0-9]", a) else \
                rx(deva=(re.escape(a) + rf"[{DEV}]*",))
            if len(a) > size and pattern.search(t):
                best, size = key, len(a)
    return best


def term_key(text: str) -> str | None:
    return _alias_hit(fold(text), TERMS)


def howto_key(text: str) -> str | None:
    return _alias_hit(fold(text), HOWTOS)


def _navigate(t: str, ents: Entities, cat: Catalog, ctx: Context) -> Parsed | None:
    nav = bool(NAV.search(t))
    ordinal = next((n for n, p in ORDINALS if p.search(t)), None)
    if ordinal is not None and not re.search(r"\b(?:round|submission)\b", t) and (nav or ORDINAL_NOUN.search(t)):
        if not ctx.last_items:
            return Parsed(_intent("clarify", ctx, follow_up=True))
        idx = ordinal - 1 if ordinal > 0 else len(ctx.last_items) - 1
        if idx >= len(ctx.last_items):
            return Parsed(_intent("clarify", ctx, follow_up=True))
        item = ctx.last_items[idx]
        flt = {"application": item["application_id"]} if item.get("application_id") else {}
        return Parsed(_intent("navigate", ctx, flt, target=Target(page=item.get("page") or "application"),
                              follow_up=True), item=item)
    if not nav and not PAGE_WORD.search(t):
        return None
    app = ents.applications[0] if ents.applications else None
    if app is None and len(ents.institutions) == 1:
        apps = _apps_of(cat, ents.institutions[0].id)
        app = apps[-1] if apps else None
    section = _first(SECTIONS, t)
    if app:
        doc = "fire_noc" if re.search(r"\bfire\b|\bnoc\b", t) else None
        return Parsed(_intent("navigate", ctx, {"application": app},
                              target=Target(page="application", section=section or ("documents" if doc else None),
                                            document=doc)))
    page = _first(PAGES, t)
    if page:
        return Parsed(_intent("navigate", ctx, target=Target(page=page)))
    if nav and section and ctx.page_application:
        return Parsed(_intent("navigate", ctx, {"application": ctx.page_application},
                              target=Target(page="application", section=section)))
    return None


def _follow_up(t: str, ents: Entities, ctx: Context, new_intent: str | None = None) -> Parsed | None:
    """Refine the previous intent with whatever the message changes."""
    prev = ctx.previous
    if prev is None or prev.intent not in {"count_applications", "list_applications", "list_decisions", "list_findings",
                                           "expiring_certificates", "awaiting_confirmation", "application_summary"}:
        return None
    name = new_intent or prev.intent
    f = _filters(t, ents, ctx, findings=name == "list_findings")
    if name == "list_decisions" or prev.intent == "list_decisions":
        if re.search(r"rectification|रिक्टिफिकेशन", t):
            f["decision_type"] = "rectification"
        elif re.search(r"\boutcomes?\b|परिणाम", t):
            f["decision_type"] = "outcome"
    if not f and new_intent is None:
        return None
    merged = prev.filters.model_dump()
    if "period" in f or "date_from" in f or "date_to" in f:
        merged.update(period=None, date_from=None, date_to=None)
    if name == "application_summary" and ("application" in f or "institution" in f):
        merged.update(application=None, institution=None)
    merged.update(f)
    if name == "application_summary" and not merged.get("application") and merged.get("institution"):
        return None
    return Parsed(Intent(intent=name, filters=Filters(**merged), target=prev.target, language=ctx.language,
                         follow_up=True))


def _data_intent(t: str, ents: Entities, ctx: Context) -> tuple[str, dict] | None:
    """Expiring certificates, awaiting confirmation, decisions or findings, with the filters the message states."""
    if EXPIRING.search(t):
        f = _filters(t, ents, ctx)
        if not (f.get("date_from") or f.get("date_to")):
            f.setdefault("period", "this_session")
        return "expiring_certificates", f
    if AWAIT.search(t):
        f = _filters(t, ents, ctx)
        f.pop("status", None)
        return "awaiting_confirmation", f
    if DECISIONS.search(t):
        f = _filters(t, ents, ctx)
        for k in ("status", "category"):
            f.pop(k, None)
        if re.search(r"rectification|रिक्टिफिकेशन", t):
            f["decision_type"] = "rectification"
        elif re.search(r"\boutcomes?\b|परिणाम", t):
            f["decision_type"] = "outcome"
        return "list_decisions", f
    if FINDINGS.search(t):
        f = _filters(t, ents, ctx, findings=True)
        f.pop("status", None)
        across = f.get("application") or f.get("institution") or f.get("place") or LIST.search(t) or COUNT.search(t)
        if not across and ctx.page_application:
            f["application"] = ctx.page_application
        return "list_findings", f
    return None


def parse(text: str, ents: Entities, cat: Catalog, ctx: Context) -> Parsed | None:
    t = fold(text)
    if is_greeting(t):
        return Parsed(_intent("greeting", ctx))

    # Requests to act: officials decide in Pramana, never Drishti
    if not HOW_SHAPE.search(t):
        action = _first(ACTION, t)
        if action:
            app = _application(ents, cat, ctx)
            return Parsed(_intent("application_summary", ctx, {"application": app} if app else {}), action=action)

    nav = _navigate(OPEN_ADJ.sub(" ", t), ents, cat, ctx)
    if nav:
        return nav

    has_entity = bool(ents.applications or ents.unknown_applications or ents.institutions)
    follow = bool(FOLLOW.search(t)) and ctx.previous is not None

    # "Its summary", "uske findings": the single application of the last answer
    if ITS.search(t) and not has_entity and (SUMMARY.search(t) or FINDINGS.search(t) or WHY.search(t)):
        apps = list(dict.fromkeys(i["application_id"] for i in ctx.last_items if i.get("application_id")))
        prev_app = ctx.previous.filters.application if ctx.previous else None
        # The conversation first, then the application open on the page; with neither, ask which one
        app = (apps[0] if len(apps) == 1 else prev_app) or ctx.page_application
        flt = {"application": app} if app else {}
        if app and FINDINGS.search(t) and not WHY.search(t) and not SUMMARY.search(t):
            return Parsed(_intent("list_findings", ctx, flt, follow_up=True))
        return Parsed(_intent("application_summary", ctx, flt, follow_up=True), why=bool(WHY.search(t)))

    if HOW_SHAPE.search(t):
        key = howto_key(text)
        if key:
            return Parsed(_intent("how_to", ctx, howto=key))
    if TERM_SHAPE.search(t) and not has_entity:
        key = term_key(text)
        if key:
            return Parsed(_intent("explain_term", ctx, term=key))

    # "What is Pramana", "who are you": the greeting introduces Drishti and what it can do
    if ABOUT_US.search(t) and not has_entity and len(re.findall(r"\w+", t)) <= 6 and not _data_intent(t, ents, ctx):
        return Parsed(_intent("greeting", ctx))

    # An institution asking about its own application: status, next step and what to fix
    across = COUNT.search(t) or (LIST.search(t) and not ACTOR_ME.search(t))
    if ctx.role == "institution" and (READINESS.search(t) or FINDINGS.search(t)) and not across:
        app = _application(ents, cat, ctx)
        return Parsed(_intent("application_summary", ctx, {"application": app} if app else {}), readiness=True)

    if WHY.search(t) and (FINDINGS.search(t) or has_entity):
        # With no application named or open, the reply asks which one
        app = _application(ents, cat, ctx)
        return Parsed(_intent("application_summary", ctx, {"application": app} if app else {}), why=True)

    data = _data_intent(t, ents, ctx)
    if data:
        name, f = data
        # "Only rectification requests" after a list of decisions keeps its period and actor
        if follow and ctx.previous.intent == name:
            return _follow_up(t, ents, ctx, name) or Parsed(_intent(name, ctx, f))
        return Parsed(_intent(name, ctx, f))

    if SUMMARY.search(t) and has_entity:
        app = _application(ents, cat, ctx)
        if app:
            return Parsed(_intent("application_summary", ctx, {"application": app}))

    counting = bool(COUNT.search(t))
    f = _filters(t, ents, ctx)
    f.pop("application", None)
    app_filters = any(f.get(k) for k in ("category", "status", "place", "institution", "round", "period", "date_from",
                                        "date_to"))
    # A bare noun ("that college") is not a request for a list; a verb or a filter on applications is
    listing = bool(LIST.search(t)) or bool(APPS_NOUN.search(t) and app_filters)
    if counting or listing:
        about_apps = APPS_NOUN.search(t) or any(f.get(k) for k in ("category", "status", "place", "institution", "round"))
        prev_apps = ctx.previous is not None and ctx.previous.intent in {"count_applications", "list_applications"}
        # "How many?", "list them" or "and how many from Pune?" after a question about applications
        if prev_apps and (follow or not about_apps):
            return _follow_up(t, ents, ctx, "count_applications" if counting else "list_applications")
        if about_apps:
            if f.get("institution") and not counting and not APPS_NOUN.search(t):
                return Parsed(_intent("application_summary", ctx, {"application": _application(ents, cat, ctx)}))
            return Parsed(_intent("count_applications" if counting else "list_applications", ctx, f))

    fu = _follow_up(t, ents, ctx)
    if fu:
        return fu

    # A bare application ID or institution name: its summary
    if has_entity and len(re.findall(r"\w+", t)) <= 6:
        app = _application(ents, cat, ctx)
        if app:
            return Parsed(_intent("application_summary", ctx, {"application": app}))
    if SUMMARY.search(t) and ctx.page_application:
        return Parsed(_intent("application_summary", ctx, {"application": ctx.page_application}))
    return None
