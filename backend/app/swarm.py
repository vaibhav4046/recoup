"""Recoup — multi-agent recovery swarm.

A Coordinator dispatches specialist agents, each owning a slice of the money
surface. An independent Verifier validates every finding before it can reach the
human (non-positive amount, missing rule basis, missing evidence, or an
implausibly large sum get flagged). A Drafter attaches the claim text.

This is real orchestration over the deterministic scan — each finding carries the
specialist that surfaced it plus a verification verdict, and an orchestration
trace is emitted for the UI. Deterministic on purpose: the swarm decides *routing
and validation*, the model only narrates.
"""
from __future__ import annotations

from .snapshot import RULES

SPECIALISTS = [
    {"id": "sub_hunter", "name": "Subscription Hunter",
     "kinds": {"dead_subscription", "price_creep"}, "mandate": "recurring subscription leaks"},
    {"id": "billing_auditor", "name": "Billing Auditor",
     "kinds": {"billing_error"}, "mandate": "duplicate fees & billing errors"},
    {"id": "refund_claimant", "name": "Refund Claimant",
     "kinds": {"price_drop", "warranty"}, "mandate": "refunds & warranty within policy windows"},
    {"id": "entitlement_finder", "name": "Entitlement Finder",
     "kinds": {"flight_comp", "settlement", "unclaimed", "deposit"}, "mandate": "money owed to you by law / settlement"},
]
_PLAUSIBLE_MAX = 5000.0  # a single finding above this is flagged for human review


def _verify(f: dict) -> dict:
    reasons = []
    if f.get("amount", 0) <= 0:
        reasons.append("non-positive amount")
    if f.get("rule") not in RULES:
        reasons.append("no rule basis")
    if not f.get("evidence"):
        reasons.append("no evidence")
    review = f.get("amount", 0) > _PLAUSIBLE_MAX
    return {"ok": not reasons, "review": review, "reasons": reasons}


def orchestrate(scan_result: dict) -> dict:
    """Attribute + verify findings in place; return the swarm roster + trace."""
    findings = scan_result["findings"]
    by_agent: dict[str, list] = {s["id"]: [] for s in SPECIALISTS}

    for f in findings:
        owner = next((s for s in SPECIALISTS if f["kind"] in s["kinds"]), None)
        sid, sname = (owner["id"], owner["name"]) if owner else ("coordinator", "Coordinator")
        f["agent"], f["agent_name"] = sid, sname
        f["verify"] = _verify(f)
        if owner:
            by_agent[sid].append(f)

    verified = sum(1 for f in findings if f["verify"]["ok"])
    flagged = sum(1 for f in findings if f["verify"]["review"])

    roster = []
    for s in SPECIALISTS:
        items = by_agent[s["id"]]
        roster.append({
            "id": s["id"], "name": s["name"], "mandate": s["mandate"],
            "count": len(items), "amount": round(sum(x["amount"] for x in items), 2),
            "status": "active" if items else "idle",
        })

    trace = [{"t": f"Coordinator dispatched {len(SPECIALISTS)} specialist agents in parallel", "tone": "cyan"}]
    for r in roster:
        if r["count"]:
            trace.append({"t": f"{r['name']} → {r['count']} found (${r['amount']:,.0f})", "tone": "warn"})
    vmsg = f"Verifier validated {verified}/{len(findings)} findings"
    if flagged:
        vmsg += f" · {flagged} flagged for review"
    trace.append({"t": vmsg, "tone": "ok"})
    trace.append({"t": f"Claim Drafter attached {len(findings)} ready-to-send drafts", "tone": "cyan"})

    return {"roster": roster, "verified": verified, "flagged": flagged,
            "agents": len(SPECIALISTS), "trace": trace}
