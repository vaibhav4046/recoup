"""Recoup — Cloud / Spaces API (FastAPI).

Endpoints the frontend calls: scan the money surface, run the Gemini agent,
approve/reject each drafted action (the human gate), read the audit hash-chain,
and generate the recovery report. Every response carries a trace id. Gemini
activates with a free key; otherwise clearly-labelled fallback.
"""
from __future__ import annotations

import uuid
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Cookie, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response

from . import auth
from .config import get_settings
from .mcp import TOOLS as MCP_TOOLS, handle_mcp
from .state import APP

COOKIE = "ro_session"


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from . import vector
        vector.seed()  # embed the precedent corpus + ensure the Atlas Vector Search index
    except Exception:
        pass
    try:
        APP.run_scan()
        APP.run_agent()
    except Exception:
        pass
    yield


app = FastAPI(title="Recoup API", version="0.3.0", lifespan=lifespan)
_s = get_settings()
_cors_list = ["*"] if _s.cors_origins.strip() == "*" else [o.strip() for o in _s.cors_origins.split(",") if o.strip()]
_cors_wild = "*" in _cors_list  # catch "*" ANYWHERE in the list, not only an exact ["*"] — a wildcard mixed with other origins still makes Starlette reflect any origin when credentials are on
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_list,
    # SECURITY: never combine a wildcard/reflected origin with credentials. Credentials are only
    # allowed when the origin is a pinned allowlist (not "*"), which closes the reflect-origin hole.
    allow_credentials=not _cors_wild,
    allow_methods=["*"], allow_headers=["*"], expose_headers=["x-trace-id"],
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tid(r: Request) -> str:
    return getattr(r.state, "trace_id", "tr_unknown")


def _ok(r: Request, **payload) -> dict:
    return {"ok": True, "trace_id": _tid(r), "ts": _now_iso(), **payload}


@app.middleware("http")
async def trace_mw(request: Request, call_next):
    request.state.trace_id = "tr_" + uuid.uuid4().hex[:12]
    response = await call_next(request)
    response.headers["x-trace-id"] = request.state.trace_id
    return response


@app.get("/api/health")
async def health(request: Request):
    s = get_settings()
    from . import vector
    return _ok(request, service="recoup-api", version=app.version, mode=s.mode,
               integrations=s.integration_status(),
               gemini_model=s.gemini_model if s.gemini_ready else None,
               vector=vector.status(),  # MongoDB Atlas Vector Search — the agent's retrieval brain
               audit=APP.audit.verify(),  # SHA-256 chain state {intact,count,head} — externally verifiable
               recurring_year=APP.scan_result["recurring_year"] if APP.scan_result else 0,
               one_time=APP.scan_result["one_time"] if APP.scan_result else 0,
               recoverable=APP.scan_result["total_recoverable"] if APP.scan_result else 0)


@app.post("/api/ask")
async def ask(request: Request):
    """Voice agent Q&A — a concise spoken-style Gemini answer (free AI Studio key)."""
    body = await request.json()
    q = ((body or {}).get("question") or "").strip()
    if not q:
        return JSONResponse(status_code=400, content={"ok": False, "error": "question required"})
    ctx = ((body or {}).get("context") or "")[:400]
    from . import agent
    res = await run_in_threadpool(agent.voice_answer, q, ctx)
    return _ok(request, **res)


@app.post("/api/tts")
async def tts(request: Request):
    """ElevenLabs TTS proxy (key stays server-side). Returns audio/mpeg, or 204 when no key is
    configured so the frontend falls back to the free browser voice."""
    s = get_settings()
    if not s.elevenlabs_api_key:
        return Response(status_code=204)
    body = await request.json()
    text = ((body or {}).get("text") or "").strip()[:800]
    if not text:
        return Response(status_code=204)

    def _call():
        import httpx
        return httpx.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{s.elevenlabs_voice_id}",
            headers={"xi-api-key": s.elevenlabs_api_key, "accept": "audio/mpeg", "content-type": "application/json"},
            json={"text": text, "model_id": "eleven_turbo_v2_5",
                  "voice_settings": {"stability": 0.4, "similarity_boost": 0.7}},
            timeout=25,
        )

    try:
        r = await run_in_threadpool(_call)
        if r.status_code >= 300:
            return Response(status_code=204)
        return Response(content=r.content, media_type="audio/mpeg")
    except Exception:
        return Response(status_code=204)


@app.post("/api/scan")
async def scan_ep(request: Request):
    res = await run_in_threadpool(lambda: APP.run_scan(_tid(request)))
    return _ok(request, findings=res["findings"], total_recoverable=res["total_recoverable"])


@app.post("/api/agent/run")
async def agent_run(request: Request):
    res = await run_in_threadpool(lambda: APP.run_agent(_tid(request)))
    return _ok(request, **res)


