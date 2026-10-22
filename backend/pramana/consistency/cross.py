"""Cross-application relationship checks.

Single-document review cannot see that the same faculty member, file, certificate number or photo is
being used by two institutions. This module links applications through shared entities and reports
each shared entity with the path that connects them.
"""

import re
from dataclasses import dataclass, field
from typing import Any

import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..forensics.fingerprints import minhash_similarity, phash_distance
from ..models import Application, Document, ReferenceRecord

PHASH_MAX_DISTANCE = 18  # of 256 bits; tuned on fixtures, see docs/evaluation-results.md
MINHASH_MIN_SIMILARITY = 0.85


@dataclass
class Link:
    code: str
    title: str
    detail: str
    severity: str
    evidence_class: str
    entity: str
    other_application: str | None
    other_institution: str | None
    evidence: list[dict[str, Any]] = field(default_factory=list)
    limitation: str | None = None


def norm_id(s: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def _faculty_rows(doc: Document) -> list[dict[str, Any]]:
    return [r for r in (doc.analysis or {}).get("rows", []) if r.get("faculty_id")]


def _peer_docs(db: Session, app: Application) -> list[tuple[Document, Application]]:
    q = (
        select(Document, Application)
        .join(Application, Document.application_id == Application.id)
        .where(Application.id != app.id, Application.institution_id != app.institution_id,
               Application.academic_year == app.academic_year, Document.superseded.is_(False),
               Document.processing_status == "processed")
    )
    return list(db.execute(q).all())


def cross_checks(db: Session, app: Application, docs: list[Document], ref_fields: dict[str, str]) -> list[Link]:
    """ref_fields maps document type -> the field holding the issuer reference number."""
    links: list[Link] = []
    peers = _peer_docs(db, app)

    for d in docs:
        fp = d.fingerprints or {}
        for pd, papp in peers:
            pfp = pd.fingerprints or {}
            inst = papp.institution.name
            if fp.get("sha256") and fp.get("sha256") == pfp.get("sha256"):
                links.append(Link(
                    "XA-IDENTICAL-FILE", "Identical file submitted by another institution",
                    f"'{d.original_filename}' is byte-identical to a {pd.declared_type} in application {papp.id} "
                    f"({inst}).", "high", "record", f"sha256:{fp['sha256'][:16]}", papp.id, inst,
                    [{"kind": "document", "document_id": d.id}, {"kind": "peer_document", "document_id": pd.id,
                                                                   "application_id": papp.id}],
                    "Shared templates are not byte-identical; identical files usually mean reuse.",
                ))
                continue
            if d.mime.startswith("image/") and pd.mime.startswith("image/") and fp.get("phash") and pfp.get("phash"):
                dist = phash_distance(fp["phash"], pfp["phash"])
                if dist <= PHASH_MAX_DISTANCE:
                    links.append(Link(
                        "XA-PHOTO-REUSED", "Same photo appears in another institution's application",
                        f"Photo '{d.original_filename}' is visually near-identical (perceptual hash distance {dist}/256) "
                        f"to '{pd.original_filename}' submitted by {inst} ({papp.id}).",
                        "high", "heuristic", f"phash:{fp['phash'][:12]}", papp.id, inst,
                        [{"kind": "document", "document_id": d.id}, {"kind": "peer_document", "document_id": pd.id,
                                                                       "application_id": papp.id}],
                        "Very similar scenes (e.g. identical stock layouts) can collide; compare the images.",
                    ))
            elif (d.declared_type == pd.declared_type and fp.get("minhash") and pfp.get("minhash")
                  and d.mime == "application/pdf" and pd.mime == "application/pdf"):
                sim = minhash_similarity(fp["minhash"], pfp["minhash"])
                if sim >= MINHASH_MIN_SIMILARITY:
                    links.append(Link(
                        "XA-NEAR-DUPLICATE-TEXT", "Near-duplicate document text in another application",
                        f"Text of '{d.original_filename}' is {sim:.0%} similar (MinHash of 4-word shingles) to a "
                        f"{pd.declared_type} from {inst} ({papp.id}).", "medium", "heuristic",
                        f"minhash:{d.id}", papp.id, inst,
                        [{"kind": "document", "document_id": d.id}, {"kind": "peer_document", "document_id": pd.id,
                                                                       "application_id": papp.id}],
                        "Standard issuer templates share wording; meaningful when values also match.",
                    ))

        rf = ref_fields.get(d.declared_type)
        if rf:
            mine = next((f for f in d.fields if f.name == rf and f.value), None)
            if mine:
                for pd, papp in peers:
                    if pd.declared_type != d.declared_type:
                        continue
                    theirs = next((f for f in pd.fields if f.name == rf and f.value), None)
                    if theirs and norm_id(theirs.value) == norm_id(mine.value):
                        links.append(Link(
                            "XA-SHARED-CERTIFICATE-NUMBER", "Certificate number also used by another institution",
                            f"{d.declared_type} number '{mine.value}' also appears in application {papp.id} "
                            f"({papp.institution.name}). An issuer reference number identifies one certificate "
                            "for one premises.", "high", "record", f"ref:{norm_id(mine.value)}", papp.id,
                            papp.institution.name,
                            [{"kind": "region", "document_id": d.id, "page": mine.page, "bbox": mine.bbox,
                              "label": rf},
                             {"kind": "peer_document", "document_id": pd.id, "application_id": papp.id,
                              "page": theirs.page, "bbox": theirs.bbox}],
                        ))

    # Faculty listed by this application and by another institution, or registered elsewhere
    my_rows = [(d, r) for d in docs if d.declared_type == "faculty_list" for r in _faculty_rows(d)]
    if my_rows:
        peer_fac: dict[str, list[tuple[Document, Application, dict]]] = {}
        for pd, papp in peers:
            if pd.declared_type == "faculty_list":
                for r in _faculty_rows(pd):
                    peer_fac.setdefault(norm_id(r["faculty_id"]), []).append((pd, papp, r))
        registry = {norm_id(r.key): r for r in db.scalars(
            select(ReferenceRecord).where(ReferenceRecord.record_type == "faculty")).all()}
        for d, r in my_rows:
            fid = norm_id(r["faculty_id"])
            for pd, papp, pr in peer_fac.get(fid, []):
                links.append(Link(
                    "XA-FACULTY-MULTIPLE-INSTITUTIONS", "Faculty member listed by two institutions",
                    f"{r.get('name')} ({r['faculty_id']}) appears in this faculty list and in the faculty list of "
                    f"{papp.institution.name} ({papp.id}) for the same academic year.", "high", "record",
                    f"faculty:{fid}", papp.id, papp.institution.name,
                    [{"kind": "region", "document_id": d.id, "page": r["_page"], "bbox": r["_bbox"],
                      "label": "faculty row"},
                     {"kind": "peer_document", "document_id": pd.id, "application_id": papp.id,
                      "page": pr["_page"], "bbox": pr["_bbox"]}],
                    "Visiting or adjunct arrangements exist; confirm appointment letters and salary records.",
                ))
            reg = registry.get(fid)
            if reg is None:
                links.append(Link(
                    "XA-FACULTY-NOT-IN-REGISTRY", "Faculty ID not found in the faculty registry",
                    f"{r.get('name')} ({r['faculty_id']}) is not in the AICTE faculty registry extract.",
                    "medium", "record", f"faculty:{fid}", None, None,
                    [{"kind": "region", "document_id": d.id, "page": r["_page"], "bbox": r["_bbox"],
                      "label": "faculty row"}],
                    "The registry extract may lag recent appointments.",
                ))
            elif reg.institution_id and reg.institution_id != app.institution_id:
                links.append(Link(
                    "XA-FACULTY-REGISTERED-ELSEWHERE", "Faculty registered with a different institution",
                    f"{r.get('name')} ({r['faculty_id']}) is registered with institution "
                    f"{reg.data.get('institution_name', reg.institution_id)} in the faculty registry.",
                    "high", "record", f"faculty:{fid}", None, reg.data.get("institution_name"),
                    [{"kind": "region", "document_id": d.id, "page": r["_page"], "bbox": r["_bbox"],
                      "label": "faculty row"},
                     {"kind": "reference_record", "record_id": reg.id, "source": reg.source}],
                ))
    return links


def relationship_graph(db: Session, app: Application, links: list[Link]) -> dict[str, Any]:
    """Ego graph around the application: shared entities and the other applications they connect to."""
    g = nx.Graph()
    me = f"app:{app.id}"
    g.add_node(me, kind="application", label=app.institution.name, focus=True)
    for ln in links:
        ent = ln.entity
        g.add_node(ent, kind=ent.split(":")[0], label=ent.split(":", 1)[1][:24])
        g.add_edge(me, ent, code=ln.code)
        if ln.other_application:
            other = f"app:{ln.other_application}"
            g.add_node(other, kind="application", label=ln.other_institution or ln.other_application)
            g.add_edge(other, ent, code=ln.code)
    return {
        "nodes": [{"id": n, **d} for n, d in g.nodes(data=True)],
        "edges": [{"source": a, "target": b, **d} for a, b, d in g.edges(data=True)],
    }
