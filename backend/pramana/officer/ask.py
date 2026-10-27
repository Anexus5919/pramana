"""Ask why: grounded explanations of an application's existing findings for the officer.

The model sees only structured data Pramana produced (findings, verification results, rule clauses quoted
from the ruleset, run facts), never raw document text, which is where injected instructions live. Text that
quotes a document is screened and withheld when it addresses an automated reader.

Every sentence must cite evidence ids from the context. A post-check drops sentences that cite nothing valid,
use numbers, dates or codes that are not in the items they cite, contradict the cited statuses, judge a
document or decide the application. When no model is available, template answers built from the same items
are used instead. The answer explains; it decides nothing.
"""

import json
import re
import time
import urllib.error
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Application, Document, VerificationAttempt, round_label
from ..pipeline.llm_extract import INJECTION, _post
from ..rules.engine import active_ruleset
from ..verification.base import channel_label
from ..verification.effective import effective_document_status
from .common import FORBIDDEN_WORDS, citation, latest_run, rules_by_id, rules_needing, run_findings
from .settings import officer_settings

SYSTEM = (
    "You answer a scrutiny officer's question about one application, using only the evidence items given. "
    "Rules: 1) Every sentence cites at least one evidence id from the list in 'cites'. 2) Copy numbers, dates "
    "and reference codes exactly as they appear in the items you cite; never compute or infer new ones. "
    "3) Add nothing that is not in the items. 4) You explain existing findings; you never decide, approve, "
    "reject or recommend action on the application. 5) Never call a document forged, fake, fraudulent or "
    "genuine; use the wording of the items, such as 'modified after signing', 'could not be confirmed' or "
    "'not found in the issuer registry'. Use status words as the items state them; say 'verified' only for an "
    "item whose status is verified. 6) If the items do not answer the question, say so in one sentence "
    "citing the closest item. Answer in two to four short sentences and cite the specific items behind each one: "
    "findings (F), verification results (V), rules (R), documents (D), page regions (P) or the run (RUN). "
    "Reply with JSON only."
)
SCHEMA = {"type": "object", "required": ["sentences"], "properties": {"sentences": {"type": "array", "items": {
    "type": "object", "required": ["text", "cites"],
    "properties": {"text": {"type": "string"}, "cites": {"type": "array", "items": {"type": "string"}}}}}}}

# Words officers use for each document type
DOC_WORDS = {
    "fire_noc": r"fire|noc\b|no objection",
    "structural_stability": r"\bssc\b|structural|stability",
    "occupancy_certificate": r"\boc\b|occupancy|completion certificate|building licen",
    "affidavit_2": r"affidavit|e-?stamp",
    "ter_receipt": r"\bter\b|receipt|payment|fee",
    "satellite_map": r"satellite|\bmap\b|location|coordinates",
    "audited_accounts": r"accounts|audit(ed)? statement|udin",
    "faculty_list": r"faculty|teacher|staff|fsr|student ratio",
    "nba_certificate": r"\bnba\b|accreditation",
    "infrastructure_photo": r"photo|geotag|picture",
}
VER_SUPPORT = {"verified"}
NOT_VERIFIED = {"not_checked", "manual_review_required", "source_unavailable", "verification_pending",
                "mismatch_detected", "expired", "officer_reviewed"}
