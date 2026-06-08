"""Recoup — authentication: magic-link email, Google OAuth, CAPTCHA, sessions.

Design: the PUBLIC demo stays open (judges must be able to see it); REAL-DATA
endpoints require a valid session, enforced server-side. Each provider activates
as its keys are configured. Without keys it runs in dev mode (the magic link is
returned to the page instead of emailed; CAPTCHA passes) so the whole flow is
testable before the providers are wired. Sessions are stateless signed tokens
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


def _secret() -> bytes:
    return (get_settings().app_secret or "dev-secret-change-me").encode()


# ---- stateless signed sessions ----
def create_session(email: str, name: str = "") -> str:
    payload = {"email": email, "name": name or email.split("@")[0], "exp": time.time() + 7 * 24 * 3600}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def session_user(token: str | None) -> dict | None:
    if not token or "." not in token:
        return None
    try:
        body, sig = token.split(".", 1)
        expect = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
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
    # dev mode: surface the link so the flow is testable before email is wired
    return {"sent": sent, "dev_link": None if sent else link, "expires_s": 900}


def verify_magic(code: str) -> str | None:
    rec = _MAGIC.pop(code, None)
    if not rec or rec["exp"] < time.time():
        return None
    return create_session(rec["email"])


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
        return True  # not configured -> don't block in dev
    try:
        import httpx
        r = httpx.post("https://challenges.cloudflare.com/turnstile/v0/siteverify",
                       data={"secret": s.turnstile_secret, "response": token, "remoteip": ip}, timeout=10)
        return bool(r.json().get("success"))
    except Exception:
        return False


# ---- Google OAuth ----
def google_auth_url(state: str, gmail: bool = False) -> str | None:
    s = get_settings()
    if not s.google_oauth_client_id:
        return None
    from urllib.parse import urlencode
    scope, redirect = "openid email profile", "/api/auth/google/callback"
    if gmail:  # read-only subscription emails only
        scope += " https://www.googleapis.com/auth/gmail.readonly"
        redirect = "/api/gmail/callback"
    q = urlencode({
        "client_id": s.google_oauth_client_id,
        "redirect_uri": f"{s.base_url.rstrip('/')}{redirect}",
        "response_type": "code", "scope": scope,
        "state": state, "access_type": "online", "prompt": "consent select_account",
    })
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
    s = get_settings()
    if not s.google_oauth_client_id:
        return None
    try:
        import httpx
        tok = httpx.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": s.google_oauth_client_id,
            "client_secret": s.google_oauth_client_secret,
            "redirect_uri": f"{s.base_url.rstrip('/')}/api/auth/google/callback",
            "grant_type": "authorization_code"}, timeout=10).json()
        prof = httpx.get("https://www.googleapis.com/oauth2/v2/userinfo",
                         headers={"Authorization": f"Bearer {tok['access_token']}"}, timeout=10).json()
        return create_session(prof["email"], prof.get("name", ""))
    except Exception:
        return None


def status() -> dict:
    """Honest report of which auth providers are wired."""
    s = get_settings()
    return {
        "google": bool(s.google_oauth_client_id),
        "magic_link_email": s.email_ready,
        "captcha": bool(s.turnstile_secret),
        "mode": "live" if (s.google_oauth_client_id or s.email_ready) else "dev",
    }
