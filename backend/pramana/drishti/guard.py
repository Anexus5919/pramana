"""The relevance guardrail: decides out_of_scope before any model runs (docs/features/drishti-spec.md, section 4).

A lexicon in English, Hinglish and Hindi scores domain relevance, together with the institutions, districts,
states, application IDs and usernames in the database (cached). Instruction-injection phrases, coding requests and
general-knowledge shapes with no domain signal are refused here, with no model call.
"""

import re
import threading
import time
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Application, Institution, User

CACHE_TTL_S = 120.0
APP_ID = re.compile(r"\bAPP-\d{4}-[0-9A-Z]{6}\b", re.I)
ALIAS = re.compile(r"(?<![\w-])a-?(\d{1,2})\b", re.I)
AICTE_ID = re.compile(r"\b1-\d{10}\b")

# Words in institution names that do not identify one
GENERIC_NAME_WORDS = {"institute", "institution", "of", "technology", "college", "engineering", "and", "school",
                      "campus", "technical", "studies", "management", "polytechnic", "valley", "shree", "shri", "sri",
                      "the", "university", "academy", "education", "science", "sciences", "research", "centre",
                      "center", "for", "women", "group", "institutes"}
# Devanagari spellings of the seeded names, matched as their Roman forms
DEVANAGARI_NAMES = {
    "पंचगंगा": "panchganga", "गोदावरी": "godavari", "कोंकण": "konkan", "विदर्भ": "vidarbha", "सह्याद्रि": "sahyadri",
    "सह्याद्री": "sahyadri", "कृष्णा": "krishna", "डेक्कन": "deccan", "दक्कन": "deccan", "मराठवाड़ा": "marathwada",
    "मराठवाडा": "marathwada", "तापी": "tapi", "भीमा": "bhima", "ज्ञानेश्वर": "dnyaneshwar", "पुणे": "pune",
    "नाशिक": "nashik", "रत्नागिरी": "ratnagiri", "नागपुर": "nagpur", "सातारा": "satara", "कराड": "karad",
    "कोल्हापुर": "kolhapur", "हैदराबाद": "hyderabad", "संभाजीनगर": "sambhajinagar", "जलगांव": "jalgaon",
    "जलगाँव": "jalgaon", "सोलापुर": "solapur", "महाराष्ट्र": "maharashtra", "तेलंगाना": "telangana",
}


def _rx(*parts: str) -> re.Pattern[str]:
    # Whole words for Roman script; Devanagari has no \b, so its words match as plain substrings
    roman = [p for p in parts if re.match(r"[a-z0-9]", p)]
    deva = [p for p in parts if not re.match(r"[a-z0-9]", p)]
    alts = []
    if roman:
        alts.append(r"\b(?:" + "|".join(roman) + r")\b")
    if deva:
        alts.append("(?:" + "|".join(deva) + ")")
    return re.compile("|".join(alts))


