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


async def plan_charge(charge: dict, playbook: str = "", tools=None) -> dict:
    """Run the ADK Gemini agent to plan a recovery for one charge.
    Returns {plan, status:'pending_approval', model, live}."""
    from google.adk.runners import InMemoryRunner
    from google.genai import types
    s = get_settings()
    if not s.gemini_ready:
        return {"plan": "", "status": "pending_approval", "model": "unconfigured", "live": False}
    try:
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
        return {"plan": "", "status": "pending_approval", "model": "error", "live": False, "note": f"{type(e).__name__}: {str(e)[:120]}"}
