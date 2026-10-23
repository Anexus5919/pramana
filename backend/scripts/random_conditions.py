"""The catalogue of conditions a randomised world can plant.

Each kind changes the plan of one application (and, for cross-application kinds, a partner) and returns the
findings that must follow: `planted` on the target, `partner` on the other application, and `side_effect`
for consequences fixed before any run (a reused photo keeps its old geotag, for example). Rule and
year-over-year side effects that follow from the plan are added by random_world from
random_plan.derived_codes and attributed to the condition whose slots they depend on.

Slots keep two conditions from editing the same document or value on one application.
"""

import math
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from random_identity import COMMON_LABS, INSTRUCTION_LINES, PROGRAMMES, add_years, haversine_km, offset
from random_plan import (
    COVER,
    DEADLINE,
    SESSION_END,
    SESSION_START,
    SSC_DAYS,
    App,
    World,
    bandwidth_tier,
    fire_number,
    fire_spec,
    genuine_fire,
    new_photo,
    required_faculty,
)

OTHER_FONTS = ["ArialMT", "TimesNewRomanPSMT", "Calibri", "Verdana", "CourierNewPSMT"]
OUTAGES = [("FIRE-SERVICES", "fire"), ("MUNICIPAL-OC", "oc"), ("SHCIL-ESTAMP", "aff"), ("ICAI-UDIN", "acc")]


def E(a: App, code: str, role: str = "planted", why: str = "") -> dict[str, str]:
    return {"app": a.key, "code": code, "role": role, "why": why}


def pair(a: App, b: App, main: str, note: str) -> list[dict[str, str]]:
    """The later submission carries the main finding and the earlier one a low note, whoever copied."""
    later, earlier = (a, b) if a.submitted > b.submitted else (b, a)
    return [E(later, main, "planted" if later is a else "partner"),
            E(earlier, note, "planted" if earlier is a else "partner")]


@dataclass(frozen=True)
class Kind:
    name: str
    title: str
    slots: tuple[str, ...]
    apply: Callable[[World, App, App | None], list[dict[str, str]]]
    eligible: Callable[[World, App], bool] = lambda w, a: True
    partner_slots: tuple[str, ...] = ()
    partner_ok: Callable[[World, App, App], bool] | None = None
    side_effects: str = ""
    weight: float = 1.0  # raised for kinds only a few applications are eligible for


def _fire(w: World, a: App, g: dict) -> None:
    a.fire = fire_spec(w, a, g)
    a.decl["fire_noc_number"] = g["number"]


def fire_expired(w, a, b):
    _fire(w, a, genuine_fire(w, a, expired=True))
    out = [E(a, "APH-617I-FIRE-VALID"), E(a, "VER-ISSUER_REGISTRY-EXPIRED")]
    return out + ([E(a, "VER-SIGNED_QR-EXPIRED")] if a.fire["qr"] else [])


def overwritten(other_font: bool):
    def apply(w, a, b):
        expired = w.rng.random() < 0.6
        g = genuine_fire(w, a, expired=expired)
        _fire(w, a, g)
        font = w.rng.choice(OTHER_FONTS) if other_font else "Helvetica"
        a.fire.update(sign="issuer", tamper={"new": add_years(g["valid"], w.rng.choice([1, 2, 3])), "font": font})
        out = [E(a, c) for c in ("VER-ISSUER_SIGNATURE-MISMATCH_DETECTED", "FX-FIELD-OVERWRITTEN",
                                 "FX-PDF-REVISION-TEXT-CHANGE", "FX-PDF-OVERLAID-TEXT", "FX-PDF-WHITEOUT")]
        if other_font:
            out.append(E(a, "FX-FONT-MISMATCH"))
        if expired:
            out += [E(a, "APH-617I-FIRE-VALID"), E(a, "VER-ISSUER_REGISTRY-EXPIRED")]
            out += [E(a, "VER-SIGNED_QR-EXPIRED")] if a.fire["qr"] else []
        return out
    return apply


