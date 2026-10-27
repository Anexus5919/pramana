"""Surface forms for Drishti's training data: how officials say each filter value, term and page in English,
Hindi (Devanagari) and Hinglish (Roman, code-mixed). generate_data.py combines these with sentence templates.

The seeded world (institutions, their cities and states, A1 to A11) is read from scripts/make_fixtures.py with
ast, so this module needs neither the fixture libraries nor a generated fixtures/out.
"""

import ast
from pathlib import Path

EN, HI, HG = "en", "hi", "hinglish"
LANGS = (EN, HI, HG)
FIXTURES = Path(__file__).resolve().parents[2] / "scripts" / "make_fixtures.py"


def seeded_institutions() -> list[dict]:
    """INSTITUTIONS from the fixture script, as plain dicts, in seed order (I1 to I11)."""
    tree = ast.parse(FIXTURES.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", None) == "INSTITUTIONS":
            return [{kw.arg: ast.literal_eval(kw.value) for kw in call.keywords} for call in node.value.elts]
    raise RuntimeError("INSTITUTIONS not found in make_fixtures.py")


INSTITUTIONS = seeded_institutions()
# A1 to A11 belong to I1 to I11 in order; the seeded IDs are APP-2026-000101 to APP-2026-000111
APPS = {f"A{n}": f"APP-2026-{100 + n:06d}" for n in range(1, len(INSTITUTIONS) + 1)}

# Name fragments an official would type for each seeded institution, and the Devanagari spelling of the main
# fragment. Devanagari names map to the English fragment, because the database stores names in English.
INST_FRAGMENTS = {
    "I1": (["Shree Dnyaneshwar", "Dnyaneshwar", "Dnyaneshwar Institute", "Shree Dnyaneshwar Institute"],
           ["ज्ञानेश्वर", "श्री ज्ञानेश्वर"], ["Dnyaneshwar", "Shree Dnyaneshwar"]),
    "I2": (["Godavari", "Godavari College", "Godavari College of Engineering", "Godavari Engineering"],
           ["गोदावरी", "गोदावरी कॉलेज"], ["Godavari", "Godavari College"]),
    "I3": (["Konkan", "Konkan Institute", "Konkan Institute of Engineering"], ["कोंकण", "कोंकण इंस्टिट्यूट"],
           ["Konkan", "Konkan Institute"]),
    "I4": (["Vidarbha", "Vidarbha Technical Campus", "Vidarbha Technical"], ["विदर्भ", "विदर्भ टेक्निकल कैंपस"],
           ["Vidarbha", "Vidarbha Technical Campus"]),
    "I5": (["Sahyadri", "Sahyadri School", "Sahyadri School of Engineering"], ["सह्याद्रि", "सह्याद्री"],
           ["Sahyadri", "Sahyadri"]),
    "I6": (["Krishna Valley", "Krishna Valley College", "Krishna Valley College of Engineering"],
           ["कृष्णा वैली", "कृष्णा वैली कॉलेज"], ["Krishna Valley", "Krishna Valley College"]),
    "I7": (["Panchganga", "Panchganga Institute", "Panchganga Institute of Technology", "Panchganga IT"],
           ["पंचगंगा", "पंचगंगा इंस्टिट्यूट"], ["Panchganga", "Panchganga Institute"]),
    "I8": (["Deccan", "Deccan Institute", "Deccan Institute of Engineering Studies"], ["डेक्कन", "दक्कन"],
           ["Deccan", "Deccan"]),
    "I9": (["Marathwada", "Marathwada Polytechnic", "Marathwada Polytechnic and Engineering College"],
           ["मराठवाड़ा", "मराठवाड़ा पॉलिटेक्निक"], ["Marathwada", "Marathwada Polytechnic"]),
    "I10": (["Tapi Valley", "Tapi Valley Institute", "Tapi Valley Institute of Technology"],
            ["तापी वैली", "ताप्ती वैली"], ["Tapi Valley", "Tapi Valley"]),
    "I11": (["Bhima Valley", "Bhima Valley College", "Bhima Valley College of Engineering"],
            ["भीमा वैली", "भीमा वैली कॉलेज"], ["Bhima Valley", "Bhima Valley College"]),
}
# Institutions that are not seeded, so the model learns to copy any name rather than memorise eleven
OTHER_INST_WORDS = ["Narmada", "Kaveri", "Saraswati", "Vivekananda", "Matoshri", "Rajarshi", "Shivneri", "Malwa",
                    "Aravali", "Nilgiri", "Annasaheb", "Pratibha", "Jagruti", "Navjeevan", "Sant Gadge", "Yashwant",
                    "Sinhgad", "Pravara", "Walchand", "Ajeenkya"]
OTHER_INST_KINDS = ["Institute of Technology", "College of Engineering", "Polytechnic", "Technical Campus",
                    "School of Engineering", "Institute of Management", "College of Pharmacy"]

# Districts and states: (English as stored, Devanagari). Seeded cities first, then others the model may meet.
SEEDED_PLACES = [(i["city"], None) for i in INSTITUTIONS] + [("Maharashtra", None), ("Telangana", None)]
PLACE_HI = {"Pune": "पुणे", "Nashik": "नासिक", "Ratnagiri": "रत्नागिरी", "Nagpur": "नागपुर", "Satara": "सातारा",
            "Karad": "कराड", "Kolhapur": "कोल्हापुर", "Hyderabad": "हैदराबाद",
            "Chhatrapati Sambhajinagar": "छत्रपति संभाजीनगर", "Jalgaon": "जलगांव", "Solapur": "सोलापुर",
            "Maharashtra": "महाराष्ट्र", "Telangana": "तेलंगाना", "Mumbai": "मुंबई", "Thane": "ठाणे",
            "Gujarat": "गुजरात", "Karnataka": "कर्नाटक", "Bengaluru": "बेंगलुरु", "Indore": "इंदौर",
            "Madhya Pradesh": "मध्य प्रदेश", "Lucknow": "लखनऊ", "Uttar Pradesh": "उत्तर प्रदेश",
            "Jaipur": "जयपुर", "Rajasthan": "राजस्थान", "Goa": "गोवा", "Nanded": "नांदेड़", "Latur": "लातूर",
            "Amravati": "अमरावती", "Sangli": "सांगली", "Ahmednagar": "अहमदनगर"}
OTHER_PLACES = ["Mumbai", "Thane", "Gujarat", "Karnataka", "Bengaluru", "Indore", "Madhya Pradesh", "Lucknow",
                "Uttar Pradesh", "Jaipur", "Rajasthan", "Goa", "Nanded", "Latur", "Amravati", "Sangli", "Ahmednagar",
                "Tamil Nadu", "Chennai", "Kerala"]

USERNAMES = ["officer", "verifier", "admin", "officer2", "rsharma", "liyer", "srao", "verifier2"]

# Period words. "adv" fits after a verb ("aaye aaj"), "adj" before a noun ("aaj ke decisions").
PERIOD = {
    EN: {
        "today": (["today", "today so far", "so far today", "this morning"], ["today's"]),
        "yesterday": (["yesterday", "yday"], ["yesterday's"]),
        "this_week": (["this week", "so far this week", "in the current week"], ["this week's"]),
        "last_week": (["last week", "the previous week", "during last week"], ["last week's"]),
        "last_7_days": (["in the last 7 days", "in the past seven days", "over the last 7 days", "past 7 days"],
                        ["last 7 days'"]),
        "this_month": (["this month", "so far this month", "in the current month"], ["this month's"]),
        "last_month": (["last month", "the previous month", "during last month"], ["last month's"]),
        "last_30_days": (["in the last 30 days", "in the past thirty days", "over the last 30 days"],
                         ["last 30 days'"]),
        "this_session": (["this session", "this academic session", "in the current session"],
                         ["this session's"]),
        "all": (["so far", "till now", "until now", "ever", "of all time", "overall"], ["all-time"]),
    },
    HG: {
        "today": (["aaj", "aj", "aaj tak", "aaj ke din"], ["aaj ke", "aj ke", "aaj wale"]),
        "yesterday": (["kal", "kal ke din"], ["kal ke", "kal wale"]),
        "this_week": (["is hafte", "iss hafte", "is week", "iss week mein"], ["is hafte ke", "iss week ke"]),
        "last_week": (["pichle hafte", "pichhle hafte", "last week", "pichle week"],
                      ["pichle hafte ke", "last week ke"]),
        "last_7_days": (["pichle 7 din mein", "pichhle saat din mein", "last 7 din me"],
                        ["pichle 7 din ke", "last 7 din ke"]),
        "this_month": (["is mahine", "iss mahine", "is month"], ["is mahine ke", "iss month ke"]),
        "last_month": (["pichle mahine", "pichhle mahine", "last month"], ["pichle mahine ke", "last month ke"]),
        "last_30_days": (["pichle 30 din mein", "last 30 din me", "pichhle tees din mein"],
                         ["pichle 30 din ke", "last 30 din ke"]),
        "this_session": (["is session mein", "iss session me", "current session mein"],
                         ["is session ke", "iss session ke"]),
        "all": (["ab tak", "abhi tak", "aaj tak ke total"], ["ab tak ke", "abhi tak ke"]),
    },
    HI: {
        "today": (["आज", "आज अब तक"], ["आज के", "आज वाले"]),
        "yesterday": (["कल"], ["कल के", "कल वाले"]),
        "this_week": (["इस हफ्ते", "इस सप्ताह", "इस हफ़्ते"], ["इस हफ्ते के", "इस सप्ताह के"]),
        "last_week": (["पिछले हफ्ते", "पिछले सप्ताह", "पिछले हफ़्ते"], ["पिछले हफ्ते के", "पिछले सप्ताह के"]),
        "last_7_days": (["पिछले 7 दिनों में", "पिछले सात दिनों में"], ["पिछले 7 दिनों के", "पिछले सात दिन के"]),
        "this_month": (["इस महीने", "इस माह"], ["इस महीने के", "इस माह के"]),
        "last_month": (["पिछले महीने", "पिछले माह"], ["पिछले महीने के", "पिछले माह के"]),
        "last_30_days": (["पिछले 30 दिनों में", "पिछले तीस दिनों में"], ["पिछले 30 दिनों के"]),
        "this_session": (["इस सत्र में", "इस सेशन में", "इस शैक्षणिक सत्र में"], ["इस सत्र के", "इस सेशन के"]),
        "all": (["अब तक", "आज तक"], ["अब तक के", "आज तक के"]),
    },
}

MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
             "November", "December"]
