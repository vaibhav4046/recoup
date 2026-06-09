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
            "odds": f.get("odds"), "timeline": f.get("timeline"),
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


def _generate(model: str, prompt: str, attempts: int = 3, json_mode: bool = True) -> str:
    """Call the Gemini REST API directly via httpx — robust across runtimes
    across serverless containers. Returns the model's text; backs off on 429/503."""
    import httpx
    s = get_settings()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    gen_cfg = {"temperature": 0.4}
    if json_mode:
        gen_cfg["responseMimeType"] = "application/json"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": gen_cfg,
    }
    last = None
    for i in range(attempts):
        try:
            r = httpx.post(url, params={"key": s.google_api_key}, json=body, timeout=20)
            if r.status_code in (429, 503) and i < attempts - 1:
                time.sleep(1.2 * (i + 1))
                continue
            r.raise_for_status()
            data = r.json()
            cands = data.get("candidates") or []
            parts = (cands[0].get("content", {}).get("parts") if cands else None) or []
            if not parts or "text" not in parts[0]:
                fr = (cands[0].get("finishReason") if cands else None) or "no_candidates"
                raise RuntimeError(f"Gemini returned 200 with no text (finishReason={fr})")
            return parts[0]["text"]
        except httpx.TransportError as e:  # timeouts, connect/read errors
            last = e
            if i < attempts - 1:
                time.sleep(1.0 * (i + 1))
                continue
            raise
        except Exception as e:  # noqa: BLE001
            last = e
            if i < attempts - 1 and any(t in str(e) for t in ("429", "503", "RESOURCE_EXHAUSTED", "UNAVAILABLE")):
                time.sleep(1.0 * (i + 1))
                continue
            raise
    raise last  # pragma: no cover


def draft_plan(scan: dict) -> dict:
    """The agentic loop: PLAN -> use TOOLS (Atlas Vector Search + the rule engine) ->
    ACT (draft claims) -> human approval gate. Not a chatbot: it retrieves real
    consumer-protection precedent for every finding and grounds the drafts in it."""
    s = get_settings()
    meta = swarm.orchestrate(scan)             # attribute + verify findings; build roster + orchestration trace
    actions = build_actions(scan["findings"])  # findings now carry agent attribution + verdict
    sw = {"swarm": meta["roster"], "verified": meta["verified"], "needs_confirm": meta["needs_confirm"],
          "flagged": meta["flagged"], "agents": meta["agents"]}

    # ---- PLAN ----
    plan_line = [{"t": f"Plan: classify {len(scan['findings'])} charges, retrieve each one's legal basis "
                       "via MongoDB Atlas Vector Search, then draft a claim you approve.", "tone": "cyan"}]

    # ---- TOOL: ground the top findings in real precedent via Atlas Vector Search ----
    from . import vector
    grounding, vlines = [], []
    for f in scan["findings"][:3]:
        hits = vector.retrieve(f"{f['title']}. {f.get('evidence', '')}", k=1)
        if hits:
            h = hits[0]
            grounding.append({"finding": f["title"], "precedent": {k: h.get(k) for k in ("title", "basis", "jurisdiction")}})
            via = "Atlas Vector Search" if h.get("via") == "atlas_vector_search" else "vector cosine"
            vlines.append({"t": f"Tool · {via}: \"{f['title'][:34]}\" → {h['title']} · {h['basis']} (sim {h.get('score', 0):.2f})", "tone": "cyan"})
    sw["grounding"] = grounding

    closing = [
        {"t": "One-time payouts are never annualized; amounts come from the rules, not the model", "tone": "dim"},
        {"t": "Nothing is sent without your approval", "tone": "ok"},
    ]

    if not s.gemini_ready:
        return {"reasoning": plan_line + meta["trace"] + vlines + closing, "actions": actions, **sw,
                "model": "deterministic-fallback", "latency_ms": 0, "live": False,
                "note": "Gemini not configured — deterministic swarm + Atlas Vector Search grounding."}
    try:
        prompt = (f"{SYSTEM_PROMPT}\n\nSCAN (amounts already computed — do not change them):\n"
                  f"{json.dumps(scan, ensure_ascii=False)[:7000]}\n\n"
                  f"PRECEDENTS RETRIEVED via MongoDB Atlas Vector Search (cite these as the basis):\n"
                  f"{json.dumps(grounding, ensure_ascii=False)[:1500]}\n\n"
                  'Return JSON {"reasoning":[{"t":str,"tone":"cyan|dim|ok|warn"}]} — 2-3 concise narration '
                  "lines on the most valuable recoveries, citing the retrieved precedent basis. Keep "
                  "recurring vs one-time distinct; never annualize a one-time payout.")
        t0 = time.perf_counter()
        text = _generate(s.gemini_model, prompt)
        latency = round((time.perf_counter() - t0) * 1000)
        gem = (json.loads(text).get("reasoning") or [])[:3]
        return {"reasoning": plan_line + meta["trace"] + vlines + gem + closing[:1], "actions": actions, **sw,
                "model": s.gemini_model, "latency_ms": latency, "live": True,
                "note": f"Live {s.gemini_model} narrating a {meta['agents']}-agent swarm grounded in Atlas Vector Search."}
    except Exception as e:  # noqa: BLE001
        return {"reasoning": plan_line + meta["trace"] + vlines + closing, "actions": actions, **sw,
                "model": "deterministic-fallback", "latency_ms": 0, "live": False,
                "note": f"Gemini fallback ({type(e).__name__}): {str(e)[:90]}"}


VOICE_SYSTEM = (
    "You are Recoup's voice assistant — a money-recovery agent that helps everyday people find money "
    "they're OWED (refunds, class-action settlements, EU261/UK261 flight-delay compensation, unclaimed "
    "property) and money they're LOSING (dead subscriptions, silent price hikes, billing errors), and "
    "drafts every claim for the human to approve (nothing is ever sent automatically). "
    "Answer the spoken question in 1-3 short, warm, concrete sentences. NO markdown, NO bullet lists, "
    "NO emojis — your text is read ALOUD. If asked something off-topic, answer briefly then steer back "
    "to recovering their money."
)


def voice_answer(question: str, context: str = "") -> dict:
    """A concise, spoken-style Gemini answer for the voice agent. Free (AI Studio key)."""
    s = get_settings()
    if not s.gemini_ready:
        return {"answer": "", "live": False, "note": "gemini_not_configured"}
    try:
        ctx = f"\nThe user's current screen: {context[:400]}" if context else ""
        prompt = f"{VOICE_SYSTEM}{ctx}\n\nUser said: \"{question[:400]}\"\n\nSpoken answer:"
        t0 = time.perf_counter()
        text = _generate(s.gemini_model, prompt, json_mode=False)
        latency = round((time.perf_counter() - t0) * 1000)
        ans = " ".join((text or "").split())[:600]
        return {"answer": ans, "live": True, "latency_ms": latency}
    except Exception as e:  # noqa: BLE001
        return {"answer": "", "live": False, "note": f"{type(e).__name__}"}
