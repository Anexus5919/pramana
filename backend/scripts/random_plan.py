"""The plan of a randomised world before any document is drawn.

An application starts clean: every document genuine, every declared value consistent with the records and
the handbook norms. Conditions from random_conditions then change the plan, and random_world draws the
documents from it. `derived_codes` restates, from the plan alone, which rule and year-over-year findings
the world implies; the generator uses it to check the answer key, never the pipeline's output.
"""

import math
import random
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any

from random_identity import (
    CITIES,
    COMMON_LABS,
    FIRE_FORMATS,
    INTAKES,
    NBA_FORMATS,
    OC_FORMATS,
    PROGRAMMES,
    Identities,
    add_years,
    haversine_km,
    offset,
)

DEADLINE = date(2026, 1, 20)  # PN2627-DEADLINE
# The portal opened with the 2026-27 public notice on 26 Nov 2025, which is also when the rules take effect
ON_TIME = (date(2025, 11, 27), DEADLINE)
LATE = (date(2026, 1, 23), date(2026, 2, 27))
PREV_WINDOW = (date(2024, 11, 18), date(2024, 12, 31))
PREVIOUS_FY = "2024-25"  # for as-of dates from April 2025 to March 2026
RATIO, YEARS = 20, 4  # UG_ET faculty-student ratio and programme duration (ruleset norms)
BANDWIDTH_TIERS = [(300, 100), (600, 300), (900, 500), (999999, 1000)]
TURNOVER_THRESHOLD = 0.5
STATUS_OK = ("Payment Received", "Payment Not Applicable")

# Rule and year-over-year codes the plan can restate; every other code comes only from a condition
DERIVED = {"APH-ANX5-FSR", "XD-FACULTY-COUNT", "APH-ANX41-BANDWIDTH", "APH-ANX33-ADMIN-AREA", "XR-INTAKE-RECORD",
           "XR-EOA-NO-INCREASE", "ADD26-26C-CORE-BRANCHES", "XD-OC-AREA", "APH-A21-SSC-REQUIRED",
           "APH-617H-SSC-VALID", "PN2627-DEADLINE", "APH-617I-FIRE-VALID", "APH-A31D-FIRE-BEFORE",
           "XD-FIRE-INSTITUTION", "APH-232D-TER-STATUS", "XR-TER-RECEIPT-MATCH", "APH-639-AFF2-DSC",
           "XD-AFF2-APPLICATION", "XD-ACCOUNTS-ENTITY", "XD-SATMAP-LOCATION", "XR-NBA-CLAIMS", "XD-OC-INSTITUTION",
           "YOY-INTAKE-JUMP", "YOY-LAND-AREA-DECREASED", "YOY-BUILT-UP-AREA-DECREASED", "YOY-FACULTY-TURNOVER",
           "YOY-CERT-REUSED-NEW-VALIDITY"}
# Which planned slots a derived code depends on, to attribute side effects to the condition that caused them
RELATED_SLOTS = {"APH-ANX5-FSR": {"fac", "intake"}, "XD-FACULTY-COUNT": {"fac"}, "APH-ANX41-BANDWIDTH": {"bw", "intake"},
                 "APH-ANX33-ADMIN-AREA": {"admin", "intake"}, "XR-INTAKE-RECORD": {"intake"},
                 "XR-EOA-NO-INCREASE": {"intake"}, "ADD26-26C-CORE-BRANCHES": {"intake"}, "XD-OC-AREA": {"area"},
                 "APH-A21-SSC-REQUIRED": {"ssc"}, "APH-617H-SSC-VALID": {"ssc"}, "PN2627-DEADLINE": {"date"},
                 "APH-617I-FIRE-VALID": {"fire"}, "APH-A31D-FIRE-BEFORE": {"fire"}, "XD-FIRE-INSTITUTION": {"fire"},
                 "APH-232D-TER-STATUS": {"ter"}, "XR-TER-RECEIPT-MATCH": {"ter"}, "APH-639-AFF2-DSC": {"aff"},
                 "XD-AFF2-APPLICATION": {"aff"}, "XD-ACCOUNTS-ENTITY": {"acc"}, "XD-SATMAP-LOCATION": {"sat"},
                 "XR-NBA-CLAIMS": {"nba"}, "XD-OC-INSTITUTION": {"oc"}, "YOY-INTAKE-JUMP": {"intake"},
                 "YOY-LAND-AREA-DECREASED": {"land"}, "YOY-BUILT-UP-AREA-DECREASED": {"area"},
                 "YOY-FACULTY-TURNOVER": {"fac"}, "YOY-CERT-REUSED-NEW-VALIDITY": {"fire"}}


