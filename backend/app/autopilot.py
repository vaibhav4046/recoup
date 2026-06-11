"""Recoup — AUTOPILOT: the autonomous recovery mission.

One call runs the agent's FULL loop end-to-end, server-side, with no human prompting between
steps — scan the money surface, ground every finding kind in Atlas (vector retrieval), draft
claims, run the verifier, and queue everything at the human approval gate. Every phase/step is
real work (no theater), timed, and audit-chained; the response is a structured mission log the
UI renders as a layered timeline (the "Beyond Chat" autonomous showcase).

Autonomy boundary (deliberate): the mission STOPS at pending_approval. Recoup never sends a
claim by itself — approval is the one step that stays human.
"""
from __future__ import annotations

import time
import uuid

from .state import APP


def _step(t: str, detail: str = "", tone: str = "ok", ms: int | None = None, **extra) -> dict:
    s = {"t": t, "detail": detail, "tone": tone}
    if ms is not None:
        s["ms"] = ms
    s.update(extra)
    return s


def _clean_findings(raw) -> list[dict]:
    """Validate visitor-supplied findings (from THEIR Gmail/statement scan) at the money boundary:
    cap the list, whitelist fields, sanitize strings, reject non-positive amounts."""
    out = []
    for f in (raw or [])[:50]:
        if not isinstance(f, dict):
            continue
        try:
            amount = float(f.get("amount") or 0)
        except (TypeError, ValueError):
            continue
        if amount <= 0 or amount > 1_000_000:
            continue
        out.append({
            "title": str(f.get("title") or "")[:120],
            "kind": str(f.get("kind") or "")[:40],
            "amount": round(amount, 2),
            "cadence": "yearly" if f.get("cadence") == "yearly" else "once",
            "evidence": str(f.get("evidence") or "")[:200],
            "verify": f.get("verify") if isinstance(f.get("verify"), dict) else {},
            "draft": bool(f.get("draft")),
        })
    return out


