"""Diagnose the live Gemini call — print version, key shape, full traceback."""
import sys
import traceback
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402

s = get_settings()
key = s.google_api_key or ""
print(f"key_prefix={key[:4]!r} key_len={len(key)} model={s.gemini_model!r}")

try:
    import google.genai as genai
    print("google-genai version:", getattr(genai, "__version__", "unknown"))
except Exception as e:
    print("import error:", e)
    raise SystemExit(1)

try:
    client = genai.Client(api_key=s.google_api_key)
    resp = client.models.generate_content(model=s.gemini_model, contents="Reply with exactly: ok")
    print("PLAIN OK ->", (resp.text or "").strip()[:80])
except Exception:
    print("PLAIN FAILED:"); traceback.print_exc()

PROMPT = 'Return JSON {"reasoning":[{"t":"hi","tone":"cyan"}]}'

print("\n--- dict config (current agent style) ---")
try:
    c = genai.Client(api_key=s.google_api_key)
    r = c.models.generate_content(model=s.gemini_model, contents=PROMPT,
                                  config={"response_mime_type": "application/json", "temperature": 0.4})
    print("DICT OK ->", (r.text or "")[:100])
except Exception:
    print("DICT FAILED:"); traceback.print_exc()

print("\n--- typed config ---")
try:
    from google.genai import types
    c = genai.Client(api_key=s.google_api_key)
    r = c.models.generate_content(model=s.gemini_model, contents=PROMPT,
                                  config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.4))
    print("TYPES OK ->", (r.text or "")[:100])
except Exception:
    print("TYPES FAILED:"); traceback.print_exc()

print("\n--- exact agent path (real prompt + agent._client) ---")
import json as _json  # noqa: E402
from app import agent, snapshot  # noqa: E402
scan = snapshot.scan()
prompt = (agent.SYSTEM_PROMPT + "\n\nSCAN:\n" + _json.dumps(scan, ensure_ascii=False)[:9000] +
          '\n\nReturn JSON {"reasoning":[{"t":str,"tone":"cyan|dim|ok|warn"}]} — 6-9 concise trace lines.')
print(f"prompt_len={len(prompt)}")
try:
    c = agent._client()
    r = c.models.generate_content(model=s.gemini_model, contents=prompt,
                                  config={"response_mime_type": "application/json", "temperature": 0.4})
    print("AGENT-PATH OK ->", (r.text or "")[:120])
except Exception:
    print("AGENT-PATH FAILED:"); traceback.print_exc()