@dataclass
class Inst:
    key: str
    name: str
    core: str
    city: str
    state: str
    st: str
    lat: float
    lon: float
    pin: str
    society: str
    chair: str
    est: int
    aicte_id: str

    def builder(self) -> dict[str, Any]:
        """The institution as make_fixtures' document builders expect it."""
        return {"key": self.key, "name": self.name, "city": self.city, "state": self.state, "pin": self.pin,
                "society": self.society, "chair": self.chair, "aicte_id": self.aicte_id, "lat": self.lat,
                "lon": self.lon}


@dataclass
class App:
    key: str
    inst: Inst
    id: str
    category: str
    submitted: date
    clean: bool
    record: list[dict] = field(default_factory=list)
    progs: list[dict] = field(default_factory=list)
    own: list[dict] = field(default_factory=list)
    roster: list[dict] = field(default_factory=list)
    decl: dict = field(default_factory=dict)
    fire: dict = field(default_factory=dict)
    oc: dict = field(default_factory=dict)
    ssc: dict | None = None
    aff: dict = field(default_factory=dict)
    ter: dict = field(default_factory=dict)
    acc: dict = field(default_factory=dict)
    sat: dict = field(default_factory=dict)
    nba: dict | None = None
    photos: list[dict] = field(default_factory=list)
    prev_id: str = ""
    prev_submitted: date = date(2024, 12, 1)
    prev_over: dict = field(default_factory=dict)
    prev: dict = field(default_factory=dict)
    down: list[str] = field(default_factory=list)
    slots: set[str] = field(default_factory=set)
    conds: list[Any] = field(default_factory=list)

    @property
    def as_of(self) -> date:
        return self.submitted


@dataclass
class World:
    seed: int
    rng: random.Random
    ids: Identities
    apps: list[App] = field(default_factory=list)
    fire_fmt: dict[str, str] = field(default_factory=dict)
    oc_fmt: dict[str, str] = field(default_factory=dict)
    nba_fmt: str = ""
    fire_qr: dict[str, bool] = field(default_factory=dict)
    fire_signs: dict[str, bool] = field(default_factory=dict)
    muni_signs: dict[str, bool] = field(default_factory=dict)
    nba_qr: bool = True
    engineers: dict[str, list[str]] = field(default_factory=dict)
    photo_seeds: set[int] = field(default_factory=set)

    def app(self, key: str) -> App:
        return next(a for a in self.apps if a.key == key)

    def city_count(self, city: str) -> int:
        return sum(1 for a in self.apps if a.inst.city == city)


def required_faculty(progs: list[dict]) -> int:
    return math.ceil(sum(int(p["approved_intake"]) * YEARS / RATIO for p in progs))


def bandwidth_tier(total_intake: int) -> int:
    return next(mbps for cap, mbps in BANDWIDTH_TIERS if total_intake <= cap)


def ter_fee(total_intake: int) -> int:
    return 60500 if total_intake <= 180 else 72600 if total_intake <= 300 else 96800 if total_intake <= 480 else 121000


def new_world(seed: int) -> World:
    rng = random.Random(seed)
    w = World(seed, rng, Identities(rng))
    states = sorted({c[2] for c in CITIES})
    for st in states:
        w.fire_fmt[st] = rng.choice(FIRE_FORMATS)
        w.oc_fmt[st] = rng.choice(OC_FORMATS)
        w.fire_qr[st] = rng.random() < 0.7
        w.fire_signs[st] = rng.random() < 0.8
        w.muni_signs[st] = rng.random() < 0.7
    w.nba_fmt = rng.choice(NBA_FORMATS)
    w.nba_qr = rng.random() < 0.8
    return w


