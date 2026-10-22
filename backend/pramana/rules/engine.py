"""Versioned, effective-dated rule evaluation with a trace from requirement to evidence.

Rulesets are YAML files reviewed like any other regulation text. The ruleset hash is pinned on every
validation run, so a past result can be replayed under exactly the rules that produced it.
"""

from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from ..config import get_settings
from ..crypto import sha256_hex
from .expr import Evaluator, ExprError, MissingFact
from .facts import FactStore

PASS, FAIL, INSUFFICIENT, NOT_APPLICABLE, ERROR = "pass", "fail", "insufficient_evidence", "not_applicable", "error"


@dataclass
class Ruleset:
    id: str
    title: str
    version: str
    sha256: str
    sources: dict[str, dict[str, Any]]
    rules: list[dict[str, Any]]
    path: Path
    doc_types: dict[str, dict[str, Any]] = field(default_factory=dict)
    checklists: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass
class RuleResult:
    rule: dict[str, Any]
    outcome: str
    message: str
    inputs: list[dict[str, Any]] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    detail: dict[str, Any] = field(default_factory=dict)

    def citation(self, rs: Ruleset) -> dict[str, Any]:
        src = dict(self.rule.get("source") or {})
        doc = rs.sources.get(src.get("doc", ""), {})
        return {**src, "doc_title": doc.get("title"), "doc_url": doc.get("url")}


def load_ruleset(path: Path) -> Ruleset:
    raw = path.read_bytes()
    data = yaml.safe_load(raw)
    meta = data["ruleset"]
    return Ruleset(
        id=meta["id"],
        title=meta["title"],
        version=str(meta["version"]),
        sha256=sha256_hex(raw),
        sources={s["id"]: s for s in data.get("sources", [])},
        rules=data.get("rules", []),
        path=path,
        doc_types=data.get("document_types", {}),
        checklists=data.get("checklists", {}),
    )


@lru_cache
def active_ruleset() -> Ruleset:
    d = get_settings().rulesets_dir
    files = sorted(d.glob("*.yaml"))
    if not files:
        raise RuntimeError(f"no rulesets in {d}")
    return load_ruleset(files[-1])


def _effective(rule: dict[str, Any], on: date) -> bool:
    f, t = rule.get("effective_from"), rule.get("effective_to")
    f = date.fromisoformat(str(f)) if f else None
    t = date.fromisoformat(str(t)) if t else None
    return (f is None or f <= on) and (t is None or on <= t)


def _fmt(template: str, values: dict[str, Any]) -> str:
    try:
        return template.format(**{k.replace(".", "_"): v for k, v in values.items()})
    except (KeyError, IndexError, ValueError):
        return template


def evaluate(rs: Ruleset, facts: FactStore, *, category: str, as_of: date) -> list[RuleResult]:
    results = []
    for rule in rs.rules:
        applies = rule.get("applies_to") or {}
        cats = applies.get("categories")
        if (cats and category not in cats) or not _effective(rule, as_of):
            continue
        ev = Evaluator(facts, {"as_of": as_of})
        when = applies.get("when")
        if when:
            try:
                if not ev.eval(when):
                    results.append(RuleResult(rule, NOT_APPLICABLE, f"Not applicable: {when}",
                                              [f.describe() for f in ev.read.values()]))
                    continue
            except MissingFact as m:
                results.append(RuleResult(rule, INSUFFICIENT, f"Cannot decide applicability; missing {m.path}",
                                          missing=[m.path]))
                continue
        results.append(_check(rule, facts, as_of))
    return results


def _check(rule: dict[str, Any], facts: FactStore, as_of: date) -> RuleResult:
    chk = rule["check"]
    kind = chk["type"]
    msgs = rule.get("messages", {})
    ev = Evaluator(facts, {"as_of": as_of})
    try:
        if kind == "document_present":
            types = chk["doc_types"] if "doc_types" in chk else [chk["doc_type"]]
            present = [t for t in types if facts.has_prefix(f"doc.{t}")]
            needed = chk.get("min", 1)
            ok = len(present) >= needed
            inputs = [facts.get(f"doc.{t}.document_id").describe() for t in present if facts.get(f"doc.{t}.document_id")]
            return RuleResult(rule, PASS if ok else FAIL,
                              msgs.get("pass" if ok else "fail", "Required document present" if ok else
                                       f"Required document missing: {', '.join(types)}"),
                              inputs, detail={"expected": types, "present": present})
        if kind == "expression":
            ok = bool(ev.eval(chk["expr"]))
        elif kind == "not_expired":
            v = ev.eval(chk["date"])
            ok = v >= as_of
        else:
            raise ExprError(f"unknown check type {kind}")
    except MissingFact as m:
        return RuleResult(rule, INSUFFICIENT,
                          msgs.get("insufficient", f"Evidence needed to evaluate this rule is missing: {m.path}"),
                          [f.describe() for f in ev.read.values()], missing=[m.path])
    except (ExprError, TypeError, ValueError) as e:
        return RuleResult(rule, ERROR, f"Rule could not be evaluated: {e}", [f.describe() for f in ev.read.values()])
    values = {p: f.value for p, f in ev.read.items()}
    values["as_of"] = as_of
    derived = {}
    for name, expr in (chk.get("show") or {}).items():
        try:
            derived[name] = Evaluator(facts, {"as_of": as_of}).eval(expr)
        except (MissingFact, ExprError, TypeError, ValueError):
            derived[name] = None
    values.update(derived)
    template = msgs.get("pass" if ok else "fail", "Requirement met" if ok else "Requirement not met")
    return RuleResult(rule, PASS if ok else FAIL, _fmt(template, values),
                      [f.describe() for f in ev.read.values()], detail={"computed": derived})
