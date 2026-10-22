"""SIMULATED issuing-authority registries.

Stand-ins for reference-number lookups that real issuers (state fire services, municipal bodies, NBA,
registrars of societies) offer through portals or partner APIs. No real service is contacted. Every
response carries `simulated: true`, and the UI labels results from here as simulated.
Availability can be switched off to demonstrate the source-unavailable path.
"""

import json
import threading
import time
from pathlib import Path
from typing import Any

from ..config import get_settings

_lock = threading.Lock()


class SourceUnavailable(Exception):
    pass


def _path() -> Path:
    return get_settings().data_dir / "sim" / "issuer_registry.json"


def load() -> dict[str, Any]:
    p = _path()
    if not p.exists():
        return {"issuers": {}, "records": []}
    return json.loads(p.read_text(encoding="utf-8"))


def save(data: dict[str, Any]) -> None:
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with _lock:
        p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def list_issuers() -> list[dict[str, Any]]:
    data = load()
    return [{"code": c, **{k: v for k, v in i.items()}, "simulated": True} for c, i in data["issuers"].items()]


def set_availability(code: str, available: bool) -> dict[str, Any]:
    data = load()
    if code not in data["issuers"]:
        raise KeyError(code)
    data["issuers"][code]["available"] = available
    save(data)
    return data["issuers"][code]


def lookup(code: str, ref_no: str) -> dict[str, Any]:
    """The simulated issuer's reference-number lookup, as an issuer API would answer it."""
    data = load()
    issuer = data["issuers"].get(code)
    if issuer is None:
        raise KeyError(code)
    time.sleep(issuer.get("latency_ms", 150) / 1000)
    if not issuer.get("available", True):
        raise SourceUnavailable(f"{issuer['name']} did not respond (simulated outage)")
    norm = ref_no.strip().upper().replace(" ", "")
    for r in data["records"]:
        if r["issuer"] == code and r["ref_no"].upper().replace(" ", "") == norm:
            return {"simulated": True, "issuer": issuer["name"], "found": True, "record": r,
                    "mode": issuer.get("mode", "sync")}
    return {"simulated": True, "issuer": issuer["name"], "found": False, "record": None,
            "mode": issuer.get("mode", "sync")}
