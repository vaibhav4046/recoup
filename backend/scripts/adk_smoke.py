"""Local smoke test for the ADK Gemini agent (Phase 2). Run: python backend/scripts/adk_smoke.py"""
import asyncio
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
sys.path.insert(0, HERE)
envp = os.path.join(HERE, ".env")
if os.path.exists(envp):
    for line in open(envp, encoding="utf-8"):
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.split(" #")[0].strip())

from app import adk_agent  # noqa: E402

charge = {"merchant": "StreamMax Premium", "amount": 240, "kind": "dead_subscription", "cadence": "yearly"}
res = asyncio.run(adk_agent.plan_charge(charge))
print("LIVE:", res.get("live"), "| status:", res.get("status"), "| model:", res.get("model"))
print("PLAN:", (res.get("plan") or res.get("note") or "")[:500])
