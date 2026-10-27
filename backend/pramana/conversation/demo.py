"""Demo state for the conversation: A3's correction round with an exchange on its item and one open question.

Runs through the same functions as the endpoints (letter draft and finalise, messages), so the audit chain and the
notifications are exactly what a live round produces. Run after validation: it adds no finding and no run.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Application, User
from . import threads as th

A3 = "APP-2026-000103"
REASON = "Fire Safety Certificate expired before submission; a certificate valid on resubmission is needed."
EXCHANGE = (
    (1, "institution", "reply",
     "The Ratnagiri fire office renewed our Fire Safety Certificate on 14 October 2026. We will upload the renewed "
     "certificate in the Fire Safety Certificate slot this week."),
    (1, "cell", "cell_reply",
     "Thank you. Upload the renewed certificate in the Fire Safety Certificate slot, then resubmit. It must be valid "
     "on the date you resubmit."),
    (0, "institution", "question",
     "Does the renewed certificate need to be attested by our Principal, or is the copy issued by the fire office "
     "enough?"),
)


def seed_round(db: Session, app_id: str = A3) -> None:
    from ..api.applications import latest_run
    from ..models import Finding
    from ..officer.routes import DraftBody, FinaliseBody, draft_letter, finalise_letter

    app = db.get(Application, app_id)
    officer = db.scalars(select(User).where(User.username == "officer")).first()
    inst = db.scalars(select(User).where(User.role == "institution", User.institution_id == app.institution_id)).first()
    run = latest_run(db, app.id)
    ids = [f.id for f in db.scalars(select(Finding).where(Finding.run_id == run.id, Finding.review_status == "open"))]
    letter = draft_letter(app.id, DraftBody(finding_ids=ids), user=officer, db=db)
    finalise_letter(letter["id"], FinaliseBody(reason=REASON), user=officer, db=db)
    rect = th.rounds(db, app)[-1]
    th.ensure_threads(db, rect)
    threads = {t.item_no: t for t in th.threads_of(db, rect.id)}
    for item_no, side, kind, body in EXCHANGE:
        th.post_message(db, inst if side == "institution" else officer, app, threads[item_no], kind, body)
    db.commit()