def new_inst(w: World, key: str) -> Inst:
    r = w.rng
    city, state, st, clat, clon, pin3 = r.choice(CITIES)
    lat, lon = offset(clat, clon, r.uniform(0.5, 9.0), r.uniform(0, 360))
    name, core = w.ids.institution_name(city)
    return Inst(key, name, core, city, state, st, lat, lon, f"{pin3}{r.randint(1, 99):03d}", w.ids.society(core, city),
                w.ids.chair(), 0, w.ids.aicte_id())


def programme(code: str, intake: int) -> dict:
    name, core, cs, _ = PROGRAMMES[code]
    return {"code": code, "name": name, "level": "UG_ET", "duration_years": YEARS, "approved_intake": intake,
            "proposed_intake": intake, "core": core, "cs_allied": cs, "nba_accredited": False}


def core_ok(progs: list[dict]) -> bool:
    core = [p for p in progs if p["core"]]
    return len(core) >= 3 and sum(1 for p in core if not p["cs_allied"]) >= 2


def pick_programmes(r: random.Random, category: str) -> list[dict]:
    while True:
        codes = r.sample(sorted(PROGRAMMES), r.choice([2, 3, 3, 4]))
        progs = [programme(c, r.choice(INTAKES)) for c in codes]
        if category != "INCREASE_INTAKE" or core_ok(progs):
            return progs


def faculty_rows(w: World, n: int, submitted: date) -> list[dict]:
    r = w.rng
    rows = []
    for i in range(n):
        desig = "Professor" if i % 9 == 0 else ("Associate Professor" if i % 9 in (1, 2) else "Assistant Professor")
        q = "Ph.D." if desig != "Assistant Professor" or r.random() < 0.2 else r.choice(["M.Tech", "M.E."])
        rows.append({"faculty_id": w.ids.faculty_id(), "name": w.ids.person(), "designation": desig,
                     "qualification": q, "doj": w.ids.day(date(2008, 6, 1), submitted - timedelta(days=60))})
    return rows


def new_photo(w: World, a: App, name: str | None = None, *, km: tuple[float, float] = (0.05, 0.6)) -> dict:
    r = w.rng
    seed = r.randint(1, 10**9)
    while seed in w.photo_seeds:
        seed = r.randint(1, 10**9)
    w.photo_seeds.add(seed)
    taken = a.submitted - timedelta(days=r.randint(5, 150))
    return {"name": name or r.choice(["lab_photo.jpg", "classroom.jpg", "workshop.jpg", "library.jpg",
                                      "computer_lab.jpg"]),
            "seed": seed, "gps": offset(a.inst.lat, a.inst.lon, r.uniform(*km), r.uniform(0, 360)),
            "taken": datetime.combine(taken, time(r.randint(9, 17), r.randint(0, 59))).isoformat(),
            "c2pa": False, "edit_after_signing": False, "reuse_of": None}


def fire_number(w: World, inst: Inst, year: int) -> str:
    return w.ids.number(w.fire_fmt[inst.st], inst.city, inst.st, year)


def genuine_fire(w: World, a: App, *, expired: bool = False) -> dict:
    """The institution's own fire NOC as the issuer printed, signed and registered it."""
    r = w.rng
    for _ in range(200):
        term = r.choice([1, 2, 3, 5])
        if expired:
            valid = a.as_of - timedelta(days=r.randint(15, 400))
            issue = add_years(valid + timedelta(days=1), -term)
        else:
            issue = a.as_of - timedelta(days=r.randint(20, 1000))
            valid = add_years(issue, term) - timedelta(days=1)
            if valid < a.as_of + timedelta(days=20):
                continue
        break
    return {"number": fire_number(w, a.inst, issue.year), "issue": issue, "valid": valid}


