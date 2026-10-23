"""Cycle-wide integrity views: the integrity network and the faculty overlap radar.

Both are read-only projections of what validation already recorded. A shared faculty ID, certificate number,
file, photo or seal is an indicator that needs confirmation by an official; nothing here decides anything about
an application or a person, and institutions never see these views.
"""

import json
import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

import networkx as nx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..api.applications import latest_run
from ..auth import OFFICIAL_ROLES, require_roles
from ..consistency.cross import norm_id
from ..db import get_db
from ..history.yoy import RECORD_TYPE as PREVIOUS_APPLICATION
from ..models import Application, Document, Finding, ReferenceRecord, User
from ..pipeline.validate import _fp

router = APIRouter(prefix="/api/insights", tags=["insights"])
# A network built once from a random evaluation world (scripts/network_snapshot.py); synthetic, read-only
SNAPSHOT = Path(__file__).with_name("synthetic_network.json")

# Finding code -> the kind of shared item it records
LINK_KIND = {
    "XA-FACULTY-MULTIPLE-INSTITUTIONS": "faculty",
    "XA-SHARED-CERTIFICATE-NUMBER": "certificate",
    "XA-IDENTICAL-FILE": "file",
    "XA-PHOTO-REUSED": "photo",
    "XA-PHOTO-REUSED-LATER": "photo",
    "FX-SEAL-REUSED": "seal",
    "FX-SEAL-REUSED-LATER": "seal",
    "XA-NEAR-DUPLICATE-DETAILS": "details",
}
FACULTY_CODES = ("XA-FACULTY-MULTIPLE-INSTITUTIONS", "XA-FACULTY-REGISTERED-ELSEWHERE", "XA-FACULTY-NOT-IN-REGISTRY")
# Items matched by image or by extracted values have one entity per side; they are joined through their documents
PAIRED_KINDS = {"photo", "seal", "details"}
KIND_ORDER = ["faculty", "certificate", "file", "photo", "seal", "details"]
RELATION = {"faculty": "lists faculty", "file": "submitted file", "photo": "same photo", "seal": "same seal",
            "details": "same details"}
DOC_SHORT = {"fire_noc": "fire NOC", "occupancy_certificate": "occupancy certificate", "affidavit_1": "affidavit",
             "affidavit_2": "affidavit", "structural_stability": "structural stability certificate",
             "audited_accounts": "audit report", "nba_certificate": "NBA certificate", "land_document": "land record",
             "building_plan": "building plan", "campus_photo": "campus photo", "faculty_list": "faculty list"}
NAME_STOP = {"institute", "college", "school", "technical", "polytechnic", "university", "campus", "academy"}


def short_name(name: str) -> str:
    """'Panchganga Institute of Technology' -> 'Panchganga'; names without a generic word stay whole."""
    words = name.split()
    for i, w in enumerate(words):
        if w.lower() in NAME_STOP and i > 0:
            return " ".join(words[:i])
    return name


def doc_short(declared_type: str | None) -> str:
    return DOC_SHORT.get(declared_type or "", (declared_type or "document").replace("_", " "))


def join_words(parts: list[str]) -> str:
    if len(parts) <= 1:
        return "".join(parts)
    return f"{', '.join(parts[:-1])} and {parts[-1]}"


def _plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


def current_applications(db: Session) -> tuple[str | None, list[Application]]:
    """Applications of the latest academic year: cross-application checks compare within one year."""
    apps = db.scalars(select(Application)).all()
    if not apps:
        return None, []
    year = max(a.academic_year for a in apps)
    return year, sorted((a for a in apps if a.academic_year == year), key=lambda a: a.id)


def _finding_brief(f: Finding) -> dict[str, Any]:
    return {"id": f.id, "code": f.code, "title": f.title, "severity": f.severity, "review_status": f.review_status}


def _entity_of(f: Finding, candidates: dict[str, str]) -> str | None:
    """The shared entity a cross-application finding was recorded for, recovered from its fingerprint.

    Validation fingerprints each link as _fp('xa', code, entity), and a repeated fingerprint as _fp(fp, message)."""
    if f.fingerprint in candidates:
        return candidates[f.fingerprint]
    for fp, ent in candidates.items():
        if _fp(fp, f.message) == f.fingerprint:
            return ent
    return None


