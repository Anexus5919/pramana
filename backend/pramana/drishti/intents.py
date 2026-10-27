"""Drishti's intent: what the rules and the model produce from one message (docs/features/drishti-spec.md, section 3).

The server validates every intent with these models; anything invalid becomes `clarify`. Pure Python and
pydantic, so the training scripts in backend/training/drishti/ import it without the app's database or settings.
"""

import json
import re
from typing import Any, Literal, get_args

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

IntentName = Literal[
    "count_applications", "list_applications", "list_decisions", "list_findings", "expiring_certificates",
    "awaiting_confirmation", "application_summary", "navigate", "explain_term", "how_to", "greeting", "clarify",
    "out_of_scope",
]
Category = Literal["eoa", "increase_intake"]
Status = Literal["under_review", "rectification_requested", "rectified", "closed", "withdrawn", "draft", "submitted"]
Round = Literal["first", "correction"]
Period = Literal[
    "today", "yesterday", "this_week", "last_week", "last_7_days", "this_month", "last_month", "last_30_days",
    "this_session", "all",
]
DecisionType = Literal["rectification", "outcome"]
Severity = Literal["high", "medium", "low"]
Topic = Literal[
    "fire_safety", "building", "land", "faculty", "fees", "signature", "qr", "photo", "seal", "edits", "accounts",
    "intake", "bandwidth",
]
Page = Literal["queue", "analyse", "integrity", "issuer_simulator", "rules", "audit", "platform", "application", "portal"]
Section = Literal["summary", "findings", "documents", "comparisons", "activity"]
Language = Literal["en", "hi", "hinglish"]
# Glossary entries and help topics (pramana.drishti.glossary holds the text for each key)
Term = Literal[
    "eoa", "increase_in_intake", "rectification", "deficiency_letter", "correction_round", "proof_strength",
    "evidence_class", "simulated", "signed_qr", "dsc", "cca_india", "time_machine", "readiness_check",
    "integrity_network", "ghost_faculty", "coverage_calendar", "inspection_brief", "evidence_pack", "replay",
    "audit_chain", "aph", "ter", "nba", "finding", "scrutiny_outcome", "ask_why", "fire_noc",
]
HowTo = Literal[
    "request_rectification", "record_outcome", "analyse_document", "verify_qr_by_phone", "check_audit_chain",
    "read_proof_ladder", "use_ask_why", "export_evidence_pack", "confirm_verification", "start_application",
    "fix_readiness_items", "submit_application",
]

INTENTS: tuple[str, ...] = get_args(IntentName)
CATEGORIES: tuple[str, ...] = get_args(Category)
STATUSES: tuple[str, ...] = get_args(Status)
ROUNDS: tuple[str, ...] = get_args(Round)
PERIODS: tuple[str, ...] = get_args(Period)
DECISION_TYPES: tuple[str, ...] = get_args(DecisionType)
SEVERITIES: tuple[str, ...] = get_args(Severity)
TOPICS: tuple[str, ...] = get_args(Topic)
PAGES: tuple[str, ...] = get_args(Page)
SECTIONS: tuple[str, ...] = get_args(Section)
LANGUAGES: tuple[str, ...] = get_args(Language)
TERMS: tuple[str, ...] = get_args(Term)
HOWTOS: tuple[str, ...] = get_args(HowTo)

# Patterns stay inside the regex subset Ollama's JSON-schema grammar supports: no \d, no (?:
DATE = r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
# A1 to A11 are aliases of the seeded application IDs; the server resolves them
APPLICATION = r"^(APP-[0-9]{4}-[0-9A-Z]{6}|A[0-9]{1,2})$"


def _blank_to_none(v: Any) -> Any:
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


class Filters(BaseModel):
    """Every filter is optional; an omitted field means null."""

    model_config = ConfigDict(extra="forbid")

    category: Category | None = None
    status: list[Status] | None = None
    round: Round | None = None
    period: Period | None = None
    date_from: str | None = Field(default=None, pattern=DATE)
    date_to: str | None = Field(default=None, pattern=DATE)
    actor: str | None = Field(default=None, max_length=80)
    decision_type: DecisionType | None = None
    severity: Severity | None = None
    topic: Topic | None = None
    institution: str | None = Field(default=None, max_length=120)
    application: str | None = Field(default=None, pattern=APPLICATION)
    place: str | None = Field(default=None, max_length=80)
    open_only: bool | None = None

    @field_validator("date_from", "date_to", "actor", "institution", "place", mode="before")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        return _blank_to_none(v)

    @field_validator("application", mode="before")
    @classmethod
    def _app_id(cls, v: Any) -> Any:
        v = _blank_to_none(v)
        return v.upper() if isinstance(v, str) else v

    @field_validator("status", mode="before")
    @classmethod
    def _status(cls, v: Any) -> Any:
        if isinstance(v, str):
            v = [v]
        return v or None


class Target(BaseModel):
    """Where a `navigate` intent goes; `document` is a declared document type key such as fire_noc."""

    model_config = ConfigDict(extra="forbid")

    page: Page | None = None
    section: Section | None = None
    document: str | None = Field(default=None, max_length=60, pattern=r"^[a-z0-9_]+$")


class Intent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: IntentName
    filters: Filters = Field(default_factory=Filters)
    target: Target | None = None
    term: Term | None = None
    howto: HowTo | None = None
    follow_up: bool = False
    language: Language = "en"

    @field_validator("filters", mode="before")
    @classmethod
    def _filters(cls, v: Any) -> Any:
        return {} if v is None else v

    @field_validator("term", "howto", mode="before")
    @classmethod
    def _key(cls, v: Any) -> Any:
        v = _blank_to_none(v)
        return re.sub(r"[\s-]+", "_", v.lower()) if isinstance(v, str) else v


def clarify(language: str = "en") -> Intent:
    return Intent(intent="clarify", language=language if language in LANGUAGES else "en")


def out_of_scope(language: str = "en") -> Intent:
    return Intent(intent="out_of_scope", language=language if language in LANGUAGES else "en")


def compact(intent: Intent) -> dict[str, Any]:
    """The intent without nulls, empty objects or a false follow_up: the canonical form for prompts and training."""

    def strip(v: Any) -> Any:
        if isinstance(v, dict):
            out = {k: strip(x) for k, x in v.items()}
            return {k: x for k, x in out.items() if x not in (None, {}, [])}
        return v

    out = strip(intent.model_dump(mode="json"))
    if not out.get("follow_up"):
        out.pop("follow_up", None)
    return out


def dumps(intent: Intent) -> str:
    """Canonical one-line JSON, keys in schema order."""
    return json.dumps(compact(intent), ensure_ascii=False, separators=(",", ":"))


def parse(data: str | dict[str, Any] | None) -> Intent | None:
    """A validated intent from model output or a stored dict, or None when it is not one."""
    if data is None:
        return None
    try:
        if isinstance(data, str):
            data = json.loads(data)
        return Intent.model_validate(data)
    except (ValidationError, ValueError, TypeError):
        return None