# Document statuses in the words the workspace shows officials
DOC_STATUS_WORDS = {"not_checked": "no outside source", "officer_reviewed": "reviewed by officer"}
DOC_STATUS_NOTE = {
    "not_checked": " No issuing body is connected for this kind of document, so it cannot be confirmed from outside.",
    "officer_reviewed": " An official examined it and recorded a note; no issuing body confirmed it.",
}
CLAIMS: list[tuple[str, re.Pattern, set[str], str | None]] = [
    ("unverified", re.compile(r"\b(unverified|not (yet |been )?(verified|confirmed|authenticated)"
                              r"|could not be (confirmed|verified|authenticated)|unconfirmed|not checked)\b", re.I),
     NOT_VERIFIED | {"insufficient_evidence"}, None),
    ("verified", re.compile(r"\b(verified|confirmed|authenticated)\b", re.I), VER_SUPPORT, None),
    ("expired", re.compile(r"\b(expired|no longer valid)\b", re.I), {"expired"}, r"expir"),
    ("mismatch", re.compile(r"\b(mismatch\w*|does not match|do not match|differs?|modified after signing)\b", re.I),
     {"mismatch_detected"}, r"mismatch|differ|modified after signing|overwrit|changed"),
    ("pending", re.compile(r"\b(pending|awaiting)\b", re.I), {"verification_pending", "evidence_requested"},
     r"pending|await"),
    ("unavailable", re.compile(r"\b(unavailable|did not respond|outage)\b", re.I), {"source_unavailable"},
     r"unavailable|did not respond|outage"),
    ("dismissed", re.compile(r"\bdismissed\b", re.I), {"dismissed"}, None),
    ("accepted", re.compile(r"\baccepted\b", re.I), {"accepted"}, None),
    ("escalated", re.compile(r"\bescalated\b", re.I), {"escalated"}, None),
    ("resolved", re.compile(r"\bresolved\b", re.I), {"resolved"}, None),
    ("passed", re.compile(r"\b(passe[sd]|passing|compliant|satisfie[sd])\b", re.I), {"pass"}, None),
    ("failed", re.compile(r"\bfail(s|ed)?\b", re.I), {"fail"}, r"fail"),
]
DECIDES = re.compile(r"\b(should|must|can|may|will)\s+(not\s+)?be\s+(approved|rejected|penali[sz]ed|granted|refused)\b"
                     r"|\b(approve|reject|penali[sz]e|refuse)\s+(the|this)\s+(application|institution)\b"
                     r"|\bi\s+recommend\b|\brecommend(s|ed)?\s+(that|approv|reject)", re.I)
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov",
                                      "dec"], start=1)}
DATE_RE = re.compile(
    r"\b(?P<iso>(?P<y1>\d{4})-(?P<m1>\d{2})-(?P<d1>\d{2}))\b"
    r"|\b(?P<dmy>(?P<d2>\d{1,2})[-/.](?P<m2>\d{1,2})[-/.](?P<y2>\d{4}))\b"
    r"|\b(?P<dmy_t>(?P<d3>\d{1,2})(st|nd|rd|th)?\s+(?P<m3>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?"
    r"\s+(?P<y3>\d{4}))\b"
    r"|\b(?P<mdy_t>(?P<m4>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?P<d4>\d{1,2})(st|nd|rd|th)?,?"
    r"\s+(?P<y4>\d{4}))\b", re.I)
CODE_RE = re.compile(r"\b(?=[A-Z0-9/-]*\d)(?=[A-Z0-9/-]*[A-Z])[A-Z0-9]+(?:[-/][A-Z0-9]+)+\b")
NUM_RE = re.compile(r"(?<![\w./-])\d+(?:,\d{3})*(?:\.\d+)?(?![\w/-]|\.\d)")
MAX_SENTENCES = 10
ID_RE = re.compile(r"\b(?:F|V|R|D|P)\d{1,3}\b|\bRUN\b")


# ------------------------------------------------------------------ context


def _screen(text: str | None, limit: int = 400) -> str:
    """Document-derived text is withheld when it addresses an automated reader, and long quotes are cut."""
    if not text:
        return ""
    if INJECTION.search(text):
        return "[text withheld: it quotes a line addressed to automated readers]"
    text = re.sub(r"'([^']{90,})'", "'[long quote withheld]'", text)
    return text[:limit]


def _h(code: str | None) -> str:
    return (code or "").replace("_", " ")


def _doc_status(code: str | None) -> str:
    return DOC_STATUS_WORDS.get(code or "", _h(code))


