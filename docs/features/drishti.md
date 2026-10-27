# Drishti (दृष्टि): the assistant

Drishti is the round button on every signed-in page. It answers questions about the whole system in English, Hindi and Hinglish, takes the official to the right screen, explains Pramana's terms and remembers the conversation. It stays on Pramana's job: anything else gets one short scope line and three suggestions.

It never decides. Requests to approve, reject, request rectification or record an outcome get a polite reply that officials decide in Pramana, with a link to that application's Decide action.

The contract shared by the engine, the chat window and our question model is `docs/features/drishti-spec.md`. This page describes the engine.

Code: `backend/pramana/drishti/`. Tests: `backend/tests/test_drishti.py`. Evaluation: `backend/scripts/eval_drishti.py`.

## 1. What it answers

| Intent | Example | Answer |
|---|---|---|
| `count_applications`, `list_applications` | "how many intake requests came today", "Telangana ke colleges dikhao" | Applications by category, status, round, place, institution and submission date |
| `list_decisions` | "decisions by me yesterday", "कल मेरे फ़ैसले दिखाओ" | Rectification requests and recorded scrutiny outcomes from the audit log |
| `list_findings` | "A7 ki kamiyan dikhao", "fire safety findings" | Open findings by severity, topic and application |
| `expiring_certificates` | "which certificates expire this session" | Certificates that lapse before or during the session, from the coverage calendar |
| `awaiting_confirmation` | "what is awaiting manual confirmation?" | Verification attempts waiting for the verification cell |
| `application_summary` | "Panchganga ka summary dikhao", "why is A7 flagged" | Status, round, open findings by severity and the top three, with links to the workspace and Ask why |
| `navigate` | "open the integrity page", "pehla wala kholo" | A link; the window goes there only on a click |
| `explain_term` | "रिक्टिफिकेशन क्या है" | A curated glossary entry in English or Hindi (27 terms) |
| `how_to` | "how do I request rectification" | Curated steps with a link (12 topics), or who does it when the role cannot |
| `greeting` | "hello", "thanks", "what is Drishti" | A short hello and role-specific suggestions |
| `clarify` | "show me something" | One short question and suggestion chips |
| `out_of_scope` | "what is biryani" | The scope line and three chips |

Every number in a reply is counted by a fixed SQLAlchemy query, and the records behind it come back as items (at most eight, with a `more_href` when a page can show the rest). Empty results are useful: "No increase-in-intake applications were submitted today. The latest was on 31 Dec 2025: Tapi Valley Institute of Technology."

## 2. The pipeline

1. **Limits.** At most 300 characters (422 above); an empty or whitespace message is 422; 30 messages a minute per user (429 with Retry-After), through the same in-memory limiter as sign-in and Ask why.
2. **Language.** Devanagari is `hi`; Roman script with a Hindi function word (hai, kitne, aaj, kal, mere, dikhao, wale, kya, ka, ki, ke and about 150 more) is `hinglish`; anything else is `en`. "In Hindi" or "hinglish mein" picks the language explicitly. Words that are also common English (is, me, hi, to, do, main, par) do not count.
3. **Guardrail** (`guard.py`), no model. In order:
   - instruction-injection phrases ("ignore previous instructions", "you are now", "system prompt", "pichle instructions bhool jao", "निर्देश भूल जाओ") are out of scope, whatever else the message says;
   - abuse, and requests for code (Python, SQL, "write a program") are out of scope;
   - everyday topics (food, cricket, weather, films, jokes, politics, personal advice, money) are out of scope unless a domain word is also present;
   - a general-knowledge shape ("what is X", "X kya hai", "X क्या है", "who won", "kaise banate hain") with no domain word, application ID or institution is out of scope;
   - a domain word, an institution, district, state, application ID (or A1 to A11), a glossary or help key, or a weaker signal (periods, counting, "dikhao", "mere", follow-up words in a conversation) puts it in scope; nothing at all is out of scope.

   The lexicon covers English, Hinglish and Hindi. Institution names, districts, states, application IDs and usernames come from the database and are cached for two minutes (refreshed at once when an unknown application ID appears). The seeded names also match in Devanagari (पंचगंगा, कोल्हापुर, महाराष्ट्र).
