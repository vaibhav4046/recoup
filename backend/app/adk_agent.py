"""Recoup — Google ADK agent (Gemini reasoner): the qualifying agent spine.

A Gemini-powered ADK LlmAgent that PLANS a recovery for one detected charge. Deterministic
amounts are passed in and never invented; the agent cites the retrieved playbook/basis and
returns a plan with status `pending_approval` (the human gate lives downstream in state.py).
The MongoDB MCP toolset + Atlas Vector Search retrieval attach in later phases via `tools`.
"""
from __future__ import annotations

import json
import os

from .config import get_settings

_APP = "recoup"
_agent = None

INSTRUCTION = (
    "You are Recoup's recovery-planner agent. You are given a detected CHARGE (merchant, amount, "
    "kind) and, when available, a retrieved RECOVERY PLAYBOOK. Produce a tight recovery PLAN: state "
    "the consumer-protection basis, 3-5 concrete steps, and the expected outcome. HARD RULES: never "
    "invent or change a dollar amount — amounts are computed deterministically and handed to you; cite "
    "the playbook/basis when provided; do not claim anything was sent. End by stating the draft is "
    "ready for the human to approve."
)


def _build_agent(tools=None):
    from google.adk.agents import LlmAgent
    s = get_settings()
    # ADK reads the model key from env; pin AI Studio (not Vertex) mode. Never hardcode the key.
    if s.google_api_key:
        os.environ.setdefault("GOOGLE_API_KEY", s.google_api_key)
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")
    return LlmAgent(
        name="recoup_planner",
        model=s.gemini_model or "gemini-2.5-flash",
        instruction=INSTRUCTION,
        tools=tools or [],
    )


def get_agent(tools=None):
    global _agent
    if _agent is None or tools is not None:
        _agent = _build_agent(tools)
    return _agent


def mongodb_toolset():
    """The OFFICIAL MongoDB MCP server (`mongodb-mcp-server`) registered as an ADK MCP toolset.
    The Gemini agent queries Atlas THROUGH this tool — not hand-rolled DB calls. URI from env."""
    s = get_settings()
    if not s.mongodb_uri:
        return None
    try:
        from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
        from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
        from mcp import StdioServerParameters
        return MCPToolset(connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command="npx",
                args=["-y", "mongodb-mcp-server", "--connectionString", s.mongodb_uri],
            ), timeout=60))
    except Exception:
        return None


def _tool_agent(tools):
    from google.adk.agents import LlmAgent
    s = get_settings()
    if s.google_api_key:
        os.environ.setdefault("GOOGLE_API_KEY", s.google_api_key)
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")
    return LlmAgent(
        name="recoup_data_agent", model=s.gemini_model or "gemini-2.5-flash",
        instruction="You are Recoup's data agent. Use the available MongoDB tools to answer the question "
                    "about the Atlas database. Always CALL the tools to get real data; never guess.",
        tools=tools or [])


async def run_query(prompt: str, tools=None) -> dict:
    """Run the agent with MCP tools and report the tool calls it made + final text."""
    try:
        from google.adk.runners import InMemoryRunner
        from google.genai import types
        runner = InMemoryRunner(agent=_tool_agent(tools), app_name=_APP)
        sess = await runner.session_service.create_session(app_name=_APP, user_id="recoup")
        content = types.Content(role="user", parts=[types.Part(text=prompt)])
        out, calls = "", []
        async for ev in runner.run_async(user_id="recoup", session_id=sess.id, new_message=content):
            if ev.content and ev.content.parts:
                for p in ev.content.parts:
                    fc = getattr(p, "function_call", None)
                    if fc:
                        calls.append(fc.name)
            if ev.is_final_response() and ev.content and ev.content.parts:
                out = ev.content.parts[0].text or ""
        return {"text": out.strip(), "tool_calls": calls, "live": bool(calls)}
    except Exception as e:  # noqa: BLE001
        return {"text": "", "tool_calls": [], "live": False, "note": f"{type(e).__name__}"}


async def mcp_probe(charge: dict) -> dict:
    """Best-effort proof that the ADK agent has the official MongoDB MCP toolset registered.
    The agent asks Atlas for playbook/precedent context through `mongodb-mcp-server`.
    Vector Search retrieval still owns semantic memory; this call proves partner-MCP use."""
    ts = mongodb_toolset()
    if ts is None:
        return {"live": False, "tool_calls": [], "note": "mongodb_mcp_toolset_unavailable"}
    merchant = charge.get("merchant") or charge.get("title") or "unknown merchant"
    kind = charge.get("kind") or "unknown"
    return await run_query(
        "Use the MongoDB tools to inspect the Recoup Atlas database. List available "
        "collections, then look for one recovery playbook or precedent relevant to "
        f"merchant={merchant!r}, kind={kind!r}. Return only the collection name and title.",
        tools=[ts],
    )


def _deterministic_plan(charge: dict, playbook: str) -> str:
    """Plan assembled deterministically from the retrieved playbook — used when ADK/Gemini is
    rate-limited (free-tier 429). Amounts come from the charge, never invented."""
    m = charge.get("merchant") or charge.get("title") or "this charge"
    amt = charge.get("amount_label") or (f"${charge.get('amount')}" if charge.get("amount") else "")
    head = f"Recovery plan for {m}" + (f" ({amt})" if amt else "") + ":"
    steps = (playbook or "").strip() or ("1) Contact the vendor in writing. 2) Cite the consumer-protection "
             "basis. 3) Request cancellation/refund. 4) Escalate to a chargeback if refused.")
    return f"{head}\n{steps}\n\nDraft ready for your approval — nothing is sent until you confirm."


async def plan_charge(charge: dict, playbook: str = "", tools=None) -> dict:
    """Run the ADK Gemini agent to plan a recovery for one charge.
    Returns {plan, status:'pending_approval', model, live}."""
    s = get_settings()
    if not s.gemini_ready:
        return {"plan": "", "status": "pending_approval", "model": "unconfigured", "live": False}
    try:
        from google.adk.runners import InMemoryRunner
        from google.genai import types
        agent = get_agent(tools)
        runner = InMemoryRunner(agent=agent, app_name=_APP)
        sess = await runner.session_service.create_session(app_name=_APP, user_id="recoup")
        msg = f"Detected charge: {json.dumps(charge, ensure_ascii=False)}"
        if playbook:
            msg += f"\n\nRetrieved recovery playbook:\n{playbook}"
        content = types.Content(role="user", parts=[types.Part(text=msg)])
        out = ""
        async for ev in runner.run_async(user_id="recoup", session_id=sess.id, new_message=content):
            if ev.is_final_response() and ev.content and ev.content.parts:
                out = ev.content.parts[0].text or ""
        return {"plan": out.strip(), "status": "pending_approval", "model": s.gemini_model, "live": True}
    except Exception as e:  # noqa: BLE001
        # ADK/Gemini unavailable (e.g. free-tier 429 ResourceExhausted) -> deterministic playbook-based plan
        return {"plan": _deterministic_plan(charge, playbook), "status": "pending_approval",
                "model": "deterministic-fallback", "live": False, "note": f"{type(e).__name__}"}