def fire_unknown_number(w, a, b):
    _fire(w, a, genuine_fire(w, a))
    a.fire.update(registry=None, qr=None, sign="applicant", genuine=None)
    return [E(a, "VER-ISSUER_REGISTRY-MISMATCH_DETECTED"), E(a, "VER-ISSUER-SIGNATURE-ABSENT")]


def copied_ok(w, a, b):
    s = b.fire
    return (s["layout"] == "standard" and s["registry"] is not None and s["office"] == b.inst.key
            and s["issue"] <= a.as_of and s["valid"] >= a.as_of + timedelta(days=20))


def fire_copied(w, a, b):
    s = b.fire
    a.fire = {"layout": "standard", "number": s["number"], "issue": s["issue"], "valid": s["valid"],
              "issued_to": a.inst.name, "office": b.inst.key, "seal_of": b.inst.key,
              "qr": dict(s["qr"]) if s["qr"] else None, "sign": "applicant", "registry": None, "tamper": None,
              "injection": None, "genuine": None, "readable": True}
    a.decl["fire_noc_number"] = s["number"]
    out = [E(a, "VER-ISSUER_REGISTRY-MISMATCH_DETECTED"), E(a, "XA-SHARED-CERTIFICATE-NUMBER"),
           E(a, "XA-NEAR-DUPLICATE-DETAILS"), E(a, "VER-ISSUER-SIGNATURE-ABSENT"),
           E(b, "XA-SHARED-CERTIFICATE-NUMBER", "partner"),
           E(b, "XA-NEAR-DUPLICATE-DETAILS", "partner")]
    return out + ([E(a, "VER-SIGNED_QR-MISMATCH_DETECTED")] if s["qr"] else [])


def fire_qr_mismatch(w, a, b):
    g = genuine_fire(w, a, expired=w.rng.random() < 0.4)
    _fire(w, a, g)
    a.fire["qr"] = {"number": g["number"], "name": a.inst.name, "issue": g["issue"], "valid": g["valid"]}
    k = 1
    while add_years(g["valid"], k) < SESSION_END + COVER:
        k += 1
    a.fire.update(valid=add_years(g["valid"], k + w.rng.choice([0, 1])), sign="applicant")
    return [E(a, "VER-SIGNED_QR-MISMATCH_DETECTED"), E(a, "VER-ISSUER_REGISTRY-MISMATCH_DETECTED"),
            E(a, "VER-ISSUER-SIGNATURE-ABSENT")]


def fire_after_submission(w, a, b):
    issue = a.as_of + timedelta(days=w.rng.randint(5, 45))
    valid = add_years(issue, w.rng.choice([2, 3, 5])) - timedelta(days=1)
    _fire(w, a, {"number": fire_number(w, a.inst, issue.year), "issue": issue, "valid": valid})
    return [E(a, "APH-A31D-FIRE-BEFORE")]


def fire_other_name(w, a, b):
    _fire(w, a, genuine_fire(w, a))
    other, _ = w.ids.institution_name(a.inst.city)
    a.fire["issued_to"] = other
    a.fire["registry"]["name"] = other
    if a.fire["qr"]:
        a.fire["qr"]["name"] = other
    return [E(a, "XD-FIRE-INSTITUTION")]


def variant(instruction: bool):
    def apply(w, a, b):
        _fire(w, a, genuine_fire(w, a))
        a.fire.update(layout="variant", qr=None, sign="issuer", readable=False,
                      injection=w.rng.choice(INSTRUCTION_LINES) if instruction else None)
        out = [E(a, c) for c in ("APH-617I-FIRE-VALID", "APH-A31D-FIRE-BEFORE", "XD-FIRE-INSTITUTION",
                                 "VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED")]
        return out + ([E(a, "SEC-INSTRUCTION-TEXT")] if instruction else [])
    return apply


