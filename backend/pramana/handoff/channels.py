"""Channels that take a prepared report towards the Executive Committee.

A channel is offered every new report. The manual channel sends nothing: an officer or administrator forwards the
report and records the date, a reference number and a note. AictePortalChannel is the connector to the AICTE web
portal, designed and documented but not built, because the portal offers no public interface to send to. Nothing
is ever shown as sent unless a channel that sends reported a delivery.
"""

import logging
from dataclasses import dataclass
from typing import Any, Protocol

from sqlalchemy.orm import Session

from .models import EcReport
from .settings import handoff_settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Delivery:
    """What a channel did with one report."""

    channel: str
    sent: bool
    detail: str
    reference: str | None = None


class HandoffChannel(Protocol):
    name: str
    label: str
    # Built and usable; a channel that is not is skipped with a warning
    available: bool
    # Transmits the report by itself, as opposed to waiting for an official's record
    sends: bool

    def offer(self, db: Session, report: EcReport, pdf: bytes, pack: bytes) -> Delivery:
        """Take the report. A channel that sends records the forwarding itself; the caller commits."""
        ...


class ManualChannel:
    """An official forwards the report (on the AICTE portal, by letter or by hand) and records it in Pramana."""

    name = "manual"
    label = "Recorded by an official"
    available = True
    sends = False

    def offer(self, db: Session, report: EcReport, pdf: bytes, pack: bytes) -> Delivery:
        return Delivery(self.name, False, "Waiting for an officer or administrator to record the forwarding.")


class AictePortalChannel:
    """Designed, not built: the report placed on the AICTE web portal for the Executive Committee's agenda.

    AICTE's portal publishes no interface for this, so the endpoint, its credentials and its acknowledgment would be
    agreed with AICTE (the Regulation Bureau and NIC). What it would send, for each report version, in one HTTPS
    request:
    - metadata: format, report id and version, application id, the institution's AICTE id, academic year, round,
      outcome code and label, prepared_at, report_sha256, pdf_sha256, pack_zip_sha256, pack_manifest_sha256 and the
      audit public key that signs the evidence pack;
    - the report PDF, the report record as canonical JSON (its SHA-256 is report_sha256) and the signed evidence
      pack ZIP, which carries no original documents.
    Nothing goes to the institution through this channel; its letter comes from AICTE after the decision.

    How to switch it on:
    1. Agree the endpoint and the acknowledgment format with AICTE. Authenticate with mutual TLS: a client
       certificate issued for this deployment, its private key read from the secret store at run time (never
       committed). Send the report id as an idempotency key, so a retry never places the report twice.
    2. Implement offer() with that request. On an acknowledgment, add an EcForwarding with channel "aicte_portal",
       sent_by_pramana true, today's date and the portal's reference number, and record an `ec_report.forwarded`
       audit event with the reference and the SHA-256 of the acknowledgment. On a failure record
       `ec_report.send_failed` and leave the report Ready, so an official can still forward it by hand; retry
       through the job queue (pramana.jobs) with a back-off.
    3. Set `available = True` and add "aicte_portal" to PRAMANA_HANDOFF_CHANNELS. Until then naming it there only
       logs a warning: the report stays Ready and nothing reads as sent.
    """

    name = "aicte_portal"
    label = "AICTE web portal (not connected)"
    available = False
    sends = True

    def offer(self, db: Session, report: EcReport, pdf: bytes, pack: bytes) -> Delivery:
        raise NotImplementedError("the AICTE portal connector is designed but not built; see AictePortalChannel")


_REGISTRY: dict[str, HandoffChannel] = {"manual": ManualChannel(), "aicte_portal": AictePortalChannel()}
_warned: set[str] = set()


def configured() -> list[str]:
    return [n.strip() for n in handoff_settings().handoff_channels.split(",") if n.strip()]


def channels() -> list[HandoffChannel]:
    """The configured channels that are built; the others are skipped with one warning each."""
    out = []
    for name in configured():
        ch = _REGISTRY.get(name)
        if ch is None or not ch.available:
            if name not in _warned:
                _warned.add(name)
                log.warning("handoff channel %r is not available; skipped", name)
            continue
        out.append(ch)
    return out


def offer_all(db: Session, report: EcReport, pdf: bytes, pack: bytes) -> list[Delivery]:
    """Offer a new report to every channel. A channel named but not built is reported, never used."""
    built = {c.name for c in channels()}
    out = []
    for name in configured():
        if name in built:
            out.append(_REGISTRY[name].offer(db, report, pdf, pack))
        else:
            out.append(Delivery(name, False, "Not available: this channel is designed but not built."
                                if name in _REGISTRY else "Unknown channel; skipped."))
    if "manual" not in built:
        # Forwarding by hand is always possible, so a report never waits on a channel that cannot send
        out.append(ManualChannel().offer(db, report, pdf, pack))
    return out


def describe() -> list[dict[str, Any]]:
    """Each configured channel for the officer's screen, plus the manual one that is always there."""
    names = list(dict.fromkeys([*configured(), "manual"]))
    rows = []
    for n in names:
        ch = _REGISTRY.get(n)
        rows.append({"name": n, "label": ch.label if ch else n, "available": bool(ch and ch.available),
                     "sends": bool(ch and ch.sends)})
    return rows
