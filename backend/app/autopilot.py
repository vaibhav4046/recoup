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


def run_mission() -> dict:
    """Execute the autonomous mission. Returns the structured, layered mission log."""
    mission_id = "mi_" + uuid.uuid4().hex[:8]
    t_start = time.perf_counter()
    phases: list[dict] = []

    # ---- PHASE 1 · SCAN (deterministic rule engine over the money surface) ----
    t0 = time.perf_counter()
    APP.run_scan()
    scan = APP.scan_result or {}
    findings = scan.get("findings", [])
    leaks = [f for f in findings if f.get("cadence") == "yearly"]
    owed = [f for f in findings if f.get("cadence") == "once"]
    phases.append({"name": "Scan", "icon": "radar", "steps": [
        _step("Money surface scanned", f"{len(findings)} recoverable items found", ms=round((time.perf_counter() - t0) * 1000)),
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
    for a in actions:
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
                           label=f"Autonomous mission {mission_id}: {len(drafted)} claims queued for approval",
                           amount=scan.get("total_recoverable", 0.0))
    ver = APP.audit.verify()
    pending = len([a for a in actions if a.get("approvalState") == "pending"])
    phases.append({"name": "Queue", "icon": "lock", "steps": [
        _step(f"{pending} claims at the human approval gate", "nothing sends until YOU approve — by design", tone="ok"),
        _step("Mission audit-chained", f"event {evt.get('event_id')} · head {str(ver.get('head', ''))[:12]}…", tone="cyan"),
    ]})

    return {
        "mission_id": mission_id,
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