MONTHS_HI = ["जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर",
             "दिसंबर"]

CATEGORY = {
    EN: {"eoa": ["EoA", "EOA", "extension of approval", "extension-of-approval", "approval extension"],
         "increase_intake": ["intake", "increase in intake", "intake increase", "increase-in-intake", "seat increase",
                             "intake approval", "intake expansion"]},
    HG: {"eoa": ["EoA", "eoa", "extension of approval", "approval extension"],
         "increase_intake": ["intake", "intake badhane", "intake increase", "seat badhane", "intake approval"]},
    HI: {"eoa": ["EoA", "ईओए", "अनुमोदन विस्तार", "मंज़ूरी विस्तार"],
         "increase_intake": ["इंटेक", "इनटेक", "इंटेक बढ़ाने", "प्रवेश क्षमता वृद्धि", "सीट बढ़ाने", "intake"]},
}

# Status: "pre" goes before a noun, "post" after it
STATUS = {
    EN: {"under_review": (["under-review", "in-review"], ["under review", "being reviewed", "in review"]),
         "rectification_requested": (["rectification-requested"],
                                     ["sent for rectification", "awaiting rectification", "sent back for corrections"]),
         "rectified": (["rectified", "corrected"], ["rectified", "resubmitted after rectification"]),
         "closed": (["closed", "finalised"], ["closed", "already closed"]),
         "withdrawn": (["withdrawn"], ["withdrawn", "withdrawn by the institution"]),
         "draft": (["draft"], ["still in draft", "in draft"]),
         "submitted": (["submitted", "newly submitted"], ["submitted", "just submitted"])},
    HG: {"under_review": (["under review wale", "review mein pade"], ["under review", "review mein"]),
         "rectification_requested": (["rectification wale", "rectification maange gaye"],
                                     ["rectification ke liye bheje gaye", "rectification pe"]),
         "rectified": (["rectified", "sudhaare hue"], ["rectify ho chuke", "rectified"]),
         "closed": (["closed", "band"], ["close ho chuke", "closed"]),
         "withdrawn": (["withdrawn", "wapas liye gaye"], ["withdraw ho gaye", "wapas le liye gaye"]),
         "draft": (["draft wale", "draft"], ["draft mein", "abhi draft mein"]),
         "submitted": (["submitted", "naye submit hue"], ["submit hue", "submit ho gaye"])},
    HI: {"under_review": (["समीक्षाधीन", "जांचाधीन"], ["समीक्षा में", "जांच में"]),
         "rectification_requested": (["सुधार हेतु लौटाए गए", "रिक्टिफिकेशन वाले"], ["सुधार के लिए भेजे गए"]),
         "rectified": (["सुधारे गए", "रिक्टिफाई हुए"], ["सुधार के बाद दोबारा जमा"]),
         "closed": (["बंद", "बंद हो चुके"], ["बंद हो चुके"]),
         "withdrawn": (["वापस लिए गए"], ["वापस ले लिए गए"]),
         "draft": (["ड्राफ्ट", "मसौदा"], ["ड्राफ्ट में"]),
         "submitted": (["जमा किए गए", "सबमिट हुए"], ["जमा हुए"])},
}