def fire_spec(w: World, a: App, g: dict) -> dict:
    """A standard-layout fire NOC printing the genuine values g."""
    i = a.inst
    st = i.st
    return {"layout": "standard", "number": g["number"], "issue": g["issue"], "valid": g["valid"],
            "issued_to": i.name, "office": i.key, "seal_of": i.key,
            "qr": ({"number": g["number"], "name": i.name, "issue": g["issue"], "valid": g["valid"]}
                   if w.fire_qr[st] else None),
            "sign": "issuer" if w.fire_signs[st] else None,
            "registry": {"number": g["number"], "name": i.name, "issue": g["issue"], "valid": g["valid"]},
            "tamper": None, "injection": None, "genuine": dict(g), "readable": True}


def base_app(w: World, key: str, inst: Inst, category: str, submitted: date, clean: bool) -> App:
    r, ids = w.rng, w.ids
    a = App(key, inst, ids.application_id(2026), category, submitted, clean)
    a.record = pick_programmes(r, category)
    a.progs = [dict(p) for p in a.record]
    if category == "INCREASE_INTAKE":
        p = r.choice(a.progs)
        p["proposed_intake"] = p["approved_intake"] + r.choice([30, 60])
    total = sum(p["approved_intake"] for p in a.progs)
    a.own = faculty_rows(w, required_faculty(a.progs) + r.randint(0, 6), submitted)
    a.roster = list(a.own)

    oc_issue = submitted - timedelta(days=r.randint(int(1.5 * 365), int(27.5 * 365)))
    inst.est = max(1960, oc_issue.year - r.randint(0, 2))
    oc_area = r.randint(600, 3200) * 10
    a.oc = {"number": ids.number(w.oc_fmt[inst.st], inst.city, inst.st, oc_issue.year), "issue": oc_issue,
            "area": oc_area, "name": inst.name, "sign": w.muni_signs[inst.st]}
    a.oc["registry"] = {"name": inst.name, "issue": oc_issue, "area": oc_area}

    a.fire = fire_spec(w, a, genuine_fire(w, a))
    sworn = submitted - timedelta(days=r.randint(1, 8))
    a.aff = {"estamp": ids.estamp(inst.st), "app_id": a.id, "sworn": sworn, "signed": True, "stamp_value": 100,
             "notary": f"Notary Public, {inst.city} (Reg. No. {r.randint(1000, 9999)})"}
    fee, txn = ter_fee(total), ids.txn()
    paid = submitted - timedelta(days=r.randint(0, 9))
    a.ter = {"txn": txn, "amount": fee, "paid": paid, "status": "Payment Received",
             "ledger": {"txn": txn, "amount": fee, "status": "Payment Received", "paid": paid}}
    a.acc = {"entity": inst.society, "fy": PREVIOUS_FY, "udin": ids.udin("25"), "scan": r.random() < 0.10}
    lat, lon = offset(inst.lat, inst.lon, r.uniform(0.02, 0.25), r.uniform(0, 360))
    a.sat = {"lat": lat, "lon": lon}
    if r.random() < 0.25:
        p = r.choice(a.progs)
        y = r.choice([2023, 2024, 2025])
        a.nba = {"prog": p["code"], "ref": ids.number(w.nba_fmt, inst.city, inst.st, y), "from": date(y, 7, 1),
                 "to": date(y + 3, 6, 30), "qr": w.nba_qr, "register": True}
        p["nba_accredited"] = True
    if r.random() < 0.45:
        ph = new_photo(w, a)
        ph["c2pa"] = r.random() < 0.35
        a.photos.append(ph)

    labs = COMMON_LABS + [lab for p in a.progs for lab in PROGRAMMES[p["code"]][3]]
    bw = r.choice([b for b in (100, 150, 200, 300, 500, 1000) if b >= bandwidth_tier(total)])
    built = oc_area - r.randint(0, 80) * 10
    a.decl = {"programmes": a.progs, "faculty_count": len(a.roster), "built_up_area_sqm": built,
              "land_area_acres": round(r.uniform(4.0, 30.0), 1), "internet_bandwidth_mbps": bw,
              "administrative_area_sqm": r.randint(760, 1600), "amenities_area_sqm": r.randint(510, 1300),
              "fire_noc_number": a.fire["number"], "fee_transaction_id": txn, "labs": labs}
    a.prev_id = ids.application_id(2025)
    a.prev_submitted = ids.day(*PREV_WINDOW)
    a.prev_over = {"moved": r.randint(0, 4), "built": built - r.randint(0, 40) * 10,
                   "land": a.decl["land_area_acres"]}
    return a


