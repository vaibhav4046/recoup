"""Recoup — append-only audit log with a sha256 hash chain.

Each event folds in the previous event's hash, so any retroactive edit breaks
every later link. This is the user's tamper-evident record of what Recoup found,
what they approved, and what was recovered. `verify()` re-walks the chain.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone


def _canonical(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def event_hash(prev_hash: str, event: dict) -> str:
    body = _canonical({k: v for k, v in event.items() if k != "hash"})
    return hashlib.sha256((prev_hash + body).encode("utf-8")).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AuditLog:
    GENESIS = "0" * 64

    def __init__(self) -> None:
        self._events: list[dict] = []

    def append(self, *, actor_type: str, actor_name: str, event_type: str,
               label: str, evidence_ref: str = "", amount: float = 0.0,
               trace_id: str = "") -> dict:
        prev = self._events[-1]["hash"] if self._events else self.GENESIS
        evt = {
            "event_id": f"au_{len(self._events) + 1:04d}",
            "actor_type": actor_type, "actor_name": actor_name,
            "event_type": event_type, "label": label,
            "evidence_ref": evidence_ref, "amount": amount,
            "trace_id": trace_id, "timestamp": _now_iso(), "prev_hash": prev,
        }
        evt["hash"] = event_hash(prev, evt)
        self._events.append(evt)
        return evt

    def list(self) -> list[dict]:
        return list(self._events)

    def verify(self) -> dict:
        prev = self.GENESIS
        for i, e in enumerate(self._events):
            if e["prev_hash"] != prev or event_hash(prev, e) != e["hash"]:
                return {"intact": False, "broken_at": i, "event_id": e.get("event_id")}
            prev = e["hash"]
        return {"intact": True, "count": len(self._events), "head": prev}
