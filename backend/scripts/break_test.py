"""Recoup — adversarial break test. Tries to bypass the approval gate, double-
count money, forge the audit chain, and slip bad findings past the verifier."""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import swarm  # noqa: E402
from app.state import AppState  # noqa: E402

fails = []
def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)

APP = AppState(); APP.run_scan(); APP.run_agent()

# 1. approve a non-existent action must not silently "succeed"
try:
    APP.approve_action("act_does_not_exist"); check("approve nonexistent rejected", False)
except KeyError:
    check("approve nonexistent rejected (KeyError)", True)

# 2. double approve must not double-count
a0 = APP.actions[0]["id"]
APP.approve_action(a0); t1 = APP.totals()
APP.approve_action(a0); APP.approve_action(a0); t2 = APP.totals()
check("double/triple approve does not double-count", t1 == t2)

# 3. reject -> approve transition is clean
a1 = APP.actions[1]["id"]
APP.reject_action(a1)
check("reject sets rejected", next(x for x in APP.actions if x["id"] == a1)["approvalState"] == "rejected")
APP.approve_action(a1)
ax = next(x for x in APP.actions if x["id"] == a1)
check("approve-after-reject readies claim", ax["approvalState"] == "approved" and ax["status"] == "claim_ready")

# 3b. lifecycle endpoints cannot bypass the human approval gate
a2 = APP.actions[2]["id"]
try:
    APP.mark_sent(a2); check("mark sent before approval rejected", False)
except PermissionError:
    check("mark sent before approval rejected", True)
try:
    APP.mark_paid(a2); check("mark paid before approval rejected", False)
except PermissionError:
    check("mark paid before approval rejected", True)

# 4. forge the audit chain at head, middle, tail — every edit must be caught
ev = APP.audit._events
for pos in sorted({0, len(ev) // 2, len(ev) - 1}):
    saved = ev[pos]["label"]; ev[pos]["label"] = "FORGED"
    check(f"tamper at event {pos} detected", not APP.audit.verify()["intact"])
    ev[pos]["label"] = saved
check("audit verifies intact after restore", APP.audit.verify()["intact"])

# 5. re-running the agent must preserve human decisions (no silent reset)
before = {a["id"]: a["approvalState"] for a in APP.actions}
APP.run_agent()
after = {a["id"]: a["approvalState"] for a in APP.actions}
check("re-run preserves approvals/rejections",
      all(after.get(k) == v for k, v in before.items() if v in ("approved", "rejected")))

# 6. verifier flags an implausibly large finding for human review
huge = {"findings": [{"id": "x", "kind": "deposit", "amount": 999999, "cadence": "once",
                      "currency": "$", "amount_label": "$999999", "unit_note": "once",
                      "rule": "deposit", "evidence": "suspicious", "priority": "high",
                      "action": "request_refund", "title": "Huge"}],
        "recurring_year": 0, "one_time": 999999, "total_recoverable": 999999}
check("verifier flags implausible >$5000", swarm.orchestrate(huge)["flagged"] >= 1)

# 7. verifier rejects a finding with no real rule basis
norule = {"findings": [{"id": "y", "kind": "deposit", "amount": 10, "cadence": "once",
                        "currency": "$", "amount_label": "$10", "unit_note": "once",
                        "rule": "TOTALLY_MADE_UP", "evidence": "e", "priority": "low",
                        "action": "x", "title": "Bad"}],
          "recurring_year": 0, "one_time": 10, "total_recoverable": 10}
check("verifier rejects fabricated rule basis", swarm.orchestrate(norule)["verified"] == 0)

# 8. totals are never negative
check("totals never negative", all(v >= 0 for v in APP.totals().values()))

print()
print("BREAK-TEST: " + ("ALL PASS — system holds." if not fails else f"{len(fails)} FAILED: {fails}"))
sys.exit(1 if fails else 0)