ROUND = {EN: {"first": ["in the first round", "in round one", "in the first scrutiny round"],
              "correction": ["in the correction round", "in the second round", "in the rectification round"]},
         HG: {"first": ["pehle round mein", "first round me"], "correction": ["correction round mein",
                                                                             "doosre round me", "second round mein"]},
         HI: {"first": ["पहले दौर में", "पहले राउंड में"], "correction": ["सुधार दौर में", "दूसरे दौर में"]}}

OPEN = {EN: ["open", "still open", "pending", "not yet closed", "unresolved"],
        HG: ["open", "abhi bhi open", "pending", "khule", "baaki"],
        HI: ["खुले", "लंबित", "अभी भी खुले"]}

SEVERITY = {EN: {"high": ["high", "serious", "critical", "major"], "medium": ["medium", "moderate"],
                 "low": ["low", "minor"]},
            HG: {"high": ["high", "serious", "badi", "high severity"], "medium": ["medium", "beech wale", "moderate"],
                 "low": ["low", "chhoti", "minor"]},
            HI: {"high": ["गंभीर", "उच्च", "हाई"], "medium": ["मध्यम", "मीडियम"], "low": ["कम गंभीर", "निम्न", "मामूली"]}}

TOPIC = {
    EN: {"fire_safety": ["fire safety", "fire NOC", "fire", "fire certificate"],
         "building": ["building", "occupancy certificate", "structural stability", "building safety"],
         "land": ["land", "land area", "land documents"], "faculty": ["faculty", "staff", "teachers", "faculty roster"],
         "fees": ["fees", "fee payment", "TER fee", "payment"],
         "signature": ["signature", "digital signature", "DSC", "signing"],
         "qr": ["QR", "QR code", "signed QR"], "photo": ["photo", "lab photo", "infrastructure photo", "campus photo"],
         "seal": ["seal", "stamp", "rubber stamp"], "edits": ["edits", "document edits", "edits after signing"],
         "accounts": ["accounts", "audited accounts", "financial statements", "balance sheet"],
         "intake": ["intake", "seat intake", "intake numbers"],
         "bandwidth": ["bandwidth", "internet bandwidth", "internet speed"]},
    HG: {"fire_safety": ["fire safety", "fire NOC", "fire"], "building": ["building", "occupancy", "building safety"],
         "land": ["land", "zameen", "land area"], "faculty": ["faculty", "teachers", "staff"],
         "fees": ["fees", "fee", "payment"], "signature": ["signature", "DSC", "sign"], "qr": ["QR", "QR code"],
         "photo": ["photo", "lab photo", "photos"], "seal": ["seal", "stamp", "mohar"], "edits": ["edits", "editing"],
         "accounts": ["accounts", "audited accounts", "hisaab"], "intake": ["intake", "seats"],
         "bandwidth": ["bandwidth", "internet speed"]},
    HI: {"fire_safety": ["अग्नि सुरक्षा", "फायर एनओसी", "फायर"], "building": ["भवन", "इमारत", "बिल्डिंग"],
         "land": ["भूमि", "ज़मीन"], "faculty": ["फैकल्टी", "शिक्षकों", "स्टाफ"], "fees": ["शुल्क", "फीस"],
         "signature": ["हस्ताक्षर", "डिजिटल हस्ताक्षर"], "qr": ["क्यूआर", "QR कोड"], "photo": ["फोटो", "तस्वीर"],
         "seal": ["मुहर", "सील"], "edits": ["संपादन", "बदलाव"], "accounts": ["लेखा", "खातों", "ऑडिटेड अकाउंट्स"],
         "intake": ["इंटेक", "प्रवेश क्षमता"], "bandwidth": ["बैंडविड्थ", "इंटरनेट स्पीड"]},
}