# Words that alone put a message in Pramana's domain
DOMAIN = _rx(
    r"applications?", r"applicants?", r"apps", r"intake", r"approvals?", r"approved?", r"eoa", r"noc", r"nocs",
    r"certificates?", r"certs?", r"faculty", r"faculties", r"rectifications?", r"rectif(?:y|ied)", r"decisions?",
    r"decided", r"findings?", r"flagged", r"flags?", r"audit", r"colleges?", r"institutions?", r"institutes?",
    r"aicte", r"signatures?", r"signed", r"dsc", r"qr", r"documents?", r"docs?", r"rules?", r"ruleset",
    r"handbook", r"expir(?:y|es?|ed|ing)", r"lapses?", r"validity", r"verif(?:y|ied|ication|ications|ier)",
    r"scrutiny", r"deficienc(?:y|ies)", r"officers?", r"queue", r"dashboard", r"integrity", r"issuers?",
    r"simulator", r"platform", r"portal", r"outcomes?", r"submissions?", r"submitted", r"submit", r"resubmit",
    r"under review", r"withdrawn", r"drafts?", r"correction", r"evidence", r"proof", r"seals?", r"stamps?",
    r"photos?", r"campus", r"building", r"land", r"fire", r"fees?", r"ter", r"nba", r"accreditation", r"bandwidth",
    r"accounts", r"affidavits?", r"occupancy", r"structural", r"readiness", r"coverage calendar",
    r"inspection brief", r"evidence pack", r"replay", r"audit chain", r"analy[sz]e", r"uploads?", r"uploaded",
    r"status", r"summary", r"severity", r"academic", r"session", r"drishti", r"pramana", r"deficiency letter",
    r"letters?", r"proof ladder", r"revisions?", r"time machine", r"ghost faculty", r"programmes?", r"seats?",
    r"branch(?:es)?", r"rosters?", r"registry", r"confirmation", r"manual confirmation", r"aph", r"cca",
    r"digital signature", r"simulated", r"ask why", r"pdf", r"enquiry", r"inquiry", r"cases?", r"pending",
    r"aavedan", r"avedan", r"sanstha", r"sansthan", r"manjoori", r"manzoori", r"faisl[ae]y?", r"faisle",
    r"pramanpatra", r"praman patra", r"kami", r"kamiyan", r"kamiya", r"jaanch", r"janch", r"satyapan",
    r"hastakshar",
    "आवेदन", "प्रमाणपत्र", "प्रमाण पत्र", "फैसले", "फैसला", "फ़ैसले", "फ़ैसला", "निर्णय", "संस्थान", "कॉलेज", "मंजूरी",
    "मंज़ूरी", "अनुमोदन", "इंटेक", "सीट", "संकाय", "फैकल्टी", "दस्तावेज़", "दस्तावेज", "नियम", "ऑडिट", "सुधार",
    "रिक्टिफिकेशन", "रेक्टिफिकेशन", "जांच", "जाँच", "सत्यापन", "हस्ताक्षर", "समाप्त", "वैधता", "सारांश", "स्थिति",
    "निष्कर्ष", "कमी", "कमियां", "कमियाँ", "अधिकारी", "पोर्टल", "हैंडबुक", "एनओसी", "फायर", "प्रोग्राम", "रिपोर्ट",
)
# Words that point at the domain only together with a question about records: periods, counting, showing
WEAK = _rx(
    r"today", r"yesterday", r"this week", r"last week", r"this month", r"last month", r"last \d+ days",
    r"how many", r"count", r"number of", r"list", r"show", r"open", r"go to", r"take me", r"latest", r"recent",
    r"my", r"mine", r"by me", r"first one", r"second one", r"third one", r"last one", r"total", r"page",
    r"aaj", r"kal", r"kitne", r"kitna", r"kitni", r"dikhao", r"dikha", r"mere", r"mera", r"meri", r"maine",
    r"wale", r"wala", r"wali", r"sirf", r"kholo", r"khol", r"pehla", r"pehle", r"doosra", r"dusra", r"batao",
    r"hafte", r"mahine", r"uska", r"uski",
    "आज", "कल", "कितने", "कितना", "कितनी", "दिखाओ", "दिखाइए", "दिखाएं", "मेरे", "मेरा", "मैंने", "वाले", "वाला",
    "सिर्फ", "सिर्फ़", "खोलो", "खोलें", "पहला", "दूसरा", "बताओ", "बताइए", "हफ्ते", "हफ़्ते", "महीने", "उसका",
)
GREETING_PHRASES = re.compile(
    r"\b(?:hi+|hello|hey|namaste|namaskar|good (?:morning|afternoon|evening)|thanks?|thank you|thx|ty|shukriya"
    r"|dhanyavaa?d|dhanyawad|ok(?:ay)?|theek hai|thik hai|acha|accha|great|nice|cool|bye|help|madad"
    r"|who are you|what can you do|what do you do|how can you help|tum kaun ho|aap kaun ho|kya kar sakte ho"
    r"|drishti|ji|sir|madam|there|you|so much|a lot|bahut|please|me|karo|kijiye|chahiye|aap|tum|kya|kaun|ho"
    r"|hai|hain|can|do|what|who|are|is|sakte|how|kaise|haal|today|aaj)\b"
    r"|नमस्ते|नमस्कार|धन्यवाद|शुक्रिया|ठीक है|मदद|आप|कौन|हैं|है|क्या|कर|सकते|दृष्टि|जी|कैसे|हो",
    re.I)
