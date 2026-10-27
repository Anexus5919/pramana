# Rectification conversation and notifications

Before this feature, contact in a correction round went one way. The officer sent a deficiency letter, and the institution could only re-upload and resubmit. It could not explain, ask or disagree, and it was not told when anything happened.

Now each item of the letter has its own thread, and each round has one general thread. Both sides write in these threads, and both sides get in-app notifications. Pramana still decides nothing: officials record the outcome, and an open review request has to be answered before they can.

Code: `backend/pramana/conversation/` (models, threads, notify, api, demo, settings) and `frontend/src/conversation/`, with the portal panel in `frontend/src/pages/portal/RectificationLetter.tsx`, the officer tab in `frontend/src/pages/application/sections/RectificationSection.tsx` and the bell in `frontend/src/shell/NotificationBell.tsx`. Tests: `backend/tests/test_rectification_conversation.py`.

## 1. Who sees what

| | Institution (its own applications only) | Officer, admin | Verifier |
|---|---|---|---|
| Read threads | Yes | Yes | Yes |
| Write | Reply, Ask a question, Request review | Reply as the cell; mark an item resolved or still open, with a note | No (403) |
| Name on the cell's messages | "AICTE Scrutiny Cell" only | "AICTE Scrutiny Cell" and the colleague who wrote | Same as officers |
| Name on the institution's messages | Its own user | The institution user's name | Same as officers |
| Finding ids in thread payloads | Never | Yes, to open the findings | Yes |
| Notifications | Letter sent, cell reply, status change, outcome, response date close | Institution message, review request | None |

Another institution's application, thread, attachment or outcome answers 404, the same as an id that does not exist. Every message stores its author's user id for the audit trail. The institution's payload carries no author id for cell messages, no finding ids, no rule or detector codes, and no severity or evidence class. A test checks this.

## 2. Threads and item status

- **Threads.** A round's items are the final letter's items, in the letter's order. A round without a letter uses the request's items, worded the way the institution reads them. Thread `item_no` 1 to n follows the same numbering as the portal. `item_no` 0 is the general thread. Threads are created the first time a round is read.
- **Status.** Only items have a status; the general thread has none.

| Status | Set by | When |
|---|---|---|
| `open` | (start) | No answer yet |
| `responded` | Institution | A reply on an `open` or `still_open` item |
| `review_requested` | Institution | Request review, with a reason of at least 10 characters. Not allowed on a `resolved` item or on the general thread |
| `resolved` | Officer or admin | With a note the institution reads |
| `still_open` | Officer or admin | With a note the institution reads |

- **What changes the status.** A question changes no status. A cell reply changes no status either, but it does answer a review request.
- **Who can write, and when.**
  - The institution writes only in the latest round. It stops when the application is closed or withdrawn, or when an outcome is recorded after the round opened.
  - The cell can always answer, while the application is open. This way, a review request from an earlier round can always get its reply.
- **Message text.**
  - A message has 1 to 2,000 characters.
  - Cell text and status notes are refused (400) if they use the banned vocabulary about documents (`FORBIDDEN_WORDS`), as deficiency letters are.
  - The officer's reply box has a quiet hint: "The institution sees this. Say what to submit; do not describe how an indicator was found."
  - The box also shows a soft warning, which does not block sending, when the text mentions revision, edited after signing, overlay, annotation, forensic or metadata.
  - The Record outcome dialog has the same hint and warning, because the institution now reads the outcome reason.
- **Attachments.** One optional PDF, JPG or PNG per message, up to `PRAMANA_MAX_UPLOAD_MB` (15 MB).
  - The type is taken from the magic bytes (`%PDF-`, the PNG signature, `FF D8 FF`) and must match the file extension. Anything else gets 422.
  - The file is stored with the same per-document envelope encryption as submitted documents.
  - It is never parsed or analysed and is not part of the checklist; the item's required document still goes through its upload slot.
  - Downloads are audited, sent with `Content-Disposition: attachment` and `nosniff`, and limited to the application's own users and officials.
- **Rate limit.** Messages and status changes share one budget per user: 12 a minute (`PRAMANA_THREAD_POSTS_PER_MINUTE`). Over the limit, the answer is 429 with `Retry-After`.

## 3. Natural justice: the outcome waits for review replies

While any review request, in any round of the application, has no cell reply after it, `POST /api/applications/{id}/scrutiny-outcome` answers 409:

> Reply to the institution's review request first. Item 1 of correction round 1 is waiting for a reply from the AICTE Scrutiny Cell. Requesting another rectification stays possible.