def seal_ok(w, a, b):
    # The source seal's city has one institution, so exactly two issuers carry that image
    return (b.inst.city != a.inst.city and w.city_count(b.inst.city) == 1 and b.submitted != a.submitted
            and b.fire["layout"] == "standard" and b.fire["seal_of"] == b.inst.key and b.fire["office"] == b.inst.key)


def seal_other_issuer(w, a, b):
    _fire(w, a, genuine_fire(w, a))
    a.fire.update(seal_of=b.inst.key, sign="applicant")
    return pair(a, b, "FX-SEAL-REUSED", "FX-SEAL-REUSED-LATER") + [E(a, "VER-ISSUER-SIGNATURE-ABSENT")]


def cert_lapses_in_session(w, a, b):
    """A genuine fire NOC, valid on the submission date, that lapses before the session starts or during it."""
    r = w.rng
    if r.random() < 0.3:
        valid = a.as_of + timedelta(days=r.randint(30, max(31, (SESSION_START - a.as_of).days - 30)))
    else:
        valid = SESSION_START + timedelta(days=r.randint(15, (SESSION_END - SESSION_START).days - 30))
    term = 1
    while add_years(valid + timedelta(days=1), -term) > a.as_of - timedelta(days=20):
        term += 1
    issue = add_years(valid + timedelta(days=1), -term)
    _fire(w, a, {"number": fire_number(w, a.inst, issue.year), "issue": issue, "valid": valid})
    return [E(a, "XD-CERT-EXPIRES-IN-SESSION")]


def yoy_cert_reused(w, a, b):
    g = genuine_fire(w, a)
    _fire(w, a, g)
    a.prev_over["fire_cert"] = {"number": g["number"],
                                "valid_until": add_years(g["valid"], -w.rng.choice([1, 2])).isoformat()}
    return [E(a, "YOY-CERT-REUSED-NEW-VALIDITY")]


def _old_building(w, a):
    issue = a.as_of - timedelta(days=w.rng.randint(int(31.5 * 365.25), int(48 * 365.25)))
    a.oc["issue"] = issue
    a.oc["registry"]["issue"] = issue
    a.oc["number"] = w.ids.number(w.oc_fmt[a.inst.st], a.inst.city, a.inst.st, issue.year)
    a.inst.est = max(1950, issue.year - w.rng.randint(0, 2))


def _ssc(w, a, days: tuple[int, int]) -> None:
    r = w.rng
    pool = w.engineers.setdefault(a.inst.city, [
        w.ids.unique(lambda: f"SE/{w.ids.city_code(a.inst.city)}/{r.randint(1998, 2020)}/{w.ids.digits(4)}")
        for _ in range(r.randint(1, 3))])
    issue = a.as_of - timedelta(days=r.randint(*days))
    a.ssc = {"number": w.ids.unique(lambda: f"SSC/{issue.year}/{w.ids.digits(r.choice([3, 4]))}"), "issue": issue,
             "reg": r.choice(pool)}


def ssc_missing(w, a, b):
    _old_building(w, a)
    return [E(a, "APH-A21-SSC-REQUIRED")]


def ssc_pending(w, a, b):
    _old_building(w, a)
    # Issued recently enough that its five years outlast the session
    _ssc(w, a, (180, (a.as_of - (SESSION_END + COVER - timedelta(days=SSC_DAYS))).days))
    return [E(a, "VER-ISSUER_REGISTRY-VERIFICATION_PENDING")]


def ssc_expired(w, a, b):
    _old_building(w, a)
    _ssc(w, a, (int(5.5 * 365), 9 * 365))
    return [E(a, "APH-617H-SSC-VALID"), E(a, "VER-ISSUER_REGISTRY-VERIFICATION_PENDING")]


def oc_area_exceeded(w, a, b):
    a.decl["built_up_area_sqm"] = int(a.oc["area"] * w.rng.uniform(1.05, 1.3)) // 10 * 10
    return [E(a, "XD-OC-AREA")]


def oc_other_name(w, a, b):
    other, _ = w.ids.institution_name(a.inst.city)
    a.oc["name"] = other
    a.oc["registry"]["name"] = other
    return [E(a, "XD-OC-INSTITUTION")]