@app.post("/api/actions/{action_id}/approve")
async def approve(action_id: str, request: Request):
    try:
        a = APP.approve_action(action_id, trace_id=_tid(request))
    except KeyError:
        return JSONResponse(status_code=404, content={"ok": False, "error": f"unknown action {action_id}", "trace_id": _tid(request)})
    return _ok(request, action=a, totals=APP.totals(), contained=APP.contained())


@app.post("/api/actions/{action_id}/reject")
async def reject(action_id: str, request: Request):
    try:
        a = APP.reject_action(action_id, trace_id=_tid(request))
    except KeyError:
        return JSONResponse(status_code=404, content={"ok": False, "error": f"unknown action {action_id}", "trace_id": _tid(request)})
    return _ok(request, action=a, totals=APP.totals(), contained=APP.contained())


@app.post("/api/actions/{action_id}/sent")
async def mark_sent(action_id: str, request: Request):
    try:
        a = APP.mark_sent(action_id, trace_id=_tid(request))
    except KeyError:
        return JSONResponse(status_code=404, content={"ok": False, "error": f"unknown action {action_id}", "trace_id": _tid(request)})
    return _ok(request, action=a, totals=APP.totals())


@app.post("/api/actions/{action_id}/paid")
async def mark_paid(action_id: str, request: Request):
    try:
        a = APP.mark_paid(action_id, trace_id=_tid(request))
    except KeyError:
        return JSONResponse(status_code=404, content={"ok": False, "error": f"unknown action {action_id}", "trace_id": _tid(request)})
    return _ok(request, action=a, totals=APP.totals())


@app.get("/api/audit")
async def audit_ep(request: Request):
    return _ok(request, events=APP.audit.list(), integrity=APP.audit.verify())


@app.post("/api/report")
async def report(request: Request):
    rep = await run_in_threadpool(lambda: APP.report(_tid(request)))
    return _ok(request, report=rep)


@app.get("/api/state")
async def full_state(request: Request):
    s = get_settings()
    return _ok(
        request, mode=s.mode, integrations=s.integration_status(),
        scan=APP.scan_result, actions=APP.actions, run=APP.last_run,
        reasoning=APP.last_plan["reasoning"] if APP.last_plan else [],
        swarm=APP.last_plan.get("swarm") if APP.last_plan else [],
        verified=APP.last_plan.get("verified") if APP.last_plan else 0,
        needs_confirm=APP.last_plan.get("needs_confirm") if APP.last_plan else 0,
        flagged=APP.last_plan.get("flagged") if APP.last_plan else 0,
        totals=APP.totals(),
        recurring_year=APP.scan_result["recurring_year"] if APP.scan_result else 0,
        one_time=APP.scan_result["one_time"] if APP.scan_result else 0,
        recoverable=APP.scan_result["total_recoverable"] if APP.scan_result else 0,
        audit=APP.audit.list(), auditIntegrity=APP.audit.verify(), contained=APP.contained(),
    )


@app.get("/mcp")
@app.get("/api/mcp")
async def mcp_info(request: Request):
    return _ok(request, protocol="MCP JSON-RPC over HTTP", tools=[t["name"] for t in MCP_TOOLS])