GREETING_CORE = re.compile(
    r"\b(?:hi+|hello|hey|namaste|namaskar|good (?:morning|afternoon|evening)|thanks?|thank you|thx|shukriya"
    r"|dhanyavaa?d|dhanyawad|ok(?:ay)?|theek hai|thik hai|bye|help|madad|who are you|what can you do"
    r"|what do you do|how can you help|tum kaun ho|aap kaun ho|kya kar sakte ho|how are you|kaise ho|kaise hain"
    r"|kya haal)\b"
    r"|नमस्ते|नमस्कार|धन्यवाद|शुक्रिया|ठीक है|मदद|आप कौन|क्या कर सकते|कैसे हैं|कैसे हो",
    re.I)


def is_greeting(t: str) -> bool:
    """Only greetings, thanks or 'what can you do', with nothing else asked."""
    return bool(GREETING_CORE.search(t)) and not re.search(r"\w", GREETING_PHRASES.sub(" ", t))


INJECTION = re.compile(
    r"\b(?:ignore|disregard|forget|override|bypass|skip)\b\W+(?:\w+\W+){0,4}?"
    r"(?:instructions?|rules?|prompts?|guidelines?|guardrails?|everything|context|system|restrictions?|filters?)\b"
    r"|\b(?:you are now|from now on you|act as|pretend (?:to be|you are)|roleplay|role-play|jailbreak|dan mode"
    r"|developer mode|system prompt|your (?:prompt|instructions|rules)|new instructions|reveal your|sudo\b"
    r"|print your|repeat (?:the|your) (?:prompt|instructions))"
    r"|\b(?:instructions?|nirdesh|rules?)\s+(?:bhool|bhul|ignore)"
    r"|(?:निर्देश|नियमों)\s*(?:भूल|को अनदेखा|अनदेखा)|पिछले निर्देश",
    re.I)