def _value(v: Any) -> str:
    s = str(v)
    if INJECTION.search(s) or len(s) > 80:
        return "[withheld]"
    return s


def build_context(db: Session, app: Application, question: str = "") -> dict[str, Any]:
    """Evidence items with short ids. Only Pramana's own structured output goes in."""
    rs = active_ruleset()
    rules = rules_by_id(rs)
    run = latest_run(db, app.id)
    findings = run_findings(db, run)
    docs = {d.id: d for d in db.scalars(select(Document).where(Document.application_id == app.id,
                                                                Document.superseded.is_(False)))}
    labels = {k: v.get("label", k) for k, v in rs.doc_types.items()}
    items: dict[str, dict[str, Any]] = {}

    def add(prefix: str, kind: str, text: str, statuses: set[str], target: dict[str, Any], label: str,
            say: str) -> str:
        n = sum(1 for k in items if k.startswith(prefix) and k[len(prefix):].isdigit()) + 1
        iid = f"{prefix}{n}"
        items[iid] = {"id": iid, "kind": kind, "text": text, "statuses": sorted(statuses), "target": target,
                      "label": label, "say": say}
        return iid

    # What officials read now: later manual confirmations and officer reviews applied to the run's statuses
    doc_status = effective_document_status(db, run) if run else {}
    if run:
        s = run.summary or {}
        by_doc = "; ".join(f"{labels.get(d.declared_type, d.declared_type)} {_doc_status(doc_status.get(d.id))}"
                           for d in docs.values() if doc_status.get(d.id))
        items["RUN"] = {"id": "RUN", "kind": "run", "label": "Latest run",
                        "text": f"Latest validation run {run.id}, {round_label(run.round)}, status {run.status}, as of "
                                f"{s.get('as_of')}, ruleset {run.ruleset_id}, {s.get('findings', 0)} findings. "
                                f"Authenticity status by document: {by_doc or 'none recorded'}.",
                        "statuses": [run.status], "target": {"type": "run", "run_id": run.id},
                        "say": f"The latest run is {run.id}, as of {s.get('as_of')}."}

    q = question.lower()
    wanted_types = {t for t, pat in DOC_WORDS.items() if re.search(pat, q)}
    rule_ids: list[str] = []
    for f in findings:
        rid = (f.rule or {}).get("id")
        if rid and rid not in rule_ids:
            rule_ids.append(rid)
    for t in wanted_types:
        for r in rules_needing(rs, t):
            if r["id"] not in rule_ids:
                rule_ids.append(r["id"])
    checklist = {c["rule_id"]: c for c in ((run.summary or {}).get("checklist", []) if run else [])}
    rule_item: dict[str, str] = {}
    for rid in rule_ids[: max(officer_settings().ask_max_rules, len({(f.rule or {}).get("id") for f in findings}))]:
        r = rules.get(rid)
        if not r:
            continue
        c = citation(rs, r)
        needs = sorted({labels[t] for t in labels if r in rules_needing(rs, t)})
        outcome = checklist.get(rid, {}).get("outcome")
        text = (f"Rule {rid}: {r['title']}. Cites {c['doc_title'] or c['doc']}, {c['section']}, page {c['page']}: "
                f"\"{c['quote']}\"" + (f" Depends on: {', '.join(needs)}." if needs else "")
                + (f" Outcome on the latest run: {_h(outcome)}." if outcome else ""))
        rule_item[rid] = add("R", "rule", text, {outcome} if outcome else set(), {"type": "rule", **c}, rid,
                             f"{rid} ({c['section']}, page {c['page']}) says: \"{c['quote']}\"")

    for d in docs.values():
        status = doc_status.get(d.id, "not_checked")
        add("D", "document", f"Document {labels.get(d.declared_type, d.declared_type)} ({d.original_filename}): "
                             f"authenticity status {_doc_status(status)}.{DOC_STATUS_NOTE.get(status, '')}", {status},
            {"type": "document", "document_id": d.id}, labels.get(d.declared_type, d.declared_type),
            f"{labels.get(d.declared_type, d.declared_type)}: {_doc_status(status)}"
            + (", not verified." if status == "officer_reviewed" else "."))

    for f in findings:
        doc = docs.get(f.document_id or "")
        dl = labels.get(doc.declared_type, doc.declared_type) if doc else None
        msg = _screen(f.message)
        if f.code == "SEC-INSTRUCTION-TEXT":
            msg = "A line on the page addresses automated readers; its text is withheld here."
        rid = rule_item.get((f.rule or {}).get("id", ""))
        text = (f"Finding {f.code}: {f.title}." + (f" Document: {dl}." if dl else "") + f" {msg}"
                + (f" Limitation: {_screen(f.limitation, 200)}" if f.limitation else "")
                + f" Severity {f.severity}; evidence class {f.evidence_class}; outcome {_h(f.outcome)}; review status "
                  f"{_h(f.review_status)}." + (f" Rule item {rid}." if rid else ""))
        fid = add("F", "finding", text, {f.outcome, f.review_status}, {"type": "finding", "finding_id": f.id},
                  f.title[:60], f"{f.title}: {msg}")
        items[fid]["related"] = [rid] if rid else []
        items[fid]["code"], items[fid]["document_id"] = f.code, f.document_id
        for e in f.evidence or []:
            if e.get("kind") not in ("region", "revision_diff") or not e.get("page") or not e.get("bbox"):
                continue
            did = e.get("document_id") or f.document_id
            d = docs.get(did or "")
            if not d:
                continue
            if e["kind"] == "region":
                what = f"{e.get('label') or 'value'}" + (f" = {_value(e.get('value'))}" if e.get("value") else "")
            else:
                what = (f"revision {e.get('to_revision')} added '{_value(e.get('added_text'))}' over "
                        f"'{_value(e.get('text_underneath') or e.get('removed_text'))}'")
            if f.code == "SEC-INSTRUCTION-TEXT":
                what = "instruction text (withheld)"
            pid = add("P", "region", f"Page region for {fid}: {labels.get(d.declared_type, d.declared_type)} page "
                               f"{e['page']}, {what}.", {f.outcome},
                {"type": "region", "document_id": did, "page": e["page"], "bbox": e["bbox"],
                 "label": e.get("label") or f.title, "finding_id": f.id},
                f"{labels.get(d.declared_type, d.declared_type)} p.{e['page']}",
                f"On page {e['page']} of the {labels.get(d.declared_type, d.declared_type)}: {what}.")
            items[fid]["related"].append(pid)

    attempts = db.scalars(select(VerificationAttempt).where(VerificationAttempt.run_id == run.id)
                          .order_by(VerificationAttempt.started_at)).all() if run else []
    for v in attempts:
        d = docs.get(v.document_id or "")
        dl = labels.get(d.declared_type, d.declared_type) if d else "document"
        comps = "; ".join(f"{c.get('field')} submitted {_value(c.get('submitted'))} vs record "
                          f"{_value(c.get('authoritative'))} ({'match' if c.get('match') else 'differs'})"
                          for c in (v.comparison or [])[:4])
        sig = v.channel in ("issuer_signature", "applicant_signature")
        sim = (" DEMO trust anchor." if sig else " SIMULATED source.") if v.simulated else ""
        first = _screen(v.detail, 300).split(". ")[0].rstrip(".")
        if v.channel == "officer_review":
            # An official's own examination, which confirms nothing from outside
            vid = add("V", "verification", f"Officer review of {dl} ({v.source_name}): status reviewed by officer. "
                                           f"No issuing body confirmed it. Note: {_screen(v.detail, 300)}",
                      {v.status}, {"type": "verification", "attempt_id": v.id, "document_id": v.document_id},
                      f"{dl}: officer review", f"{dl}: reviewed by officer ({v.source_name}), not verified.")
            items[vid]["document_id"] = v.document_id
            continue
        vid = add("V", "verification", f"Verification of {dl} via {channel_label(v.channel)} ({v.source_name}): "
                                       f"status {_h(v.status)}.{sim} {_screen(v.detail, 300)}"
                                       + (f" Compared: {comps}." if comps else ""),
                  {v.status}, {"type": "verification", "attempt_id": v.id, "document_id": v.document_id},
                  f"{dl}: {channel_label(v.channel)}", f"{dl}, {channel_label(v.channel)}: {_h(v.status)}. {first}.")
        # The finding a run raises for this result, so an answer does not say the same thing twice
        items[vid]["code"] = f"VER-{v.channel.upper()}-{v.status.upper()}"
        items[vid]["document_id"] = v.document_id
    return {"items": items, "run_id": run.id if run else None}