def previous_year(w: World, a: App) -> dict:
    """The institution's 2025-26 application as the approval portal holds it."""
    r = w.rng
    o = a.prev_over
    own_ids = [x["faculty_id"] for x in a.own]
    moved = min(len(own_ids), o["moved"])
    joined = set(r.sample(own_ids, moved))
    roster = [f for f in own_ids if f not in joined] + [w.ids.faculty_id() for _ in range(moved)]
    progs = [{"code": p["code"], "name": p["name"], "level": p["level"], "approved_intake": p["approved_intake"],
              "proposed_intake": p["approved_intake"],
              "nba_accredited": bool(a.nba and a.nba["register"] and a.nba["prog"] == p["code"])} for p in a.record]
    g = a.fire.get("genuine")
    if "fire_cert" in o:
        fire = o["fire_cert"]
    elif g and g["issue"] <= a.prev_submitted <= g["valid"]:
        fire = {"number": g["number"], "valid_until": g["valid"].isoformat()}
    else:
        older = (g["issue"] if g else a.prev_submitted + timedelta(days=r.randint(30, 300))) - timedelta(days=1)
        fire = {"number": fire_number(w, a.inst, a.prev_submitted.year - 1), "valid_until": older.isoformat()}
    certs: dict[str, dict] = {"fire_noc": fire, "occupancy_certificate": {"number": a.oc["number"]},
                              "affidavit_2": {"number": w.ids.estamp(a.inst.st)},
                              "audited_accounts": {"number": w.ids.udin("24")}}
    if a.nba:
        certs["nba_certificate"] = {"number": a.nba["ref"], "valid_until": a.nba["to"].isoformat()}
    labs = list(a.decl["labs"])
    if r.random() < 0.3:
        labs.pop()
    decl = a.decl
    return {"academic_year": "2025-26", "application_id": a.prev_id, "category": "EOA",
            "submitted_on": a.prev_submitted.isoformat(), "programmes": progs, "faculty_ids": roster,
            "faculty_count": len(roster), "land_area_acres": o["land"], "built_up_area_sqm": o["built"],
            "administrative_area_sqm": decl["administrative_area_sqm"] - r.choice([0, 0, 40]),
            "amenities_area_sqm": decl["amenities_area_sqm"],
            "internet_bandwidth_mbps": r.choice([b for b in (100, 150, 200) if b <= decl["internet_bandwidth_mbps"]]
                                                or [decl["internet_bandwidth_mbps"]]),
            "labs": labs, "nba_claims": [p["code"] for p in progs if p["nba_accredited"]], "certificates": certs}