def _peer(evidence: list[dict[str, Any]]) -> tuple[str | None, str | None, int | None, list[float] | None]:
    for e in evidence or []:
        if e.get("kind") == "peer_document":
            return e.get("application_id"), e.get("document_id"), e.get("page"), e.get("bbox")
        if e.get("kind") == "image_match":
            return e.get("peer_application_id"), e.get("peer_document_id"), e.get("peer_page"), e.get("peer_bbox")
    return None, None, None, None


def _mine(f: Finding) -> tuple[str | None, int | None, list[float] | None]:
    for e in f.evidence or []:
        if e.get("kind") in ("region", "document") and e.get("document_id"):
            return e["document_id"], e.get("page"), e.get("bbox")
    return f.document_id, None, None


def _run_links(db: Session, app: Application) -> list[dict[str, Any]]:
    """Every cross-application link finding in the application's current run, with the entity it is about."""
    run = latest_run(db, app.id)
    if run is None or run.status != "complete":
        return []
    graph = (run.summary or {}).get("graph") or {}
    ents = [n["id"] for n in graph.get("nodes", []) if not str(n["id"]).startswith("app:")]
    out = []
    for f in db.scalars(select(Finding).where(Finding.run_id == run.id)):
        kind = LINK_KIND.get(f.code)
        if kind is None:
            continue
        candidates = {_fp("xa", f.code, e): e for e in ents}
        ent = _entity_of(f, candidates)
        peer_app, peer_doc, peer_page, peer_bbox = _peer(f.evidence)
        doc_id, page, bbox = _mine(f)
        out.append({"finding": f, "kind": kind, "entity": ent, "app": app.id, "doc": doc_id, "page": page,
                    "bbox": bbox, "peer_app": peer_app, "peer_doc": peer_doc, "peer_page": peer_page,
                    "peer_bbox": peer_bbox})
    return out


class _Union:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def find(self, x: str) -> str:
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)


def _label(kind: str, ln: dict[str, Any], doc_types: dict[str, str]) -> tuple[str, str | None]:
    """(label, detail) for a shared item, read from the finding that recorded it."""
    f: Finding = ln["finding"]
    ent = ln["entity"] or ""
    if kind == "faculty":
        m = re.search(r"\(([^()]+)\) appears", f.message)
        return (m.group(1) if m else ent.split(":", 1)[-1]), f.message.split(" (")[0]
    if kind == "certificate":
        m = re.search(r"number '([^']+)'", f.message)
        return (m.group(1) if m else ent.split(":", 1)[-1]), doc_short(doc_types.get(ln["doc"] or ""))
    if kind == "file":
        m = re.search(r"'([^']+)' is byte-identical", f.message)
        return f"SHA-256 {ent.split(':', 1)[-1][:12]}", (m.group(1) if m else None)
    if kind == "photo":
        m = re.search(r"Photo '([^']+)'", f.message)
        return "Campus photo", (m.group(1) if m else None)
    if kind == "seal":
        m = re.search(r"issued by ([^)]+)\)|names (.+?) as its", f.message)
        return "Seal image", (next((g for g in m.groups() if g), None) if m else None)
    return f"Same {doc_short(doc_types.get(ln['doc'] or ''))} details", None


def _relation(kind: str, doc_type: str | None) -> str:
    if kind == "certificate":
        return {"fire_noc": "carries NOC no.", "occupancy_certificate": "carries OC no."}.get(
            doc_type or "", "carries cert. no.")
    return RELATION[kind]


def _count_phrase(kind: str, items: list[dict[str, Any]]) -> list[str]:
    if kind == "faculty":
        return [_plural(len(items), "faculty ID")]
    if kind == "certificate":
        by_type: dict[str, int] = defaultdict(int)
        for it in items:
            by_type[it["doc_label"] or "certificate"] += 1
        return [_plural(n, f"{t} number") for t, n in sorted(by_type.items())]
    if kind == "file":
        return [_plural(len(items), "identical file")]
    if kind == "photo":
        return [_plural(len(items), "photo")]
    if kind == "seal":
        return [_plural(len(items), "seal image")]
    return [_plural(len(items), "set of certificate details", "sets of certificate details")]


def items_phrase(items: list[dict[str, Any]]) -> str:
    by_kind: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for it in items:
        by_kind[it["kind"]].append(it)
    parts = [p for k in KIND_ORDER if by_kind.get(k) for p in _count_phrase(k, by_kind[k])]
    return join_words(parts)