def _prompt(items: dict[str, dict[str, Any]], question: str) -> str:
    lines = "\n".join(f"[{i['id']}] {i['text']}" for i in items.values())
    return f"Evidence items:\n{lines}\n\nQuestion: {question}\nAnswer as JSON: {{\"sentences\": [{{\"text\": " \
           f"\"...\", \"cites\": [\"F1\"]}}]}}"


# ------------------------------------------------------------------ model


def _ollama(prompt: str) -> dict[str, Any]:
    s, o = get_settings(), officer_settings()
    out = _post(f"{s.ollama_url.rstrip('/')}/api/chat", {
        "model": o.ask_model, "stream": False, "think": False, "keep_alive": "5m", "format": SCHEMA,
        "options": {"temperature": 0, "num_ctx": 6144, "num_predict": 400},
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
    }, {}, o.ask_timeout_s)
    return json.loads(out["message"]["content"])


PROVIDERS = {"ollama": _ollama}


def model_name(provider: str) -> str:
    return {"ollama": officer_settings().ask_model}[provider]


def enabled_providers() -> list[str]:
    return [p for p in (x.strip() for x in officer_settings().ask_providers.split(",")) if p in PROVIDERS]


def call_model(prompt: str) -> tuple[list[dict[str, Any]] | None, str | None, list[str]]:
    errors = []
    for p in enabled_providers():
        try:
            out = PROVIDERS[p](prompt)
            sents = out.get("sentences") if isinstance(out, dict) else None
            if isinstance(sents, list):
                return sents, p, errors
            errors.append(f"{p}: output had no sentence list")
        except (urllib.error.URLError, TimeoutError, KeyError, IndexError, json.JSONDecodeError, RuntimeError,
                OSError) as e:
            errors.append(f"{p}: {e}")
    return None, None, errors


