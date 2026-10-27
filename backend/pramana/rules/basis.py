"""The regulatory basis of a finding: the provisions it concerns and what to establish before acting on it.

rulesets/regulatory_basis.yaml maps finding codes to verbatim provisions of the AICTE Act, 1987, the Approval
Regulations, 2020 (amended 2021) and the Approval Process Handbook, each with its page and source. It is
validated here at load time and shown to officials only. Pramana relates a finding to provisions; whether one
is breached is for the competent authority.
"""

import re
from datetime import date
from fnmatch import fnmatchcase
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

from ..config import get_settings
from ..crypto import sha256_hex

BASIS_FILE = "regulatory_basis.yaml"
EVIDENCE = "evidence"
# Words the mapping must never use: Pramana relates, it does not accuse or decide
FORBIDDEN = re.compile(r"violat|forg|fake|genuine|\bIPC\b|\bBNS\b|criminal|police|verdict", re.IGNORECASE)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Source(_Strict):
    id: str
    instrument: str
    short: str
    url: HttpUrl
    official_url: HttpUrl | None = None
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    retrieved: date
    retrieved_via: str | None = None
    gazette: str | None = None


class Provision(_Strict):
    source: str
    number: str
    cite: str
    page: int = Field(ge=1)
    quote: str = Field(min_length=3, max_length=400)
    verified: Literal[True]


class Step(_Strict):
    text: str
    basis: str


class Entry(_Strict):
    id: str
    title: str
    codes: list[str] = []
    patterns: list[str] = []
    document_clause: bool = False
    provisions: list[str] = Field(min_length=1)
    establish: list[str] = Field(min_length=1)


class Meta(_Strict):
    id: str
    version: str
    ruleset: str
    verified_on: date
    scope_note: str


class BasisMap(_Strict):
    basis: Meta
    sources: list[Source]
    provisions: dict[str, Provision]
    steps: dict[str, Step]
    documents: dict[str, list[str]] = {}
    entries: list[Entry]
    sha256: str = ""

    @model_validator(mode="after")
    def _references(self) -> "BasisMap":
        src = {s.id for s in self.sources}
        for pid, p in self.provisions.items():
            if p.source not in src:
                raise ValueError(f"provision {pid}: unknown source {p.source}")
        for sid, s in self.steps.items():
            if s.basis != EVIDENCE and s.basis not in self.provisions:
                raise ValueError(f"step {sid}: basis {s.basis} is neither 'evidence' nor a provision")
        for t, ids in self.documents.items():
            for pid in ids:
                if pid not in self.provisions:
                    raise ValueError(f"documents.{t}: unknown provision {pid}")
        seen: dict[str, str] = {}
        for e in self.entries:
            if not (e.codes or e.patterns):
                raise ValueError(f"entry {e.id}: no codes or patterns")
            for pid in e.provisions:
                if pid not in self.provisions:
                    raise ValueError(f"entry {e.id}: unknown provision {pid}")
            for sid in e.establish:
                if sid not in self.steps:
                    raise ValueError(f"entry {e.id}: unknown step {sid}")
            for key in [*e.codes, *e.patterns]:
                if key in seen:
                    raise ValueError(f"{key} is mapped by both {seen[key]} and {e.id}")
                seen[key] = e.id
        words = [self.basis.scope_note, *(p.quote for p in self.provisions.values()),
                 *(p.number for p in self.provisions.values()), *(s.text for s in self.steps.values()),
                 *(e.title for e in self.entries)]
        for w in words:
            if m := FORBIDDEN.search(w):
                raise ValueError(f"forbidden word {m.group(0)!r} in: {w}")
        return self

    # ------------------------------------------------------------------ resolution

    def entry_for(self, code: str) -> Entry | None:
        """The entry for a finding code: an exact code first, then the most specific pattern."""
        for e in self.entries:
            if code in e.codes:
                return e
        best: tuple[int, Entry] | None = None
        for e in self.entries:
            for pat in e.patterns:
                if fnmatchcase(code, pat) and (best is None or len(pat) > best[0]):
                    best = (len(pat), e)
        return best[1] if best else None

    def source(self, sid: str) -> Source:
        return next(x for x in self.sources if x.id == sid)

    def provision(self, pid: str) -> dict[str, Any]:
        p = self.provisions[pid]
        return {"id": pid, "source": p.source, "number": p.number, "cite": p.cite, "quote": p.quote,
                "page": p.page, "verified": p.verified}

    def resolve(self, code: str, doc_type: str | None = None) -> dict[str, Any] | None:
        """Provisions and steps for one finding. Each instrument's name and URL appear once, under sources, so a
        page of findings does not repeat them for every provision."""
        e = self.entry_for(code)
        if e is None:
            return None
        ids = [*(self.documents.get(doc_type or "", []) if e.document_clause else []), *e.provisions]
        provisions = [self.provision(pid) for pid in dict.fromkeys(ids)]
        steps = []
        for sid in e.establish:
            st = self.steps[sid]
            if st.basis == EVIDENCE:
                steps.append({"text": st.text, "basis": {"kind": EVIDENCE, "label": "Evidence"}})
            else:
                p = self.provisions[st.basis]
                steps.append({"text": st.text, "basis": {"kind": "provision", "label": p.cite, "id": st.basis,
                                                         "source": p.source, "page": p.page}})
        used = dict.fromkeys([p["source"] for p in provisions]
                             + [s["basis"]["source"] for s in steps if s["basis"]["kind"] != EVIDENCE])
        sources = {sid: {"name": self.source(sid).short, "url": str(self.source(sid).url)} for sid in used}
        return {"entry": e.id, "scope_note": self.basis.scope_note, "version": self.basis.version,
                "sources": sources, "provisions": provisions, "establish": steps}


def load_basis(path: Path) -> BasisMap:
    raw = path.read_bytes()
    return BasisMap.model_validate({**yaml.safe_load(raw), "sha256": sha256_hex(raw)})


@lru_cache
def active_basis() -> BasisMap:
    return load_basis(get_settings().rulesets_dir / BASIS_FILE)


@lru_cache(maxsize=512)
def basis_for(code: str, doc_type: str | None = None) -> dict[str, Any] | None:
    """Resolved once per code and document type; findings share the result, so treat it as read-only."""
    return active_basis().resolve(code, doc_type)