def build_network(db: Session) -> dict[str, Any]:
    year, apps = current_applications(db)
    by_id = {a.id: a for a in apps}
    links = [ln for a in apps for ln in _run_links(db, a)]
    doc_ids = {d for ln in links for d in (ln["doc"], ln["peer_doc"]) if d}
    doc_types = {d.id: d.declared_type for d in db.scalars(select(Document).where(Document.id.in_(doc_ids)))} \
        if doc_ids else {}

    # Image and value matches carry one entity per side; documents that match are one shared item
    uf = _Union()
    for ln in links:
        if ln["kind"] in PAIRED_KINDS and ln["doc"] and ln["peer_doc"]:
            uf.union(f"{ln['kind']}:{ln['doc']}", f"{ln['kind']}:{ln['peer_doc']}")

    items: dict[str, dict[str, Any]] = {}
    for ln in links:
        kind = ln["kind"]
        if kind in PAIRED_KINDS:
            if not ln["doc"]:
                continue
            key = uf.find(f"{kind}:{ln['doc']}")
        else:
            key = ln["entity"] or f"{kind}:{ln['finding'].id}"
        it = items.get(key)
        if it is None:
            label, detail = _label(kind, ln, doc_types)
            doc_type = doc_types.get(ln["doc"] or "")
            it = items[key] = {"id": key, "kind": kind, "label": label, "detail": detail, "doc_type": doc_type,
                               "doc_label": doc_short(doc_type) if kind == "certificate" else None,
                               "relation": _relation(kind, doc_type), "apps": {}}
        mine = it["apps"].setdefault(ln["app"], {"findings": [], "document_id": ln["doc"], "page": ln["page"],
                                                 "bbox": ln["bbox"]})
        # The application's own finding locates its document best; a peer's reference is the fallback
        if ln["page"] and not mine.get("own"):
            mine.update(document_id=ln["doc"], page=ln["page"], bbox=ln["bbox"], own=True)
        if all(x["id"] != ln["finding"].id for x in mine["findings"]):
            mine["findings"].append(_finding_brief(ln["finding"]))
        if ln["peer_app"] in by_id:
            it["apps"].setdefault(ln["peer_app"], {"findings": [], "document_id": ln["peer_doc"],
                                                   "page": ln["peer_page"], "bbox": ln["peer_bbox"]})

    shared = sorted((it for it in items.values() if len(it["apps"]) >= 2),
                    key=lambda it: (KIND_ORDER.index(it["kind"]), it["label"]))

    g = nx.Graph()
    g.add_nodes_from(by_id)
    pairs: dict[tuple[str, str], list[str]] = defaultdict(list)
    for it in shared:
        ids = sorted(it["apps"])
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                pairs[(a, b)].append(it["id"])
                g.add_edge(a, b)
    item_by_id = {it["id"]: it for it in shared}

    comps = [sorted(c) for c in nx.connected_components(g) if len(c) >= 2]
    comps.sort(key=lambda c: (-len(c), -sum(1 for it in shared if set(it["apps"]) & set(c)), c[0]))
    clusters, cluster_of = [], {}
    for n, comp in enumerate(comps, start=1):
        cid = f"C{n}"
        members = set(comp)
        its = [it for it in shared if set(it["apps"]) <= members]
        names = [short_name(by_id[a].institution.name) for a in comp]
        cpairs = [{"a": a, "b": b, "items": ids, "summary": f"{short_name(by_id[a].institution.name)} and "
                   f"{short_name(by_id[b].institution.name)} share {items_phrase([item_by_id[i] for i in ids])}"}
                  for (a, b), ids in sorted(pairs.items()) if a in members]
        findings = {f["id"] for it in its for x in it["apps"].values() for f in x["findings"]}
        high = {f["id"] for it in its for x in it["apps"].values() for f in x["findings"]
                if f["severity"] in ("critical", "high")}
        clusters.append({
            "id": cid, "applications": comp, "items": [it["id"] for it in its],
            "summary": f"{join_words(names)} {'share' if len(comp) == 2 else 'are linked through'} "
                       f"{items_phrase(its)}",
            "pairs": cpairs, "findings": len(findings), "high_findings": len(high),
            "kinds": {k: sum(1 for it in its if it["kind"] == k) for k in KIND_ORDER
                      if any(it["kind"] == k for it in its)},
        })
        for a in comp:
            cluster_of[a] = cid

    applications = [{
        "id": a.id, "institution_id": a.institution_id, "institution": a.institution.name,
        "short_name": short_name(a.institution.name), "district": a.institution.district, "status": a.status,
        "cluster": cluster_of.get(a.id), "degree": g.degree(a.id),
    } for a in apps]
    edges = [{"source": a, "target": it["id"], "kind": it["kind"], "relation": it["relation"],
              "findings": x["findings"], "document_id": x["document_id"], "page": x["page"], "bbox": x["bbox"]}
             for it in shared for a, x in sorted(it["apps"].items())]
    out_items = [{k: v for k, v in it.items() if k != "apps"} | {"applications": sorted(it["apps"])}
                 for it in shared]
    return {
        "dataset": "current", "synthetic": False, "academic_year": year,
        "applications": applications, "items": out_items, "edges": edges,
        "pairs": [{"a": a, "b": b, "items": ids} for (a, b), ids in sorted(pairs.items())],
        "clusters": clusters,
        "stats": {"applications": len(apps), "linked_applications": len(cluster_of), "clusters": len(clusters),
                  "shared_items": len(shared),
                  "by_kind": {k: sum(1 for it in shared if it["kind"] == k) for k in KIND_ORDER}},
    }