DECISION_TYPE = {EN: {"rectification": ["rectification requests", "rectification letters", "rectifications"],
                      "outcome": ["outcomes", "final outcomes", "scrutiny outcomes", "recorded outcomes"]},
                 HG: {"rectification": ["rectification requests", "rectification wale", "rectifications"],
                      "outcome": ["outcomes", "outcome wale", "final outcome"]},
                 HI: {"rectification": ["सुधार अनुरोध", "रिक्टिफिकेशन अनुरोध"],
                      "outcome": ["परिणाम", "अंतिम परिणाम", "आउटकम"]}}

ME = {EN: ["by me", "I made", "I recorded", "mine"], HG: ["mere", "maine", "mera"], HI: ["मेरे", "मैंने"]}

# Glossary keys with what people call them
TERM = {
    "eoa": (["EoA", "extension of approval", "EOA"], ["EoA", "extension of approval"], ["ईओए", "अनुमोदन विस्तार", "EoA"]),
    "increase_in_intake": (["increase in intake", "intake increase"], ["intake increase", "increase in intake"],
                           ["इंटेक वृद्धि", "प्रवेश क्षमता वृद्धि"]),
    "rectification": (["rectification"], ["rectification", "rectification process"], ["रिक्टिफिकेशन", "रेक्टिफिकेशन"]),
    "deficiency_letter": (["a deficiency letter", "deficiency letter", "the deficiency report"], ["deficiency letter"],
                          ["कमी पत्र", "डेफिशिएंसी लेटर"]),
    "correction_round": (["the correction round", "correction round"], ["correction round"],
                         ["सुधार दौर", "करेक्शन राउंड"]),
    "proof_strength": (["proof strength", "strength of proof"], ["proof strength"], ["प्रूफ स्ट्रेंथ", "प्रमाण की मज़बूती"]),
    "evidence_class": (["evidence class", "evidence classes", "E1 to E5", "an E3 evidence class"],
                       ["evidence class", "E1 se E5"], ["एविडेंस क्लास", "साक्ष्य वर्ग"]),
    "simulated": (["SIMULATED", "the SIMULATED label", "a simulated issuer"], ["SIMULATED", "simulated issuer"],
                  ["सिम्युलेटेड", "SIMULATED"]),
    "signed_qr": (["a signed QR", "signed QR code", "signed QR"], ["signed QR"], ["साइन किया हुआ QR", "हस्ताक्षरित क्यूआर"]),
    "dsc": (["DSC", "a digital signature certificate", "digital signature certificate"], ["DSC"],
            ["डीएससी", "डिजिटल हस्ताक्षर प्रमाणपत्र"]),
    "cca_india": (["CCA India", "the CCA", "Controller of Certifying Authorities"], ["CCA India"], ["सीसीए इंडिया"]),
    "time_machine": (["the time machine", "time machine", "revision history"], ["time machine"], ["टाइम मशीन"]),
    "readiness_check": (["the readiness check", "readiness check", "readiness score"], ["readiness check"],
                        ["रेडीनेस चेक", "तैयारी जांच"]),
    "integrity_network": (["the integrity network", "integrity network"], ["integrity network"],
                          ["इंटीग्रिटी नेटवर्क"]),
    "ghost_faculty": (["ghost faculty", "a ghost faculty member"], ["ghost faculty"], ["घोस्ट फैकल्टी"]),
    "coverage_calendar": (["the coverage calendar", "coverage calendar"], ["coverage calendar"], ["कवरेज कैलेंडर"]),
    "inspection_brief": (["an inspection brief", "inspection brief"], ["inspection brief"],
                         ["इंस्पेक्शन ब्रीफ", "निरीक्षण ब्रीफ"]),
    "evidence_pack": (["an evidence pack", "evidence pack"], ["evidence pack"], ["एविडेंस पैक", "साक्ष्य पैक"]),
    "replay": (["replay", "verification replay"], ["replay"], ["रीप्ले"]),
    "audit_chain": (["the audit chain", "audit chain", "the hash-chained audit log"], ["audit chain", "hash chain"],
                    ["ऑडिट चेन"]),
    "aph": (["APH", "the APH handbook", "the approval process handbook"], ["APH", "APH handbook"],
            ["एपीएच", "एपीएच हैंडबुक"]),
    "ter": (["TER", "the TER"], ["TER"], ["टीईआर"]),
    "nba": (["NBA", "NBA accreditation"], ["NBA", "NBA accreditation"], ["एनबीए", "एनबीए मान्यता"]),
    "finding": (["a finding", "finding"], ["finding"], ["फाइंडिंग"]),
    "scrutiny_outcome": (["a scrutiny outcome", "scrutiny outcome"], ["scrutiny outcome"], ["जांच परिणाम", "स्क्रूटिनी आउटकम"]),
    "ask_why": (["Ask why", "the Ask why button"], ["Ask why"], ["आस्क व्हाई"]),
    "fire_noc": (["a fire NOC", "fire NOC", "NOC"], ["fire NOC", "NOC"], ["फायर एनओसी", "अग्नि अनापत्ति प्रमाणपत्र"]),
}

