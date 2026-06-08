"""Generate recoup/data.js (window.RO_FALLBACK) from a real backend run, so the
static site renders identically to the live API when the backend is unreachable."""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/

from app.config import get_settings  # noqa: E402
from app.state import AppState  # noqa: E402

APP = AppState()
APP.run_scan()
APP.run_agent()
s = get_settings()

state = {
    "mode": s.mode,
    "integrations": s.integration_status(),
    "scan": APP.scan_result,
    "actions": APP.actions,
    "run": APP.last_run,
    "reasoning": APP.last_plan["reasoning"],
    "swarm": APP.last_plan.get("swarm"),
    "verified": APP.last_plan.get("verified"),
    "flagged": APP.last_plan.get("flagged"),
    "totals": APP.totals(),
    "recurring_year": APP.scan_result["recurring_year"],
    "one_time": APP.scan_result["one_time"],
    "recoverable": APP.scan_result["total_recoverable"],
    "audit": APP.audit.list(),
    "auditIntegrity": APP.audit.verify(),
    "generated": "static-fallback",
}

out = Path(__file__).resolve().parents[2] / "data.js"
out.write_text("window.RO_FALLBACK = " + json.dumps(state, indent=2, ensure_ascii=False) + ";\n", encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size} bytes) — {len(state['actions'])} actions, ${state['recoverable']:.2f}")
