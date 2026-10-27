"""Reply language from the message itself: Devanagari is Hindi, Roman script with Hindi function words is
Hinglish, anything else is English (docs/features/drishti-spec.md, section 4, step 6)."""

import re

DEVANAGARI = re.compile(r"[\u0900-\u097F]")
LATIN = re.compile(r"[A-Za-z]")
# Hindi function and question words as Indian officials type them in Roman script. Words that are also common
# English ("is", "me", "hi", "to", "do", "main", "par", "us") are left out on purpose
HINGLISH_WORDS = frozenset("""
hai hain ho hoga hogi honge tha thi kitne kitna kitni kitno aaj kal parso mere mera meri maine mujhe hamare
humare hamara apne apna apni dikhao dikha dikhaye dikhana dikhado batao bata bataye batado wale wala wali walo kya
kyu kyun kyon ka ki ke ko se mein aur sirf bas kaise kaisa kaisi kahan kaun kaunsa kaunse konsa konse kab
kholo khol kholna khole karo karna karu karun kare kariye kijiye nahi nahin hua hue hui aaye aaya aayi aye aya
gaye gaya gayi diya diye kiya kiye uska uski uske iska iski iske unka unki unke pehla pehle pehli doosra dusra
teesra tisra pichle pichla pichli agle agla raha rahe rahi chahiye abhi wapas naya nayi purana khatam baki baaki
bacha bache matlab samjhao samjha samjhaiye hota hoti hote banate banta banaye banao saare sare sab sabhi koi
kuch yeh woh wo jo jab tak liye bhi ji haan accha acha theek thik shukriya dhanyavad dhanyawad namaste
namaskar madad sakte sakta sakti hafte hafta mahine mahina saal din waala waali
""".split())


def words(text: str) -> list[str]:
    return re.findall(r"[a-z]+", (text or "").lower())


def detect(text: str) -> str:
    """'hi', 'hinglish' or 'en'."""
    t = text or ""
    if DEVANAGARI.search(t):
        return "hi"
    if any(w in HINGLISH_WORDS for w in words(t)):
        return "hinglish"
    return "en"