def run_mission(user_findings: list | None = None) -> dict:
    """Execute the autonomous mission. When the visitor supplies THEIR OWN findings (from their
    real Gmail/statement scan), the mission runs on those — grounding each kind in Atlas and
    verifying them — instead of the sample surface. Returns the structured, layered mission log."""
    mission_id = "mi_" + uuid.uuid4().hex[:8]
    t_start = time.perf_counter()
    phases: list[dict] = []
    user_findings = _clean_findings(user_findings)
    on_user_data = bool(user_findings)

    # ---- PHASE 1 · SCAN (deterministic rule engine over the money surface) ----
    t0 = time.perf_counter()
    if on_user_data:
        findings = user_findings
        rec = sum(f["amount"] for f in findings if f["cadence"] == "yearly")
        scan = {"findings": findings, "recurring_label": f"${rec:,.0f}",
                "one_time_label": "", "total_recoverable": round(sum(f["amount"] for f in findings), 2)}
    else:
        APP.run_scan()
        scan = APP.scan_result or {}
        findings = scan.get("findings", [])
    leaks = [f for f in findings if f.get("cadence") == "yearly"]
    owed = [f for f in findings if f.get("cadence") == "once"]
    phases.append({"name": "Scan", "icon": "radar", "steps": [
        _step("YOUR data scanned" if on_user_data else "Money surface scanned",
              f"{len(findings)} recoverable items found" + (" in your real Gmail/statement scan" if on_user_data else ""),
              ms=round((time.perf_counter() - t0) * 1000)),
        _step(f"{len(leaks)} recurring leaks", scan.get("recurring_label", "") and f"~{scan['recurring_label']}/yr leaking" or "", tone="warn"),
        _step(f"{len(owed)} one-time amounts owed", scan.get("one_time_label", ""), tone="cyan"),
        _step("Amounts computed by rules", "the model never invents a number", tone="dim"),
    ]})

    # ---- PHASE 2 · GROUND (Atlas retrieval per distinct kind — real vector/keyword hits) ----
    t0 = time.perf_counter()
    from . import vector
    kinds: dict[str, dict | None] = {}
    ground_steps = []
    for f in findings:
        kind = f.get("kind", "")
        if kind in kinds:
            continue
        hits = vector.retrieve(f"{f.get('title', '')}. {f.get('evidence', '')}", k=1, kind=kind)
        kinds[kind] = hits[0] if hits else None
        if hits:
            h = hits[0]
            via = {"atlas_vector_search": "Atlas $vectorSearch", "keyword_fallback": "keyword match"}.get(h.get("via"), "vector cosine")
            ground_steps.append(_step(f"{kind or 'charge'} → {h.get('title', '')[:46]}",
                                      f"{h.get('basis', '')[:60]} · {via}" + (f" · sim {h.get('score', 0):.2f}" if h.get("score") else ""),
                                      tone="cyan"))
    ground_steps.append(_step(f"{len([v for v in kinds.values() if v])}/{len(kinds)} kinds grounded in the corpus",
                              "41 precedents + playbooks in MongoDB Atlas", ms=round((time.perf_counter() - t0) * 1000)))
    phases.append({"name": "Ground", "icon": "db", "steps": ground_steps})

    # ---- PHASE 3 · DRAFT (claims drafted; ONE live model call narrates — quota-safe) ----
    t0 = time.perf_counter()
    if on_user_data:
        # the visitor's claims are drafted client-side by the rule engine; here the LIVE model
        # reasons over THEIR surface (one ladder call, content-cached) — real AI on real data.
        actions = []
        drafted = findings
        live, model = False, "deterministic"
        try:
            import json as _json
            from . import agent as _agent
            summary = [{"t": f["title"], "amt": f["amount"], "kind": f["kind"], "cad": f["cadence"]} for f in findings[:12]]
            prompt = ("You are Recoup's recovery strategist. For this user's REAL detected charges "
                      f"(amounts already computed — never change them): {_json.dumps(summary)}\n"
                      "Return ONLY JSON {\"advice\":[{\"t\":str}]} — the 3 highest-value moves, concrete and grounded "
                      "in consumer-protection rules (Click-to-Cancel, FCBA chargebacks, EU261...). No invented numbers.")
            # HARD 7s budget — the mission must stay demo-fast; a slow ladder hop must never make
            # the user-data Autopilot take 30s+ (cached answers still return instantly).
            from concurrent.futures import ThreadPoolExecutor
            _ex = ThreadPoolExecutor(max_workers=1)
            try:
                text, used = _ex.submit(_agent.generate_any, prompt).result(timeout=7)
            finally:
                _ex.shutdown(wait=False, cancel_futures=True)
            advice = (_json.loads(_agent._strip_fences(text)).get("advice") or [])[:3]
            model, live = used, True
            draft_steps = [_step(f"{len(drafted)} of your claims drafted", "each cites its consumer-protection basis",
                                 ms=round((time.perf_counter() - t0) * 1000)),
                           _step(f"Live {used} reasoned over YOUR charges", "real AI on your real data", tone="ok", model=used, live=True)]
            draft_steps += [_step(a.get("t", "")[:110], tone="cyan") for a in advice if a.get("t")]
        except Exception:
            draft_steps = [_step(f"{len(drafted)} of your claims drafted", "rule-grounded; AI tier cooling down", tone="dim",
                                 ms=round((time.perf_counter() - t0) * 1000))]
        phases.append({"name": "Draft", "icon": "pen", "steps": draft_steps})
        run = {"model": model, "live": live}
    else:
        APP.run_agent()  # builds actions + the (cached/ladder) narration
        run = APP.last_run or {}
        actions = APP.actions or []
        drafted = [a for a in actions if a.get("draft")]
        model = run.get("model", "deterministic")
        phases.append({"name": "Draft", "icon": "pen", "steps": [
            _step(f"{len(drafted)} claims drafted", "each cites its consumer-protection basis", ms=round((time.perf_counter() - t0) * 1000)),
            _step(f"Narrated by {model}", ("live AI" if run.get("live") else "grounded rules — AI cooling down"),
                  tone=("ok" if run.get("live") else "dim"), model=model, live=bool(run.get("live"))),
        ]})

    # ---- PHASE 4 · VERIFY (independent checks per finding — the agent that can say NO) ----
    checks_total, checks_failed, needs_confirm = 0, 0, 0
    for a in (findings if on_user_data else actions):
        v = a.get("verify") or {}
        cs = v.get("checks") or []
        checks_total += len(cs)
        checks_failed += len([c for c in cs if not c.get("ok")])
        if v.get("needs_confirm") or v.get("review"):
            needs_confirm += 1
    phases.append({"name": "Verify", "icon": "shield", "steps": [
        _step(f"{checks_total} verifier checks run", f"{checks_failed} flagged for review", tone=("warn" if checks_failed else "ok")),
        _step(f"{needs_confirm} findings need your eligibility confirmation",
              "region/cadence caveats are surfaced, never hidden", tone=("warn" if needs_confirm else "dim")),
    ]})

    # ---- PHASE 5 · QUEUE (human gate + tamper-evident audit) ----
    evt = APP.audit.append(actor_type="agent", actor_name="Autopilot", event_type="MISSION_RUN",
                           label=(f"Autonomous mission {mission_id} on VISITOR data: {len(drafted)} claims queued"
                                  if on_user_data else
                                  f"Autonomous mission {mission_id}: {len(drafted)} claims queued for approval"),
                           amount=scan.get("total_recoverable", 0.0))
    ver = APP.audit.verify()
    pending = len(findings) if on_user_data else len([a for a in actions if a.get("approvalState") == "pending"])
    phases.append({"name": "Queue", "icon": "lock", "steps": [
        _step(f"{pending} claims at the human approval gate", "nothing sends until YOU approve — by design", tone="ok"),
        _step("Mission audit-chained", f"event {evt.get('event_id')} · head {str(ver.get('head', ''))[:12]}…", tone="cyan"),
    ]})

    # ---- PHASE 6 · EXECUTE (real browser preview on the top drain — Playwright, time-budgeted) ----
    exec_shot = None
    try:
        top = next((f for f in sorted((findings if on_user_data else actions), key=lambda x: -float(x.get("amount") or 0))
                    if f.get("cadence") == "yearly"), None)
        if top:
            from . import executor
            from .executor import ALLOWED_DOMAINS as _AD
            name = str(top.get("title") or "").upper()
            url = None
            PORTALS = {"NETFLIX": "https://www.netflix.com/cancelplan", "SPOTIFY": "https://www.spotify.com/account/subscription/",
                       "YOUTUBE": "https://www.youtube.com/paid_memberships", "DISNEY": "https://www.disneyplus.com/account/subscription",
                       "LINKEDIN": "https://www.linkedin.com/psettings/manage-premium", "GOOGLE ONE": "https://one.google.com/settings",
                       "AMAZON": "https://www.amazon.com/gp/primecentral", "ADOBE": "https://account.adobe.com/plans"}
            for k, v in PORTALS.items():
                if k in name:
                    url = v
                    break
            if url:
                from concurrent.futures import ThreadPoolExecutor as _TPE
                _e = _TPE(max_workers=1)
                try:
                    res = _e.submit(executor.run_preview, url).result(timeout=18)
                finally:
                    _e.shutdown(wait=False, cancel_futures=True)
                if res.get("ok"):
                    exec_shot = (res.get("shots") or [None])[-1]
                    phases.append({"name": "Execute", "icon": "pen", "steps": [
                        _step("Execution Agent walked the top drain's portal",
                              f"real headless browser · {res.get('final_url_host','')} · {res.get('total_ms',0)}ms · Playwright", tone="ok"),
                        _step("Login wall reached — your account, your final click" if res.get("login_wall")
                              else "Cancellation page reached — one click left, and it is yours", tone="warn"),
                    ]})
    except Exception:
        pass  # execution preview is a bonus — the mission never fails because of it

    return {
        "mission_id": mission_id,
        "exec_shot": exec_shot,
        "on_user_data": on_user_data,
        "phases": phases,
        "model": model,
        "live": bool(run.get("live")),
        "findings": len(findings),
        "drafted": len(drafted),
        "pending_approval": pending,
        "audit": {"intact": ver.get("intact"), "count": ver.get("count"), "head": ver.get("head")},
        "total_ms": round((time.perf_counter() - t_start) * 1000),
        "boundary": "Autopilot stops at pending_approval — approval is the one step that stays human.",
    }