4. **Rules** (`rules.py`): a deterministic parser for common phrasings in all three languages. In order: greetings; requests to act; navigation and "open the first one"; "its summary" and "uske findings"; how-to and glossary questions; an institution asking about its own application; "why is it flagged"; expiring certificates, items awaiting confirmation, decisions and findings; summaries; counts and lists; refinements of the previous question; a bare application ID or institution name. Periods ("aaj", "kal", "pichle hafte", "इस महीने", typed dates such as "between 1 Dec 2025 and 15 Dec 2025"), categories, statuses, rounds, severities, topics, "me" and "mere", places and institutions become filters. If the rules produce a complete intent it runs.
5. **Model** (`model.py`), only when the guardrail said in scope and the rules could not finish. It calls Ollama's `/api/chat` with the prompt and JSON schema from `model_prompt.py` (the schema goes in `format`), the previous intent as context, temperature 0 and an 8 s timeout. The reply is validated with the Pydantic intent; anything missing, slow or invalid becomes `clarify`. After a failure the model is not asked again for 60 s, so a model that is not pulled yet costs one fast 404, not a delay on every message.
6. **Execute** (`execute.py`): fixed queries per intent, filtered by role (section 3).
7. **Reply** (`replies.py`): templates in the detected language. No model writes text the user reads.
8. **Audit.** One `drishti.query` event per message with the validated intent, the result count, the reply kind, the source (`guardrail`, `rules` or `model`), the language and the conversation ID. The message text is never stored, in the audit log or in memory.

## 3. Roles

Filters are applied on the server for every query.

- **Officer, admin:** every intent. Only officers get the Decide and Ask why links (only they have those actions in the workspace).
- **Verifier:** items awaiting confirmation, findings (verification findings only), one application's summary, glossary, how-to, navigation (not the audit log or platform pages) and greetings. Counts, lists, decisions and certificate expiry get "That is for scrutiny officers and administrators" and suggestions they can use.
- **Institution:** only its own applications. "What is missing in my application" gives the institution-safe view: status, the next step and, for a draft or a rectification round, the items to fix from the readiness check (`insights/readiness.check`, which computes no forensic, cross-application or verification output); otherwise what AICTE asked for in an open rectification request. Lists or counts across institutions, decisions, findings detail, other institutions' applications and official pages get "I can only show your own application", with a link to their own.
- **Requests to act** ("approve A7", "reject", "request rectification for A3", "A7 approve kar do", "स्वीकृत करो") are answered for every role with "Officials decide in Pramana, so Drishti cannot approve APP-2026-000107 (Panchganga Institute of Technology)". Officers get a link to `/applications/APP-2026-000107?action=decide`. Nothing is written.

## 4. Conversation memory

- The server keeps the last 10 turns per `conversation_id`, in memory, scoped to the user who started it, and drops a conversation after 30 idle minutes. Another user's ID, or an expired one, starts a new conversation.
- A turn stores the validated intent and the items of its answer, not the message.
- Follow-ups refine the latest question about records, even after a glossary question in between: "and yesterday?", "aur kal?", "और कल?" change the period; "only intake", "sirf intake wale" add the category; "from Maharashtra" adds the place; "only rectification requests" narrows decisions; "sirf high wale" narrows findings; "list them" and "how many?" switch between a count and a list; "and A5?" switches the application.
- "Open the first one", "pehla wala kholo", "open the second one" navigate to that item of the latest answer that listed records. "Its summary" and "uska summary" summarise the single application of the last answer, or the one the conversation was about.
- Like the rate limiter, memory is per process and resets on restart.

## 5. Settings

| Setting | Default | Meaning |
|---|---|---|
| `PRAMANA_DRISHTI_PROVIDERS` | `ollama` | Empty disables the model; Drishti then asks a clarifying question when the rules cannot parse a message |
| `PRAMANA_DRISHTI_MODEL` | `pramana-drishti` | The Ollama model name |
| `PRAMANA_DRISHTI_TIMEOUT_S` | `8` | Seconds before a model call gives up |
| `PRAMANA_OLLAMA_URL` | `http://127.0.0.1:11434` | Shared with the extractor |

Periods are computed in Asia/Kolkata from the server clock: "today" ten minutes after midnight IST is the new day even though UTC is still on the previous one. The clock is injectable (`periods.set_clock`) for tests.

## 6. API

`POST /api/drishti/ask` (signed in, CSRF header as for every unsafe request) and `GET /api/drishti/suggestions?lang=en|hi|hinglish`. Shapes follow spec section 5. Additions and choices the window and the model can rely on:

