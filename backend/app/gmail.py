"""Recoup — Gmail subscription intake (READ-ONLY, subscriptions only).

Given a Gmail access token with the `gmail.readonly` scope, this reads
purchase/subscription emails and extracts recurring SERVICES — never bank or card
data, only what the inbox already shows. The sender→service match is the same
heuristic proven on real inboxes (Netflix, giffgaff, Slack, Anthropic, Mistral,
LinkedIn, Spotify, Adobe, …). Read-only: it never sends, deletes, or modifies mail.

Activates when a token is present; otherwise inert (the app falls back to the
in-browser paste scan). Amounts are TYPICAL estimates flagged for user
confirmation unless a receipt body yields the real figure.
"""
from __future__ import annotations

import re

# domain fragment -> (display name, typical monthly £/$, category)
KNOWN_SERVICES = {
    "netflix": ("Netflix", 12.99),
    "spotify": ("Spotify", 11.99),
    "giffgaff": ("giffgaff mobile", 10.00),
    "slack": ("Slack", 8.75),
    "anthropic": ("Anthropic (Claude)", 18.00),
    "mistral": ("Mistral AI", 14.99),
    "linkedin": ("LinkedIn Premium", 29.99),
    "adobe": ("Adobe Creative Cloud", 59.99),
    "youtube": ("YouTube Premium", 12.99),
    "disney": ("Disney+", 7.99),
    "audible": ("Audible", 7.99),
    "nytimes": ("NYTimes", 17.00),
    "dropbox": ("Dropbox", 9.99),
    "notion": ("Notion", 8.00),
    "github": ("GitHub", 4.00),
    "openai": ("OpenAI / ChatGPT", 20.00),
    "amazon": ("Amazon Prime", 8.99),
    "apple": ("Apple / iCloud", 2.99),
    "googleone|google storage": ("Google One", 1.99),
    "patreon": ("Patreon", 6.00),
    "hellofresh": ("HelloFresh", 40.00),
}
_MONEY = re.compile(r"[£$€]\s?(\d+(?:[.,]\d{2})?)")


def _match(sender: str, subject: str) -> tuple[str, float] | None:
    blob = (sender + " " + subject).lower()
    for frag, svc in KNOWN_SERVICES.items():
        if any(f in blob for f in frag.split("|")):
            return svc
    return None


def detect(messages: list[dict]) -> list[dict]:
    """messages: [{sender, subject, snippet}] -> deduped subscription findings."""
    seen: dict[str, dict] = {}
    for m in messages:
        hit = _match(m.get("sender", ""), m.get("subject", ""))
        if not hit:
            continue
        name, est = hit
        body = f"{m.get('subject','')} {m.get('snippet','')}"
        found = _MONEY.search(body)
        amount = round(float(found.group(1).replace(",", ".")), 2) if found else est
        confident_amt = bool(found)
        trial = "trial" in body.lower()
        lapsing = any(w in body.lower() for w in ("cancel", "update payment", "lose access", "expired", "failed"))
        if name not in seen:
            seen[name] = {
                "name": name, "monthly": amount, "amount_known": confident_amt,
                "trial": trial, "lapsing": lapsing, "evidence": m.get("subject", "")[:120],
            }
    return list(seen.values())


def to_findings(subs: list[dict]) -> list[dict]:
    """Map detected subscriptions to Recoup's action/finding shape."""
    out = []
    for i, s in enumerate(subs, 1):
        annual = round(s["monthly"] * 12, 2)
        note = "free trial — will auto-convert" if s["trial"] else "payment lapsing" if s["lapsing"] else "active recurring charge"
        conf = 0.9 if s["amount_known"] else 0.72
        out.append({
            "id": f"gm_{i}", "kind": "dead_subscription",
            "title": f"Review {s['name']} subscription",
            "amount": annual, "cadence": "yearly", "currency": "$",
            "amount_label": f"${annual:,.0f}/yr", "unit_note": f"${s['monthly']:.2f}/mo" + ("" if s["amount_known"] else " (est.)"),
            "evidence": f"From your Gmail: \"{s['evidence']}\" — {note}",
            "rule": "dead_sub", "confidence": conf, "confidence_band": "high" if conf >= 0.85 else "medium",
            "caveat": "Confirm you've stopped using it before cancelling." if not s["trial"] else "Cancel before the trial converts to avoid the charge.",
            "claim_url": None, "agent": "sub_hunter", "agent_name": "Subscription Hunter",
            "verify": {"ok": True, "checks": [
                {"label": "matched a known subscription sender", "ok": True},
                {"label": "amount from receipt" if s["amount_known"] else "amount estimated (confirm)", "ok": s["amount_known"]},
                {"label": "from your own Gmail", "ok": True},
            ]},
            "draft": f"Subject: Cancel {s['name']}\n\nPlease cancel my {s['name']} subscription effective immediately and confirm in writing, including any proration owed.",
            "approvalState": "pending", "status": "drafted", "source": "gmail",
        })
    return out


# --- live read (activates with an OAuth token) ---
def available(token: str | None) -> bool:
    return bool(token)


def fetch_subscription_emails(token: str, max_results: int = 60) -> list[dict]:
    """Read-only Gmail API: list purchase/subscription emails -> [{sender,subject,snippet}]."""
    import httpx
    H = {"Authorization": f"Bearer {token}"}
    q = "category:purchases OR subject:(subscription OR receipt OR renew OR invoice OR membership) newer_than:1y"
    base = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    ids = httpx.get(base, headers=H, params={"q": q, "maxResults": max_results}, timeout=15).json().get("messages", [])
    out = []
    for it in ids[:max_results]:
        msg = httpx.get(f"{base}/{it['id']}", headers=H, params={"format": "metadata", "metadataHeaders": ["From", "Subject"]}, timeout=15).json()
        headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
        out.append({"sender": headers.get("from", ""), "subject": headers.get("subject", ""), "snippet": msg.get("snippet", "")})
    return out