A cell reply in that thread answers the request, and so does a resolved or still-open decision with its note. Requesting another rectification stays allowed.

The workspace shows the rule before the officer runs into it:
- the Decide menu's Record scrutiny outcome item reads "Reply to the institution's review request first";
- the dialog shows that message, a link to the request and a disabled Record outcome button;
- the Rectification tab opens with the same message.

## 4. The outcome, as the institution reads it

`GET /api/applications/{id}/outcome` returns:
- the recorded outcome's label;
- the official's written reasons, as stored on `ScrutinyOutcome.reason`;
- the date and round;
- a short, neutral "What you can do next" for each outcome (`WHAT_NEXT` in `threads.py`).

Institutions do not get the official's name; officials also get `recorded_by`. The portal shows this in a Scrutiny outcome panel under Next step, and Next step points to it.

The seeded A6 reason was reworded so it names no other institution, because the institution now reads it.

## 5. Notifications

**Events.** Each event names a template key; its title and body are rendered from the key's template.

| Event | Template key | To | Link |
|---|---|---|---|
| Letter finalised (or a request without a letter) | `rect.letter_finalised` (`rect.requested`) | The institution's users | Portal, the letter |
| Institution reply or question | `rect.institution_reply`, `rect.institution_question` | Officers and admins | Workspace, Rectification tab, the thread |
| Review request | `rect.review_requested` | Officers and admins | The thread |
| Cell reply | `rect.cell_reply` | The institution's users | Portal, the thread |
| Status change by the cell | `rect.status_changed` | The institution's users | The thread |
| Outcome recorded | `outcome.recorded` | The institution's users | Portal, the outcome |
| Response date 3 days away or nearer, or passed | `rect.deadline_soon` | The institution's users | Portal, the letter |

- **How events reach people.** `notify.notify(db, key, app, params, ...)` renders the key's template for its audience and works out the recipients. It then hands the result to every enabled channel.
- **In-app channel.** `InAppChannel` writes one `notifications` row per recipient, with the template key and parameters.
- **Reminders.** Response-date reminders are created when the portal (the bell) or the review queue loads. Each one carries a dedupe key per round, date and user, so it is created once.
- **The bell.** The bell sits in the top bar for officers, admins and institutions, but not for verifiers. It shows the unread count and the latest 20 items. Each item is a link that marks it read, there is a per-item Mark as read, and there is a Mark all as read. On phones, the list opens under the bar and stops short of the bottom of the screen, clear of Drishti's button.

### Adding email (Azure Communication Services)

`EmailChannel` in `notify.py` is the documented stub. It is unavailable, and naming it in `PRAMANA_NOTIFY_CHANNELS` only logs that it was skipped. Adding it does not touch any event code:

1. Add `azure-communication-email`. Read the connection string from the secret store at run time, and use a sender address on a domain verified in ACS.
2. Give users an email address, through a `User.email` column or a directory lookup, and an opt-out.
3. Write a subject and an HTML body for each key in `TEMPLATES`, as `templates/email/<key>.html`. Fill them from the same `params` the in-app rows store. Institution emails keep the portal's rule: the sender is the AICTE Scrutiny Cell, never an official, with no finding, rule or detector detail.
4. Implement `deliver()` with `EmailClient.begin_send`, one message per recipient. Audit `notification.email_sent` with the key and the recipient id, never the address or the body.
5. Set `available = True`, then set `PRAMANA_NOTIFY_CHANNELS=in_app,email`.

## 6. API

| Method and path | Who | Returns |
|---|---|---|
| `GET /api/applications/{id}/rectification/threads[?rectification_id=]` | Any role with access | The round (latest by default), as below |
| `POST /api/rectification-threads/{thread_id}/messages` | Institution, officer, admin | Multipart `body`, `kind` (`reply`, `question`, `review_request` for institutions; officials post `cell_reply`), optional `file`. Returns the round with `message_id` |
| `POST /api/rectification-threads/{thread_id}/status` | Officer, admin | JSON `{status: "resolved" \| "still_open", note}`. Returns the round |
| `GET /api/rectification-messages/{message_id}/attachment` | Any role with access | The file (audited) |
| `GET /api/applications/{id}/outcome` | Any role with access | `{application_id, outcome: {outcome, label, reasons, recorded_at, round, round_label, what_next, recorded_by?} \| null}` |
| `GET /api/rectification/awaiting` | Officials | `{awaiting, pending_reviews, items: [{application_id, institution, thread_id, rectification_id, round_label, item_no, title, kind, pending_review, last_at}]}`; review requests first |
| `GET /api/notifications?limit=20` | Any signed-in user | `{unread, items: [{id, event, title, body, link, application_id, thread_id, created_at, read}]}` |
| `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all` | The recipient | The notification; `{marked}` |

