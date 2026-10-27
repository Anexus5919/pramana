"""Curated glossary terms and how-to topics, in English and Hindi. Keys match intents.TERMS and intents.HOWTOS.

`aliases` are the words the rules and the guardrail recognise, in English, Hinglish and Hindi; they are matched
as whole words on the lowercased message.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Term:
    key: str
    title: str
    title_hi: str
    text: str
    text_hi: str
    aliases: tuple[str, ...]
    href: str | None = None


@dataclass(frozen=True)
class HowTo:
    key: str
    title: str
    title_hi: str
    steps: tuple[str, ...]
    steps_hi: tuple[str, ...]
    aliases: tuple[str, ...]
    roles: frozenset[str] = field(default_factory=lambda: frozenset({"officer", "verifier", "admin", "institution"}))
    href: str | None = None
    # Who does it, named in the reply when another role asks
    done_by: str = ""
    done_by_hi: str = ""


OFFICIALS = frozenset({"officer", "verifier", "admin"})
OFFICER = frozenset({"officer"})
INSTITUTION = frozenset({"institution"})

TERMS: dict[str, Term] = {t.key: t for t in [
    Term("eoa", "Extension of Approval (EoA)", "अनुमोदन का विस्तार (EoA)",
         "An existing institution's yearly request to AICTE to continue its approved programmes for the next "
         "academic year.",
         "मौजूदा संस्थान का AICTE से हर साल किया गया अनुरोध, ताकि उसके अनुमोदित कार्यक्रम अगले शैक्षणिक वर्ष में भी चलते रहें।",
         ("eoa", "extension of approval", "extension", "ईओए", "अनुमोदन का विस्तार")),
    Term("increase_in_intake", "Increase in intake", "इंटेक में वृद्धि",
         "A request to admit more students in a programme than AICTE approved last year. The handbook sets "
         "extra conditions for it, such as core branches and faculty.",
         "किसी कार्यक्रम में पिछले साल की अनुमोदित सीटों से ज़्यादा छात्रों को प्रवेश देने का अनुरोध। हैंडबुक इसके लिए "
         "अतिरिक्त शर्तें रखती है, जैसे कोर ब्रांच और फैकल्टी।",
         ("increase in intake", "intake increase", "increase intake", "intake", "इंटेक", "इंटेक वृद्धि",
          "सीट वृद्धि")),
    Term("rectification", "Rectification", "रिक्टिफिकेशन (सुधार)",
         "When a scrutiny officer finds a deficiency the institution can correct, they request rectification. "
         "The institution gets a deficiency letter, corrects or uploads the documents asked for, and resubmits "
         "in a correction round.",
         "जब स्क्रूटिनी अधिकारी को ऐसी कमी मिलती है जिसे संस्थान सुधार सकता है, तो वे रिक्टिफिकेशन माँगते हैं। संस्थान को "
         "कमी पत्र मिलता है, वह माँगे गए दस्तावेज़ सुधारकर या अपलोड करके सुधार राउंड में दोबारा जमा करता है।",
         ("rectification", "rectify", "rectifications", "रिक्टिफिकेशन", "रेक्टिफिकेशन", "सुधार")),
    Term("deficiency_letter", "Deficiency letter", "कमी पत्र",
         "The letter that goes with a rectification request. Each item names the deficiency, what to submit, "
         "the rule it comes from and the response date. Pramana drafts it from findings; the officer edits "
         "and finalises it.",
         "रिक्टिफिकेशन अनुरोध के साथ जाने वाला पत्र। हर बिंदु में कमी, क्या जमा करना है, संबंधित नियम और जवाब की तारीख "
         "होती है। Pramana इसे निष्कर्षों से तैयार करता है; अधिकारी इसे संपादित करके अंतिम रूप देते हैं।",
         ("deficiency letter", "deficiency", "deficiency notice", "kami patra", "कमी पत्र")),
    Term("correction_round", "Correction round", "सुधार राउंड",
         "Each rectification request opens the next round. Round 1 is the first submission; correction round 1 "
         "is the resubmission the first deficiency letter asks for.",
         "हर रिक्टिफिकेशन अनुरोध अगला राउंड खोलता है। राउंड 1 पहली बार जमा करना है; सुधार राउंड 1 वह दोबारा जमा करना है "
         "जिसे पहला कमी पत्र माँगता है।",
         ("correction round", "correction rounds", "round", "सुधार राउंड")),
    Term("proof_strength", "Proof strength", "प्रमाण की मज़बूती",
         "For each requirement, how strongly the latest run proves it, on six levels: declared, present, read, "
         "AICTE record, issuer registry, and the issuer's signature or signed QR. It is on the application "
         "Summary, for officials.",
         "हर आवश्यकता के लिए, नवीनतम रन उसे कितनी मज़बूती से साबित करता है, छह स्तरों पर: घोषित, मौजूद, पढ़ा गया, AICTE "
         "रिकॉर्ड, जारीकर्ता रजिस्ट्री, और जारीकर्ता का हस्ताक्षर या हस्ताक्षरित QR। यह अधिकारियों के लिए आवेदन के "
         "सारांश पर है।",
         ("proof strength", "proof ladder", "proof matrix", "ladder", "प्रमाण की मज़बूती", "प्रूफ लैडर")),
    Term("evidence_class", "Evidence class", "साक्ष्य वर्ग",
         "Every finding carries the class of evidence behind it, strongest first: cryptographic, issuer, record, "
         "rule, structural, heuristic and model. The class decides which words Pramana may use.",
         "हर निष्कर्ष के साथ उसके पीछे के साक्ष्य का वर्ग होता है, सबसे मज़बूत पहले: cryptographic, issuer, record, rule, "
         "structural, heuristic और model। वर्ग तय करता है कि Pramana कौन से शब्द इस्तेमाल कर सकता है।",
         ("evidence class", "evidence classes", "e1", "e2", "e3", "e4", "e5", "साक्ष्य वर्ग")),
    Term("simulated", "SIMULATED", "SIMULATED (सिम्युलेटेड)",
         "In this prototype the issuer registries are stand-ins run by Pramana. Every result from them is tagged "
         "SIMULATED, so nobody mistakes it for a real issuer's answer.",
         "इस प्रोटोटाइप में जारीकर्ता रजिस्ट्रियाँ Pramana द्वारा चलाए गए विकल्प हैं। उनसे आया हर परिणाम SIMULATED चिह्नित "
         "होता है, ताकि कोई उसे असली जारीकर्ता का जवाब न समझे।",
         ("simulated", "simulation", "sim", "सिम्युलेटेड")),
    Term("signed_qr", "Signed QR", "हस्ताक्षरित QR",
         "A QR code on a certificate that carries the issuer's digital signature over its key fields. Pramana "
         "checks the signature with the issuer's public key and compares the fields with the page.",
         "प्रमाणपत्र पर ऐसा QR कोड जिसमें मुख्य विवरणों पर जारीकर्ता का डिजिटल हस्ताक्षर होता है। Pramana जारीकर्ता की "
         "सार्वजनिक कुंजी से हस्ताक्षर जाँचता है और विवरणों का पेज से मिलान करता है।",
         ("signed qr", "qr", "qr code", "क्यूआर", "क्यूआर कोड")),
    Term("dsc", "Digital Signature Certificate (DSC)", "डिजिटल हस्ताक्षर प्रमाणपत्र (DSC)",
         "A certificate, issued under the CCA India framework, that lets a person or office sign a PDF "
         "digitally. Pramana checks whose DSC signed a document and whether the file changed after signing.",
         "CCA India ढाँचे के तहत जारी प्रमाणपत्र, जिससे कोई व्यक्ति या कार्यालय PDF पर डिजिटल हस्ताक्षर कर सकता है। "
         "Pramana जाँचता है कि दस्तावेज़ पर किसके DSC से हस्ताक्षर हुए और हस्ताक्षर के बाद फ़ाइल बदली या नहीं।",
         ("dsc", "digital signature", "digital signature certificate", "डिजिटल हस्ताक्षर", "डीएससी")),
    Term("cca_india", "CCA India", "CCA इंडिया",
         "The Controller of Certifying Authorities, which licenses the authorities that issue digital "
         "signature certificates in India. A DSC is trusted when it chains to the CCA India root.",
         "प्रमाणन प्राधिकारियों के नियंत्रक, जो भारत में डिजिटल हस्ताक्षर प्रमाणपत्र जारी करने वाले प्राधिकारियों को "
         "लाइसेंस देते हैं। कोई DSC तब भरोसेमंद है जब वह CCA India रूट से जुड़ा हो।",
         ("cca india", "cca", "controller of certifying authorities", "सीसीए")),
    Term("time_machine", "Revisions and the time machine", "रिवीज़न और टाइम मशीन",
         "A PDF saved more than once keeps every earlier revision inside the file. The time machine steps "
         "through them and shows what each revision changed and which ones a signature covers.",
         "एक से ज़्यादा बार सेव की गई PDF अपने हर पुराने रिवीज़न को फ़ाइल के अंदर रखती है। टाइम मशीन उनमें एक-एक करके "
         "जाती है और दिखाती है कि हर रिवीज़न ने क्या बदला और कौन से रिवीज़न हस्ताक्षर के दायरे में हैं।",
         ("time machine", "revision", "revisions", "टाइम मशीन", "रिवीज़न")),
    Term("readiness_check", "Readiness check", "तैयारी जाँच",
         "A self-check for institutions before submitting: it lists what AICTE's handbook rules are likely to "
         "raise, with the clause and where to fix it. It never submits, blocks or decides anything.",
         "जमा करने से पहले संस्थानों के लिए स्व-जाँच: यह बताती है कि AICTE हैंडबुक के नियम क्या उठा सकते हैं, नियम के "
         "अनुच्छेद और सुधार की जगह के साथ। यह न जमा करती है, न रोकती है, न कुछ तय करती है।",
         ("readiness check", "readiness", "तैयारी जाँच")),
    Term("integrity_network", "Integrity network", "इंटीग्रिटी नेटवर्क",
         "A cycle-wide view that links applications sharing evidence: the same certificate number, seal, photo "
         "or faculty member. Each link is an indicator for review, not a conclusion.",
         "पूरे चक्र का दृश्य जो साझा साक्ष्य वाले आवेदनों को जोड़ता है: वही प्रमाणपत्र संख्या, मुहर, फ़ोटो या फैकल्टी। "
         "हर कड़ी समीक्षा के लिए एक संकेत है, निष्कर्ष नहीं।",
         ("integrity network", "integrity", "network", "इंटीग्रिटी", "नेटवर्क"), "/integrity"),
    Term("ghost_faculty", "Ghost faculty", "घोस्ट फैकल्टी",
         "A faculty member listed by two institutions at once, or registered with a different institution. "
         "The Faculty overlaps view shows each case with the rosters and the registry record for an official "
         "to review.",
         "ऐसा फैकल्टी सदस्य जिसे दो संस्थान एक साथ दिखाते हैं, या जो किसी दूसरे संस्थान में पंजीकृत है। फैकल्टी ओवरलैप "
         "दृश्य हर मामले को रोस्टर और रजिस्ट्री रिकॉर्ड के साथ अधिकारी की समीक्षा के लिए दिखाता है।",
         ("ghost faculty", "ghost", "faculty overlap", "faculty overlaps", "घोस्ट फैकल्टी"), "/integrity/faculty"),
    Term("coverage_calendar", "Coverage calendar", "कवरेज कैलेंडर",
         "Every time-bound certificate drawn against the submission date and the academic session being "
         "approved, so a certificate valid today that lapses mid-session is visible.",
         "हर समय-सीमित प्रमाणपत्र को जमा करने की तारीख और अनुमोदित होने वाले शैक्षणिक सत्र के साथ दिखाता है, ताकि आज "
         "वैध पर सत्र के बीच में समाप्त होने वाला प्रमाणपत्र दिख जाए।",
         ("coverage calendar", "coverage", "कवरेज कैलेंडर")),
    Term("inspection_brief", "Inspection brief", "निरीक्षण ब्रीफ़",
         "A short brief for the Expert Visit Committee, generated from findings: what to see, count and ask on "
         "the site visit.",
         "विशेषज्ञ निरीक्षण समिति के लिए निष्कर्षों से बना छोटा ब्रीफ़: साइट विज़िट पर क्या देखना, गिनना और पूछना है।",
         ("inspection brief", "inspection", "site visit", "evc", "निरीक्षण", "निरीक्षण ब्रीफ़")),
    Term("evidence_pack", "Evidence pack", "साक्ष्य पैक",
         "A sealed ZIP of one application's report, findings, page crops, verification results and cited "
         "rules, with digests, so the case can be checked outside Pramana.",
         "एक आवेदन की रिपोर्ट, निष्कर्ष, पेज के अंश, सत्यापन परिणाम और उद्धृत नियमों का सील्ड ZIP, डाइजेस्ट के साथ, ताकि "
         "मामले को Pramana के बाहर भी जाँचा जा सके।",
         ("evidence pack", "pack", "साक्ष्य पैक")),
    Term("replay", "Replay", "रीप्ले",
         "Re-runs a past validation with the same inputs and ruleset and confirms the report comes out "
         "byte-identical, so every result can be reproduced.",
         "पिछले सत्यापन रन को उन्हीं इनपुट और नियमों के साथ दोबारा चलाता है और पुष्टि करता है कि रिपोर्ट हूबहू वही आती है, "
         "ताकि हर परिणाम दोहराया जा सके।",
         ("replay", "re-run", "rerun", "रीप्ले")),
    Term("audit_chain", "Audit chain", "ऑडिट चेन",
         "Every action in Pramana is an audit event that commits to the previous event's hash, and signed "
         "checkpoints seal the head, so any edit, deletion or truncation is detectable.",
         "Pramana की हर कार्रवाई एक ऑडिट घटना है जो पिछली घटना के हैश से जुड़ी होती है, और हस्ताक्षरित चेकपॉइंट अंतिम "
         "सिरे को सील करते हैं, ताकि कोई भी बदलाव, हटाना या काटना पकड़ में आ जाए।",
         ("audit chain", "audit log", "audit trail", "hash chain", "ऑडिट चेन", "ऑडिट"), "/audit"),
    Term("aph", "Approval Process Handbook (APH)", "अनुमोदन प्रक्रिया हैंडबुक (APH)",
         "AICTE's handbook for 2024-27 that sets the documents, norms and conditions for approval. Pramana's "
         "rules quote its clauses word for word.",
         "2024-27 के लिए AICTE की हैंडबुक जो अनुमोदन के लिए दस्तावेज़, मानक और शर्तें तय करती है। Pramana के नियम इसके "
         "अनुच्छेदों को शब्दशः उद्धृत करते हैं।",
         ("aph", "handbook", "approval process handbook", "aph handbook", "हैंडबुक"), "/rules"),
    Term("ter", "TER (processing fee)", "TER (प्रोसेसिंग शुल्क)",
         "The processing fee receipt for the application. Pramana matches the receipt's transaction ID and "
         "amount with AICTE's payment ledger.",
         "आवेदन के प्रोसेसिंग शुल्क की रसीद। Pramana रसीद के ट्रांज़ैक्शन ID और राशि का AICTE के भुगतान रिकॉर्ड से मिलान "
         "करता है।",
         ("ter", "ter receipt", "processing fee", "fee receipt", "टीईआर")),
    Term("nba", "NBA accreditation", "NBA मान्यता",
         "Accreditation of a programme by the National Board of Accreditation. Pramana checks NBA claims "
         "against the accreditation register and the certificate's QR.",
         "राष्ट्रीय प्रत्यायन बोर्ड द्वारा किसी कार्यक्रम की मान्यता। Pramana NBA के दावों को मान्यता रजिस्टर और प्रमाणपत्र "
         "के QR से जाँचता है।",
         ("nba", "accreditation", "nba accreditation", "एनबीए", "मान्यता")),
    Term("finding", "Finding", "निष्कर्ष (फाइंडिंग)",
         "Something the validation run reports for an official to review, with its evidence, severity, "
         "evidence class and the rule behind it. A finding is never a decision.",
         "सत्यापन रन द्वारा अधिकारी की समीक्षा के लिए बताई गई बात, उसके साक्ष्य, गंभीरता, साक्ष्य वर्ग और संबंधित नियम के "
         "साथ। निष्कर्ष कभी निर्णय नहीं होता।",
         ("finding", "findings", "flag", "फाइंडिंग", "निष्कर्ष")),
    Term("scrutiny_outcome", "Scrutiny outcome", "स्क्रूटिनी परिणाम",
         "The authority's decision on an application, recorded by a scrutiny officer with a reason. Recording "
         "it starts the re-verification watch on issuer-confirmed certificates.",
         "किसी आवेदन पर प्राधिकारी का निर्णय, जिसे स्क्रूटिनी अधिकारी कारण के साथ दर्ज करते हैं। इसे दर्ज करते ही जारीकर्ता "
         "द्वारा पुष्ट प्रमाणपत्रों पर दोबारा-सत्यापन निगरानी शुरू होती है।",
         ("scrutiny outcome", "outcome", "outcomes", "स्क्रूटिनी परिणाम", "परिणाम")),
    Term("ask_why", "Ask why", "Ask why (क्यों पूछें)",
         "A panel inside one application that explains its findings in plain words, every sentence citing "
         "Pramana's own evidence. It explains; it does not decide.",
         "एक आवेदन के अंदर का पैनल जो उसके निष्कर्षों को सरल शब्दों में समझाता है, हर वाक्य Pramana के अपने साक्ष्य का "
         "हवाला देता है। यह समझाता है, तय नहीं करता।",
         ("ask why",)),
    Term("fire_noc", "Fire safety certificate (fire NOC)", "अग्नि सुरक्षा प्रमाणपत्र (फायर NOC)",
         "The fire service's certificate that the building meets fire safety norms. AICTE needs it valid on "
         "the submission date; Pramana checks it with the issuer's signature, signed QR and registry.",
         "अग्निशमन सेवा का प्रमाणपत्र कि इमारत अग्नि सुरक्षा मानकों पर खरी है। AICTE को यह जमा करने की तारीख पर वैध "
         "चाहिए; Pramana इसे जारीकर्ता के हस्ताक्षर, हस्ताक्षरित QR और रजिस्ट्री से जाँचता है।",
         ("fire noc", "noc", "fire certificate", "fire safety certificate", "फायर एनओसी", "एनओसी",
          "अग्नि सुरक्षा प्रमाणपत्र")),
]}

HOWTOS: dict[str, HowTo] = {h.key: h for h in [
    HowTo("request_rectification", "Request rectification", "रिक्टिफिकेशन कैसे माँगें",
          ("Open the application and review its findings.",
           "Choose Decide, then Request rectification.",
           "Pick the findings to include, check the deficiency letter and send it."),
          ("आवेदन खोलें और उसके निष्कर्ष देखें।",
           "Decide चुनें, फिर Request rectification।",
           "शामिल करने वाले निष्कर्ष चुनें, कमी पत्र जाँचें और भेजें।"),
          ("request rectification", "send rectification", "rectification request", "deficiency letter",
           "rectification", "रिक्टिफिकेशन"),
          OFFICER, "/dashboard", "scrutiny officers", "स्क्रूटिनी अधिकारी"),
    HowTo("record_outcome", "Record a scrutiny outcome", "स्क्रूटिनी परिणाम कैसे दर्ज करें",
          ("Open the application after its validation run is complete.",
           "Choose Decide, then Record scrutiny outcome.",
           "Pick the outcome the authority decided and write the reason. It goes into the audit chain."),
          ("सत्यापन रन पूरा होने के बाद आवेदन खोलें।",
           "Decide चुनें, फिर Record scrutiny outcome।",
           "प्राधिकारी द्वारा तय परिणाम चुनें और कारण लिखें। यह ऑडिट चेन में दर्ज होता है।"),
          ("record outcome", "record an outcome", "record the outcome", "scrutiny outcome", "outcome", "decision",
           "decide", "परिणाम"),
          OFFICER, "/dashboard", "scrutiny officers", "स्क्रूटिनी अधिकारी"),
    HowTo("analyse_document", "Analyse a document", "दस्तावेज़ का विश्लेषण कैसे करें",
          ("Open Analyse a document.",
           "Drop a PDF or photo. Nothing is filed; only an audit entry is kept.",
           "Read the tiles: signature, revisions, structure, QR and photo checks."),
          ("Analyse a document खोलें।",
           "PDF या फ़ोटो डालें। कुछ भी दर्ज नहीं होता; सिर्फ़ ऑडिट प्रविष्टि रहती है।",
           "टाइल पढ़ें: हस्ताक्षर, रिवीज़न, संरचना, QR और फ़ोटो जाँच।"),
          ("analyse", "analyze", "analyse a document", "check a pdf", "verify a pdf", "upload a pdf", "विश्लेषण"),
          OFFICIALS, "/analyse", "officials", "अधिकारी"),
    HowTo("verify_qr_by_phone", "Verify a QR by phone", "फ़ोन से QR कैसे जाँचें",
          ("Point the phone camera at the certificate's QR code.",
           "Certificates with a scan link open Pramana's scan page and check themselves.",
           "For other signed QRs, take a photo on the scan page."),
          ("फ़ोन का कैमरा प्रमाणपत्र के QR कोड पर रखें।",
           "स्कैन लिंक वाले प्रमाणपत्र Pramana का स्कैन पेज खोलकर खुद जाँच लेते हैं।",
           "बाकी हस्ताक्षरित QR के लिए स्कैन पेज पर फ़ोटो लें।"),
          ("verify qr", "scan qr", "qr by phone", "scan", "phone", "mobile", "qr", "स्कैन"),
          OFFICIALS | INSTITUTION, "/scan"),
    HowTo("check_audit_chain", "Check the audit chain", "ऑडिट चेन कैसे जाँचें",
          ("Open the Audit log.",
           "Choose Verify chain: Pramana recomputes every hash and checks the signed checkpoints.",
           "Any broken link is named by its sequence number."),
          ("ऑडिट लॉग खोलें।",
           "Verify chain चुनें: Pramana हर हैश दोबारा गिनता है और हस्ताक्षरित चेकपॉइंट जाँचता है।",
           "कोई भी टूटी कड़ी उसके क्रम संख्या से बताई जाती है।"),
          ("check audit", "audit chain", "verify chain", "audit log", "audit", "ऑडिट"),
          frozenset({"officer", "admin"}), "/audit", "officers and administrators", "अधिकारी और प्रशासक"),
    HowTo("read_proof_ladder", "Read the proof ladder", "प्रूफ लैडर कैसे पढ़ें",
          ("Open an application's Summary and find Proof strength.",
           "Each row is a requirement; rungs rise from declared to the issuer's signature or QR.",
           "Green is proven by an AICTE record or stronger, red is contradicted, amber is inconclusive."),
          ("आवेदन का सारांश खोलें और Proof strength देखें।",
           "हर पंक्ति एक आवश्यकता है; सीढ़ी घोषित से जारीकर्ता के हस्ताक्षर या QR तक चढ़ती है।",
           "हरा मतलब AICTE रिकॉर्ड या उससे मज़बूत प्रमाण, लाल मतलब विरोधाभास, एम्बर मतलब अनिर्णीत।"),
          ("proof ladder", "proof strength", "ladder", "प्रूफ लैडर"),
          OFFICIALS, "/dashboard", "officials", "अधिकारी"),
    HowTo("use_ask_why", "Use Ask why", "Ask why का इस्तेमाल कैसे करें",
          ("Open the application.",
           "Choose Ask why in the header.",
           "Ask about a finding; every sentence of the answer cites Pramana's evidence."),
          ("आवेदन खोलें।",
           "हेडर में Ask why चुनें।",
           "किसी निष्कर्ष के बारे में पूछें; जवाब का हर वाक्य Pramana के साक्ष्य का हवाला देता है।"),
          ("ask why", "use ask why", "explain findings"),
          OFFICER, "/dashboard", "scrutiny officers", "स्क्रूटिनी अधिकारी"),
    HowTo("export_evidence_pack", "Export an evidence pack", "साक्ष्य पैक कैसे निकालें",
          ("Open the application.",
           "Open More actions and choose Export evidence pack.",
           "Download the sealed ZIP; its digests can be checked offline."),
          ("आवेदन खोलें।",
           "More actions खोलें और Export evidence pack चुनें।",
           "सील्ड ZIP डाउनलोड करें; उसके डाइजेस्ट ऑफ़लाइन जाँचे जा सकते हैं।"),
          ("evidence pack", "export pack", "export", "साक्ष्य पैक"),
          OFFICER, "/dashboard", "scrutiny officers", "स्क्रूटिनी अधिकारी"),
    HowTo("confirm_verification", "Record a manual confirmation", "मैन्युअल पुष्टि कैसे दर्ज करें",
          ("Open the application's Documents, then Verification.",
           "Pick an attempt marked source unavailable, pending or manual review.",
           "Record what the issuer confirmed by letter, email or portal, with a note."),
          ("आवेदन के Documents में Verification खोलें।",
           "source unavailable, pending या manual review वाला प्रयास चुनें।",
           "जारीकर्ता ने पत्र, ईमेल या पोर्टल से जो पुष्टि की, उसे नोट के साथ दर्ज करें।"),
          ("manual confirmation", "confirm verification", "confirmation", "manual", "पुष्टि"),
          frozenset({"verifier", "officer"}), "/dashboard", "the verification cell and scrutiny officers",
          "सत्यापन प्रकोष्ठ और स्क्रूटिनी अधिकारी"),
    HowTo("start_application", "Start an application", "आवेदन कैसे शुरू करें",
          ("Open your Applications and choose New application.",
           "Pick the category and academic year.",
           "Fill in the declared figures and upload the documents the checklist asks for."),
          ("अपने Applications खोलें और New application चुनें।",
           "श्रेणी और शैक्षणिक वर्ष चुनें।",
           "घोषित आँकड़े भरें और चेकलिस्ट में माँगे गए दस्तावेज़ अपलोड करें।"),
          ("start an application", "new application", "start application", "create application", "apply",
           "नया आवेदन"),
          INSTITUTION, "/portal/new", "institutions", "संस्थान"),
    HowTo("fix_readiness_items", "Fix readiness items", "तैयारी जाँच की कमियाँ कैसे ठीक करें",
          ("Open your application; the Readiness check runs on its own.",
           "Each item to fix says what was found and what to do, with Go to buttons.",
           "Upload or correct, and the check runs again."),
          ("अपना आवेदन खोलें; तैयारी जाँच अपने आप चलती है।",
           "ठीक करने वाले हर बिंदु में लिखा है कि क्या मिला और क्या करना है, Go to बटन के साथ।",
           "अपलोड या सुधार करें, जाँच फिर से चलती है।"),
          ("readiness", "fix readiness", "readiness items", "what is missing", "कमियाँ"),
          INSTITUTION, "/portal", "institutions", "संस्थान"),
    HowTo("submit_application", "Submit an application", "आवेदन कैसे जमा करें",
          ("Open your draft application.",
           "Check the Readiness panel and upload anything missing.",
           "Choose Submit. In a rectification round, Submit sends the correction."),
          ("अपना ड्राफ़्ट आवेदन खोलें।",
           "Readiness पैनल देखें और जो कमी है वह अपलोड करें।",
           "Submit चुनें। रिक्टिफिकेशन राउंड में Submit सुधार भेजता है।"),
          ("submit", "submit application", "resubmit", "जमा"),
          INSTITUTION, "/portal", "institutions", "संस्थान"),
]}
