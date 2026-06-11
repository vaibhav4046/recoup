"""Recoup — the user's 'money surface' + the recoverable-money rule engine.

Seeded demo data for the user's financial footprint (subscriptions, recurring
bills, recent purchases, a delayed flight, unclaimed-property / settlement
matches). In live mode the user connects/uploads a statement (or Gmail) and
Gemini extracts this same shape — so the numbers are real and personal.

Every finding is tagged with a `cadence`:
  - "yearly"  -> a recurring leak; `amount` is the ANNUAL saving (shown as $X/yr)
  - "once"    -> a one-time payout you're owed; `amount` is a flat sum (no /yr)

Totals are reported split (recurring_year vs one_time) so a one-time €250 flight
refund is NEVER annualized into a misleading per-year headline.

`scan()` is a deterministic rule pass; Gemini only writes the human-readable
reasoning (it never invents the amounts). Each rule cites a real consumer right.
"""
from __future__ import annotations

# --- real consumer-protection rules the findings cite ---
RULES = {
    "eu261": "EU261/UK261: flights delayed 3h+ owe €250 (<1500km), €400 (1500–3500km), or €600 cash.",
    "dead_sub": "A subscription unused 60+ days is a recurring leak; most allow instant cancel + proration.",
    "price_creep": "Silent price increases can be challenged or matched to the new-customer rate (retention offer).",
    "billing_error": "Duplicate charges / undisclosed fees are recoverable: contact the vendor first (usually corrected within 30–60 days); if unresolved, your card issuer's chargeback window (typically 60–120 days from the statement) is the fallback.",
    "settlement": "Open class-action settlements (e.g. the $1.5B Amazon Prime / FTC fund) pay eligible consumers who file.",
    "unclaimed": "State unclaimed-property programs (NAUPA) hold forgotten deposits, refunds, and balances under your name.",
    "refund_window": "Many retailers and airlines owe a refund for a price drop or cancellation within a stated window.",
    "warranty": "Active warranty / protection plans cover repair or replacement at no cost — don't pay out of pocket.",
    "deposit": "Security deposits must be returned within a statutory window (often 14–30 days); overdue deposits are recoverable.",
}

# per-kind confidence + honest caveat + real claim link + de-risk (odds you'll get paid, how long)
KIND_META = {
    "dead_subscription": {"confidence": 0.95, "caveat": "Confirm you've truly stopped using it before you cancel.", "claim_url": None, "odds": "very likely", "timeline": "instant–1 billing cycle"},
    "price_creep": {"confidence": 0.85, "caveat": "The vendor can decline; cancelling is your leverage.", "claim_url": None, "odds": "often works", "timeline": "a few days"},
    "billing_error": {"confidence": 0.90, "caveat": "Have the statement line ready — some fees are contractual.", "claim_url": None, "odds": "likely", "timeline": "1–2 statements"},
    "price_drop": {"confidence": 0.90, "caveat": "Only valid inside the retailer's price-protection window.", "claim_url": None, "odds": "likely", "timeline": "a few days"},
    "flight_comp": {"confidence": 0.70, "caveat": "Void if the delay was 'extraordinary' (weather, ATC, strike).", "claim_url": "https://www.caa.co.uk/passengers/resolving-travel-problems/", "odds": "~60–70% if eligible", "timeline": "2–8 weeks"},
    "settlement": {"confidence": 0.60, "caveat": "You must have been an affected customer within the claim period.", "claim_url": "https://www.ftc.gov/enforcement/refunds", "odds": "if eligible", "timeline": "months"},
    "unclaimed": {"confidence": 0.85, "caveat": "Requires ID verification to prove the property is yours.", "claim_url": "https://www.missingmoney.com/", "odds": "high if it's you", "timeline": "2–12 weeks"},
    "warranty": {"confidence": 0.85, "caveat": "Check the plan covers this failure and is still active.", "claim_url": None, "odds": "high", "timeline": "days–weeks"},
    "deposit": {"confidence": 0.80, "caveat": "The landlord may deduct for documented damages.", "claim_url": None, "odds": "high", "timeline": "2–4 weeks"},
}


