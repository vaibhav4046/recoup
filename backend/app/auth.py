"""Recoup — authentication: magic-link email, Google OAuth, CAPTCHA, sessions.

Design: the public demo and browser-only scan stay open so judges can evaluate
the product without an account. Auth exists for optional sign-in and Gmail
handoff flows. Each provider activates as its keys are configured. Without
provider keys it runs in dev mode for the start steps, but session signing fails
closed unless APP_SECRET is set. Sessions are stateless signed tokens
(HMAC-SHA256) — swap _SESSIONS for MongoDB to persist across restarts.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from .config import get_settings


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _ub64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


_MAGIC: dict[str, dict] = {}  # code -> {email, exp}
_OAUTH_STATES: dict[str, dict] = {}  # state -> {flow, exp}


def _secret() -> bytes | None:
    secret = (get_settings().app_secret or "").strip()
    if not secret or secret == "dev-secret-change-me":
        return None
    return secret.encode()


# ---- stateless signed sessions ----
def create_session(email: str, name: str = "") -> str:
    secret = _secret()
    if not secret:
        raise RuntimeError("APP_SECRET is required for session signing")
    payload = {"email": email, "name": name or email.split("@")[0], "exp": time.time() + 7 * 24 * 3600}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(secret, body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def session_user(token: str | None) -> dict | None:
    if not token or "." not in token:
        return None
    secret = _secret()
    if not secret:
        return None
    try:
        body, sig = token.split(".", 1)
        expect = _b64(hmac.new(secret, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expect):
            return None
        data = json.loads(_ub64(body))
        return data if data.get("exp", 0) >= time.time() else None
    except Exception:
        return None


# ---- magic link ----
def start_magic(email: str) -> dict:
    code = secrets.token_urlsafe(24)
    _MAGIC[code] = {"email": email, "exp": time.time() + 900}
    s = get_settings()
    link = f"{s.base_url.rstrip('/')}/api/auth/magic/verify?code={code}"
    sent = _send_email(email, link) if s.email_ready else False
    # dev ONLY: surface the link so the flow is testable before email is wired.
    # NEVER return a working sign-in link from a public (non-localhost) backend.
    dev_link = link if (not sent and s.is_local) else None
    return {"sent": sent, "dev_link": dev_link, "expires_s": 900}


def verify_magic(code: str) -> str | None:
    rec = _MAGIC.pop(code, None)
    if not rec or rec["exp"] < time.time():
        return None
    try:
        return create_session(rec["email"])
    except RuntimeError:
        return None


def issue_oauth_state(flow: str) -> str:
    """CSRF state for Google OAuth redirects. STATELESS: HMAC-signed + time-boxed so it
    survives server restarts/replica swaps mid-flow (an in-memory dict loses the state if
    the container recycles between /start and the callback — observed live on Spaces).
    Falls back to the in-memory dict only when APP_SECRET isn't configured."""
    secret = _secret()
    if secret:
        body = _b64(json.dumps({"f": flow, "exp": time.time() + 600, "n": secrets.token_urlsafe(8)},
                               separators=(",", ":")).encode())
        sig = _b64(hmac.new(secret, body.encode(), hashlib.sha256).digest())
        return f"{body}.{sig}"
    now = time.time()
    for key, rec in list(_OAUTH_STATES.items()):
        if rec.get("exp", 0) < now:
            _OAUTH_STATES.pop(key, None)
    state = secrets.token_urlsafe(24)
    _OAUTH_STATES[state] = {"flow": flow, "exp": now + 10 * 60}
    return state


def verify_oauth_state(state: str | None, flow: str) -> bool:
    if not state:
        return False
    secret = _secret()
    if secret and "." in state:
        try:
            body, sig = state.split(".", 1)
            expect = _b64(hmac.new(secret, body.encode(), hashlib.sha256).digest())
            if not hmac.compare_digest(sig, expect):
                return False
            data = json.loads(_ub64(body))
            return data.get("f") == flow and data.get("exp", 0) >= time.time()
        except Exception:
            return False
    rec = _OAUTH_STATES.pop(state, None)
    return bool(rec and rec.get("flow") == flow and rec.get("exp", 0) >= time.time())


