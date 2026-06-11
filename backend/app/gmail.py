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
    "hulu": ("Hulu", 7.99), "hbo|max.com|hbomax": ("Max (HBO)", 15.99),
    "paramount": ("Paramount+", 11.99), "peacock": ("Peacock", 7.99),
    "primevideo|prime video": ("Prime Video", 8.99), "twitch": ("Twitch", 8.99),
    "xbox|game pass|gamepass": ("Xbox Game Pass", 16.99), "playstation|psn|sony": ("PlayStation Plus", 13.99),
    "nintendo": ("Nintendo Online", 3.99), "crunchyroll": ("Crunchyroll", 7.99),
    "deezer": ("Deezer", 11.99), "tidal": ("Tidal", 10.99),
    "grammarly": ("Grammarly", 12.00), "canva": ("Canva", 12.99),
    "figma": ("Figma", 12.00), "zoom": ("Zoom", 13.99),
    "1password|agilebits": ("1Password", 2.99), "lastpass": ("LastPass", 3.00),
    "nordvpn": ("NordVPN", 12.99), "expressvpn": ("ExpressVPN", 12.95), "surfshark": ("Surfshark", 12.95),
    "microsoft|office365|microsoft365": ("Microsoft 365", 9.99), "squarespace": ("Squarespace", 16.00),
    "wix.com": ("Wix", 16.00), "mailchimp|intuit mailchimp": ("Mailchimp", 13.00),
    "substack": ("Substack", 5.00), "medium.com": ("Medium", 5.00),
    "economist": ("The Economist", 19.00), "wsj|wall street journal|dowjones": ("WSJ", 38.99),
    "ft.com|financial times": ("Financial Times", 40.00), "bloomberg": ("Bloomberg", 34.99),
    "puregym|pure gym": ("PureGym", 25.99), "thegymgroup|the gym group": ("The Gym Group", 22.99),
    "peloton": ("Peloton", 12.99), "calm.com": ("Calm", 14.99), "headspace": ("Headspace", 12.99),
    "duolingo": ("Duolingo", 12.99), "masterclass": ("MasterClass", 15.00),
    "skillshare": ("Skillshare", 14.00), "coursera": ("Coursera", 49.00), "udemy": ("Udemy", 16.58),
    "crunchyroll": ("Crunchyroll", 7.99), "scribd|everand": ("Everand", 11.99),
    "doordash|dashpass": ("DashPass", 9.99), "uber one|uberone": ("Uber One", 9.99),
    "instacart": ("Instacart+", 9.99), "chegg": ("Chegg", 15.95),
    "norton": ("Norton", 9.99), "mcafee": ("McAfee", 9.99),
    "ring.com|ring protect": ("Ring Protect", 4.99), "nest aware": ("Nest Aware", 8.00),
    "evernote": ("Evernote", 14.99), "vimeo": ("Vimeo", 12.00), "shutterstock": ("Shutterstock", 29.00),
}
# currency symbol + amount; supports "1,200.00" thousands groups and plain "12.99"
_MONEY = re.compile(r"([$£€₹]|USD|GBP|EUR|INR|Rs\.?)\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:[.,]\d{2})?)", re.I)
# REAL currency, never assumed: symbols pass through; ISO codes / Rs map to their symbol.
_CCY_MAP = {"USD": "$", "GBP": "£", "EUR": "€", "INR": "₹", "RS": "₹", "RS.": "₹"}


def _parse_amount(raw: str) -> float:
    """A comma before exactly 3 digits is a thousands separator ("1,200" -> 1200);
    a comma before 2 digits is a EU decimal ("12,99" -> 12.99)."""
    raw = raw.strip()
    raw = raw.replace(",", "") if re.search(r",\d{3}(?:\D|$)", raw) else raw.replace(",", ".")
    try:
        return round(float(raw), 2)
    except ValueError:
        return 0.0


def _match(sender: str, subject: str) -> tuple[str, float] | None:
    blob = (sender + " " + subject).lower()
    for frag, svc in KNOWN_SERVICES.items():
        if any(f in blob for f in frag.split("|")):
            return svc
    return None


