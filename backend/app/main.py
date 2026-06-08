"""Recoup — Cloud / Spaces API (FastAPI).

Endpoints the frontend calls: scan the money surface, run the Gemini agent,
approve/reject each drafted action (the human gate), read the audit hash-chain,
and generate the recovery report. Every response carries a trace id. Gemini
activates with a free key; otherwise clearly-labelled fallback.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Cookie, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from . import auth
from .config import get_settings
from .state import APP

COOKIE = "ro_session"


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        APP.run_scan()
        APP.run_agent()
    except Exception:
        pass
    yield


app = FastAPI(title="Recoup API", version="0.1.0", lifespan=lifespan)
_s = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _s.cors_origins.strip() == "*" else [o.strip() for o in _s.cors_origins.split(",")],
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
    return _ok(request, service="recoup-api", version=app.version, mode=s.mode,
               integrations=s.integration_status(),
               gemini_model=s.gemini_model if s.gemini_ready else None,
               recurring_year=APP.scan_result["recurring_year"] if APP.scan_result else 0,
               one_time=APP.scan_result["one_time"] if APP.scan_result else 0,
               recoverable=APP.scan_result["total_recoverable"] if APP.scan_result else 0)


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


# ---- auth (public demo stays open; real-data endpoints require a session) ----
def _set_session(resp, token: str) -> None:
    resp.set_cookie(COOKIE, token, httponly=True, max_age=7 * 24 * 3600, samesite="lax", secure=True)


@app.get("/api/auth/status")
async def auth_status(request: Request):
    s = get_settings()
    return _ok(request, providers=auth.status(), turnstile_site_key=s.turnstile_site_key)


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
    token = auth.verify_magic(code)
    if not token:
        return RedirectResponse("/login.html?err=expired")
    resp = RedirectResponse("/?signed_in=1")
    _set_session(resp, token)
    return resp


@app.get("/api/auth/google/start")
async def google_start():
    url = auth.google_auth_url(state=uuid.uuid4().hex)
    if not url:
        return JSONResponse(status_code=503, content={"ok": False, "error": "Google OAuth not configured"})
    return RedirectResponse(url)


@app.get("/api/auth/google/callback")
async def google_cb(code: str):
    token = auth.google_callback(code)
    if not token:
        return RedirectResponse("/login.html?err=google")
    resp = RedirectResponse("/?signed_in=1")
    _set_session(resp, token)
    return resp


@app.get("/api/auth/me")
async def auth_me(request: Request, ro_session: str = Cookie(default="")):
    user = auth.session_user(ro_session)
    return _ok(request, user=user, authenticated=bool(user))


@app.post("/api/auth/logout")
async def auth_logout():
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie(COOKIE)
    return resp


# ---- Gmail subscription intake (read-only; subscriptions only, never bank data) ----
_GMAIL_FINDINGS: dict[str, list] = {}


@app.get("/api/gmail/start")
async def gmail_start():
    url = auth.google_auth_url(state="gmail_" + uuid.uuid4().hex[:8], gmail=True)
    if not url:
        return JSONResponse(status_code=503, content={"ok": False, "error": "Google OAuth not configured — set GOOGLE_OAUTH_CLIENT_ID"})
    return RedirectResponse(url)


@app.get("/api/gmail/callback")
async def gmail_cb(code: str):
    from . import gmail as gmailmod
    try:
        tok = auth.google_exchange(code, redirect_path="/api/gmail/callback")
        access = tok.get("access_token")
        if not access:
            return RedirectResponse("/?gmail=err")
        msgs = gmailmod.fetch_subscription_emails(access)
        findings = gmailmod.to_findings(gmailmod.detect(msgs))
    except Exception:
        return RedirectResponse("/?gmail=err")
    sess = auth.create_session("gmail-user")
    _GMAIL_FINDINGS[sess] = findings
    resp = RedirectResponse("/?gmail=ok")
    _set_session(resp, sess)
    return resp


@app.get("/api/gmail/findings")
async def gmail_findings(request: Request, ro_session: str = Cookie(default="")):
    return _ok(request, findings=_GMAIL_FINDINGS.get(ro_session, []))
