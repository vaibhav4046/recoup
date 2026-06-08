"""Recoup — in-process orchestration + the human-approval gate.

Single source of truth for a running demo: the scan, the drafted actions, the
audit hash-chain, and running totals. The approval gate is enforced HERE —
`approve_action` is the only path that marks a claim ready, and it always writes
an audit event first. Approving DRAFTS a claim ready to send; it does not assert
the money is in hand. In live mode approved cases also persist to MongoDB.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

from . import agent, snapshot
from .audit import AuditLog
from .config import get_settings


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AppState:
    def __init__(self) -> None:
        self.audit = AuditLog()
        self.scan_result: dict | None = None
        self.actions: list[dict] = []
        self.last_plan: dict | None = None
        self.last_run: dict | None = None

    def run_scan(self, trace_id: str = "") -> dict:
        self.scan_result = snapshot.scan()
        rec, one = self.scan_result["recurring_year"], self.scan_result["one_time"]
        n = len(self.scan_result["findings"])
        self.audit.append(actor_type="system", actor_name="Recoup scanner",
                          event_type="SCAN_RUN",
                          label=f"Scanned money surface — {n} items: ${rec:,.0f}/yr recurring + ${one:,.0f} one-time",
                          amount=self.scan_result["total_recoverable"], trace_id=trace_id)
        return self.scan_result

    def run_agent(self, trace_id: str = "") -> dict:
        if not self.scan_result:
            self.run_scan(trace_id)
        t0 = time.perf_counter()
        plan = agent.draft_plan(self.scan_result)
        latency = plan.get("latency_ms") or round((time.perf_counter() - t0) * 1000)

        prev = {a["id"]: a for a in self.actions}
        self.actions = plan["actions"]
        for a in self.actions:  # preserve prior human decisions across re-runs
            old = prev.get(a["id"])
            if old and old["approvalState"] in ("approved", "rejected"):
                a["approvalState"] = old["approvalState"]
                a["status"] = old["status"]
                a["claimedAt"] = old.get("claimedAt")
        self.last_plan = plan
        self.audit.append(actor_type="agent", actor_name="Gemini agent",
                          event_type="PLAN_DRAFTED",
                          label=f'{len(self.actions)} claims drafted ({"live" if plan["live"] else "fallback"})',
                          trace_id=trace_id)
        self.last_run = {
            "run_id": f"run_{uuid.uuid4().hex[:6]}", "model": plan["model"],
            "live": plan["live"], "latency_ms": latency,
            "actions": len(self.actions), "agents": plan.get("agents"),
            "verified": plan.get("verified"), "flagged": plan.get("flagged"),
            "created_at": _now_iso(),
        }
        return {"run": self.last_run, "reasoning": plan["reasoning"], "actions": self.actions,
                "swarm": plan.get("swarm"), "verified": plan.get("verified"), "flagged": plan.get("flagged"),
                "recurring_year": self.scan_result["recurring_year"],
                "one_time": self.scan_result["one_time"],
                "total_recoverable": self.scan_result["total_recoverable"], "note": plan["note"]}

    def _find(self, action_id: str) -> dict:
        for a in self.actions:
            if a["id"] == action_id:
                return a
        raise KeyError(action_id)

    # ---- the approval gate: the only path that readies a claim ----
    def approve_action(self, action_id: str, trace_id: str = "") -> dict:
        a = self._find(action_id)
        if a["approvalState"] == "approved":
            return a
        a["approvalState"] = "approved"
        a["status"] = "claim_ready"  # drafted + approved, ready to send — NOT money-in-hand
        a["claimedAt"] = _now_iso()
        self.audit.append(actor_type="human", actor_name="You", event_type="ACTION_APPROVED",
                          label=f'Approved (claim ready): {a["title"]}', evidence_ref=action_id,
                          amount=a["amount"], trace_id=trace_id)
        self._store(a)
        return a

    def reject_action(self, action_id: str, trace_id: str = "") -> dict:
        a = self._find(action_id)
        a["approvalState"] = "rejected"
        a["status"] = "drafted"
        self.audit.append(actor_type="human", actor_name="You", event_type="ACTION_REJECTED",
                          label=f'Skipped: {a["title"]}', evidence_ref=action_id, trace_id=trace_id)
        return a

    def _store(self, action: dict) -> None:
        if not get_settings().mongodb_ready:
            return
        try:
            from . import mongodb
            mongodb.save_case(action)
        except Exception:
            pass

    # ---- split totals: recurring (per-year) vs one-time, never blended ----
    def _sum(self, state: str, cadence: str) -> float:
        return round(sum(a["amount"] for a in self.actions
                         if a["approvalState"] == state and a["cadence"] == cadence), 2)

    def totals(self) -> dict:
        return {
            "approved_recurring_year": self._sum("approved", "yearly"),
            "approved_one_time": self._sum("approved", "once"),
            "pending_recurring_year": self._sum("pending", "yearly"),
            "pending_one_time": self._sum("pending", "once"),
        }

    def contained(self) -> bool:
        return bool(self.actions) and all(a["approvalState"] in ("approved", "rejected") for a in self.actions)

    def report(self, trace_id: str = "") -> dict:
        self.audit.append(actor_type="agent", actor_name="Recoup", event_type="REPORT_GENERATED",
                          label="Recovery report generated", trace_id=trace_id)
        return {
            "generatedAt": _now_iso(), "scan": self.scan_result, "actions": self.actions,
            "recurring_year": self.scan_result["recurring_year"] if self.scan_result else 0,
            "one_time": self.scan_result["one_time"] if self.scan_result else 0,
            "total_recoverable": self.scan_result["total_recoverable"] if self.scan_result else 0,
            "totals": self.totals(),
            "audit": self.audit.list(), "auditIntegrity": self.audit.verify(),
        }


APP = AppState()
