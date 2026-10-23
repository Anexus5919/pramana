"""The same seal image on certificates attributed to different issuers, across institutions.

Follows the photo-reuse precedent: the later submission carries the main finding and the earlier one a
low note, because which file the image came from cannot be told from the files alone.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..forensics.seals import COMMON_ISSUERS, PHASH_MAX_DISTANCE, distance, issuer_key, issuer_of
from ..models import Application, Document
from .cross import Link, _peer_docs, _submitted_before


def _images(doc: Document) -> list[dict[str, Any]]:
    return (doc.fingerprints or {}).get("images") or []


def _issuer(doc: Document) -> str | None:
    return issuer_of({f.name: f.value for f in doc.fields})


def _shared_artwork(db: Session) -> list[dict[str, Any]]:
    """Images printed under COMMON_ISSUERS or more distinct issuers, such as a state emblem."""
    by_sha: dict[str, tuple[dict[str, Any], set[str]]] = {}
    for d in db.scalars(select(Document).where(Document.superseded.is_(False),
                                               Document.processing_status == "processed")):
        ims = _images(d)
        iss = _issuer(d) if ims else None
        for im in ims if iss else []:
            by_sha.setdefault(im["sha256"], (im, set()))[1].add(issuer_key(iss))
    common = []
    for im, _ in by_sha.values():
        issuers = set().union(*(keys for other, keys in by_sha.values() if distance(im, other) <= PHASH_MAX_DISTANCE))
        if len(issuers) >= COMMON_ISSUERS:
            common.append(im)
    return common


def seal_reuse(db: Session, app: Application, docs: list[Document]) -> list[Link]:
    mine = [(d, _issuer(d), im) for d in docs for im in _images(d)]
    mine = [(d, iss, im) for d, iss, im in mine if iss]
    if not mine:
        return []
    common = _shared_artwork(db)
    peers = [(pd, papp, _issuer(pd)) for pd, papp in _peer_docs(db, app) if _images(pd)]
    links, seen = [], set()
    for d, iss, im in mine:
        if any(distance(im, c) <= PHASH_MAX_DISTANCE for c in common):
            continue
        for pd, papp, piss in peers:
            if not piss or issuer_key(piss) == issuer_key(iss) or (d.id, pd.id) in seen:
                continue
            hit = next((p for p in _images(pd) if distance(im, p) <= PHASH_MAX_DISTANCE), None)
            if hit is None:
                continue
            seen.add((d.id, pd.id))
            dist = distance(im, hit)
            exact = im["sha256"] == hit["sha256"]
            how = "pixel-identical" if exact else f"visually near-identical (perceptual hash distance {dist}/256)"
            inst = papp.institution.name
            evidence = [
                {"kind": "region", "document_id": d.id, "page": im["page"], "bbox": im["bbox"],
                 "label": "seal image", "value": iss},
                {"kind": "peer_document", "document_id": pd.id, "application_id": papp.id, "page": hit["page"],
                 "bbox": hit["bbox"]},
                {"kind": "image_match", "document_id": d.id, "page": im["page"], "bbox": im["bbox"], "issuer": iss,
                 "peer_document_id": pd.id, "peer_application_id": papp.id, "peer_institution": inst,
                 "peer_page": hit["page"], "peer_bbox": hit["bbox"], "peer_issuer": piss, "distance": dist,
                 "exact": exact},
            ]
            if _submitted_before(papp, app):
                links.append(Link(
                    "FX-SEAL-REUSED-LATER", "This seal image also appears under another issuer in a later application",
                    f"The seal image on page {im['page']} of '{d.original_filename}' (issued by {iss}) is {how} to a "
                    f"seal on '{pd.original_filename}' submitted later by {inst} ({papp.id}), which names {piss} as "
                    "its issuer. Recorded here so both files can be compared; the later submission carries the "
                    "main finding.",
                    "low", "heuristic", f"seal:{im['phash']}", papp.id, inst, evidence,
                    "Which file the image was copied from cannot be established from the files alone.",
                ))
            else:
                links.append(Link(
                    "FX-SEAL-REUSED", "Seal image of a different issuer",
                    f"The seal image on page {im['page']} of '{d.original_filename}', which names {iss} as its "
                    f"issuer, is {how} to the seal on '{pd.original_filename}' submitted earlier by {inst} "
                    f"({papp.id}) and issued by {piss}. One authority's seal on another authority's certificate "
                    "suggests the image was copied from that file.",
                    "high" if exact else "medium", "structural" if exact else "heuristic", f"seal:{im['phash']}",
                    papp.id, inst, evidence,
                    "A matching image shows that the picture was copied, not who copied it or why. Artwork printed "
                    f"under {COMMON_ISSUERS} or more issuers (an emblem) is ignored, and documents whose issuer could "
                    "not be read are not compared. Compare both seals.",
                ))
    return links
