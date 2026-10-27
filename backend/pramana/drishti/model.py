"""Ollama client for `pramana-drishti`, our question model. Called only for in-scope messages the rules could not parse.

The model only turns a message into an intent: the JSON schema goes to Ollama as `format`, the reply is validated,
and anything missing, slow or invalid returns None so the engine asks a clarifying question instead.
"""

import json
import logging
import socket
import time
import urllib.error
import urllib.request

from ..config import get_settings
from .intents import Intent
from .model_prompt import GENERATION_OPTIONS, OUTPUT_SCHEMA, build_messages, parse_output

log = logging.getLogger(__name__)
# After a failure the model is not retried for this long, so a missing model does not slow every message
BACKOFF_S = 60.0
_down_until = 0.0
last_error: str | None = None


def providers() -> list[str]:
    return [p for p in (x.strip() for x in get_settings().drishti_providers.split(",")) if p == "ollama"]


def enabled() -> bool:
    return bool(providers())


def _ollama(message: str, role: str, previous: Intent | None, language: str) -> Intent | None:
    s = get_settings()
    body = {"model": s.drishti_model, "stream": False, "think": False, "keep_alive": "10m", "format": OUTPUT_SCHEMA,
            "options": GENERATION_OPTIONS, "messages": build_messages(message, role, previous, language)}
    req = urllib.request.Request(f"{s.ollama_url.rstrip('/')}/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "User-Agent": "pramana/0.3"})
    with urllib.request.urlopen(req, timeout=s.drishti_timeout_s) as r:
        out = json.loads(r.read())
    return parse_output((out.get("message") or {}).get("content"))


def parse(message: str, role: str, previous: Intent | None, language: str) -> Intent | None:
    """A validated intent from the model, or None when no model is configured, reachable or valid."""
    global _down_until, last_error
    if not enabled() or time.monotonic() < _down_until:
        return None
    try:
        intent = _ollama(message, role, previous, language)
    except (urllib.error.URLError, TimeoutError, socket.timeout, ConnectionError, OSError, ValueError, KeyError) as e:
        # 404 is a model that is not pulled yet; connection errors and timeouts mean Ollama is down or busy
        last_error = f"{type(e).__name__}: {e}"
        _down_until = time.monotonic() + BACKOFF_S
        log.info("drishti model unavailable: %s", last_error)
        return None
    if intent is None:
        last_error = "invalid output"
    return intent


def reset() -> None:
    global _down_until, last_error
    _down_until, last_error = 0.0, None
