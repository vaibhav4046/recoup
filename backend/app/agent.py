"""Recoup — Gemini money-recovery agent.

Live mode calls Gemini (free AI Studio key) to write the transparent reasoning
trace; fallback mode is deterministic. Either way the OUTPUT SHAPE is identical,
the actions/amounts are drafted from the deterministic scan (stable + auditable,
the model never invents a number), and NOTHING is sent without human approval
(enforced in state.py). Live calls retry transient 429/503 then fall back.
"""
from __future__ import annotations

import json
import time

from . import swarm
from .config import get_settings
from .snapshot import RULES

SYSTEM_PROMPT = (
    "You are Recoup, an agent that recovers money for everyday people. You reason "
    "over a user's financial footprint to find money they're LEAKING (dead "
    "subscriptions, silent price hikes, billing errors) and money they're OWED "
    "(refunds, class-action settlements, flight-delay compensation, unclaimed "
    "property). Rules: cite the consumer-protection basis for every finding; never "
    "send anything (you only DRAFT for the human to approve); be concrete about "
    "amounts but NEVER annualize a one-time payout; output strict JSON only."
)

_ACTION_VERB = {
    "cancel": "Cancel", "dispute_charge": "Dispute", "dispute_price": "Challenge",
    "request_refund": "Refund", "file_claim": "File claim",
}


def _draft_text(f: dict) -> str:
    kind, ev, label = f["kind"], f["evidence"], f["amount_label"]
    name = f["title"].split(":", 1)[-1].strip()
    return {
        "dead_subscription": (
            f"Subject: Cancel my subscription — effective immediately\n\n"
            f"Please cancel my plan and confirm in writing, including any proration owed. "
            f"It has gone unused ({ev}). This stops a recurring leak of {label}."),
        "price_creep": (
            f"Subject: Apply current rate or cancel\n\n"
            f"My price rose ({ev}). Please match the current new-customer / retention rate, "
            f"or treat this as notice of cancellation. Recovers {label}. Basis: {RULES['price_creep']}"),
        "billing_error": (
            f"Subject: Dispute an incorrect charge\n\n"
            f"There is an erroneous charge on my account ({ev}). Please remove it and credit "
            f"me — worth {label} if recurring. Basis: {RULES['billing_error']}"),
        "price_drop": (
            f"Subject: Price-protection refund request\n\n"
            f"{ev}. Per your price-protection / refund-window policy, please refund the "
            f"one-time difference of {label}. Basis: {RULES['refund_window']}"),
        "flight_comp": (
            f"Subject: EU261 delay compensation claim\n\n"
            f"My flight {ev}. Under EU261/UK261 I am owed {label} in cash compensation "
            f"(one-time, not a voucher). Please process. Basis: {RULES['eu261']}"),
        "settlement": (
            f"Filing my consumer claim ({ev}) for a one-time {label}. Basis: {RULES['settlement']}"),
        "unclaimed": (
            f"Filing to recover property held in my name ({ev}), a one-time {label}. "
            f"Basis: {RULES['unclaimed']}"),
        "warranty": (
            f"Subject: Warranty claim — covered repair\n\n"
            f"My item is covered ({ev}). Please repair or replace at no cost under the plan; "
            f"value {label} (one-time). Basis: {RULES['warranty']}"),
        "deposit": (
            f"Subject: Return of overdue security deposit\n\n"
            f"My deposit is overdue ({ev}). Please return {label} in full, plus any statutory "
            f"penalty for late return. Basis: {RULES['deposit']}"),
    }.get(kind, f"Draft action for {name} — recover {label}.")


def build_actions(findings: list[dict]) -> list[dict]:
    actions = []
    for i, f in enumerate(findings, start=1):
        actions.append({
            "id": f"act_{i}", "finding_id": f["id"], "kind": f["kind"],
            "title": f["title"], "verb": _ACTION_VERB.get(f["action"], "Act"),
            "amount": f["amount"], "cadence": f["cadence"], "currency": f["currency"],
            "amount_label": f["amount_label"], "unit_note": f["unit_note"],
            "priority": f["priority"], "evidence": f["evidence"], "rule": f["rule"],
            "agent": f.get("agent"), "agent_name": f.get("agent_name"), "verify": f.get("verify"),
            "confidence": f.get("confidence"), "confidence_band": f.get("confidence_band"),
            "caveat": f.get("caveat"), "claim_url": f.get("claim_url"),
            "draft": _draft_text(f),
            "approvalState": "pending", "status": "drafted", "claimedAt": None,
        })
    return actions