# Help topics: English verb phrases ("how do I ..."), Hinglish and Hindi task phrases ("... kaise karein")
HOWTO = {
    "request_rectification": (["request rectification", "send a rectification request", "ask an institution to rectify"],
                              ["rectification request", "rectification bhejna", "institution se rectification maangna"],
                              ["सुधार का अनुरोध", "रिक्टिफिकेशन अनुरोध"]),
    "record_outcome": (["record an outcome", "record the scrutiny outcome", "close an application with an outcome"],
                       ["outcome record", "final outcome darj"], ["परिणाम दर्ज", "आउटकम रिकॉर्ड"]),
    "analyse_document": (["analyse a document", "check a single document", "run the analyser on a PDF"],
                         ["document analyse", "ek document check"], ["दस्तावेज़ का विश्लेषण", "डॉक्यूमेंट एनालिसिस"]),
    "verify_qr_by_phone": (["verify a QR by phone", "scan a certificate QR with my phone", "check a QR code on mobile"],
                           ["phone se QR verify", "mobile se QR scan"], ["फोन से QR सत्यापन", "मोबाइल से क्यूआर जांच"]),
    "check_audit_chain": (["check the audit chain", "verify the audit log", "confirm the audit chain is intact"],
                          ["audit chain check", "audit log verify"], ["ऑडिट चेन की जांच", "ऑडिट लॉग सत्यापन"]),
    "read_proof_ladder": (["read the proof ladder", "understand the proof ladder"], ["proof ladder samajhna",
                                                                                   "proof ladder padhna"],
                          ["प्रूफ लैडर पढ़ना", "प्रूफ लैडर समझना"]),
    "use_ask_why": (["use Ask why", "ask why something was flagged"], ["Ask why use", "Ask why ka istemal"],
                    ["आस्क व्हाई का उपयोग"]),
    "export_evidence_pack": (["export an evidence pack", "download the evidence pack"],
                             ["evidence pack export", "evidence pack download"], ["एविडेंस पैक डाउनलोड"]),
    "confirm_verification": (["confirm a verification item", "mark a manual check as confirmed"],
                             ["verification item confirm", "manual check confirm"], ["सत्यापन की पुष्टि"]),
    "start_application": (["start an application", "begin a new application", "create a new application"],
                          ["naya application shuru", "application start"], ["नया आवेदन शुरू", "आवेदन की शुरुआत"]),
    "fix_readiness_items": (["fix readiness items", "clear the readiness check", "fix what the readiness check shows"],
                            ["readiness items fix", "readiness ki kamiyan theek"], ["रेडीनेस आइटम ठीक", "तैयारी की कमियां दूर"]),
    "submit_application": (["submit my application", "submit an application", "send my application to AICTE"],
                           ["application submit", "apna application submit"], ["आवेदन जमा", "आवेदन सबमिट"]),
}