def derived_codes(a: App, prev: dict) -> set[str]:
    """Rule and year-over-year findings the plan implies, restated from the handbook norms and the
    configuration documented in the ruleset. Used to check the answer key, not to score."""
    out: set[str] = set()
    d, progs = a.decl, a.decl["programmes"]
    total = sum(int(p["approved_intake"]) for p in progs)
    rows = len(a.roster)
    if rows < required_faculty(progs):
        out.add("APH-ANX5-FSR")
    if d["faculty_count"] != rows:
        out.add("XD-FACULTY-COUNT")
    if d["internet_bandwidth_mbps"] < bandwidth_tier(total):
        out.add("APH-ANX41-BANDWIDTH")
    if total <= 300 and (d["administrative_area_sqm"] < 750 or d["amenities_area_sqm"] < 500):
        out.add("APH-ANX33-ADMIN-AREA")
    rec = {p["code"]: p["approved_intake"] for p in a.record}
    if any(rec.get(p["code"]) != p["approved_intake"] for p in progs):
        out.add("XR-INTAKE-RECORD")
    if a.category == "EOA" and sum(p["proposed_intake"] for p in progs) > sum(rec.values()):
        out.add("XR-EOA-NO-INCREASE")
    if a.category == "INCREASE_INTAKE" and not core_ok(progs):
        out.add("ADD26-26C-CORE-BRANCHES")
    if d["built_up_area_sqm"] > a.oc["area"]:
        out.add("XD-OC-AREA")
    if a.oc["name"] != a.inst.name:
        out.add("XD-OC-INSTITUTION")
    if round((a.as_of - a.oc["issue"]).days / 365.25, 1) > 30 and a.ssc is None:
        out.add("APH-A21-SSC-REQUIRED")
    if a.ssc and (a.as_of - a.ssc["issue"]).days > 1826:
        out.add("APH-617H-SSC-VALID")
    if a.submitted > DEADLINE:
        out.add("PN2627-DEADLINE")
    f = a.fire
    if not f["readable"]:
        out |= {"APH-617I-FIRE-VALID", "APH-A31D-FIRE-BEFORE", "XD-FIRE-INSTITUTION"}
    else:
        if f["valid"] < a.as_of:
            out.add("APH-617I-FIRE-VALID")
        if f["issue"] > a.as_of:
            out.add("APH-A31D-FIRE-BEFORE")
        if f["issued_to"] != a.inst.name:
            out.add("XD-FIRE-INSTITUTION")
    t = a.ter
    if t["ledger"]["status"] not in STATUS_OK:
        out.add("APH-232D-TER-STATUS")
    if t["txn"] != t["ledger"]["txn"] or t["amount"] != t["ledger"]["amount"]:
        out.add("XR-TER-RECEIPT-MATCH")
    if not a.aff["signed"]:
        out.add("APH-639-AFF2-DSC")
    if a.aff["app_id"] != a.id:
        out.add("XD-AFF2-APPLICATION")
    if a.acc["fy"] != PREVIOUS_FY or a.acc["entity"] != a.inst.society:
        out.add("XD-ACCOUNTS-ENTITY")
    if haversine_km((a.sat["lat"], a.sat["lon"]), (a.inst.lat, a.inst.lon)) > 0.5:
        out.add("XD-SATMAP-LOCATION")
    claims = [p["code"] for p in progs if p["nba_accredited"]]
    if any(not (a.nba and a.nba["register"] and a.nba["prog"] == c and a.nba["to"] >= a.as_of) for c in claims):
        out.add("XR-NBA-CLAIMS")
    # Year over year, against the previous application
    pa = {p["code"]: p["approved_intake"] for p in prev["programmes"]}
    if a.category == "EOA" and any(p["code"] in pa and p["proposed_intake"] > pa[p["code"]] for p in progs):
        out.add("YOY-INTAKE-JUMP")
    if prev["land_area_acres"] - d["land_area_acres"] > 0.01:
        out.add("YOY-LAND-AREA-DECREASED")
    if prev["built_up_area_sqm"] - d["built_up_area_sqm"] > 1.0:
        out.add("YOY-BUILT-UP-AREA-DECREASED")
    before = prev["faculty_ids"]
    now = {x["faculty_id"] for x in a.roster}
    if before and sum(1 for x in before if x not in now) / len(before) > TURNOVER_THRESHOLD:
        out.add("YOY-FACULTY-TURNOVER")
    pf = prev["certificates"].get("fire_noc")
    if f["readable"] and pf and norm(pf["number"]) == norm(f["number"]) and pf["valid_until"] != f["valid"].isoformat():
        out.add("YOY-CERT-REUSED-NEW-VALIDITY")
    return out


def norm(s: str) -> str:
    return "".join(ch for ch in str(s).upper() if ch.isalnum())