def yoy_land(w, a, b):
    a.prev_over["land"] = round(a.decl["land_area_acres"] + w.rng.uniform(0.5, 5.0), 1)
    return [E(a, "YOY-LAND-AREA-DECREASED")]


def yoy_built(w, a, b):
    a.prev_over["built"] = a.decl["built_up_area_sqm"] + w.rng.randint(30, 300) * 10
    return [E(a, "YOY-BUILT-UP-AREA-DECREASED")]


def intake_above_record(w, a, b):
    p = w.rng.choice(a.progs)
    p["approved_intake"] += w.rng.choice([30, 60])
    p["proposed_intake"] = p["approved_intake"]
    return [E(a, "XR-INTAKE-RECORD"), E(a, "XR-EOA-NO-INCREASE"), E(a, "YOY-INTAKE-JUMP")]


def eoa_seat_increase(w, a, b):
    p = w.rng.choice(a.progs)
    p["proposed_intake"] += w.rng.choice([30, 60])
    return [E(a, "XR-EOA-NO-INCREASE"), E(a, "YOY-INTAKE-JUMP")]


def core_branches_unmet(w, a, b):
    r = w.rng
    used = {p["code"] for p in a.progs}
    spare = [c for c in ("IT", "AI", "CE") if c not in used]
    r.shuffle(spare)
    noncs = [i for i, p in enumerate(a.progs) if p["core"] and not p["cs_allied"]]
    keep = r.choice([0, 1])
    for i in r.sample(noncs, len(noncs))[keep:]:
        if not spare:
            break
        code = spare.pop()
        name, core, cs, _ = PROGRAMMES[code]
        old = a.progs[i]["code"]
        for p in (a.progs[i], a.record[i]):
            p.update(code=code, name=name, core=core, cs_allied=cs)
        if a.nba and a.nba["prog"] == old:
            a.nba["prog"] = code
    a.decl["labs"] = COMMON_LABS + [lab for p in a.progs for lab in PROGRAMMES[p["code"]][3]]
    return [E(a, "ADD26-26C-CORE-BRANCHES")]


def nba_unsupported(w, a, b):
    p = w.rng.choice([p for p in a.progs if not p["nba_accredited"]])
    p["nba_accredited"] = True
    return [E(a, "XR-NBA-CLAIMS")]


def bandwidth_short(w, a, b):
    tier = bandwidth_tier(sum(p["approved_intake"] for p in a.progs))
    a.decl["internet_bandwidth_mbps"] = w.rng.choice([v for v in (50, 64, 80, 100, 150, 200, 250, 300, 400)
                                                      if v < tier])
    return [E(a, "APH-ANX41-BANDWIDTH")]


def admin_area_short(w, a, b):
    if w.rng.random() < 0.5:
        a.decl["administrative_area_sqm"] = w.rng.randint(500, 740)
    else:
        a.decl["amenities_area_sqm"] = w.rng.randint(300, 490)
    return [E(a, "APH-ANX33-ADMIN-AREA")]


def affidavit_unsigned(w, a, b):
    a.aff["signed"] = False
    return [E(a, "APH-639-AFF2-DSC")]


def affidavit_other_app(w, a, b):
    a.aff["app_id"] = a.prev_id
    return [E(a, "XD-AFF2-APPLICATION")]


def ter_not_received(w, a, b):
    status = w.rng.choice(["Pending", "Failed"])
    a.ter["status"] = status
    a.ter["ledger"]["status"] = status
    return [E(a, "APH-232D-TER-STATUS")]


def ter_receipt_mismatch(w, a, b):
    if w.rng.random() < 0.5:
        a.ter["ledger"]["amount"] = a.ter["amount"] // 2
    else:
        a.ter["txn"] = w.ids.txn()
    return [E(a, "XR-TER-RECEIPT-MATCH")]