PAGE = {
    "queue": (["queue", "application queue", "work queue", "scrutiny queue"], ["queue", "queue page", "applications ki list"],
              ["क्यू", "आवेदनों की कतार"]),
    "analyse": (["analyse page", "Analyse", "document analyser", "analysis page"], ["analyse page", "analyse"],
                ["एनालाइज़ पेज", "विश्लेषण पेज"]),
    "integrity": (["integrity page", "integrity network", "integrity view"], ["integrity page", "integrity"],
                  ["इंटीग्रिटी पेज", "इंटीग्रिटी"]),
    "issuer_simulator": (["issuer simulator", "simulator", "issuer sim"], ["issuer simulator", "simulator"],
                         ["इश्यूअर सिम्युलेटर", "सिम्युलेटर"]),
    "rules": (["rules page", "rules", "ruleset", "rule list"], ["rules page", "rules"], ["नियम पेज", "रूल्स"]),
    "audit": (["audit log", "audit page", "audit trail"], ["audit log", "audit page"], ["ऑडिट लॉग", "ऑडिट पेज"]),
    "platform": (["platform page", "platform settings", "platform health"], ["platform page", "platform"],
                 ["प्लेटफॉर्म पेज", "प्लेटफॉर्म"]),
    "portal": (["portal", "my portal", "institution portal", "portal home"], ["portal", "mera portal"],
               ["पोर्टल", "मेरा पोर्टल"]),
}
SECTION = {
    "summary": (["summary", "summary tab", "overview"], ["summary", "summary tab"], ["सारांश", "समरी"]),
    "findings": (["findings tab", "findings section"], ["findings tab", "findings section"], ["फाइंडिंग्स टैब"]),
    "documents": (["documents", "documents tab", "uploaded documents"], ["documents", "documents tab"],
                  ["दस्तावेज़", "डॉक्यूमेंट्स"]),
    "comparisons": (["comparisons", "comparison tab", "record comparisons"], ["comparisons", "comparison tab"],
                    ["तुलना", "कम्पेरिज़न"]),
    "activity": (["activity", "activity log", "activity tab"], ["activity", "activity tab"], ["गतिविधि", "एक्टिविटी"]),
}
DOCUMENT = {
    "fire_noc": (["fire NOC", "fire certificate"], ["fire NOC"], ["फायर एनओसी"]),
    "occupancy_certificate": (["occupancy certificate", "OC"], ["occupancy certificate", "OC"], ["अधिभोग प्रमाणपत्र"]),
    "affidavit_2": (["affidavit", "Affidavit 2"], ["affidavit"], ["शपथपत्र", "एफिडेविट"]),
    "ter_receipt": (["TER receipt", "fee receipt"], ["TER receipt", "fee receipt"], ["टीईआर रसीद", "फीस रसीद"]),
    "audited_accounts": (["audited accounts", "audit report"], ["audited accounts"], ["ऑडिटेड अकाउंट्स"]),
    "faculty_list": (["faculty list", "faculty roster"], ["faculty list"], ["फैकल्टी सूची"]),
    "satellite_map": (["satellite map", "site map"], ["satellite map", "map"], ["सैटेलाइट मैप"]),
    "nba_certificate": (["NBA certificate", "NBA letter"], ["NBA certificate"], ["एनबीए प्रमाणपत्र"]),
    "structural_stability": (["structural stability certificate", "stability certificate"], ["stability certificate"],
                             ["संरचनात्मक स्थिरता प्रमाणपत्र"]),
    "infrastructure_photo": (["lab photo", "infrastructure photo"], ["lab photo", "photo"], ["लैब फोटो"]),
}

# Polite and filler wrappers people put around a request
PREFIX = {EN: ["", "", "", "", "please ", "pls ", "hey drishti, ", "drishti, ", "hi, ", "ok ", "quick one: ",
               "kindly ", "sir, "],
          HG: ["", "", "", "", "drishti ", "zara ", "please ", "plz ", "bhai ", "ek baat, ", "achha "],
          HI: ["", "", "", "", "कृपया ", "दृष्टि, ", "ज़रा ", "जी, "]}
SUFFIX = {EN: ["", "", "", "", " please", " pls", " thanks", " asap", " quickly"],
          HG: ["", "", "", "", " please", " plz", " na", " zara", " jaldi"],
          HI: ["", "", "", "", " कृपया", " जी", " ज़रा"]}