# signals an email is about a RECURRING charge (so the generic detector catches merchants not listed above)
_SUB_SIGNALS = (
    "subscription", "auto-renew", "auto renew", "autorenew", "renews", "renewal", "will renew",
    "has renewed", "your plan", "membership", "monthly plan", "annual plan", "recurring",
    "billed monthly", "billed annually", "next payment", "next billing", "billing cycle",
    "payment received", "receipt for", "your invoice", "thanks for subscribing", "your membership",
    "renew your", "plan renews", "premium",
)
_SENDER_JUNK = {"no-reply", "noreply", "no_reply", "do-not-reply", "donotreply", "support", "billing",
                "team", "hello", "info", "account", "accounts", "notifications", "mail", "email",
                "help", "service", "customer", "care", "receipts", "invoices", "news", "updates"}


def _looks_like_subscription(text: str) -> bool:
    return any(sig in text for sig in _SUB_SIGNALS)


def _merchant_from_sender(sender: str) -> str:
    """A clean brand name from 'Brand <addr@domain>' (preferred) or the domain root."""
    s = (sender or "").strip()
    m = re.match(r'^"?([^"<]+?)"?\s*<', s)
    name = (m.group(1).strip() if m else "")
    if name and "@" not in name and name.lower() not in _SENDER_JUNK:
        name = re.sub(r"\b(billing|support|team|receipts?|invoices?|notifications?|account|the)\b", "", name, flags=re.I).strip(" -|,·.")
        if len(name) >= 2:
            return name[:40]
    dm = re.search(r"@([\w.-]+)", s)
    if dm:
        labels = [p for p in dm.group(1).lower().split(".") if p not in
                  ("com", "co", "uk", "net", "org", "io", "www", "mail", "email", "billing",
                   "e", "m", "t", "news", "app", "go", "info", "us", "ca", "au")]
        if labels:
            return max(labels, key=len).capitalize()[:40]
    return ""


def detect(messages: list[dict]) -> list[dict]:
    """messages: [{sender, subject, snippet}] -> deduped subscription findings."""
    seen: dict[str, dict] = {}
    for m in messages:
        sender, subject = m.get("sender", ""), m.get("subject", "")
        body = f"{subject} {m.get('snippet','')}"
        text = body.lower()
        # money already returned / subscription already cancelled -> not a live leak; skip it
        if any(w in text for w in ("refund", "refunded", "credited", "reversal", "cancellation confirmed", "we have cancelled", "we've cancelled", "has been cancelled")):
            continue
        found = _MONEY.search(body)
        hit = _match(sender, subject)
        if hit:
            name, est, generic = hit[0], hit[1], False
        else:
            # GENERIC catch-all: any sender whose email signals a recurring charge AND carries a real
            # amount (no estimate for an unknown merchant -> stays honest). Catches the long tail.
            if not (_looks_like_subscription(text) and found):
                continue
            name = _merchant_from_sender(sender)
            if len(name) < 2:
                continue
            est, generic = 0.0, True
        amount = _parse_amount(found.group(2)) if found else est
        if found and amount <= 0:                # unparseable figure -> fall back to a typical estimate
            amount, found = est, None
        if amount <= 0:
            continue
        currency = (_CCY_MAP.get(found.group(1).upper(), found.group(1)) if found else "$")  # $ only when no currency is visible (estimate, labeled)
        confident_amt = bool(found)
        # detect the billing period so an annual receipt is NOT annualized again (the ×12 bug)
        if re.search(r"\b(year|yearly|annual|annually|per year|/ ?yr|12 ?months)\b", text):
            period = "year"
        elif re.search(r"\b(month|monthly|per month|/ ?mo)\b", text):
            period = "month"
        else:
            period = "unknown"
        trial = "trial" in text
        lapsing = any(w in text for w in ("cancel", "update payment", "lose access", "expired", "failed"))
        if name not in seen:
            seen[name] = {
                "name": name, "amount": amount, "period": period, "currency": currency,
                "amount_known": confident_amt, "trial": trial, "lapsing": lapsing, "generic": generic,
                "evidence": subject[:120],
            }
    return list(seen.values())