# Requests Drishti never serves, whatever else the message mentions
HARD_OFF = _rx(
    r"python", r"javascript", r"typescript", r"java", r"c\+\+", r"html", r"css", r"sql", r"regex", r"leetcode",
    r"coding", r"code likh\w*", r"write (?:me )?(?:a |an |the )?(?:code|program|script|function|query|essay|poem)",
)
# Everyday topics: refused unless a domain word is also present
SOFT_OFF = _rx(
    r"biryani", r"recipe", r"recipes", r"pizza", r"burger", r"pasta", r"samosa", r"dosa", r"idli", r"paneer",
    r"chai", r"coffee", r"food", r"khana", r"khaana", r"cook", r"cooking", r"restaurant", r"dish",
    r"cricket", r"ipl", r"football", r"hockey", r"kabaddi", r"tennis", r"olympics?", r"world cup", r"kohli",
    r"dhoni", r"sachin", r"score", r"weather", r"mausam", r"rain", r"baarish", r"barish", r"temperature",
    r"forecast", r"movies?", r"films?", r"bollywood", r"songs?", r"gaana", r"netflix", r"actress", r"jokes?",
    r"chutkula", r"funny", r"poem", r"shayari", r"kavita", r"riddle", r"modi", r"bjp", r"congress", r"elections?",
    r"chunav", r"prime minister", r"politics", r"political", r"girlfriend", r"boyfriend", r"relationship",
    r"love", r"dating", r"marriage", r"shaadi", r"diet", r"weight loss", r"astrology", r"horoscope", r"rashifal",
    r"stocks?", r"crypto", r"bitcoin", r"invest(?:ment)?", r"capital of", r"population of", r"translate",
    r"homework", r"news", r"song", r"president of",
    "बिरयानी", "खाना", "रेसिपी", "क्रिकेट", "मैच", "मौसम", "बारिश", "फिल्म", "फ़िल्म", "गाना", "चुटकुला", "कविता",
    "चुनाव", "राजनीति", "शादी",
)
GENERAL_SHAPE = re.compile(
    r"^\W*(?:what|who|where|when|which)\s+(?:is|are|was|were)\b|\bwho\s+(?:won|is|was)\b"
    r"|\bhow\s+(?:do|to|can|should)\s+(?:i\s+|you\s+|we\s+)?(?:make|cook|bake|prepare|cure|lose|earn|win)\b"
    r"|\b(?:meaning|capital|president|population)\s+of\b|\btell me (?:a|an)\b|\bdefine\b"
    r"|\bkya\s+(?:hai|hain|hota|hoti|hote)\b|\bkaun\s+(?:hai|tha|the|thi)\b"
    r"|\bkaise\s+(?:banate|banaye|banaen|banta|banti|banaate|banaate)\b|\bkisne\s+jeet|\bkahan\s+hai\b"
    r"|क्या\s*(?:है|हैं|होता|होती)|कौन\s*(?:है|था|थे|थी)|कैसे\s*(?:बनाते|बनाएं|बनाएँ|बनता|बनाये)|किसने\s*जीत",
    re.I)
ABUSE = _rx(r"fuck\w*", r"shit", r"bitch", r"bastard", r"idiot", r"stupid", r"chutiya\w*", r"bhosd\w*",
            r"madarchod", r"behenchod", r"gandu", r"harami", r"kutta", r"kamina", "चूतिया", "हरामी", "कमीना")
FOLLOW_UP = _rx(r"and", r"aur", r"only", r"just", r"what about", r"how about", r"same", r"those", r"these",
                r"them", r"it", r"its", r"that one", r"this one", r"isme", r"usme", r"unme", r"wahi", "और", "उनमें",
                "इनमें")


@dataclass
class InstRef:
    id: str
    name: str
    aicte_id: str
    district: str
    state: str
    tokens: tuple[str, ...]


@dataclass
class Catalog:
    institutions: list[InstRef] = field(default_factory=list)
    applications: dict[str, str] = field(default_factory=dict)
    aliases: dict[str, str] = field(default_factory=dict)
    places: dict[str, str] = field(default_factory=dict)
    usernames: set[str] = field(default_factory=set)
    loaded_at: float = 0.0


_cache: dict[str, Catalog] = {}
_lock = threading.Lock()


def _tokens(name: str) -> tuple[str, ...]:
    return tuple(w for w in re.findall(r"[a-z]+", name.lower()) if w not in GENERIC_NAME_WORDS and len(w) >= 4)


def _load(db: Session) -> Catalog:
    c = Catalog(loaded_at=time.monotonic())
    for i in db.scalars(select(Institution)):
        c.institutions.append(InstRef(i.id, i.name, i.aicte_id, i.district or "", i.state or "", _tokens(i.name)))
        for p in (i.district, i.state):
            if p:
                c.places[p.lower()] = p
                for part in p.split():
                    if len(part) >= 5 and part.lower() not in GENERIC_NAME_WORDS:
                        c.places.setdefault(part.lower(), p)
    for app_id, inst in db.execute(select(Application.id, Application.institution_id)):
        c.applications[app_id] = inst
        # The seeded world's A1 to A11 are APP-2026-000101 to APP-2026-000111
        m = re.fullmatch(r"APP-\d{4}-000(\d{3})", app_id)
        if m and 100 < int(m.group(1)) < 200:
            c.aliases.setdefault(f"A{int(m.group(1)) - 100}", app_id)
    c.usernames = {u for (u,) in db.execute(select(User.username))}
    return c


