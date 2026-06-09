"""Recoup — auth smoke test (dev mode, no provider keys)."""
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("APP_SECRET", "test-secret-for-auth-smoke-only")

from app import auth  # noqa: E402
import app.main as main  # noqa: E402  (import = build the FastAPI app)

res = auth.start_magic("test@example.com")
assert res.get("dev_link"), "no dev link in dev mode"
code = res["dev_link"].split("code=")[1]

tok = auth.verify_magic(code)
assert tok and "." in tok, "no session token issued"

u = auth.session_user(tok)
assert u and u["email"] == "test@example.com", "session decode failed"

assert auth.session_user("bad.token") is None, "forged token accepted!"
assert auth.session_user(tok + "x") is None, "tampered token accepted!"
assert auth.verify_magic(code) is None, "magic code is reusable!"
assert auth.verify_captcha("anything") is True, "captcha should pass when unconfigured (dev)"
state = auth.issue_oauth_state("google")
assert auth.verify_oauth_state(state, "gmail") is False, "OAuth state accepted for wrong flow"
state = auth.issue_oauth_state("google")
assert auth.verify_oauth_state(state, "google") is True, "OAuth state rejected"
assert auth.verify_oauth_state(state, "google") is False, "OAuth state is reusable"

routes = [r.path for r in main.app.routes if hasattr(r, "path") and r.path.startswith("/api/auth")]
print("AUTH SMOKE OK — providers:", auth.status())
print("auth routes:", sorted(routes))