def to_findings(subs: list[dict]) -> list[dict]:
    """Map detected subscriptions to Recoup's action/finding shape."""
    out = []
    for i, s in enumerate(subs, 1):
        currency = s.get("currency", "$")
        amt = s.get("amount", 0.0)
        period = s.get("period", "unknown")
        if period == "year":
            annual = round(amt, 2)               # the receipt amount IS the yearly figure — do not annualize
            monthly = round(amt / 12, 2)
        else:                                     # monthly or unknown -> treat the figure as a monthly charge
            annual = round(amt * 12, 2)
            monthly = round(amt, 2)
        note = "free trial — will auto-convert" if s["trial"] else "payment lapsing" if s["lapsing"] else ("annual plan" if period == "year" else "active recurring charge")
        gen = s.get("generic", False)
        # HONESTY RULE (the Anthropic/Spotify bug): receipts prove a subscription EXISTS — they
        # can NEVER prove it's unused. Regular subscriptions are framed as "you decide" review
        # items, never cancel recommendations. Only trials (auto-convert) and lapsing payments
        # are actionable from receipt evidence alone.
        actionable = bool(s["trial"] or s["lapsing"])
        conf = ((0.6 if gen else 0.9) if s["amount_known"] else (0.5 if gen else 0.72)) if actionable \
            else (0.55 if s["amount_known"] else 0.45)
        out.append({
            "id": f"gm_{i}", "kind": "dead_subscription",
            "title": (f"Trial converting: {s['name']}" if s["trial"] else
                      f"{s['name']} — active subscription (still using it?)"),
            "amount": annual, "cadence": "yearly", "currency": currency,
            "amount_label": f"{currency}{annual:,.0f}/yr", "unit_note": f"{currency}{monthly:.2f}/mo" + ("" if s["amount_known"] else " (est.)"),
            "evidence": f"From your Gmail: \"{s['evidence']}\" — {note}",
            "rule": "dead_sub", "confidence": conf, "confidence_band": "high" if conf >= 0.85 else "medium" if conf >= 0.6 else "review",
            "caveat": ("Cancel before the trial converts to avoid the charge." if s["trial"] else
                       "Detected from receipts only — Recoup CANNOT see whether you use this service. "
                       "Keep it if you use it; this card shows what it costs per year so YOU decide."),
            "claim_url": None,
            "odds": "very likely" if actionable else "your call",
            "timeline": "before renewal" if s["trial"] else "instant–1 cycle",
            "agent": "sub_hunter", "agent_name": "Subscription Hunter",
            "verify": {"ok": True, "needs_confirm": not actionable, "checks": [
                {"label": "email signals a recurring charge" if gen else "matched a known subscription sender", "ok": True},
                {"label": "amount from receipt" if s["amount_known"] else "amount estimated (confirm)", "ok": s["amount_known"]},
                {"label": "usage is NOT verifiable from receipts — you confirm it", "ok": actionable},
            ]},
            "draft": f"Subject: Cancel {s['name']}\n\nPlease cancel my {s['name']} subscription effective immediately and confirm in writing, including any proration owed.",
            "approvalState": "pending", "status": "drafted", "source": "gmail",
        })
    return out


# --- live read (activates with an OAuth token) ---
def available(token: str | None) -> bool:
    return bool(token)


def fetch_subscription_emails(token: str, max_results: int = 120) -> list[dict]:
    """Read-only Gmail API: list purchase/subscription emails -> [{sender,subject,snippet}]."""
    import httpx
    H = {"Authorization": f"Bearer {token}"}
    q = ('category:purchases OR subject:(subscription OR receipt OR renew OR renewal OR invoice OR '
         'membership OR "auto-renew" OR "your plan" OR billing OR payment OR premium) newer_than:1y')
    base = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    ids = httpx.get(base, headers=H, params={"q": q, "maxResults": max_results}, timeout=15).json().get("messages", [])
    out = []
    for it in ids[:max_results]:
        msg = httpx.get(f"{base}/{it['id']}", headers=H, params={"format": "metadata", "metadataHeaders": ["From", "Subject"]}, timeout=15).json()
        headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
        out.append({"sender": headers.get("from", ""), "subject": headers.get("subject", ""), "snippet": msg.get("snippet", "")})
    return out
