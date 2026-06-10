"""Recoup — backend acceptance tests. Zero extra deps: from backend/, run
   `python ../tests/backend_test.py` (or `python tests/backend_test.py` from repo root).
Covers the hackathon acceptance criteria: deterministic money math, one-time payouts
never annualized, per-currency split, approval writes an audit block, tamper detection,
idempotent recovery, and ASCII-clean MCP output.
"""
import os
import sys
from pathlib import Path

# Hermetic by design: force the in-memory audit/vector path so the suite is deterministic and
# independent of any local MongoDB state (the audit chain persists in prod; a unit test must not
# inherit a previously-persisted chain). Set BEFORE importing app so get_settings() caches it.
os.environ["MONGODB_URI"] = ""

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import snapshot                 # noqa: E402
from app.state import AppState           # noqa: E402
from app import mcp as mcpmod            # noqa: E402

PASS = FAIL = 0


def ok(name, cond):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  PASS", name)
    else:
        FAIL += 1
        print("  FAIL", name)


# --- deterministic scan: amounts + currency split ---
s = snapshot.scan()
ok("scan finds the seeded items (10)", len(s["findings"]) == 10)
once = [f for f in s["findings"] if f["cadence"] == "once"]
yearly = [f for f in s["findings"] if f["cadence"] == "yearly"]
ok("one-time payouts are tagged once (never /yr)", all("/yr" not in f["amount_label"] for f in once))
ok("recurring leaks are annualized (monthly*12)", any(abs(f["amount"] - 19.99 * 12) < 0.01 for f in yearly))
flight = next((f for f in s["findings"] if f["kind"] == "flight_comp"), None)
ok("EUR flight payout stays EUR, not annualized", flight and flight["currency"] == "€" and flight["cadence"] == "once")
ok("one_time_by_currency splits $ and EUR", set(s["one_time_by_currency"].keys()) == {"$", "€"})

# --- approval gate + audit chain ---
app = AppState()
app.run_scan()
app.run_agent()
n_before = len(app.audit.list())
aid = app.actions[0]["id"]
app.approve_action(aid)
ok("approval appends an audit block", len(app.audit.list()) == n_before + 1)
ok("audit chain verifies intact after approval", app.audit.verify()["intact"] is True)

# --- tamper detection ---
app.audit._events[1]["label"] = "TAMPERED"
v = app.audit.verify()
ok("tampering a payload breaks verification", v["intact"] is False and v["broken_at"] == 1)

# --- idempotent recovery + reject guard (fresh app) ---
app2 = AppState()
app2.run_scan(); app2.run_agent()
aid2 = app2.actions[0]["id"]
app2.approve_action(aid2)
app2.mark_paid(aid2); app2.mark_paid(aid2); app2.mark_paid(aid2)
paid_events = [e for e in app2.audit.list() if e["event_type"] == "CLAIM_PAID"]
ok("mark_paid is idempotent (1 event for 3 calls)", len(paid_events) == 1)
try:
    app2.reject_action(aid2)
    ok("reject of a paid claim is blocked", False)
except PermissionError:
    ok("reject of a paid claim is blocked", True)

# --- MCP output is ASCII-clean (no mojibake-prone glyphs) ---
res = mcpmod._call_tool("recoup_scan_demo", {})
text = res["content"][0]["text"]
ok("MCP scan text is ASCII (no mojibake glyphs)", text.isascii())

# --- input validation at the money boundary (round-1 user-test fix) ---
from app.main import _validate_charge  # noqa: E402
ok("rejects negative amount", _validate_charge({"merchant": "Gym", "kind": "dead_subscription", "amount": -500})[1] != "")
ok("rejects empty merchant", _validate_charge({"merchant": "", "kind": "dead_subscription"})[1] != "")
ok("rejects oversized amount", _validate_charge({"merchant": "Gym", "kind": "dead_subscription", "amount": 9e9})[1] != "")
ok("rejects unknown kind", _validate_charge({"merchant": "Gym", "kind": "haxxor"})[1] != "")
ok("accepts a valid charge", _validate_charge({"merchant": "Gym", "kind": "dead_subscription", "amount": 480})[0] is not None)

# --- currencies are NEVER blended into one number (accountant-trust fix) ---
sc = snapshot.scan()
ok("legacy one_time is $-only (no $+EUR blend)", abs(sc["one_time"] - sc["one_time_by_currency"].get("$", 0)) < 0.01)
ok("total_recoverable never blends currencies", sc["total_recoverable"] == round(sc["recurring_year"] + sc["one_time"], 2))

print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