# ------------------------------------------------------------------ post-check


def _dates(text: str) -> set[str]:
    out = set()
    for m in DATE_RE.finditer(text):
        g = m.groupdict()
        try:
            if g["iso"]:
                d = date(int(g["y1"]), int(g["m1"]), int(g["d1"]))
            elif g["dmy"]:
                d = date(int(g["y2"]), int(g["m2"]), int(g["d2"]))
            elif g["dmy_t"]:
                d = date(int(g["y3"]), MONTHS[g["m3"][:3].lower()], int(g["d3"]))
            else:
                d = date(int(g["y4"]), MONTHS[g["m4"][:3].lower()], int(g["d4"]))
            out.add(d.isoformat())
        except ValueError:
            out.add(m.group(0))
    return out


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "").rstrip("0").rstrip(".") if "." in n else n.replace(",", "") for n in NUM_RE.findall(text)}


def _strip(text: str) -> str:
    """Text without dates, codes and evidence ids, so the remaining digits are free-standing numbers."""
    text = DATE_RE.sub(" ", text)
    text = CODE_RE.sub(" ", text)
    return ID_RE.sub(" ", text)


def _quoted(text: str, pat: re.Pattern, cited_text: str) -> bool:
    """The status word and the three words after it appear verbatim in a cited item, so it repeats the evidence."""
    norm = " ".join(cited_text.lower().split())
    for m in pat.finditer(text):
        window = " ".join(text[m.start():].lower().split()[:4]).rstrip(".,;:")
        if len(window.split()) >= 3 and window in norm:
            continue
        return False
    return True


