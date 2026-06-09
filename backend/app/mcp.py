"""Minimal MCP-compatible JSON-RPC surface for Recoup.

This intentionally keeps the public hackathon demo open while giving judges a
concrete MCP story: tools can inspect Recoup's recovery state, run the
deterministic scan, and map Gmail receipt metadata into recoverable findings.
It never accepts or exposes Gmail OAuth access tokens.
"""
from __future__ import annotations

from . import auth, gmail
from .config import get_settings
from .state import APP

PROTOCOL_VERSION = "2025-11-25"
SERVER_INFO = {"name": "recoup-money-recovery", "version": "0.2.0"}


def _text(payload: str) -> dict:
    return {"content": [{"type": "text", "text": payload}]}


TOOLS = [
    {
        "name": "recoup_scan_demo",
        "description": "Run Recoup's deterministic recovery scan and return split recurring vs one-time totals.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "recoup_get_state",
        "description": "Return the current Recoup actions, totals, audit integrity, and live integration status.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "gmail_detect_subscriptions",
        "description": "Detect subscriptions from Gmail message metadata supplied by a trusted MCP host.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "messages": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "sender": {"type": "string"},
                            "subject": {"type": "string"},
                            "snippet": {"type": "string"},
                        },
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["messages"],
            "additionalProperties": False,
        },
    },
    {
        "name": "gmail_connection_status",
        "description": "Report whether Google OAuth is configured and which read-only Gmail scope Recoup uses.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
]


def handle_mcp(message: dict) -> dict:
    """Handle the subset of MCP JSON-RPC needed by common tool hosts."""
    if not isinstance(message, dict):
        return _err(None, -32600, "Invalid MCP JSON-RPC request")
    req_id = message.get("id")
    method = message.get("method")
    try:
        if method == "initialize":
            return _ok(req_id, {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": SERVER_INFO,
            })
        if method == "ping":
            return _ok(req_id, {})
        if method == "tools/list":
            return _ok(req_id, {"tools": TOOLS})
        if method == "tools/call":
            params = message.get("params") or {}
            if not isinstance(params, dict):
                return _err(req_id, -32602, "MCP params must be an object")
            args = params.get("arguments") or {}
            if not isinstance(args, dict):
                return _err(req_id, -32602, "MCP tool arguments must be an object")
            name = str(params.get("name", ""))
            if name not in {t["name"] for t in TOOLS}:
                return _err(req_id, -32601, f"Unknown tool: {name}")
            if name == "gmail_detect_subscriptions":
                msgs = args.get("messages")
                if not isinstance(msgs, list) or not all(isinstance(x, dict) for x in msgs):
                    return _err(req_id, -32602, "messages must be an array of objects")
            return _ok(req_id, _call_tool(name, args))
        return _err(req_id, -32601, f"Unsupported MCP method: {method}")
    except Exception:
        return _err(req_id, -32603, "internal error")


def _call_tool(name: str, args: dict) -> dict:
    if name == "recoup_scan_demo":
        scan = APP.run_scan()
        APP.run_agent()
        return {
            **_text(
                f"Found {len(scan['findings'])} recoverable actions: "
                f"${scan['recurring_year']:,.0f}/yr recurring leaks + "
                f"${scan['one_time']:,.0f} one-time payouts."
            ),
            "structuredContent": _state_payload(),
        }
    if name == "recoup_get_state":
        if not APP.actions:
            APP.run_scan()
            APP.run_agent()
        return {**_text("Current Recoup state returned."), "structuredContent": _state_payload()}
    if name == "gmail_detect_subscriptions":
        messages = args.get("messages") or []
        subs = gmail.detect(messages)
        findings = gmail.to_findings(subs)
        return {
            **_text(f"Detected {len(findings)} Gmail subscription findings from supplied metadata."),
            "structuredContent": {"findings": findings},
        }
    if name == "gmail_connection_status":
        s = get_settings()
        return {
            **_text("Gmail uses Google OAuth with gmail.readonly; no send/delete/modify scope is requested."),
            "structuredContent": {
                "configured": bool(s.google_oauth_client_id),
                "scope": "https://www.googleapis.com/auth/gmail.readonly",
                "frontend_url": s.frontend_url,
                "auth": auth.status(),
            },
        }
    raise ValueError(f"Unknown MCP tool: {name}")


def _state_payload() -> dict:
    return {
        "integrations": get_settings().integration_status(),
        "actions": APP.actions,
        "totals": APP.totals(),
        "auditIntegrity": APP.audit.verify(),
        "scan": {
            "recurring_year": APP.scan_result["recurring_year"] if APP.scan_result else 0,
            "one_time": APP.scan_result["one_time"] if APP.scan_result else 0,
            "total_recoverable": APP.scan_result["total_recoverable"] if APP.scan_result else 0,
        },
    }


def _ok(req_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _err(req_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}