def _send_email(to: str, link: str) -> bool:
    s = get_settings()
    if not s.email_ready:
        return False
    try:
        import httpx
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {s.resend_api_key}"},
            json={"from": s.email_from, "to": [to], "subject": "Your Recoup sign-in link",
                  "html": f'<p>Sign in to Recoup:</p><p><a href="{link}">Sign in</a> (expires in 15 minutes).</p>'},
            timeout=10,
        )
        return r.status_code < 300
    except Exception:
        return False


# ---- CAPTCHA (Cloudflare Turnstile) ----
def verify_captcha(token: str, ip: str = "") -> bool:
    s = get_settings()
    if not s.turnstile_secret:
        # CAPTCHA not configured -> not enforced (the frontend renders no widget, so there is no
        # token to verify). Set TURNSTILE_SITE_KEY + TURNSTILE_SECRET to turn on real bot protection.
        return True
    try:
        import httpx
        r = httpx.post("https://challenges.cloudflare.com/turnstile/v0/siteverify",
                       data={"secret": s.turnstile_secret, "response": token, "remoteip": ip}, timeout=10)
        return bool(r.json().get("success"))
    except Exception:
        return False


# ---- Google OAuth ----
def google_auth_url(state: str, gmail: bool = False, include_gmail: bool = False,
                    force_chooser: bool = False) -> str | None:
    s = get_settings()
    if not s.google_oauth_client_id:
        return None
    from urllib.parse import urlencode
    scope, redirect = "openid email profile", "/api/auth/google/callback"
    if gmail:  # standalone Gmail connect: read-only subscription emails only
        scope += " https://www.googleapis.com/auth/gmail.readonly"
        redirect = "/api/gmail/callback"
    elif include_gmail:  # ONE-TAP: sign-in AND read-only Gmail scan in a single consent
        scope += " https://www.googleapis.com/auth/gmail.readonly"
    params = {
        "client_id": s.google_oauth_client_id,
        "redirect_uri": f"{s.base_url.rstrip('/')}{redirect}",
        "response_type": "code", "scope": scope,
        "state": state, "access_type": "online",
    }
    # CRITICAL UX: never force prompt=consent. With it, Google re-shows the consent (and, for the
    # restricted Gmail scope on a not-yet-verified app, the harsh interstitial) on EVERY connect.
    # Without it, a user who already granted the scope is silently re-approved — the Gmail scan
    # runs with ZERO screens from the second connect onward. Sign-in keeps the account chooser
    # only (no re-consent), so repeat sign-in stays one tap.
    if not gmail or force_chooser:
        params["prompt"] = "select_account"  # chooser for sign-in / add-another-inbox; silent otherwise
    q = urlencode(params)
    return f"https://accounts.google.com/o/oauth2/v2/auth?{q}"


def google_exchange(code: str, redirect_path: str = "/api/auth/google/callback") -> dict:
    """Exchange an auth code for tokens (access_token used for the Gmail read)."""
    s = get_settings()
    import httpx
    return httpx.post("https://oauth2.googleapis.com/token", data={
        "code": code, "client_id": s.google_oauth_client_id,
        "client_secret": s.google_oauth_client_secret,
        "redirect_uri": f"{s.base_url.rstrip('/')}{redirect_path}",
        "grant_type": "authorization_code"}, timeout=10).json()


def google_callback(code: str) -> str | None:
    token, _access = google_callback_full(code)
    return token


def google_callback_full(code: str) -> tuple[str | None, str | None]:
    """Exchange the auth code -> (session_token, google_access_token). The access token lets the
    one-tap flow read subscription emails in the same pass (when the gmail scope was granted)."""
    s = get_settings()
    if not s.google_oauth_client_id:
        return None, None
    try:
        import httpx
        tok = httpx.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": s.google_oauth_client_id,
            "client_secret": s.google_oauth_client_secret,
            "redirect_uri": f"{s.base_url.rstrip('/')}/api/auth/google/callback",
            "grant_type": "authorization_code"}, timeout=10).json()
        access = tok.get("access_token")
        prof = httpx.get("https://www.googleapis.com/oauth2/v2/userinfo",
                         headers={"Authorization": f"Bearer {access}"}, timeout=10).json()
        return create_session(prof["email"], prof.get("name", "")), access
    except Exception:
        return None, None


def status() -> dict:
    """Honest report of which auth providers are wired."""
    s = get_settings()
    return {
        "google": bool(s.google_oauth_client_id),
        "magic_link_email": s.email_ready,
        "captcha": bool(s.turnstile_secret),
        "mode": "live" if (s.google_oauth_client_id or s.email_ready) else "dev",
    }
