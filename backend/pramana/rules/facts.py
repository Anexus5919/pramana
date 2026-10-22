"""Facts carry provenance, so a rule result can always say where each input came from.

Sources, in increasing order of authority:
- declared: typed by the institution into the application form
- document: read from an uploaded document (a claim made by that document)
- reference: an AICTE or other authorized record
- verified: confirmed cryptographically or by the issuing authority
- derived: computed from other facts by a rule
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Any


@dataclass
class Fact:
    path: str
    value: Any
    source: str
    provenance: dict[str, Any] = field(default_factory=dict)

    def describe(self) -> dict[str, Any]:
        v = self.value.isoformat() if isinstance(self.value, date) else self.value
        return {"path": self.path, "value": v, "source": self.source, "provenance": self.provenance}


class FactStore:
    def __init__(self) -> None:
        self._facts: dict[str, Fact] = {}

    def add(self, path: str, value: Any, source: str, **provenance: Any) -> None:
        if value is None:
            return
        self._facts[path] = Fact(path, value, source, {k: v for k, v in provenance.items() if v is not None})

    def get(self, path: str) -> Fact | None:
        return self._facts.get(path)

    def has_prefix(self, prefix: str) -> bool:
        p = prefix + "."
        return prefix in self._facts or any(k.startswith(p) for k in self._facts)

    def children(self, prefix: str) -> dict[str, Fact]:
        p = prefix + "."
        return {k[len(p):]: f for k, f in self._facts.items() if k.startswith(p)}

    def all(self) -> list[Fact]:
        return list(self._facts.values())

    def snapshot(self) -> list[dict[str, Any]]:
        return [f.describe() for f in sorted(self._facts.values(), key=lambda f: f.path)]
