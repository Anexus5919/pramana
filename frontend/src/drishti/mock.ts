// Dev-only stand-in for POST /api/drishti/ask and GET /api/drishti/suggestions, loaded only when
// VITE_DRISHTI_MOCK=1 in a dev build (see client.ts). Replies follow the spec's shapes for every kind.
import { ApiError } from "../api";
import type { Role } from "../types";
import { starterChips } from "./copy";
import type { DrishtiAskBody, DrishtiAskResponse, DrishtiItem, DrishtiLanguage, DrishtiReply, DrishtiSuggestionsPayload } from "./types";

type Lang = DrishtiLanguage;
type Copy = Record<Lang, string>;

const HINGLISH = /\b(hai|hain|kitne|kitni|kitna|aaj|kal|mere|mera|meri|dikhao|wale|wala|wali|kya|ka|ki|ke|aur|kholo|sirf|batao|kaise|kab|aaye|aayi)\b/i;

function detect(msg: string): Lang {
  if (/[ऀ-ॿ]/.test(msg)) return "hi";
  return HINGLISH.test(msg) ? "hinglish" : "en";
}

const NAMES: Record<number, string> = {
  1: "Shree Dnyaneshwar Institute of Technology",
  2: "Godavari College of Engineering",
  3: "Konkan Institute of Engineering and Management",
  4: "Vidarbha Technical Campus",
  5: "Sahyadri School of Engineering",
  6: "Krishna Valley College of Engineering",
  7: "Panchganga Institute of Technology",
  8: "Deccan Institute of Engineering Studies",
  9: "Marathwada Polytechnic and Engineering College",
  10: "Tapi Valley Institute of Technology",
  11: "Bhima Valley College of Engineering",
};

const appId = (n: number) => `APP-2026-${String(100 + n).padStart(6, "0")}`;
const ws = (n: number, section = "") => `/applications/${appId(n)}${section ? `/${section}` : ""}`;

