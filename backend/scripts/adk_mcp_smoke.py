"""Phase 3 smoke: the ADK Gemini agent queries Atlas via the OFFICIAL MongoDB MCP server."""
import asyncio
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
envp = os.path.join(HERE, ".env")
if os.path.exists(envp):
    for line in open(envp, encoding="utf-8"):
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.split(" #")[0].strip())

from app import adk_agent  # noqa: E402


async def main():
    ts = adk_agent.mongodb_toolset()
    if ts is None:
        print("NO MONGODB_URI"); return
    res = await adk_agent.run_query(
        "List the collection names in the database, then count the documents in the 'precedents' "
        "collection. Report the collection list and the count.", tools=[ts])
    print("TOOL_CALLS:", res["tool_calls"])
    print("TEXT:", res["text"][:600])


asyncio.run(main())
