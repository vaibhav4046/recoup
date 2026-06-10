"""Recoup — backend acceptance tests. Zero extra deps: from backend/, run
   `python ../tests/backend_test.py` (or `python tests/backend_test.py` from repo root).
Covers the hackathon acceptance criteria: deterministic money math, one-time payouts
never annualized, per-currency split, approval writes an audit block, tamper detection,
idempotent recovery, and ASCII-clean MCP output.
"""
import sys
from pathlib import Path

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

print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