function day(offset: number): string {
  return new Date(Date.now() + offset * 864e5).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function reply(kind: DrishtiReply["kind"], language: Lang, text: string, extra: Partial<DrishtiReply> = {}): DrishtiReply {
  return { kind, language, text, count: null, items: [], more_href: null, suggestions: [], source: "rules", intent: null, ...extra };
}

const pick = (lang: Lang, c: Copy) => c[lang];

const OUT_OF_SCOPE =
  /biryani|cricket|match|weather|mausam|joke|recipe|film|movie|song|ignore (all |the )?previous|बिरयानी|क्रिकेट|मौसम|मज़ाक|फ़िल्म/i;

// Per conversation: the last list, so "open the first one" and "and yesterday?" work
const memory = new Map<string, { intent: string; items: DrishtiItem[] }>();
let nextConversation = 1;

function scope(lang: Lang, role: Role | undefined): DrishtiReply {
  return reply(
    "refuse",
    lang,
    pick(lang, {
      en: "I can only help with Pramana: applications, findings, decisions, certificates, rules and how to use the app.",
      hi: "यहाँ केवल Pramana से जुड़े प्रश्नों के उत्तर मिलते हैं: आवेदन, निष्कर्ष, निर्णय, प्रमाणपत्र, नियम और ऐप का उपयोग।",
      hinglish: "Yahan sirf Pramana se jude sawalon ke jawab milte hain: applications, findings, decisions, certificates, rules aur app ka use.",
    }),
    { source: "guardrail", suggestions: starterChips(role).slice(0, 3) },
  );
}

function answer(msg: string, lang: Lang, role: Role | undefined, body: DrishtiAskBody, last?: { intent: string; items: DrishtiItem[] }): DrishtiReply {
  const m = msg.toLowerCase();
  const institution = role === "institution";
  const ownApp = body.context.application_id ?? appId(1);
  const ownHref = `/portal/applications/${ownApp}`;

  if (m.includes("simulate error")) throw new ApiError(503, "Drishti is unavailable", null);
  if (OUT_OF_SCOPE.test(m)) return scope(lang, role);

  if (/^(hi|hello|hey|namaste|namaskar)\b|नमस्ते|नमस्कार/.test(m))
    return reply(
      "greeting",
      lang,
      pick(lang, {
        en: "Hello. Ask about applications, findings, decisions or certificates.",
        hi: "नमस्ते। आवेदन, निष्कर्ष, निर्णय या प्रमाणपत्रों के बारे में पूछें।",
        hinglish: "Namaste. Applications, findings, decisions ya certificates ke baare mein poochiye.",
      }),
      { suggestions: starterChips(role) },
    );

  if (/\b(approve|reject|sanction)\b|manzoor|मंजूर|स्वीकृत|अस्वीकार/.test(m))
    return reply(
      "refuse",
      lang,
      pick(lang, {
        en: "Decisions are made by officials, not by Drishti. Open the application to record yours from Decide.",
        hi: "निर्णय अधिकारी लेते हैं, Drishti नहीं। अपना निर्णय दर्ज करने के लिए आवेदन खोलें और Decide चुनें।",
        hinglish: "Decision officials lete hain, Drishti nahi. Apna decision record karne ke liye application kholiye aur Decide chuniye.",
      }),
      { items: [{ type: "page", id: `${appId(7)}:decide`, title: `Decide on ${appId(7)}`, subtitle: NAMES[7], href: `${ws(7)}?action=decide` }] },
    );

  if (institution && /\b(all|colleges|institutions|every)\b|sab(hi)?\b|सभी|सब/.test(m))
    return reply(
      "refuse",
      lang,
      pick(lang, {
        en: "I can only show your own application.",
        hi: "यहाँ केवल आपका अपना आवेदन दिखाया जा सकता है।",
        hinglish: "Yahan sirf aapki apni application dikh sakti hai.",
      }),
      { suggestions: ["What is missing in my application?", "Status of my application"] },
    );

  if (/(open|kholo|खोलो).*(first|pehla|पहला)|(first|pehla|पहला).*(open|kholo|खोलो)/.test(m) && last?.items[0])
    return reply(
      "navigate",
      lang,
      pick(lang, { en: "Here is the first result.", hi: "यह रहा पहला परिणाम।", hinglish: "Yeh raha pehla result." }),
      { items: [last.items[0]] },
    );

  const page = (
    [
      [/integrity|इंटीग्रिटी/, { title: "Integrity", subtitle: "Shared evidence and faculty overlaps across applications", href: "/integrity" }],
      [/\brules?\b|नियम/, { title: "Rules", subtitle: "The active ruleset and its handbook clauses", href: "/rules" }],
      [/audit|ऑडिट/, { title: "Audit log", subtitle: "Every action, hash-chained", href: "/audit" }],
      [/analy[sz]e|विश्लेषण/, { title: "Analyse a document", subtitle: "Check a PDF or photo on its own", href: "/analyse" }],
      [/queue|dashboard|कतार/, { title: "Review queue", subtitle: "Applications waiting for review", href: "/dashboard" }],
    ] as const
  ).find(([re]) => re.test(m));
  if (page && /\b(open|go|take me|show)\b|kholo|le chalo|खोलो|ले चलो|dikhao/.test(m) && !institution)
    return reply(
      "navigate",
      lang,
      pick(lang, { en: `Here is ${page[1].title}.`, hi: `यह रहा ${page[1].title} पेज।`, hinglish: `Yeh raha ${page[1].title} page.` }),
      { items: [{ type: "page", id: page[1].href, ...page[1] }] },
    );

  if (/(what is|what's|meaning|kya hai|kya hota|क्या है|मतलब).*(rectification|रिक्टिफिकेशन|सुधार)|(rectification|रिक्टिफिकेशन|सुधार).*(kya|क्या|mean)/.test(m))
    return reply(
      "help",
      lang,
      pick(lang, {
        en: "Rectification is the step where AICTE asks an institution to correct specific items. A deficiency letter lists them; the institution corrects them and resubmits, and the resubmission is checked as the correction round.",
        hi: "रिक्टिफिकेशन (सुधार) वह चरण है जिसमें AICTE संस्थान से कुछ विशेष बिंदु सुधारने को कहता है। कमी-पत्र (deficiency letter) में ये बिंदु लिखे होते हैं; संस्थान इन्हें सुधारकर दोबारा जमा करता है, और उसकी जाँच सुधार दौर (correction round) में होती है।",
        hinglish: "Rectification woh step hai jismein AICTE institution se kuch specific items theek karne ko kehta hai. Deficiency letter mein yeh items likhe hote hain; institution unhe theek karke resubmit karta hai, aur uski jaanch correction round mein hoti hai.",
      }),
      {
        intent: { intent: "explain_term", term: "rectification", language: lang },
        suggestions: institution ? ["How do I fix readiness items?"] : ["How do I request rectification?", "What is a deficiency letter?"],
      },
    );

  if (/how (do|to|can)|kaise|कैसे/.test(m) && /rectification|सुधार/.test(m) && !institution)
    return reply(
      "help",
      lang,
      "To request rectification:\n1. Open the application and go to Findings.\n2. Select the findings the institution should correct.\n3. Choose Decide, then Request rectification, and give a reason.\n4. Check the deficiency letter and send it.",
      { items: [{ type: "page", id: "queue", title: "Review queue", subtitle: "Pick an application to start", href: "/dashboard" }] },
    );

  if (/how (do|to|can)|kaise|कैसे/.test(m) && /qr/.test(m))
    return reply(
      "help",
      lang,
      "To verify a signed QR by phone:\n1. Open the camera and point it at the QR on the document.\n2. Open the link; it lands on Pramana's public scan page.\n3. The page shows whether the issuer's signature on the QR checks out, and the values it carries.",
      { items: [{ type: "page", id: "analyse", title: "Analyse a document", subtitle: "Or upload the PDF here", href: "/analyse" }] },
    );

  if (institution && /missing|baaki|bacha|बाकी|readiness|status|स्थिति/.test(m))
    return reply(
      "answer",
      lang,
      pick(lang, {
        en: "2 items need attention before you submit.",
        hi: "जमा करने से पहले 2 बिंदुओं पर ध्यान देना है।",
        hinglish: "Submit karne se pehle 2 items par dhyan dena hai.",
      }),
      {
        count: 2,
        items: [
          { type: "readiness", id: "r1", title: "Upload the fire NOC", subtitle: "Required document", href: ownHref },
          { type: "readiness", id: "r2", title: "Faculty list: 3 entries have no registration ID", subtitle: "Declared details", href: ownHref },
        ],
        suggestions: ["How do I fix readiness items?"],
      },
    );

  if (/decision|faisle|faisla|फैसले|फ़ैसले|निर्णय/.test(m) && !institution) {
    const items: DrishtiItem[] = [
      { type: "decision", id: "d1", title: NAMES[3], subtitle: `Rectification requested · ${day(-1)}, 11:40`, href: ws(3, "activity") },
      { type: "decision", id: "d2", title: NAMES[1], subtitle: `Scrutiny outcome recorded · ${day(-1)}, 16:05`, href: ws(1, "activity") },
    ];
    return reply(
      "answer",
      lang,
      pick(lang, { en: "2 decisions by you yesterday.", hi: "कल आपके 2 निर्णय।", hinglish: "Kal aapke 2 decisions." }),
      { count: 2, items, more_href: "/audit", suggestions: ["And today?", "Only rectification requests"] },
    );
  }

  const intakeQ = /intake|इंटेक/.test(m);
  const followUp = /^(and |aur |और )?(yesterday|kal|कल)\??$/.test(m.trim()) && last?.intent === "count_applications";
  if (intakeQ || followUp) {
    const when = followUp || /yesterday|\bkal\b|कल/.test(m) ? "yesterday" : "today";
    const latest: DrishtiItem = { type: "application", id: appId(10), title: NAMES[10], subtitle: `${appId(10)} · Submitted 22 Dec 2025`, href: ws(10) };
    return reply(
      "answer",
      lang,
      when === "today"
        ? pick(lang, {
            en: `No increase-in-intake applications were submitted today. The latest was on 22 Dec 2025: ${NAMES[10]}.`,
            hi: `आज प्रवेश क्षमता वृद्धि का कोई आवेदन जमा नहीं हुआ। सबसे हाल का आवेदन 22 दिसंबर 2025 को आया: ${NAMES[10]}।`,
            hinglish: `Aaj koi intake increase application submit nahi hui. Sabse latest 22 Dec 2025 ko aayi thi: ${NAMES[10]}.`,
          })
        : pick(lang, {
            en: `None were submitted yesterday either. The latest was on 22 Dec 2025: ${NAMES[10]}.`,
            hi: `कल भी कोई आवेदन जमा नहीं हुआ। सबसे हाल का 22 दिसंबर 2025 को आया: ${NAMES[10]}।`,
            hinglish: `Kal bhi koi application nahi aayi. Sabse latest 22 Dec 2025 ko aayi thi: ${NAMES[10]}.`,
          }),
      {
        count: 0,
        items: [latest],
        more_href: "/dashboard",
        intent: { intent: "count_applications", filters: { category: "increase_intake", period: when }, follow_up: followUp, language: lang },
        suggestions: pick(lang, { en: "And yesterday?|This month|All intake applications", hi: "और कल?|इस महीने|सभी इंटेक आवेदन", hinglish: "Aur kal?|Is mahine|Saari intake applications" }).split("|"),
      },
    );
  }

  if (/finding|nishkarsh|निष्कर्ष|गंभीर|high/.test(m) && !institution) {
    const f = (n: number, title: string, sev: string): DrishtiItem => ({
      type: "finding",
      id: `f${n}${title.length}`,
      title,
      subtitle: `${NAMES[n]} · ${sev}`,
      href: ws(n, "findings"),
    });
    return reply(
      "answer",
      lang,
      pick(lang, {
        en: "9 open high-severity findings across 6 applications.",
        hi: "6 आवेदनों में उच्च गंभीरता के 9 खुले निष्कर्ष।",
        hinglish: "6 applications mein 9 high severity findings khuli hain.",
      }),
      {
        count: 9,
        items: [
          f(7, "Fire NOC validity ended before submission", "High"),
          f(4, "Declared intake differs from the AICTE record", "High"),
          f(5, "Fire NOC number belongs to another institution", "High"),
          f(6, "Three faculty also listed by another institution", "High"),
          f(8, "Fire NOC is signed by the applicant, not the issuer", "High"),
        ],
        more_href: "/dashboard",
        suggestions: pick(lang, { en: "Only fire safety|From Maharashtra|Open the first one", hi: "केवल अग्नि सुरक्षा|महाराष्ट्र से|पहला वाला खोलो", hinglish: "Sirf fire safety wale|Maharashtra se|Pehla wala kholo" }).split("|"),
      },
    );
  }

  if (/expir|certificate|प्रमाणपत्र|समाप्त|khatam/.test(m) && !institution)
    return reply(
      "answer",
      lang,
      pick(lang, {
        en: "3 certificates end before or during the 2026-27 session.",
        hi: "3 प्रमाणपत्रों की वैधता 2026-27 सत्र से पहले या उसके दौरान समाप्त होती है।",
        hinglish: "3 certificates ki validity 2026-27 session se pehle ya uske dauran khatam hoti hai.",
      }),
      {
        count: 3,
        items: [
          { type: "certificate", id: "c1", title: `Fire NOC · ${NAMES[7]}`, subtitle: "Ended 30 Jun 2025", href: ws(7, "documents") },
          { type: "certificate", id: "c2", title: `Fire NOC · ${NAMES[3]}`, subtitle: "Ended 30 Sep 2025", href: ws(3, "documents") },
          { type: "certificate", id: "c3", title: `Structural stability certificate · ${NAMES[2]}`, subtitle: "Valid until 31 Mar 2027", href: ws(2, "documents") },
        ],
        suggestions: ["Only fire NOCs", "Expiring this month"],
      },
    );

  if (/awaiting|confirmation|pushti|पुष्टि/.test(m) && !institution)
    return reply(
      "answer",
      lang,
      pick(lang, { en: "4 verification items are waiting for manual confirmation.", hi: "4 सत्यापन बिंदु मैनुअल पुष्टि की प्रतीक्षा में हैं।", hinglish: "4 verification items manual confirmation ka wait kar rahe hain." }),
      {
        count: 4,
        items: [
          { type: "verification", id: "v1", title: `Occupancy certificate · ${NAMES[9]}`, subtitle: "Registry unavailable during validation", href: ws(9, "documents") },
          { type: "verification", id: "v2", title: `Fire NOC · ${NAMES[11]}`, subtitle: "Issuer layout not recognised", href: ws(11, "documents") },
          { type: "verification", id: "v3", title: `Fire NOC · ${NAMES[8]}`, subtitle: "Signer is not the issuer", href: ws(8, "documents") },
          { type: "verification", id: "v4", title: `Land document · ${NAMES[6]}`, subtitle: "No signed QR", href: ws(6, "documents") },
        ],
      },
    );

  if (/summary|सारांश|panchganga|पंचगंगा|\ba7\b/.test(m) && !institution)
    return reply(
      "answer",
      lang,
      pick(lang, {
        en: `${NAMES[7]} (A7) is under review in the first round, with 13 open findings: 5 high, 6 medium and 2 low.`,
        hi: `${NAMES[7]} (A7) पहले दौर में समीक्षा में है। 13 खुले निष्कर्ष: 5 उच्च, 6 मध्यम और 2 निम्न।`,
        hinglish: `${NAMES[7]} (A7) abhi first round mein under review hai. 13 findings khuli hain: 5 high, 6 medium aur 2 low.`,
      }),
      {
        source: lang === "hinglish" ? "model" : "rules",
        items: [
          { type: "application", id: appId(7), title: NAMES[7], subtitle: `${appId(7)} · Under review`, href: ws(7) },
          { type: "finding", id: "a7f1", title: "Fire NOC validity ended before submission", subtitle: "High", href: ws(7, "findings") },
          { type: "finding", id: "a7f2", title: "Fire NOC date shows an overwritten value", subtitle: "High", href: ws(7, "findings") },
          { type: "finding", id: "a7f3", title: "Faculty also listed by another institution", subtitle: "High", href: ws(7, "findings") },
          { type: "page", id: "ask", title: "Ask why", subtitle: "Every finding explained with its evidence", href: `${ws(7)}?ask=1` },
        ],
        suggestions: pick(lang, { en: "Only high findings|Its documents", hi: "केवल उच्च निष्कर्ष|इसके दस्तावेज़", hinglish: "Sirf high wale|Iske documents" }).split("|"),
      },
    );

  if (/application|aavedan|आवेदन/.test(m) && !institution)
    return reply(
      "clarify",
      lang,
      pick(lang, { en: "Which applications do you mean?", hi: "कौन से आवेदन देखने हैं?", hinglish: "Kaun si applications dekhni hain?" }),
      {
        suggestions: pick(lang, {
          en: "Under review|Rectification requested|Submitted this month",
          hi: "समीक्षा में|सुधार माँगा गया|इस महीने जमा",
          hinglish: "Under review wali|Rectification wali|Is mahine ki",
        }).split("|"),
      },
    );

  return reply(
    "clarify",
    lang,
    pick(lang, {
      en: "I could not tell what you are looking for. Try one of these, or name an application, an institution or a period.",
      hi: "प्रश्न स्पष्ट नहीं हुआ। इनमें से कोई चुनें, या किसी आवेदन, संस्थान या अवधि का नाम लिखें।",
      hinglish: "Sawal clear nahi hua. Inmein se koi chuniye, ya kisi application, institution ya period ka naam likhiye.",
    }),
    { source: "model", suggestions: starterChips(role).slice(0, 3) },
  );
}

export async function mockAsk(body: DrishtiAskBody, role: Role | undefined): Promise<DrishtiAskResponse> {
  await new Promise((r) => setTimeout(r, 450 + Math.random() * 500));
  const conversation_id = body.conversation_id ?? `c_mock${nextConversation++}`;
  const lang = detect(body.message);
  const r = answer(body.message, lang, role, body, memory.get(conversation_id));
  if (r.kind === "answer") memory.set(conversation_id, { intent: String(r.intent?.intent ?? "list"), items: r.items ?? [] });
  return { conversation_id, reply: r };
}

export async function mockSuggestions(role: Role | undefined): Promise<DrishtiSuggestionsPayload> {
  await new Promise((r) => setTimeout(r, 200));
  return { suggestions: starterChips(role) };
}