def catalog(db: Session, *, fresh: bool = False) -> Catalog:
    key = str(db.get_bind().url)
    with _lock:
        c = _cache.get(key)
        if c is None or fresh or time.monotonic() - c.loaded_at > CACHE_TTL_S:
            c = _cache[key] = _load(db)
        return c


def reset_cache() -> None:
    with _lock:
        _cache.clear()


def fold(text: str) -> str:
    """Lowercased text with the seeded names' Devanagari spellings replaced by their Roman forms."""
    t = (text or "").lower()
    for deva, roman in DEVANAGARI_NAMES.items():
        if deva in t:
            t = t.replace(deva, f" {roman} ")
    return re.sub(r"\s+", " ", t).strip()


@dataclass
class Entities:
    applications: list[str] = field(default_factory=list)
    unknown_applications: list[str] = field(default_factory=list)
    institutions: list[InstRef] = field(default_factory=list)
    places: list[str] = field(default_factory=list)
    usernames: list[str] = field(default_factory=list)

    @property
    def any(self) -> bool:
        return bool(self.applications or self.unknown_applications or self.institutions or self.places)


def entities(db: Session, text: str) -> Entities:
    """Application IDs (and A1 to A11), institutions by name, AICTE ID or distinctive name word, places, users."""
    c = catalog(db)
    raw = text or ""
    ids = [m.group(0).upper() for m in APP_ID.finditer(raw)]
    if any(i not in c.applications for i in ids):
        # An application created since the cache was filled
        c = catalog(db, fresh=True)
    e = Entities()
    for i in ids:
        (e.applications if i in c.applications else e.unknown_applications).append(i)
    for m in ALIAS.finditer(raw):
        alias = f"A{int(m.group(1))}"
        if alias in c.aliases:
            e.applications.append(c.aliases[alias])
        else:
            e.unknown_applications.append(alias)
    e.applications = list(dict.fromkeys(e.applications))
    t = fold(raw)
    words = set(re.findall(r"[a-z0-9-]+", t))
    for inst in c.institutions:
        if inst.name.lower() in t or inst.aicte_id in raw or any(tok in words for tok in inst.tokens):
            e.institutions.append(inst)
    for key, place in c.places.items():
        if re.search(rf"\b{re.escape(key)}\b", t) and place not in e.places:
            e.places.append(place)
    # A place that is only part of a matched institution's name is the institution, not a filter
    e.places = [p for p in e.places if not any(p.lower() in i.name.lower() for i in e.institutions)]
    e.usernames = [u for u in c.usernames if re.search(rf"\b{re.escape(u.lower())}\b", t)]
    return e


@dataclass
class Verdict:
    in_scope: bool
    reason: str
    greeting: bool = False


def check(text: str, ents: Entities, *, has_history: bool = False, glossary_hit: bool = False) -> Verdict:
    """In scope or not, before rules or model. `glossary_hit`: the message names a glossary or help key."""
    t = fold(text)
    if INJECTION.search(t):
        return Verdict(False, "instructions")
    if ABUSE.search(t):
        return Verdict(False, "abuse")
    if HARD_OFF.search(t):
        return Verdict(False, "coding")
    domain = bool(DOMAIN.search(t)) or glossary_hit or bool(ents.applications or ents.unknown_applications)
    if SOFT_OFF.search(t) and not domain:
        return Verdict(False, "off_topic")
    named = ents.any
    if GENERAL_SHAPE.search(t) and not (domain or ents.institutions):
        return Verdict(False, "general_knowledge")
    if is_greeting(t):
        return Verdict(True, "greeting", greeting=True)
    if domain or named:
        return Verdict(True, "domain")
    if WEAK.search(t) or (has_history and FOLLOW_UP.search(t)):
        return Verdict(True, "weak")
    return Verdict(False, "no_domain_signal")
