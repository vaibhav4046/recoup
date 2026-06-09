"""Recoup MCP smoke test: initialize, list tools, call Gmail detector."""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.mcp import handle_mcp  # noqa: E402


def call(method, params=None, req_id=1):
    return handle_mcp({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params or {}})


init = call("initialize")
assert init["result"]["serverInfo"]["name"] == "recoup-money-recovery"

tools = call("tools/list", req_id=2)["result"]["tools"]
names = {t["name"] for t in tools}
assert {"recoup_scan_demo", "recoup_get_state", "gmail_detect_subscriptions", "gmail_connection_status"} <= names

gmail = call("tools/call", {
    "name": "gmail_detect_subscriptions",
    "arguments": {
        "messages": [
            {"sender": "Netflix <info@netflix.com>", "subject": "Your Netflix receipt", "snippet": "$17.99 paid"},
            {"sender": "Spotify <no-reply@spotify.com>", "subject": "Your Spotify Premium receipt", "snippet": "€11.99 monthly"},
        ]
    },
}, req_id=3)
gmail_findings = gmail["result"]["structuredContent"]["findings"]
assert len(gmail_findings) == 2
assert any(f["currency"] == "€" and f["amount_label"].startswith("€") for f in gmail_findings)

bad = handle_mcp([{"jsonrpc": "2.0"}])
assert bad["error"]["code"] == -32600

state = call("tools/call", {"name": "recoup_scan_demo", "arguments": {}}, req_id=4)
assert state["result"]["structuredContent"]["scan"]["total_recoverable"] > 0

print("MCP SMOKE OK — tools:", sorted(names))