def check_sentence(text: str, cites: list[str], items: dict[str, dict[str, Any]]) -> tuple[list[str], str | None]:
    """Returns (valid cites, reason to drop or None)."""
    valid = [c for c in dict.fromkeys(cites or []) if isinstance(c, str) and c in items]
    if not text or not text.strip():
        return valid, "empty sentence"
    if not valid:
        return valid, "no valid citation"
    if FORBIDDEN_WORDS.search(text):
        return valid, "judges a document instead of describing the evidence"
    if DECIDES.search(text):
        return valid, "states or recommends a decision"
    # A finding's own rule and page regions count as part of what it cites
    support = list(dict.fromkeys(valid + [r for c in valid for r in items[c].get("related", [])]))
    cited_text = " ".join(items[c]["text"] for c in support)
    for d in _dates(text) - _dates(cited_text):
        return valid, f"date {d} is not in the cited items"
    upper_cited = cited_text.upper()
    for code in CODE_RE.findall(text):
        if code.upper() not in upper_cited and code not in items:
            return valid, f"reference {code} is not in the cited items"
    allowed = _numbers(_strip(cited_text)) | {p for d in _dates(cited_text) for p in d.split("-")} \
        | {p.lstrip("0") or "0" for d in _dates(cited_text) for p in d.split("-")}
    for n in _numbers(_strip(text)):
        if n not in allowed:
            return valid, f"number {n} is not in the cited items"
    statuses = {s for c in valid for s in items[c]["statuses"]}
    low = text
    for name, pat, support, text_hint in CLAIMS:
        if not pat.search(low):
            continue
        if name == "unverified":
            low = pat.sub(" ", low)
            if statuses and statuses <= VER_SUPPORT:
                return valid, "says not verified, but the cited items are verified"
            continue
        if statuses & support:
            continue
        if text_hint and re.search(text_hint, cited_text, re.I):
            continue
        if _quoted(low, pat, cited_text):
            continue
        return valid, f"says '{pat.search(low).group(0)}', which the cited items do not support"
    return valid, None


# ------------------------------------------------------------------ deterministic answers