def _fallback_reasoning(scan: dict) -> list[dict]:
    f = scan["findings"]
    leaks = [x for x in f if x["cadence"] == "yearly"]
    owed = [x for x in f if x["cadence"] == "once"]
    return [
        {"t": f"Scanned money surface — {len(f)} recoverable items found", "tone": "cyan"},
        {"t": f"Recurring leaks: {len(leaks)} worth ${scan['recurring_year']:,.0f}/yr", "tone": "warn"},
        {"t": f"Owed to you (one-time): {len(owed)} worth ~${scan['one_time']:,.0f}", "tone": "warn"},
        {"t": "Each finding cites a real consumer-protection rule", "tone": "dim"},
        {"t": f"Drafted {len(f)} claims — every one needs your approval before it sends", "tone": "cyan"},
        {"t": "One-time payouts are never annualized; amounts come from the rules, not the model", "tone": "ok"},
    ]


_CLIENT = None


def _client(fresh: bool = False):
    """Singleton genai client. `fresh=True` rebuilds it (recovers from a closed
    httpx client — seen on the Python 3.12 Spaces container)."""
    global _CLIENT
    if fresh:
        _CLIENT = None
    if _CLIENT is None:
        from google import genai
        s = get_settings()
        if s.use_vertex and s.google_cloud_project:
            _CLIENT = genai.Client(vertexai=True, project=s.google_cloud_project, location=s.google_cloud_region)
        else:
            _CLIENT = genai.Client(api_key=s.google_api_key)
    return _CLIENT


def _generate(model: str, prompt: str, attempts: int = 3):
    """Call Gemini; rebuild the client + retry on a closed-client RuntimeError,
    back off on transient rate/availability errors."""
    last = None
    for i in range(attempts):
        try:
            return _client(fresh=(i > 0)).models.generate_content(
                model=model, contents=prompt,
                config={"response_mime_type": "application/json", "temperature": 0.4})
        except Exception as e:  # noqa: BLE001
            last = e
            msg = str(e)
            closed = "closed" in msg.lower() or isinstance(e, RuntimeError)
            transient = any(t in msg for t in ("RESOURCE_EXHAUSTED", "429", "503", "UNAVAILABLE"))
            if (closed or transient) and i < attempts - 1:
                if not closed:
                    time.sleep(1.2 * (i + 1))
                continue
            raise
    raise last  # pragma: no cover


def draft_plan(scan: dict) -> dict:
    s = get_settings()
    meta = swarm.orchestrate(scan)             # attribute + verify findings; build roster + orchestration trace
    actions = build_actions(scan["findings"])  # findings now carry agent attribution + verdict
    sw = {"swarm": meta["roster"], "verified": meta["verified"], "needs_confirm": meta["needs_confirm"],
          "flagged": meta["flagged"], "agents": meta["agents"]}
    closing = [
        {"t": "One-time payouts are never annualized; amounts come from the rules, not the model", "tone": "dim"},
        {"t": "Nothing is sent without your approval", "tone": "ok"},
    ]

    if not s.gemini_ready:
        return {"reasoning": meta["trace"] + closing, "actions": actions, **sw,
                "model": "deterministic-fallback", "latency_ms": 0, "live": False,
                "note": "Gemini not configured — deterministic swarm reasoning (labelled)."}
    try:
        prompt = (f"{SYSTEM_PROMPT}\n\nSCAN (amounts already computed — do not change them):\n"
                  f"{json.dumps(scan, ensure_ascii=False)[:9000]}\n\n"
                  'Return JSON {"reasoning":[{"t":str,"tone":"cyan|dim|ok|warn"}]} — 2-3 concise '
                  "narration lines on the most valuable recoveries. Keep recurring vs one-time "
                  "distinct; never annualize a one-time payout.")
        t0 = time.perf_counter()
        resp = _generate(s.gemini_model, prompt)
        latency = round((time.perf_counter() - t0) * 1000)
        gem = (json.loads(resp.text).get("reasoning") or [])[:3]
        return {"reasoning": meta["trace"] + gem + closing[:1], "actions": actions, **sw,
                "model": s.gemini_model, "latency_ms": latency, "live": True,
                "note": f"Live {s.gemini_model} narrating a {meta['agents']}-agent swarm."}
    except Exception as e:  # noqa: BLE001
        return {"reasoning": meta["trace"] + closing, "actions": actions, **sw,
                "model": "deterministic-fallback", "latency_ms": 0, "live": False,
                "note": f"Gemini fallback ({type(e).__name__}): {str(e)[:90]}"}