def _meta(kind: str) -> dict:
    m = KIND_META.get(kind, {})
    c = m.get("confidence", 0.8)
    band = "high" if c >= 0.85 else "medium" if c >= 0.7 else "review"
    return {"confidence": c, "confidence_band": band, "caveat": m.get("caveat", ""), "claim_url": m.get("claim_url"),
            "odds": m.get("odds", "varies"), "timeline": m.get("timeline", "varies")}


def _money_surface() -> dict:
    """Seeded but realistic. In live mode this comes from the user's own statement / inbox."""
    return {
        "subscriptions": [
            {"id": "sub_1", "name": "Disney+ Premium", "monthly": 19.99, "last_used_days": 142, "since": "2023-04"},
            {"id": "sub_2", "name": "CloudStore 2TB", "monthly": 9.99, "last_used_days": 8, "since": "2022-01"},
            {"id": "sub_3", "name": "FitPlus Gym App", "monthly": 14.99, "last_used_days": 210, "since": "2024-02"},
            {"id": "sub_4", "name": "NewsDaily+", "monthly": 12.99, "last_used_days": 20, "since": "2023-09",
             "old_monthly": 7.99},  # actively used, but silent price hike -> price-creep finding
        ],
        "bills": [
            {"id": "bill_1", "name": "MobileCo wireless", "amount": 78.40,
             "issue": "duplicate_line_fee", "overcharge": 23.00},
            {"id": "bill_2", "name": "PowerGrid electric", "amount": 134.10, "issue": None, "overcharge": 0},
        ],
        "purchases": [
            {"id": "pur_1", "name": "Noise-cancel headphones", "price": 299.00, "days_ago": 6,
             "price_now": 229.00, "store": "ElectroMart"},  # price-drop refund eligible
        ],
        "flights": [
            {"id": "flt_1", "carrier": "EU carrier", "route": "LHR→BCN", "distance_km": 1137,
             "delay_hours": 4, "fare": 180.00, "owed": 250.00},  # <1500km -> €250 under EU261
        ],
        "matches": [
            {"id": "set_1", "type": "settlement", "name": "Amazon Prime / FTC settlement",
             "est_payout": 51.00, "deadline": "open"},
            {"id": "unc_1", "type": "unclaimed", "name": "State unclaimed property (utility deposit)",
             "est_payout": 214.00, "source": "NAUPA"},
        ],
        "warranties": [
            {"id": "war_1", "name": "Laptop screen repair", "issue": "covered_repair",
             "payout": 120.00, "plan": "extended protection plan"},
        ],
        "deposits": [
            {"id": "dep_1", "name": "Apartment security deposit", "held_days": 95,
             "amount": 850.00, "overdue": True},
        ],
    }


def _yearly(fid, kind, title, annual, monthly, rule, evidence, action, priority):
    return {
        "id": fid, "kind": kind, "title": title,
        "cadence": "yearly", "amount": round(annual, 2), "currency": "$",
        "amount_label": f"${annual:,.0f}/yr", "unit_note": f"${monthly:,.2f}/mo",
        "rule": rule, "evidence": evidence, "action": action, "priority": priority,
        **_meta(kind),
    }


def _once(fid, kind, title, payout, currency, rule, evidence, action, priority):
    sym = currency
    return {
        "id": fid, "kind": kind, "title": title,
        "cadence": "once", "amount": round(payout, 2), "currency": sym,
        "amount_label": f"{sym}{payout:,.0f}", "unit_note": "one-time",
        "rule": rule, "evidence": evidence, "action": action, "priority": priority,
        **_meta(kind),
    }