def accounts_wrong_year(w, a, b):
    fy = w.rng.choice(["2023-24", "2022-23"])
    a.acc.update(fy=fy, udin=w.ids.udin(fy[-2:]))
    return [E(a, "XD-ACCOUNTS-ENTITY")]


def accounts_other_entity(w, a, b):
    a.acc["entity"] = w.ids.society(w.rng.choice([c for c in ("Pragati", "Unnati", "Sanjeevani", "Navodaya",
                                                              "Abhyudaya", "Kamadhenu") if c != a.inst.core]))
    return [E(a, "XD-ACCOUNTS-ENTITY")]


def satmap_off_site(w, a, b):
    lat, lon = offset(a.inst.lat, a.inst.lon, w.rng.uniform(0.8, 5.0), w.rng.uniform(0, 360))
    a.sat = {"lat": lat, "lon": lon}
    return [E(a, "XD-SATMAP-LOCATION")]


def faculty_short(w, a, b):
    need = required_faculty(a.progs)
    a.roster = a.roster[:need - w.rng.randint(1, max(1, min(8, need // 4)))]
    a.decl["faculty_count"] = len(a.roster)
    return [E(a, "APH-ANX5-FSR")]


def faculty_shared(w, a, b):
    k = w.rng.randint(1, min(4, len(b.roster)))
    roster = list(a.roster)
    for i, row in zip(w.rng.sample(range(len(roster)), k), w.rng.sample(b.roster, k), strict=True):
        roster[i] = dict(row)
    a.roster = roster
    return [E(a, "XA-FACULTY-MULTIPLE-INSTITUTIONS"), E(a, "XA-FACULTY-REGISTERED-ELSEWHERE"),
            E(b, "XA-FACULTY-MULTIPLE-INSTITUTIONS", "partner")]


def faculty_turnover(w, a, b):
    a.prev_over["moved"] = math.ceil(w.rng.uniform(0.55, 0.85) * len(a.own))
    return [E(a, "YOY-FACULTY-TURNOVER")]


def faculty_count_mismatch(w, a, b):
    a.decl["faculty_count"] = len(a.roster) + w.rng.randint(2, 12)
    return [E(a, "XD-FACULTY-COUNT")]


def photo_ok(w, a, b):
    return b.submitted != a.submitted and haversine_km((a.inst.lat, a.inst.lon), (b.inst.lat, b.inst.lon)) > 5


def photo_reused(w, a, b):
    if not b.photos:
        b.photos.append(new_photo(w, b))
    src = b.photos[0]
    km = haversine_km(src["gps"], (a.inst.lat, a.inst.lon))
    a.photos = [{"name": w.rng.choice(["lab_photo.jpg", "classroom.jpg", "computer_lab_2.jpg"]),
                 "reuse_of": {"app": b.key, "name": src["name"]}, "quality": w.rng.randint(60, 85),
                 "scale": round(w.rng.uniform(0.6, 0.95), 2), "gps": src["gps"]}]
    return pair(a, b, "XA-PHOTO-REUSED", "XA-PHOTO-REUSED-LATER") + [
        E(a, "FX-IMG-GEOTAG-FAR", "side_effect", f"the copy keeps {b.key}'s geotag, {km:.0f} km from this campus")]


def photo_geotag_far(w, a, b):
    a.photos = [new_photo(w, a, km=(5.0, 500.0))]
    return [E(a, "FX-IMG-GEOTAG-FAR")]


def photo_c2pa_edited(w, a, b):
    ph = new_photo(w, a)
    ph.update(c2pa=True, edit_after_signing=True)
    a.photos = [ph]
    return [E(a, "PH-C2PA-MODIFIED-AFTER-SIGNING")]


def outage_ok(w, a):
    return any(slot not in a.slots for _, slot in OUTAGES)


def registry_outage(w, a, b):
    code, slot = w.rng.choice([o for o in OUTAGES if o[1] not in a.slots])
    a.slots.add(slot)
    a.down = [code]
    return [E(a, "VER-ISSUER_REGISTRY-SOURCE_UNAVAILABLE", why=f"{code} did not respond during validation")]


def unsigned_ok(w, a):
    return "fire" not in a.slots or "oc" not in a.slots


def issuer_unsigned(w, a, b):
    """A genuine fire NOC or occupancy certificate uploaded without the issuer's signature: unsigned, or signed only
    with the applicant's DSC, as a re-saved or printed-to-PDF copy would be."""
    slot = w.rng.choice([s for s in ("fire", "oc") if s not in a.slots])
    a.slots.add(slot)
    sign = w.rng.choice([None, "applicant"])
    if slot == "fire":
        a.fire["sign"] = sign
    else:
        a.oc["sign"] = False if sign is None else "applicant"
    return [E(a, "VER-ISSUER-SIGNATURE-ABSENT", why=f"{slot} uploaded {'unsigned' if sign is None else 'with the applicant DSC only'}")]


def late_submission(w, a, b):
    return [E(a, "PN2627-DEADLINE")]


def _eoa(w, a):
    return a.category == "EOA"


KINDS = [
    Kind("fire_expired", "Fire NOC expired before submission", ("fire",), fire_expired),
    Kind("fire_overwritten_same_font", "Fire NOC validity overwritten after issuer signing, same font", ("fire",),
         overwritten(False), side_effects="expiry findings when the original validity had ended"),
    Kind("fire_overwritten_other_font", "Fire NOC validity overwritten after issuer signing, in another font",
         ("fire",), overwritten(True), side_effects="expiry findings when the original validity had ended"),
    Kind("fire_unknown_number", "Fire NOC the issuer has no record of, signed only by the applicant", ("fire",),
         fire_unknown_number),
    Kind("fire_copied", "Fire NOC copied from another application with the name changed and its QR pasted",
         ("fire",), fire_copied, partner_slots=("fire",), partner_ok=copied_ok),
    Kind("fire_qr_mismatch", "Printed fire NOC validity differs from its issuer-signed QR", ("fire",),
         fire_qr_mismatch, eligible=lambda w, a: w.fire_qr[a.inst.st],
         side_effects="YOY-CERT-REUSED-NEW-VALIDITY when last year's application carried the same number"),
    Kind("fire_after_submission", "Fire NOC issued after the application was submitted", ("fire",),
         fire_after_submission),
    Kind("fire_other_name", "Fire NOC issued to a different institution name", ("fire",), fire_other_name),
    Kind("fire_variant_layout", "Valid fire NOC in an issuer layout the patterns do not know", ("fire",),
         variant(False)),
    Kind("fire_variant_instruction", "Unfamiliar fire NOC layout with a line addressed to automated readers",
         ("fire",), variant(True)),
    Kind("seal_other_issuer", "Fire NOC carrying another city's fire brigade seal", ("fire", "date"),
         seal_other_issuer, partner_slots=("fire", "date"), partner_ok=seal_ok),
    Kind("cert_lapses_in_session", "Fire NOC valid at submission that lapses before or during the session",
         ("fire",), cert_lapses_in_session),
    Kind("yoy_cert_reused", "Fire NOC number from last year returns with a new validity", ("fire",),
         yoy_cert_reused),
    Kind("ssc_missing", "Building over 30 years old without a Structural Stability Certificate", ("ssc",),
         ssc_missing),
    Kind("ssc_pending", "Structural engineer register confirms asynchronously (pending)", ("ssc",), ssc_pending),
    Kind("ssc_expired", "Structural Stability Certificate older than five years", ("ssc",), ssc_expired),
    Kind("oc_area_exceeded", "Declared built-up area beyond the occupancy certificate", ("area",),
         oc_area_exceeded),
    Kind("oc_other_name", "Occupancy certificate in another institution's name", ("oc",), oc_other_name),
    Kind("yoy_land_decreased", "Declared land area smaller than last year", ("land",), yoy_land),
    Kind("yoy_built_up_decreased", "Declared built-up area smaller than last year", ("area",), yoy_built),
    Kind("intake_above_record", "Approved intake declared above the AICTE record", ("intake",),
         intake_above_record, eligible=_eoa,
         side_effects="APH-ANX5-FSR and APH-ANX41-BANDWIDTH when the inflated intake raises the norm"),
    Kind("eoa_seat_increase", "Extension of Approval proposing more seats than approved", ("intake",),
         eoa_seat_increase, eligible=_eoa),
    Kind("core_branches_unmet", "Intake increase without three core branches, two outside CS", ("intake",),
         core_branches_unmet, eligible=lambda w, a: a.category == "INCREASE_INTAKE", weight=4.0),
    Kind("nba_unsupported", "NBA accreditation claimed without a register entry", ("nba",), nba_unsupported,
         eligible=lambda w, a: any(not p["nba_accredited"] for p in a.progs)),
    Kind("bandwidth_short", "Internet bandwidth below the handbook tier", ("bw",), bandwidth_short),
    Kind("admin_area_short", "Administrative or amenities area below the norm", ("admin", "intake"),
         admin_area_short, eligible=lambda w, a: sum(p["approved_intake"] for p in a.progs) <= 300),
    Kind("affidavit_unsigned", "Affidavit 2 without a digital signature", ("aff",), affidavit_unsigned),
    Kind("affidavit_other_app", "Affidavit 2 generated for last year's application", ("aff",), affidavit_other_app),
    Kind("ter_not_received", "TER fee not received according to the ledger", ("ter",), ter_not_received),
    Kind("ter_receipt_mismatch", "TER receipt disagrees with the ledger (amount or transaction)", ("ter",),
         ter_receipt_mismatch),
    Kind("accounts_wrong_year", "Audited accounts for an earlier financial year", ("acc",), accounts_wrong_year),
    Kind("accounts_other_entity", "Audited accounts of another trust or society", ("acc",), accounts_other_entity),
    Kind("satmap_off_site", "Satellite map point away from the campus on record", ("sat",), satmap_off_site),
    Kind("faculty_short", "Faculty below the faculty-student ratio", ("fac",), faculty_short,
         side_effects="YOY-FACULTY-TURNOVER when the dropped names push last year's roster past half gone"),
    Kind("faculty_shared", "Faculty also listed and registered by another application", ("fac",), faculty_shared,
         partner_slots=("fac",), partner_ok=lambda w, a, b: len(b.roster) >= 4),
    Kind("faculty_turnover", "More than half of last year's faculty roster replaced", ("fac",), faculty_turnover),
    Kind("faculty_count_mismatch", "Declared faculty count differs from the roster", ("fac",),
         faculty_count_mismatch),
    Kind("photo_reused", "Infrastructure photo reused from another application", ("photo", "date"), photo_reused,
         partner_slots=("photo", "date"), partner_ok=photo_ok,
         side_effects="FX-IMG-GEOTAG-FAR, since the copy keeps the other campus's geotag"),
    Kind("photo_geotag_far", "Photo geotag far from the campus", ("photo",), photo_geotag_far),
    Kind("photo_c2pa_edited", "Photo edited after its Content Credentials were signed", ("photo",),
         photo_c2pa_edited),
    Kind("registry_outage", "Issuer registry unavailable during validation", ("registry",), registry_outage,
         eligible=outage_ok),
    Kind("issuer_unsigned", "Fire NOC or occupancy certificate without the issuer's signature", ("unsigned",),
         issuer_unsigned, eligible=unsigned_ok),
    Kind("late_submission", "Application submitted after the deadline", ("date",), late_submission,
         eligible=lambda w, a: a.submitted > DEADLINE),
]
BY_NAME = {k.name: k for k in KINDS}


def catalogue() -> list[dict[str, Any]]:
    return [{"kind": k.name, "title": k.title, "slots": list(k.slots), "partner_slots": list(k.partner_slots),
             "cross_application": bool(k.partner_ok), "side_effects": k.side_effects, "weight": k.weight}
            for k in KINDS]
