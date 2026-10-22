"""Load the synthetic world from fixtures/out into a fresh database and validate every application
through the real pipeline (nothing in the results is pre-computed).

    python scripts/make_fixtures.py   # once, or after changing the generator
    python scripts/seed.py            # wipes var/ and reloads
"""

import hashlib
import json
import logging
import shutil
import sys
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[2]
logging.basicConfig(level=logging.WARNING)
for _n in ("pyhanko", "pyhanko_certvalidator", "pdfminer", "RapidOCR"):
    logging.getLogger(_n).setLevel(logging.CRITICAL)
FIX = ROOT / "fixtures" / "out"


def main(validate: bool = True) -> None:
    from pramana.config import get_settings

    s = get_settings()
    if not (FIX / "manifest.json").exists():
        sys.exit("fixtures/out/manifest.json missing: run scripts/make_fixtures.py first")
    for sub in ("documents", "cache", "rulesets", "sim"):
        shutil.rmtree(s.data_dir / sub, ignore_errors=True)
    for f in s.data_dir.glob("pramana.db*"):
        f.unlink()
    for d in (s.storage_dir, s.cache_dir):
        d.mkdir(parents=True, exist_ok=True)

    from pramana import audit
    from pramana.auth import hash_password
    from pramana.crypto import store_document
    from pramana.db import SessionLocal, init_db
    from pramana.models import Application, Document, Institution, ReferenceRecord, User
    from pramana.pipeline.intake import validate_upload
    from pramana.pipeline.validate import run_validation
    from pramana.sim import issuers as sim
    from pramana.verification import signature, signed_qr

    m = json.loads((FIX / "manifest.json").read_text(encoding="utf-8"))
    (s.data_dir / "sim").mkdir(parents=True, exist_ok=True)
    sim.save(m["issuer_registry"])
    (s.data_dir / "sim" / "issuer_keys.json").write_text(json.dumps(m["issuer_keys"], indent=2))
    demo = s.trust_dir / "demo"
    demo.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(FIX / "trust" / "pramana-demo-root.pem", demo / "pramana-demo-root.pem")
    signed_qr.issuer_keys.cache_clear()
    signature.trust_anchors.cache_clear()

    init_db()
    db = SessionLocal()
    inst_ids = {}
    for i in m["institutions"]:
        iid = f"inst_{i['key'].lower()}"
        inst_ids[i["key"]] = iid
        db.add(Institution(
            id=iid, aicte_id=i["aicte_id"], name=i["name"], society_name=i["society"],
            address=f"Main campus, {i['city']} {i['pin']}", state=i["state"], district=i["city"], pincode=i["pin"],
            latitude=i["lat"], longitude=i["lon"], established_year=i["est"],
            attributes={"authorised_signatory": i["authorised_signatory"], "city": i["city"]}))
    db.flush()
    for r in m["reference_records"]:
        db.add(ReferenceRecord(source=r["source"], record_type=r["record_type"], key=r["key"],
                               institution_id=inst_ids.get(r.get("inst")), data=r["data"], provenance="synthetic"))
    users = {}
    for a in m["demo_accounts"]:
        u = User(username=a["username"], display_name=a["display_name"], role=a["role"],
                 institution_id=inst_ids.get(a.get("institution")), password_hash=hash_password(s.demo_password))
        db.add(u)
        users[a["username"]] = u
    db.flush()
    audit.record(db, actor="system", actor_role="system", action="system.seeded", object_type="dataset",
                 details={"generated": m["generated"], "seed": m["seed"], "notice": m["notice"]})
    db.commit()

    inst_user = {a["institution"]: users[a["username"]] for a in m["demo_accounts"] if a.get("institution")}
    timings = []
    for spec in m["applications"]:
        sub_dt = datetime.fromisoformat(spec["submitted"]).replace(hour=11, tzinfo=UTC)
        u = inst_user[spec["institution"]]
        app = Application(id=spec["id"], institution_id=inst_ids[spec["institution"]], category=spec["category"],
                          academic_year=spec["academic_year"], declared=spec["declared"], status="submitted",
                          created_at=sub_dt, submitted_at=sub_dt)
        db.add(app)
        db.flush()
        audit.record(db, actor=u.username, actor_role="institution", action="application.created",
                     object_type="application", object_id=app.id, application_id=app.id)
        for f in spec["documents"]:
            data = (FIX / f["file"]).read_bytes()
            name = Path(f["file"]).name
            res = validate_upload(name, data)
            doc = Document(application_id=app.id, round=1, declared_type=f["declared_type"], original_filename=name,
                           sha256=hashlib.sha256(data).hexdigest(), size_bytes=len(data), mime=res.mime,
                           page_count=res.page_count, storage_name=f"{uuid.uuid4().hex}.bin", uploaded_by=u.id,
                           analysis={"active_content": res.active_content})
            store_document(doc.storage_name, data)
            db.add(doc)
            db.flush()
            audit.record(db, actor=u.username, actor_role="institution", action="document.uploaded",
                         object_type="document", object_id=doc.id, application_id=app.id,
                         details={"declared_type": doc.declared_type, "sha256": doc.sha256})
        audit.record(db, actor=u.username, actor_role="institution", action="application.submitted",
                     object_type="application", object_id=app.id, application_id=app.id, details={"round": 1})
        db.commit()

    if validate:
        from sqlalchemy import select

        from pramana.pipeline.process import process_document
        from pramana.rules.engine import active_ruleset

        rs = active_ruleset()
        t0 = time.perf_counter()
        # Process every document first so cross-application checks see all peers
        for d in db.scalars(select(Document)):
            inst = d.application.institution
            process_document(db, d, rs, (inst.latitude, inst.longitude))
        db.commit()
        print(f"processed all documents in {time.perf_counter() - t0:.1f}s")
        for spec in m["applications"]:
            app = db.get(Application, spec["id"])
            down = spec.get("issuers_down", [])
            for code in down:
                sim.set_availability(code, False)
            t0 = time.perf_counter()
            run = run_validation(db, app, "system", "system")
            timings.append(time.perf_counter() - t0)
            for code in down:
                sim.set_availability(code, True)
            print(f"{spec['key']:4} {app.id} {run.status:9} findings={run.summary.get('findings')} "
                  f"{time.perf_counter() - t0:5.1f}s  {spec['story'][:70]}")
        audit.checkpoint(db)
        db.commit()
        print(f"validated {len(timings)} applications, mean {sum(timings) / len(timings):.1f}s")
    db.close()


if __name__ == "__main__":
    main(validate="--no-validate" not in sys.argv)
