"""Recoup — append-only audit log with a sha256 hash chain.

Each event folds in the previous event's hash, so any retroactive edit breaks
every later link. This is the user's tamper-evident record of what Recoup found,
what they approved, and what was recovered. `verify()` re-walks the chain.
"""
from __future__ import annotations

import hashlib
import json
import threading
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
        self._lock = threading.Lock()  # serialize read-modify-append across run_in_threadpool threads
        self._restore()  # tamper-evidence must survive restarts: rebuild the chain from MongoDB

    def _coll(self):
        from .config import get_settings
        if not get_settings().mongodb_ready:
            return None
        from . import mongodb
        return mongodb.db()["audit_chain"]

    def _restore(self) -> None:
        """Rehydrate the chain from MongoDB so a process restart/redeploy cannot silently
        reset the tamper-evident record (the easiest tamper of all). Best-effort: with no
        MongoDB configured the chain is in-memory, exactly as before."""
        try:
            coll = self._coll()
            if coll is None:
                return
            docs = list(coll.find({}, {"_id": 0}).sort("seq", 1))
            events = [{k: v for k, v in d.items() if k != "seq"} for d in docs]
            # only adopt a chain that verifies — a corrupt/tampered store must not poison the log
            prev = self.GENESIS
            for e in events:
                if e.get("prev_hash") != prev or event_hash(prev, e) != e.get("hash"):
                    return
                prev = e["hash"]
            self._events = events
        except Exception:
            pass  # Mongo down at boot -> start in-memory; appends will still try to persist

    def _persist(self, evt: dict, seq: int) -> None:
        try:
            coll = self._coll()
            if coll is not None:
                coll.update_one({"seq": seq}, {"$set": {**evt, "seq": seq}}, upsert=True)
        except Exception:
            pass  # persistence is best-effort; the in-memory chain stays authoritative

    def append(self, *, actor_type: str, actor_name: str, event_type: str,
               label: str, evidence_ref: str = "", amount: float = 0.0,
               trace_id: str = "") -> dict:
        with self._lock:  # prevent interleaved read-modify-append from forking the SHA-256 chain
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
            self._persist(evt, len(self._events))
            return evt

    def list(self) -> list[dict]:
        with self._lock:
            return list(self._events)

    def verify(self) -> dict:
        with self._lock:
            events = list(self._events)
        prev = self.GENESIS
        for i, e in enumerate(events):
            if e["prev_hash"] != prev or event_hash(prev, e) != e["hash"]:
                return {"intact": False, "broken_at": i, "event_id": e.get("event_id")}
            prev = e["hash"]
        return {"intact": True, "count": len(events), "head": prev}