# ---- faculty overlap radar

def _parse_date(s: Any) -> date | None:
    if not s:
        return None
    s = str(s).strip()
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def overlap(lanes: list[dict[str, Any]], today: date) -> tuple[date | None, int, int]:
    """(first day two or more institutions list the person at once, days of such overlap, most at once).

    Each lane runs from its joining date to its leaving date, or to today when no leaving date is known."""
    events: list[tuple[date, int]] = []
    for ln in lanes:
        start = _parse_date(ln.get("joined"))
        if start is None:
            continue
        end = _parse_date(ln.get("left")) or today
        if end > start:
            events += [(start, 1), (end, -1)]
    events.sort(key=lambda e: (e[0], e[1]))
    active, first, days, peak, since = 0, None, 0, 0, None
    for d, step in events:
        if active >= 2 and since is not None:
            days += (d - since).days
        active += step
        peak = max(peak, active)
        if active >= 2:
            first = first or d
            since = d
        else:
            since = None
    return first, days, peak


def faculty_overlaps(db: Session, today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    year, apps = current_applications(db)
    by_inst = {a.institution_id: a for a in apps}
    claims: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for a in apps:
        docs = db.scalars(select(Document).where(Document.application_id == a.id,
                                                 Document.declared_type == "faculty_list",
                                                 Document.superseded.is_(False),
                                                 Document.processing_status == "processed")).all()
        for d in docs:
            for r in (d.analysis or {}).get("rows", []):
                if r.get("faculty_id"):
                    claims[norm_id(r["faculty_id"])].append({"app": a, "doc": d, "row": r})
    registry = {norm_id(r.key): r for r in db.scalars(
        select(ReferenceRecord).where(ReferenceRecord.record_type == "faculty"))}
    last_year: dict[str, set[str]] = defaultdict(set)
    last_year_label = None
    for rec in db.scalars(select(ReferenceRecord).where(ReferenceRecord.record_type == PREVIOUS_APPLICATION)):
        last_year_label = last_year_label or rec.data.get("academic_year")
        for fid in rec.data.get("faculty_ids") or []:
            if rec.institution_id:
                last_year[norm_id(fid)].add(rec.institution_id)

    runs = {a.id: latest_run(db, a.id) for a in apps}
    fac_findings: dict[str, list[Finding]] = {}
    for a in apps:
        run = runs[a.id]
        fac_findings[a.id] = list(db.scalars(select(Finding).where(
            Finding.run_id == run.id, Finding.code.in_(FACULTY_CODES)))) if run else []

    def findings_for(app_id: str, fid: str) -> list[dict[str, Any]]:
        out = []
        for f in fac_findings.get(app_id, []):
            fp = _fp("xa", f.code, f"faculty:{fid}")
            if f.fingerprint in (fp, _fp(fp, f.message)):
                out.append(_finding_brief(f))
        return sorted(out, key=lambda x: FACULTY_CODES.index(x["code"]))

    people = []
    for fid, cs in claims.items():
        insts = {c["app"].institution_id for c in cs}
        reg = registry.get(fid)
        reg_inst = reg.institution_id if reg else None
        if len(insts) < 2 and not (reg_inst and reg_inst not in insts):
            continue
        lanes = []
        for c in sorted(cs, key=lambda c: (_parse_date(c["row"].get("doj")) or today, c["app"].id)):
            a, d, r = c["app"], c["doc"], c["row"]
            joined = _parse_date(r.get("doj"))
            lanes.append({
                "source": "roster", "institution_id": a.institution_id, "institution": a.institution.name,
                "short_name": short_name(a.institution.name), "application_id": a.id, "document_id": d.id,
                "page": r.get("_page"), "bbox": r.get("_bbox"), "name": r.get("name"),
                "designation": r.get("designation"), "joined": joined.isoformat() if joined else None,
                "left": None, "registry": reg_inst == a.institution_id,
                "last_year": a.institution_id in last_year.get(fid, set()), "findings": findings_for(a.id, fid),
            })
        if reg and reg_inst and reg_inst not in insts:
            ra = by_inst.get(reg_inst)
            name = reg.data.get("institution_name") or reg_inst
            lanes.append({
                "source": "registry", "institution_id": reg_inst, "institution": name, "short_name": short_name(name),
                "application_id": ra.id if ra else None, "document_id": None, "page": None, "bbox": None,
                "name": reg.data.get("name"), "designation": reg.data.get("designation"), "joined": None,
                "left": None, "registry": True, "last_year": reg_inst in last_year.get(fid, set()), "findings": [],
            })
        roster = [ln for ln in lanes if ln["source"] == "roster"]
        first, days, peak = overlap(roster, today)
        names = sorted({ln["name"] for ln in roster if ln["name"]})
        people.append({
            "faculty_id": cs[0]["row"]["faculty_id"], "name": names[0] if names else None,
            "names_differ": len(names) > 1, "designation": roster[0]["designation"] if roster else None,
            "institutions": len({ln["institution_id"] for ln in lanes}),
            "claimed_by": len(insts), "applications": sorted({c["app"].id for c in cs}),
            "registry": {"institution_id": reg_inst, "institution": reg.data.get("institution_name") if reg else None,
                         "source": reg.source if reg else None, "listed_by_registry_institution": reg_inst in insts}
            if reg else None,
            "overlap_start": first.isoformat() if first else None, "overlap_days": days, "concurrent": peak,
            "lanes": lanes,
        })
    people.sort(key=lambda p: (-p["overlap_days"], -p["institutions"], p["faculty_id"]))
    involved = sorted({a for p in people for a in p["applications"]})
    return {
        "academic_year": year, "as_of": today.isoformat(), "last_year": last_year_label,
        "people": people,
        "stats": {"faculty_ids": len(people), "applications_involved": len(involved),
                  "applications_checked": len(apps), "rows_checked": sum(len(v) for v in claims.values()),
                  "claimed_by_two_or_more": sum(1 for p in people if p["claimed_by"] >= 2),
                  "registered_elsewhere": sum(1 for p in people if p["registry"]
                                              and not p["registry"]["listed_by_registry_institution"])},
    }


OFFICIALS = require_roles(*OFFICIAL_ROLES)


def load_snapshot() -> dict[str, Any] | None:
    if not SNAPSHOT.exists():
        return None
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


@router.get("/network")
def network(dataset: str = Query("current", pattern="^(current|synthetic)$"), user: User = Depends(OFFICIALS),
            db: Session = Depends(get_db)):
    snap = load_snapshot()
    if dataset == "synthetic":
        if snap is None:
            raise HTTPException(404, "no synthetic network snapshot")
        return snap
    out = build_network(db)
    out["datasets"] = [{"id": "current", "label": "This cycle", "applications": out["stats"]["applications"]}]
    if snap:
        out["datasets"].append({"id": "synthetic", "label": "Synthetic world",
                                "applications": snap["stats"]["applications"], "note": snap.get("note")})
    return out


@router.get("/faculty-overlaps")
def faculty_overlap_radar(user: User = Depends(OFFICIALS), db: Session = Depends(get_db)):
    return faculty_overlaps(db)