- `reply.intent` is the validated intent in compact form: nulls, empty objects and a false `follow_up` are left out, and `filters.application` holds the resolved ID (`APP-2026-000107`, never `A7`).
- `reply.count` is a number for answers and `null` for help, navigation, greetings, clarifications and refusals.
- Item types: `application`, `decision`, `finding`, `certificate`, `verification` (an attempt awaiting confirmation), `readiness` (an institution's item to fix), `page` and `term`. Every item has `type`, `id`, `title`, `subtitle` and `href`.
- Hrefs use the app's real routes: `/dashboard`, `/applications/{id}[/findings|/documents|/comparisons|/activity]` with the workspace's own query parameters (`finding=`, `doc=`, `view=verification&attempt=`, `view=audit`), `/integrity`, `/integrity/faculty`, `/issuers`, `/rules`, `/audit`, `/platform`, `/analyse`, `/portal`, `/portal/new` and `/portal/applications/{id}` for institutions.
- The Ask why link is `/applications/{id}?ask=1`, which opens the Ask why drawer for officers. The Decide link is `/applications/{id}?action=decide`; until the workspace reads `action` it opens the application, where Decide is the header's primary action.
- A `navigate` reply puts its target first in `items`, with an `href`; the window's Go button uses it.
- `reply.source` is always present: `guardrail` for scope refusals, `rules` or `model` otherwise.
- `context.application_id` (or an application path in `context.path`) from the officer workspace or `/portal/applications/{id}` lets "why is this flagged" or "its findings" refer to the open application. An institution's context is still checked against its own applications.
- Errors: 401 when signed out, 403 without the CSRF header, 422 for an empty or over-long message, 429 with `Retry-After` past 30 messages a minute.
- `GET /api/drishti/suggestions` returns `{"greeting", "suggestions", "language"}`: the first-open greeting and four starter chips for the role, in `?lang=` (default `en`).

## 7. Measured results

`backend/scripts/eval_drishti.py` runs a labelled set through the engine with no model configured, on the seed world with the clock at 27 Oct 2026, 12:00 IST.

| Set | Messages | Intent correct | Rules | Guardrail | Model |
|---|---|---|---|---|---|
| Spec acceptance table (19 messages for 18 rows: "pehla wala kholo" needs a list first) | 19 | 19 | 15 | 4 | 0 |
| More in-scope phrasings in all three languages, three roles, follow-ups | 44 | 44 | 44 | 0 | 0 |
| Out of scope: general knowledge, food, sport, weather, films, jokes, politics, coding, injection, abuse | 24 | 24 | 0 | 24 | 0 |

- **Rules coverage of the acceptance set: 19 of 19**, with no model call. The four acceptance messages that are out of scope (biryani twice, cricket, the injection) are decided by the guardrail.
- **Guardrail: 28 of 28 out-of-scope messages refused before any model,** with no in-scope message refused (precision 28/28, recall 28/28).
- **Latency without a model:** median 1 to 2 ms and 95th percentile under 40 ms per message on the development laptop (two runs); the slowest, under 1 s, are the certificate-expiry questions, which compute every application's coverage calendar.
- `backend/tests/test_drishti.py` (34 tests) covers every acceptance row through the API, asserts that out-of-scope messages never call the model (the client is replaced by one that raises), that every starter chip in every role and language is understood by the rules alone, role restrictions for the verifier and the institution, follow-ups, memory scoping and expiry, the Indian day boundary on a frozen clock, the model client (missing model, backoff, schema in `format`, invalid output), limits, CSRF and the audit event.

The extra set was written together with the rules, so it shows coverage of the phrasings the rules were built for, not accuracy on unseen messages. Unseen phrasing is the model's job; its held-out results belong in `backend/training/drishti/`.

## 8. Files

- `backend/pramana/drishti/`: `intents.py` (the intent schema), `model_prompt.py` (prompt, output schema and parser shared with training), `lang.py`, `guard.py`, `periods.py`, `rules.py`, `model.py`, `execute.py`, `replies.py`, `glossary.py`, `memory.py`, `engine.py` (the pipeline), `api.py` (the router).
- Small additive edits: `backend/pramana/main.py` (router), `backend/pramana/config.py` (three settings).
- `backend/tests/test_drishti.py`, `backend/scripts/eval_drishti.py`.

## 9. Limitations

- The rules know the phrasings in the tables above and their close variants; anything else needs the model, and without it Drishti asks a clarifying question.
- The guardrail is a lexicon. A domain word inside an everyday question ("land prices in Pune") can let it through; the rules then usually cannot parse it and Drishti asks to clarify. A common name that is also an institution's distinctive word (Krishna, Godavari) is read as that institution.
- "This session" for applications means the newest academic year in the database; for certificates it is each application's own session from the ruleset (1 July to 30 June, configuration rather than handbook law).
- Topic filters on findings read the finding's code, title and document type, so "faculty" also matches a faculty-student ratio finding.
- Memory and the rate limit live in one process; several server processes would each keep their own.