def scan() -> dict:
    """Deterministic recovery pass → findings tagged once/yearly, with split totals."""
    s = _money_surface()
    findings: list[dict] = []

    for sub in s["subscriptions"]:
        if sub.get("last_used_days", 0) >= 60:
            findings.append(_yearly(
                f"f_{sub['id']}", "dead_subscription", f"Cancel {sub['name']}",
                sub["monthly"] * 12, sub["monthly"], "dead_sub",
                f"Unused {sub['last_used_days']} days · billing since {sub['since']}", "cancel", "high"))
        elif sub.get("old_monthly") and sub["monthly"] > sub["old_monthly"]:
            diff = sub["monthly"] - sub["old_monthly"]
            findings.append(_yearly(
                f"f_{sub['id']}", "price_creep", f"Challenge {sub['name']} price hike",
                diff * 12, diff, "price_creep",
                f"Rose ${sub['old_monthly']:.2f}→${sub['monthly']:.2f}/mo", "dispute_price", "medium"))

    for bill in s["bills"]:
        if bill.get("overcharge", 0) > 0:
            findings.append(_yearly(
                f"f_{bill['id']}", "billing_error", f"Dispute {bill['name']} overcharge",
                bill["overcharge"] * 12, bill["overcharge"], "billing_error",
                f"{bill['issue'].replace('_', ' ')} on a ${bill['amount']:.2f} bill", "dispute_charge", "high"))

    for pur in s["purchases"]:
        if pur.get("price_now", pur["price"]) < pur["price"]:
            back = round(pur["price"] - pur["price_now"], 2)
            findings.append(_once(
                f"f_{pur['id']}", "price_drop", f"Claim price-drop refund: {pur['name']}",
                back, "$", "refund_window",
                f"Bought ${pur['price']:.0f} {pur['days_ago']}d ago · now ${pur['price_now']:.0f}", "request_refund", "medium"))

    for flt in s["flights"]:
        if flt.get("owed", 0) > 0:
            findings.append(_once(
                f"f_{flt['id']}", "flight_comp", f"Claim flight delay compensation ({flt['route']})",
                flt["owed"], "€", "eu261",
                f"{flt['route']} ({flt['distance_km']}km) delayed {flt['delay_hours']}h on an EU carrier", "file_claim", "high"))

    for m in s["matches"]:
        findings.append(_once(
            f"f_{m['id']}", m["type"], f"Claim: {m['name']}",
            m["est_payout"], "$", m["type"], m.get("source", "open claim window"), "file_claim", "medium"))

    for w in s.get("warranties", []):
        findings.append(_once(
            f"f_{w['id']}", "warranty", f"Claim warranty repair: {w['name']}",
            w["payout"], "$", "warranty",
            f"{w['issue'].replace('_', ' ')} under {w.get('plan', 'active plan')}", "file_claim", "medium"))

    for d in s.get("deposits", []):
        if d.get("overdue"):
            findings.append(_once(
                f"f_{d['id']}", "deposit", f"Recover {d['name']}",
                d["amount"], "$", "deposit",
                f"held {d['held_days']}d — past the statutory return window", "request_refund", "high"))

    # NEVER sum across currencies (a money app that adds $ + € loses an accountant's trust instantly).
    # Split BOTH buckets by currency; the legacy numeric fields carry the $ component ONLY, and the
    # *_by_currency / *_label fields carry the honest per-currency truth the UI renders.
    rec_ccy: dict[str, float] = {}
    one_ccy: dict[str, float] = {}
    for f in findings:
        bucket = rec_ccy if f["cadence"] == "yearly" else one_ccy
        bucket[f["currency"]] = round(bucket.get(f["currency"], 0.0) + f["amount"], 2)
    recurring = rec_ccy.get("$", 0.0)   # $ component only — no cross-currency blend
    one_time = one_ccy.get("$", 0.0)
    _label = lambda d: " + ".join(f"{c}{v:,.0f}" for c, v in sorted(d.items(), key=lambda kv: -kv[1]))
    return {
        "findings": findings,
        "recurring_year": recurring,            # $ only (legacy numeric); see recurring_by_currency
        "recurring_by_currency": rec_ccy,
        "recurring_label": _label(rec_ccy),
        "one_time": one_time,                   # $ only (legacy numeric); see one_time_by_currency
        "one_time_by_currency": one_ccy,
        "one_time_label": _label(one_ccy),
        "total_recoverable": round(recurring + one_time, 2),  # $ only — currencies never blended
        "surface": s,
    }
