"""A deliberately small, safe expression language for rule conditions.

Python syntax restricted to literals, arithmetic, comparisons, boolean logic, dotted fact names and a
whitelist of functions. No attribute access on values, no subscripts into objects, no imports. Every
fact the expression reads is recorded, which is what makes the rule trace explainable.
"""

import ast
import math
import re
from collections.abc import Callable
from datetime import date
from typing import Any

from .facts import Fact, FactStore


class MissingFact(Exception):
    def __init__(self, path: str):
        super().__init__(path)
        self.path = path


class ExprError(ValueError):
    pass


def _days_between(a: date, b: date) -> int:
    return (b - a).days


def _to_date(s: str) -> date:
    return date.fromisoformat(s)


def _similar(a: Any, b: Any) -> float:
    from rapidfuzz import fuzz

    a, b = str(a).lower(), str(b).lower()
    score = fuzz.token_sort_ratio(a, b)
    # OCR merges and splits words ("CharitableTrust"). The names as one string of letters and digits are a second
    # signal, used only when they agree almost exactly, so names that differ in a word stay apart
    ca, cb = re.sub(r"[^a-z0-9]", "", a), re.sub(r"[^a-z0-9]", "", b)
    if ca and cb:
        compact = fuzz.ratio(ca, cb)
        if compact >= 95:
            score = max(score, compact)
    return float(score)


def _geo_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (float(lat1), float(lon1), float(lat2), float(lon2)))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return round(2 * 6371.0 * math.asin(math.sqrt(h)), 3)


FUNCS: dict[str, Callable[..., Any]] = {
    "similar": _similar,
    "geo_km": _geo_km,
    "join": lambda xs: ", ".join(str(x) for x in xs),
    "min": min,
    "max": max,
    "abs": abs,
    "round": round,
    "ceil": math.ceil,
    "floor": math.floor,
    "len": len,
    "sum": sum,
    "date": _to_date,
    "days_between": _days_between,
    "lower": lambda s: str(s).lower(),
}

_BIN = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b,
    ast.FloorDiv: lambda a, b: a // b,
    ast.Mod: lambda a, b: a % b,
}
_CMP = {
    ast.Eq: lambda a, b: a == b,
    ast.NotEq: lambda a, b: a != b,
    ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b,
    ast.Gt: lambda a, b: a > b,
    ast.GtE: lambda a, b: a >= b,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}


def _dotted(node: ast.AST) -> str | None:
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return ".".join(reversed(parts))
    return None


class Evaluator:
    def __init__(self, facts: FactStore, extra: dict[str, Any] | None = None):
        self.facts = facts
        self.extra = extra or {}
        self.read: dict[str, Fact] = {}

    def eval(self, src: str) -> Any:
        try:
            tree = ast.parse(src, mode="eval")
        except SyntaxError as e:
            raise ExprError(f"bad expression {src!r}: {e}") from e
        return self._ev(tree.body)

    def _lookup(self, path: str) -> Any:
        if path in self.extra:
            return self.extra[path]
        if path in ("True", "False", "None"):
            return {"True": True, "False": False, "None": None}[path]
        f = self.facts.get(path)
        if f is None:
            raise MissingFact(path)
        self.read[path] = f
        return f.value

    def _ev(self, n: ast.AST) -> Any:
        if isinstance(n, ast.Constant):
            return n.value
        if isinstance(n, ast.Name | ast.Attribute):
            path = _dotted(n)
            if path is None:
                raise ExprError("only dotted fact names are allowed")
            return self._lookup(path)
        if isinstance(n, ast.List | ast.Tuple):
            return [self._ev(e) for e in n.elts]
        if isinstance(n, ast.BoolOp):
            if isinstance(n.op, ast.And):
                return all(self._ev(v) for v in n.values)
            return any(self._ev(v) for v in n.values)
        if isinstance(n, ast.UnaryOp):
            v = self._ev(n.operand)
            if isinstance(n.op, ast.Not):
                return not v
            if isinstance(n.op, ast.USub):
                return -v
            raise ExprError("unsupported unary operator")
        if isinstance(n, ast.BinOp) and type(n.op) in _BIN:
            return _BIN[type(n.op)](self._ev(n.left), self._ev(n.right))
        if isinstance(n, ast.Compare):
            left = self._ev(n.left)
            for op, comp in zip(n.ops, n.comparators, strict=True):
                right = self._ev(comp)
                if type(op) not in _CMP or not _CMP[type(op)](left, right):
                    return False
                left = right
            return True
        if isinstance(n, ast.IfExp):
            return self._ev(n.body) if self._ev(n.test) else self._ev(n.orelse)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in FUNCS and not n.keywords:
            return FUNCS[n.func.id](*[self._ev(a) for a in n.args])
        raise ExprError(f"unsupported syntax: {ast.dump(n)[:80]}")
