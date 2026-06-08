"""Recoup backend smoke test — no server, exercises the core flow directly."""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/

from app.state import AppState  # noqa: E402


def main() -> int:
    APP = AppState()

    scan = APP.run_scan("tr_smoke")
    print(f"[scan] findings={len(scan['findings'])} recoverable=${scan['total_recoverable']:.2f}")
    assert scan["findings"], "no findings"
    assert scan["total_recoverable"] > 0

    run = APP.run_agent("tr_smoke")
    print(f"[agent] model={run['run']['model']} live={run['run']['live']} actions={len(run['actions'])}")
    print(f"[agent] reasoning lines={len(run['reasoning'])}")
    assert run["actions"], "no actions drafted"
    for a in run["actions"]:
        assert a["approvalState"] == "pending"
        assert a["draft"], f"action {a['id']} has no draft text"

    # approve two, reject one
    a0, a1, a2 = run["actions"][0], run["actions"][1], run["actions"][2]
    APP.approve_action(a0["id"], "tr_smoke")
    APP.approve_action(a1["id"], "tr_smoke")
    APP.reject_action(a2["id"], "tr_smoke")

    def approved_sum():
        t = APP.totals()
        return round(t["approved_recurring_year"] + t["approved_one_time"], 2)

    expected = round(a0["amount"] + a1["amount"], 2)
    print(f"[approve] totals={APP.totals()} approved_sum=${approved_sum():.2f}")
    assert approved_sum() == expected, f"{approved_sum()} != {expected}"
    assert a0["status"] == "claim_ready" and a0["claimedAt"], "approve did not ready the claim"

    # idempotent approve
    APP.approve_action(a0["id"], "tr_smoke")
    assert approved_sum() == expected, "double-count!"

    rep = APP.report("tr_smoke")
    integ = rep["auditIntegrity"]
    print(f"[audit] events={len(rep['audit'])} intact={integ['intact']}")
    assert integ["intact"], "audit chain broken"

    # tamper detection
    APP.audit._events[1]["label"] = "TAMPERED"
    bad = APP.audit.verify()
    print(f"[tamper] intact_after_edit={bad['intact']} (expect False)")
    assert not bad["intact"], "tamper not detected"

    print("\nSMOKE OK — scan, agent, approval gate, split totals, audit chain + tamper detection all pass.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