@app.post("/mcp")
@app.post("/api/mcp")
async def mcp_ep(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Invalid JSON"}})
    return JSONResponse(content=handle_mcp(body))


# ---- auth (public demo stays open; auth powers optional account/Gmail flows) ----
def _set_session(resp, token: str) -> None:
    resp.set_cookie(COOKIE, token, httponly=True, max_age=7 * 24 * 3600, samesite="lax", secure=True)


@app.get("/api/auth/status")
async def auth_status(request: Request):
    s = get_settings()
    # signin_ready=True signals the frontend that THIS build has the frontend-absolute OAuth redirect
    # fix (so login won't dead-end on a backend 404). Older deployed builds lack this key -> login gates off.
    return _ok(request, providers=auth.status(), turnstile_site_key=s.turnstile_site_key, signin_ready=True)


@app.post("/api/auth/magic/start")
async def magic_start(request: Request):
    body = await request.json()
    email = (body or {}).get("email", "").strip()
    captcha = (body or {}).get("captcha", "")
    if not email or "@" not in email:
        return JSONResponse(status_code=400, content={"ok": False, "error": "a valid email is required"})
    if not auth.verify_captcha(captcha, request.client.host if request.client else ""):
        return JSONResponse(status_code=400, content={"ok": False, "error": "captcha verification failed"})
    return _ok(request, **auth.start_magic(email))


@app.get("/api/auth/magic/verify")
async def magic_verify(code: str):
    fe = get_settings().frontend_url.rstrip("/")  # redirect to the FRONTEND, not the backend host (which has no "/" route -> 404)
    token = auth.verify_magic(code)
    if not token:
        return RedirectResponse(f"{fe}/login.html?err=expired")
    resp = RedirectResponse(f"{fe}/?signed_in=1")
    _set_session(resp, token)
    return resp


@app.get("/api/auth/google/start")
async def google_start():
    url = auth.google_auth_url(state=auth.issue_oauth_state("google"))
    if not url:
        return JSONResponse(status_code=503, content={"ok": False, "error": "Google OAuth not configured"})
    return RedirectResponse(url)


@app.get("/api/auth/google/callback")
async def google_cb(code: str = "", state: str = ""):
    fe = get_settings().frontend_url.rstrip("/")  # redirect to the FRONTEND, not the backend host (which has no "/" route -> 404)
    if not auth.verify_oauth_state(state, "google"):
        return RedirectResponse(f"{fe}/login.html?err=state")
    token = auth.google_callback(code)
    if not token:
        return RedirectResponse(f"{fe}/login.html?err=google")
    resp = RedirectResponse(f"{fe}/?signed_in=1")
    _set_session(resp, token)
    return resp


@app.get("/api/auth/me")
async def auth_me(request: Request, ro_session: str = Cookie(default="")):
    user = auth.session_user(ro_session)
    return _ok(request, user=user, authenticated=bool(user))


@app.post("/api/auth/logout")
async def auth_logout():
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie(COOKIE, path="/", secure=True, samesite="lax", httponly=True)
    return resp


# ---- Gmail subscription intake (read-only; subscriptions only, never bank data) ----
_GMAIL_FINDINGS: dict[str, dict] = {}
_GMAIL_TTL_S = 5 * 60


def _store_gmail_findings(findings: list) -> str:
    token = uuid.uuid4().hex
    _GMAIL_FINDINGS[token] = {"findings": findings, "exp": time.time() + _GMAIL_TTL_S}
    return token


def _take_gmail_findings(key: str, pop: bool = True) -> list:
    if not key:
        return []
    rec = _GMAIL_FINDINGS.pop(key, None) if pop else _GMAIL_FINDINGS.get(key)
    if not rec or rec.get("exp", 0) < time.time():
        _GMAIL_FINDINGS.pop(key, None)
        return []
    return rec.get("findings", [])


@app.get("/api/gmail/start")
async def gmail_start():
    url = auth.google_auth_url(state=auth.issue_oauth_state("gmail"), gmail=True)
    if not url:
        return JSONResponse(status_code=503, content={"ok": False, "error": "Google OAuth not configured — set GOOGLE_OAUTH_CLIENT_ID"})
    return RedirectResponse(url)


@app.get("/api/gmail/callback")
async def gmail_cb(code: str = "", state: str = ""):
    from . import gmail as gmailmod
    fe = get_settings().frontend_url.rstrip("/")
    if not auth.verify_oauth_state(state, "gmail"):
        return RedirectResponse(f"{fe}/#gmail=err")
    try:
        tok = auth.google_exchange(code, redirect_path="/api/gmail/callback")
        access = tok.get("access_token")
        if not access:
            return RedirectResponse(f"{fe}/#gmail=err")
        msgs = gmailmod.fetch_subscription_emails(access)
        findings = gmailmod.to_findings(gmailmod.detect(msgs))
    except Exception:
        return RedirectResponse(f"{fe}/#gmail=err")
    token = _store_gmail_findings(findings)  # one-time handoff token (cookies don't cross origin)
    return RedirectResponse(f"{fe}/#gmail={token}")


@app.get("/api/gmail/findings")
async def gmail_findings(request: Request, token: str = "", ro_session: str = Cookie(default="")):
    key = token or ro_session
    findings = _take_gmail_findings(key, pop=bool(token))
    return _ok(request, findings=findings)


@app.post("/api/gmail/findings")
async def gmail_findings_post(request: Request, ro_session: str = Cookie(default="")):
    try:
        body = await request.json()
    except Exception:
        body = {}
    token = (body or {}).get("token", "")
    findings = _take_gmail_findings(token or ro_session, pop=bool(token))
    return _ok(request, findings=findings)


@app.post("/api/account/forget")
async def forget(request: Request, token: str = "", ro_session: str = Cookie(default="")):
    """Right-to-erasure: clear any Gmail-derived findings we hold for this user.
    Revoke the OAuth grant itself at myaccount.google.com/permissions."""
    if token:
        _GMAIL_FINDINGS.pop(token, None)
    elif ro_session:
        _GMAIL_FINDINGS.pop(ro_session, None)
    # no token and no session -> no identity to scope a delete to; never wipe every visitor's findings
    return _ok(request, cleared=True, revoke_at="https://myaccount.google.com/permissions")