def _by_kind(items: dict[str, dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    return [i for i in items.values() if i["kind"] == kind]


def template_answer(items: dict[str, dict[str, Any]], question: str) -> list[dict[str, Any]]:
    """Plain answers to common questions, assembled from the same evidence items."""
    q = question.lower()
    findings, vers, rules, docs = (_by_kind(items, k) for k in ("finding", "verification", "rule", "document"))
    types = [t for t, pat in DOC_WORDS.items() if re.search(pat, q)]
    labels = {t: active_ruleset().doc_types.get(t, {}).get("label", t) for t in types}

    def about(i: dict[str, Any]) -> bool:
        return any(lbl.lower() in i["text"].lower() for lbl in labels.values())

    out: list[dict[str, Any]] = []
    if re.search(r"which rule|what rule|rule.*(need|require)|(need|require).*rule|clause", q) and types:
        for r in [r for r in rules if any(lbl in r["text"] for lbl in labels.values())][:3]:
            out.append({"text": r["say"], "cites": [r["id"]]})
        return out or [{"text": f"No rule in the active ruleset depends on the {', '.join(labels.values())}.",
                        "cites": ["RUN"] if "RUN" in items else []}]
    if re.search(r"unverified|not verified|still|pending|outstanding|open", q) and not types:
        pending = [d for d in docs if d["statuses"] and d["statuses"][0] != "verified"]
        for d in pending[:5]:
            out.append({"text": d["say"], "cites": [d["id"]]})
        if not pending:
            out.append({"text": "Every current document has the authenticity status verified.",
                        "cites": [d["id"] for d in docs][:5]})
        return out
    if re.search(r"chang|modif|overwr|revision|after sign|edit|tamper", q):
        hits = [f for f in findings if re.search(r"FX-|modified after signing|overwrit|revision", f["text"])]
        for f in hits[:4]:
            out.append({"text": f["say"], "cites": [f["id"]]})
        regions = [p for p in _by_kind(items, "region") if any(f"for {f['id']}" in p["text"] for f in hits)]
        if regions:
            out.append({"text": regions[0]["say"], "cites": [regions[0]["id"]]})
        return out or [{"text": "No finding on the latest run reports a change after signing.",
                        "cites": ["RUN"] if "RUN" in items else []}]
    picked = [f for f in findings if about(f)] if types else findings
    for f in picked[:3]:
        out.append({"text": f["say"], "cites": [f["id"]]})
    said = {(f.get("code"), f.get("document_id")) for f in picked[:3]}
    vs = [v for v in vers if about(v) and v["statuses"] and v["statuses"][0] != "not_checked"
          and (v.get("code"), v.get("document_id")) not in said] if types else []
    for v in vs[:2]:
        out.append({"text": v["say"], "cites": [v["id"]]})
    if not out:
        out.append({"text": "No finding on the latest run matches this question." if types else
                    "The latest run raised no findings.", "cites": ["RUN"] if "RUN" in items else []})
    return out


# ------------------------------------------------------------------ answer


def _check_all(raw: list[Any], items: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    kept, dropped = [], []
    for n, s in enumerate(raw):
        text = str(s.get("text", "")).strip() if isinstance(s, dict) else ""
        cites = s.get("cites") if isinstance(s, dict) and isinstance(s.get("cites"), list) else []
        valid, reason = check_sentence(text, cites, items) if n < MAX_SENTENCES else ([], "over the sentence limit")
        if reason:
            dropped.append({"text": text[:300], "cites": [str(c) for c in cites][:6], "reason": reason})
        else:
            # Deterministic links from a cited finding to its rule and page regions, shown as extra chips
            related = [r for c in valid for r in items[c].get("related", []) if r not in valid]
            kept.append({"text": text, "cites": valid, "related": list(dict.fromkeys(related))[:3]})
    return kept, dropped


def answer(db: Session, app: Application, question: str, *, use_model: bool = True) -> dict[str, Any]:
    t0 = time.perf_counter()
    ctx = build_context(db, app, question)
    items = ctx["items"]
    raw, provider, errors = (call_model(_prompt(items, question)) if use_model else (None, None, []))
    mode = "model" if raw is not None else "template"
    fallback = None if raw is not None else ("no model reachable" if use_model else "model not used")
    kept, dropped = _check_all(raw if raw is not None else template_answer(items, question), items)
    proposed, first_kept = len(kept) + len(dropped), len(kept)
    if mode == "model" and not kept:
        # Every model sentence failed the evidence check: answer from the templates and keep the drops visible
        kept, extra = _check_all(template_answer(items, question), items)
        dropped += extra
        mode, fallback = "template", "the model's sentences did not pass the evidence check"
    used = {c for s in kept for c in s["cites"] + s["related"]}
    return {
        "question": question, "mode": mode, "provider": provider,
        "model": model_name(provider) if provider else None,
        "sentences": kept, "dropped": dropped, "dropped_count": len(dropped), "proposed_count": proposed,
        "fallback": fallback, "first_pass_kept": first_kept,
        "evidence": {k: {kk: v[kk] for kk in ("id", "kind", "label", "text", "target")} for k, v in items.items()
                     if k in used},
        "context_items": len(items), "errors": errors, "run_id": ctx["run_id"],
        "latency_ms": round((time.perf_counter() - t0) * 1000),
        "notice": "Explains existing findings, decides nothing. Evidence class: model.",
    }
