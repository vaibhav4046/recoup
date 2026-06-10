"""Recoup — Cloud Run API (FastAPI).

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
from pathlib import Path

from fastapi import Cookie, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from . import auth
from .config import get_settings
from .mcp import TOOLS as MCP_TOOLS, handle_mcp
from .state import APP

COOKIE = "ro_session"


def _warmup():
    """Seed the vector corpus + prime the first scan/agent run. Runs in a daemon thread so the
    uvicorn port binds immediately (Cloud Run readiness) instead of blocking on ~25 embed calls."""
    try:
        from . import vector
        vector.seed()            # precedent corpus + Atlas Vector Search index
        vector.seed_playbooks()  # recovery playbooks corpus + index
    except Exception:
        pass
    try:
        APP.run_scan()
        APP.run_agent()
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    import threading
    threading.Thread(target=_warmup, daemon=True).start()  # don't block the port bind on warmup
    yield


app = FastAPI(title="Recoup API", version="0.4.3", lifespan=lifespan)
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


async def _json_obj(request: Request) -> dict:
    """Parse a JSON object body, tolerating empty/malformed input — returns {} instead of a raw 500."""
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}


@app.middleware("http")
async def trace_mw(request: Request, call_next):
    request.state.trace_id = "tr_" + uuid.uuid4().hex[:12]
    response = await call_next(request)
    response.headers["x-trace-id"] = request.state.trace_id
    return response


@app.get("/api/health")
async def health(request: Request):
    s = get_settings()
    from . import vector, adk_agent
    vstatus = await run_in_threadpool(vector.status)  # touches Atlas — keep it off the event loop
    integrations = s.integration_status()
    # honest: never report gemini "live" while the quota circuit-breaker is open
    if integrations.get("gemini") == "live" and adk_agent.quota_blocked():
        integrations["gemini"] = "rate-limited"
    return _ok(request, service="recoup-api", version=app.version, mode=s.mode,
               integrations=integrations,
               gemini_model=s.gemini_model if s.gemini_ready else None,
               vector=vstatus,  # MongoDB Atlas Vector Search — the agent's retrieval brain
               audit=APP.audit.verify(),  # SHA-256 chain state {intact,count,head} — externally verifiable
               recurring_year=APP.scan_result["recurring_year"] if APP.scan_result else 0,
               one_time=APP.scan_result["one_time"] if APP.scan_result else 0,
               one_time_by_currency=APP.scan_result.get("one_time_by_currency") if APP.scan_result else {},
               recoverable=APP.scan_result["total_recoverable"] if APP.scan_result else 0)


@app.post("/api/vector/seed")
async def vector_seed(request: Request):
    """(Re)embed BOTH corpora (precedents + playbooks) and ensure both Atlas Vector Search indexes. Idempotent."""
    from . import vector
    pre = await run_in_threadpool(vector.seed)
    pb = await run_in_threadpool(vector.seed_playbooks)
    return _ok(request, precedents=pre, playbooks=pb)


@app.post("/api/agent/plan")
async def agent_plan(request: Request):
    """ADK Gemini agent: plan a recovery for one detected charge. Amounts stay deterministic;
    returns status pending_approval (human gate downstream)."""
    body = await _json_obj(request)
    charge = (body or {}).get("charge")
    if not isinstance(charge, dict) or not charge:
        return JSONResponse(status_code=400, content={"ok": False, "error": "charge object required"})
    from . import adk_agent
    res = await adk_agent.plan_charge(charge, str((body or {}).get("playbook") or ""))
    return _ok(request, **res)


@app.post("/api/agent/recover")
async def agent_recover(request: Request):
    """End-to-end agent spine: charge -> Atlas Vector Search retrieves the best recovery playbook ->
    ADK Gemini drafts the recovery grounded in it -> status pending_approval (human gate downstream)."""
    body = await _json_obj(request)
    charge = (body or {}).get("charge")
    if not isinstance(charge, dict) or not charge:
        return JSONResponse(status_code=400, content={"ok": False, "error": "charge object required"})
    from . import vector, adk_agent
    q = f"{charge.get('merchant', '')} {charge.get('title', '')} {charge.get('kind', '')}".strip()
    mcp = await adk_agent.mcp_probe(charge)
    pb = await run_in_threadpool(vector.retrieve_playbook, q, str(charge.get("kind") or ""))
    ts = adk_agent.mongodb_toolset()
    tools = [ts] if ts is not None else None
    res = await adk_agent.plan_charge(charge, playbook=(pb or {}).get("text", ""), tools=tools)
    return _ok(request, charge=charge, mcp=mcp, playbook=pb, **res)


# (voice TTS is browser-native Web Speech only — no server-side / non-Google TTS)


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
        a = await run_in_threadpool(APP.approve_action, action_id, _tid(request))
    except KeyError:
        return JSONResponse(status_code=404, content={"ok": False, "error": f"unknown action {action_id}", "trace_id": _tid(request)})
    return _ok(request, action=a, totals=APP.totals(), contained=APP.contained())


@app.post("/api/actions/{action_id}/reject")
async def reject(action_id: str, request: Request):
    try:
        a = await run_in_threadpool(APP.reject_action, action_id, _tid(request))
    except KeyError:
        return JSONResponse(status_code=404, content={"ok": False, "error": f"unknown action {action_id}", "trace_id": _tid(request)})
    except PermissionError:
        return JSONResponse(status_code=409, content={"ok": False, "error": "already_actioned", "message": "This claim was already sent or recovered.", "trace_id": _tid(request)})
    return _ok(request, action=a, totals=APP.totals(), contained=APP.contained())


@app.post("/api/actions/{action_id}/sent")
async def mark_sent(action_id: str, request: Request):
    try:
        a = await run_in_threadpool(APP.mark_sent, action_id, _tid(request))
    except KeyError:
        return JSONResponse(status_code=404, content={"ok": False, "error": f"unknown action {action_id}", "trace_id": _tid(request)})
    except PermissionError:
        return JSONResponse(status_code=409, content={"ok": False, "error": "approval_required", "message": "Approve the claim before marking it sent.", "trace_id": _tid(request)})
    return _ok(request, action=a, totals=APP.totals())


@app.post("/api/actions/{action_id}/paid")
async def mark_paid(action_id: str, request: Request):
    try:
        a = await run_in_threadpool(APP.mark_paid, action_id, _tid(request))
    except KeyError:
        return JSONResponse(status_code=404, content={"ok": False, "error": f"unknown action {action_id}", "trace_id": _tid(request)})
    except PermissionError:
        return JSONResponse(status_code=409, content={"ok": False, "error": "approval_required", "message": "Approve the claim before marking it recovered.", "trace_id": _tid(request)})
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
        one_time_by_currency=APP.scan_result.get("one_time_by_currency") if APP.scan_result else {},
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
    # SameSite=None so the session survives the cross-site fetch from the static frontend to this
    # API (CORS is a pinned allowlist with credentials, never a wildcard). On the single-origin
    # Cloud Run deployment this is same-site anyway.
    resp.set_cookie(COOKIE, token, httponly=True, max_age=7 * 24 * 3600, samesite="none", secure=True)


@app.get("/api/auth/status")
async def auth_status(request: Request):
    s = get_settings()
    # signin_ready=True signals the frontend that THIS build has the frontend-absolute OAuth redirect
    # fix (so login won't dead-end on a backend 404). Older deployed builds lack this key -> login gates off.
    return _ok(request, providers=auth.status(), turnstile_site_key=s.turnstile_site_key, signin_ready=True)


@app.post("/api/auth/magic/start")
async def magic_start(request: Request):
    body = await _json_obj(request)
    email = str((body or {}).get("email") or "").strip()
    captcha = str((body or {}).get("captcha") or "")
    if not email or "@" not in email:
        return JSONResponse(status_code=400, content={"ok": False, "error": "a valid email is required"})
    ip = request.client.host if request.client else ""
    if not await run_in_threadpool(auth.verify_captcha, captcha, ip):  # blocking httpx — off the loop
        return JSONResponse(status_code=400, content={"ok": False, "error": "captcha verification failed"})
    return _ok(request, **await run_in_threadpool(auth.start_magic, email))  # blocking httpx (email send)


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
    # CLEAN sign-in: request only openid/email/profile — NON-sensitive scopes that do NOT
    # trigger Google's "unverified app" interstitial, so the user signs in in one tap with no
    # Advanced -> Continue. Read-only Gmail is a SEPARATE opt-in (/api/gmail/start); that path
    # does show the unverified screen until the OAuth app is Google-verified (unavoidable for a
    # restricted scope on an unverified app).
    url = auth.google_auth_url(state=auth.issue_oauth_state("google"))
    if not url:
        return JSONResponse(status_code=503, content={"ok": False, "error": "Google OAuth not configured"})
    return RedirectResponse(url)


@app.get("/api/auth/google/callback")
async def google_cb(code: str = "", state: str = ""):
    fe = get_settings().frontend_url.rstrip("/")  # redirect to the FRONTEND, not the backend host (which has no "/" route -> 404)
    if not auth.verify_oauth_state(state, "google"):
        return RedirectResponse(f"{fe}/login.html?err=state")
    # blocking httpx (token exchange + userinfo) — keep off the single event loop so sign-in
    # never freezes /api/health or the static frontend for other users
    token, access = await run_in_threadpool(auth.google_callback_full, code)
    if not token:
        return RedirectResponse(f"{fe}/login.html?err=google")
    # same-pass real-inbox scan (only if the gmail scope was granted; never blocks sign-in)
    dest = f"{fe}/?signed_in=1"
    if access:
        try:
            from . import gmail as gm
            msgs = await run_in_threadpool(gm.fetch_subscription_emails, access)
            findings = gm.to_findings(gm.detect(msgs))
            if findings:
                handoff = _store_gmail_findings(findings)
                dest = f"{fe}/?signed_in=1#gmail={handoff}"
        except Exception:
            pass  # scan is best-effort; sign-in always completes
    resp = RedirectResponse(dest)
    _set_session(resp, token)
    return resp


@app.get("/api/auth/me")
async def auth_me(request: Request, ro_session: str = Cookie(default="")):
    user = auth.session_user(ro_session)
    return _ok(request, user=user, authenticated=bool(user))


@app.post("/api/auth/logout")
async def auth_logout():
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie(COOKIE, path="/", secure=True, samesite="none", httponly=True)
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
        # blocking httpx calls — keep them OFF the event loop so a slow inbox can't freeze the whole API
        tok = await run_in_threadpool(auth.google_exchange, code, "/api/gmail/callback")
        access = tok.get("access_token")
        if not access:
            return RedirectResponse(f"{fe}/#gmail=err")
        msgs = await run_in_threadpool(gmailmod.fetch_subscription_emails, access)
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


# Cloud Run can serve the full product from one Google URL. The root Dockerfile copies the
# static frontend into /app/static; local backend-only runs simply skip this mount.
_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if _STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(_STATIC_DIR), html=True), name="static")
