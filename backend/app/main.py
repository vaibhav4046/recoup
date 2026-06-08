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

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .state import APP


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
        flagged=APP.last_plan.get("flagged") if APP.last_plan else 0,
        totals=APP.totals(),
        recurring_year=APP.scan_result["recurring_year"] if APP.scan_result else 0,
        one_time=APP.scan_result["one_time"] if APP.scan_result else 0,
        recoverable=APP.scan_result["total_recoverable"] if APP.scan_result else 0,
        audit=APP.audit.list(), auditIntegrity=APP.audit.verify(), contained=APP.contained(),
    )
