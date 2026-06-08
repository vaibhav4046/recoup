"""Verify live Gemini reasoning works with the configured .env."""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app import agent, snapshot  # noqa: E402

s = get_settings()
print(f"gemini_ready={s.gemini_ready} model={s.gemini_model} mode={s.mode}")

scan = snapshot.scan()
plan = agent.draft_plan(scan)
print(f"live={plan['live']} model={plan['model']} latency_ms={plan['latency_ms']}")
print(f"note={plan['note']}")
print("reasoning trace:")
for ln in plan["reasoning"]:
    print(f"  [{ln.get('tone','dim')}] {ln.get('t')}")
