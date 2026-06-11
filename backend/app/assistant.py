"""Recoup — the in-dashboard AI guide.

A conversational agent that knows the product, answers in a warm chatbot tone, and can DRIVE the
app: its replies carry an optional `action` the UI executes (run autopilot, open the scanner,
jump to the unclaimed search, start the Gmail scan, show the audit chain). Runs on the same
all-Google resilience ladder as the rest of the agent (Gemini 3 -> Gemma), with a deterministic
intent fallback so the guide NEVER goes dead — and it never invents amounts.
"""
from __future__ import annotations

import json

ACTIONS = {"autopilot", "scan", "unclaimed", "gmail", "audit", "none"}

SYSTEM = (
    "You are Recoup's friendly in-app guide — a warm, concise chatbot inside a money-recovery "
    "agent's dashboard. Recoup finds money users are LOSING (forgotten subscriptions, silent "
    "price hikes, duplicate charges) and money they're OWED (flight compensation EU261/UK261, "
    "deposits, warranties, settlements, unclaimed property). REAL capabilities you can trigger: "
    "(1) autopilot — the autonomous mission: scan -> ground every claim in MongoDB Atlas -> draft "
    "-> verify -> queue at the human approval gate; (2) scan — paste a real bank CSV "
    "(Chase/Wells Fargo/Amex), parsed 100% in the browser; (3) unclaimed — search 20,000 official "
    "California State Controller records ($37.8M real unclaimed money); (4) gmail — read-only "
    "inbox scan for real subscription receipts; (5) audit — the tamper-evident SHA-256 chain. "
    "HARD RULES: never invent dollar amounts (amounts come from rules, not you); never claim "
    "something was sent (nothing sends without the user's approval); be honest that EU261 etc. "
    "are region-specific; keep replies under 80 words, friendly, plain English, 1-2 emoji max. "
    'Return ONLY JSON: {"reply": str, "action": one of '
    '["autopilot","scan","unclaimed","gmail","audit","none"]} — set an action ONLY when the user '
    "clearly wants to do that thing; otherwise \"none\"."
)

# deterministic intent fallback — the guide answers instantly even with zero AI quota
_FALLBACK = [
    (("autopilot", "autonomous", "mission", "run every"),
     ("Firing up Autopilot 🚀 — the agent will scan your surface, ground every claim in Atlas, "
      "draft and verify, then stop at YOUR approve button. Nothing ever sends without you."), "autopilot"),
    (("scan", "statement", "csv", "bank", "paste", "chase", "amex", "wells"),
     ("Let's scan your real statement 📄 — paste a Chase/Wells Fargo/Amex CSV export (keep the "
      "header row). It's parsed 100% in your browser; nothing is uploaded."), "scan"),
    (("unclaimed", "owed", "government", "37", "search my name", "records"),
     ("Try the real unclaimed-money search 💰 — 20,000 official California State Controller "
      "records ($37.8M). Type a last name; claims happen only on the official state site."), "unclaimed"),
    (("gmail", "email", "inbox", "receipts"),
     ("I can scan your Gmail read-only for real subscription receipts — nothing is sent or "
      "deleted, and you can wipe the results anytime."), "gmail"),
    (("audit", "hash", "chain", "tamper", "trust", "safe", "secure"),
     ("Every step is written to a tamper-evident SHA-256 hash chain — edit one event and every "
      "later link breaks. You can verify the live chain head yourself."), "audit"),
    (("approve", "send", "sent"),
     ("Recoup never sends anything itself — every claim stops at pending-approval. You review, "
      "you approve, and you send it on the vendor's or government's official site."), "none"),
    (("hi", "hello", "hey", "help", "what can", "how do", "start"),
     ("Hey! 👋 I'm your Recoup guide. I can run the autonomous Autopilot, scan your real bank "
      "statement, search $37.8M of real unclaimed money, or scan your Gmail read-only. What "
      "shall we find first?"), "none"),
]


def _fallback(message: str) -> dict:
    m = (message or "").lower()
    for keys, reply, action in _FALLBACK:
        if any(k in m for k in keys):
            return {"reply": reply, "action": action, "model": "guide-rules", "live": False}
    return {"reply": ("I can help you find money — try 'run autopilot', 'scan my statement', "
                      "'search unclaimed money', or ask how the approval gate works."),
            "action": "none", "model": "guide-rules", "live": False}


def respond(message: str, surface: str = "") -> dict:
    """Answer one chat turn. Tries the live ladder (cached for repeat questions); falls back to
    the deterministic intent guide so the bot never dies. `surface` is an optional one-line
    summary of the user's current findings (client-sent, sanitized) for grounded answers."""
    message = str(message or "").strip()[:500]
    if not message:
        return _fallback("")
    try:
        from . import agent as _agent
        prompt = SYSTEM + "\n\n"
        if surface:
            prompt += f"USER'S CURRENT SURFACE (amounts already computed): {surface[:300]}\n\n"
        prompt += f"USER: {message}\nJSON:"
        text, used = _agent.generate_any(prompt)
        data = json.loads(_agent._strip_fences(text))
        reply = str(data.get("reply") or "").strip()[:600]
        action = data.get("action") if data.get("action") in ACTIONS else "none"
        if not reply:
            return _fallback(message)
        return {"reply": reply, "action": action, "model": used, "live": True}
    except Exception:
        return _fallback(message)