The round payload:

```json
{
  "application_id": "APP-2026-000103",
  "rounds": [{"rectification_id": "rect_...", "round": 1, "label": "Correction round 1", "status": "open", "created_at": "..."}],
  "round": {"rectification_id": "rect_...", "round": 1, "label": "Correction round 1", "status": "open", "latest": true,
            "issued_at": "...", "responded_at": null, "letter_id": "ltr_...", "respond_by": "2026-11-11",
            "days_left": 15, "past_due": false},
  "can_post": true, "can_set_status": false, "closed_reason": null,
  "counts": {"awaiting_reply": 1, "pending_reviews": 0, "pending_reviews_all_rounds": null},
  "threads": [{
    "id": "thr_...", "item_no": 1, "general": false, "title": "Fire Safety Certificate valid on the date of submission",
    "status": "responded", "status_note": null, "status_at": null, "respond_by": "2026-11-11", "days_left": 15,
    "past_due": false, "awaiting_reply": false, "pending_review": false, "last_activity_at": "...",
    "entries": [
      {"type": "message", "id": "msg_...", "side": "institution", "kind": "reply", "author": "Anil M. Sawant (...)",
       "body": "...", "created_at": "...", "attachment": null},
      {"type": "message", "id": "msg_...", "side": "cell", "kind": "cell_reply", "author": "AICTE Scrutiny Cell",
       "body": "...", "created_at": "...", "attachment": null},
      {"type": "status", "id": "rsc_...", "side": "cell", "from": "review_requested", "to": "resolved",
       "note": "...", "author": "AICTE Scrutiny Cell", "created_at": "..."}
    ]
  }]
}
```

Officials also get `author_name` on cell entries, `finding_ids` on each thread and `pending_reviews_all_rounds`.

## 7. Audit trail

| Action | Details (no message text) |
|---|---|
| `rectification.message_posted` | `rectification_id`, `thread_id`, `item_no`, `kind`, `side`, `body_sha256`, `chars`, attachment `sha256`, `size`, `mime` |
| `rectification.item_status_changed` | `rectification_id`, `item_no`, `from`, `to`, `by` (`cell` or `message`), `message_id`, `note_sha256` |
| `rectification.attachment_downloaded` | `sha256` |

The text lives in `rect_messages.body` and `rect_status_changes.note`. The digests tie it to the chain: an edited message no longer matches its event.

## 8. How to see it

The command-line seed adds A3's round after every validation run, so expected findings are unchanged (`scripts/evaluate.py`: 54 of 54, 0 false positives). It goes through the same functions as the endpoints:
- a final letter over A3's three fire-certificate findings, which gives one item;
- inst3's reply on item 1;
- the cell's reply on item 1;
- inst3's open question in the general thread.

`seed.py --no-threads` leaves the round out. Tests load the world without it, because several of them start their own round on A3.

1. Sign in as `officer`. The review queue shows Awaiting your reply with Konkan's question, and the bell shows the institution's messages. Open the row to land on the thread in the Rectification tab.
2. Sign in as `inst3` and open the application. Under the deficiency letter, item 1 shows Responded, its response date and days left, the exchange, and Write to the AICTE Scrutiny Cell (Reply, Ask a question, Request review, attach a file). The general thread shows the open question.
3. As `inst3`, request a review of item 1, upload `fixtures/out/rectification/A3_fire_noc_renewed.pdf` and resubmit. As `officer`, Decide, then Record scrutiny outcome: the dialog says to reply to the review request first. Reply or resolve the item with a note, then record the outcome.
4. As `inst3`, the Scrutiny outcome panel shows the reasons and what to do next, and the bell has the outcome.

## 9. Limitations

- Notifications are in-app only. Email is designed (section 5) but not built, and users have no email addresses yet.
- There is no live push: the bell refreshes every minute and when it is opened.
- Response-date reminders are created when someone loads the portal or the queue. A round nobody opens gets its reminder late.
- The detection-word warning is a word list. It catches the listed words, not a paraphrase.
- Attachments are checked by type and size only. They are not scanned for malware, and they are not analysed by design.
