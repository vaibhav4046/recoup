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
    "billing_error": "Duplicate charges / undisclosed fees are recoverable; card issuers allow chargebacks within 60–120 days.",
    "settlement": "Open class-action settlements (e.g. the $1.5B Amazon Prime / FTC fund) pay eligible consumers who file.",
    "unclaimed": "State unclaimed-property programs (NAUPA) hold forgotten deposits, refunds, and balances under your name.",
    "refund_window": "Many retailers and airlines owe a refund for a price drop or cancellation within a stated window.",
}


def _money_surface() -> dict:
    """Seeded but realistic. In live mode this comes from the user's own statement / inbox."""
    return {
        "subscriptions": [
            {"id": "sub_1", "name": "StreamMax Premium", "monthly": 19.99, "last_used_days": 142, "since": "2023-04"},
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
    }


def _yearly(fid, kind, title, annual, monthly, rule, evidence, action, priority):
    return {
        "id": fid, "kind": kind, "title": title,
        "cadence": "yearly", "amount": round(annual, 2), "currency": "$",
        "amount_label": f"${annual:,.0f}/yr", "unit_note": f"${monthly:,.2f}/mo",
        "rule": rule, "evidence": evidence, "action": action, "priority": priority,
    }


def _once(fid, kind, title, payout, currency, rule, evidence, action, priority):
    sym = currency
    return {
        "id": fid, "kind": kind, "title": title,
        "cadence": "once", "amount": round(payout, 2), "currency": sym,
        "amount_label": f"{sym}{payout:,.0f}", "unit_note": "one-time",
        "rule": rule, "evidence": evidence, "action": action, "priority": priority,
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

    recurring = round(sum(f["amount"] for f in findings if f["cadence"] == "yearly"), 2)
    one_time = round(sum(f["amount"] for f in findings if f["cadence"] == "once"), 2)
    return {
        "findings": findings,
        "recurring_year": recurring,
        "one_time": one_time,
        "total_recoverable": round(recurring + one_time, 2),
        "surface": s,
    }
