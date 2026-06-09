"""Deploy the Recoup backend to a Hugging Face Docker Space.

Reads HF_TOKEN from the environment (never printed). Reads the Gemini config from
backend/.env and sets it as Space SECRETS (not committed to the Space repo).
Creates the Space, uploads the backend, and prints the public URL.
"""
import os
import secrets as _secrets
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
TOKEN = os.environ.get("HF_TOKEN")
if not TOKEN:
    print("NO HF_TOKEN in env"); raise SystemExit(1)

from huggingface_hub import HfApi  # noqa: E402

api = HfApi(token=TOKEN)
me = api.whoami()["name"]
repo_id = f"{me}/recoup"
url = f"https://{me}-recoup.hf.space".lower()
print(f"user={me} space={repo_id}")

api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True, private=False)
print("space ready")

backend = Path(__file__).resolve().parent.parent  # .../recoup/backend
api.upload_folder(
    folder_path=str(backend), repo_id=repo_id, repo_type="space",
    ignore_patterns=[".env", "scripts/*", "**/__pycache__/*", "*.pyc", "*.log"],
    commit_message="Deploy Recoup backend",
)
print("uploaded backend")

# read local .env -> Space secrets (values never printed)
env = {}
envp = backend / ".env"
if envp.exists():
    for line in envp.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.split(" #")[0].strip()

def _get(k, default=""):
    # prefer a real environment variable (setx) over backend/.env; never printed
    return (os.environ.get(k) or env.get(k, default) or "").strip()

secrets_to_set = {
    "GOOGLE_API_KEY": _get("GOOGLE_API_KEY"),
    "USE_VERTEX": _get("USE_VERTEX", "false"),
    "GEMINI_MODEL": _get("GEMINI_MODEL", "gemini-2.5-flash"),
    "GOOGLE_CLOUD_PROJECT": _get("GOOGLE_CLOUD_PROJECT"),
    "MONGODB_URI": _get("MONGODB_URI"),
    "MONGODB_DB": _get("MONGODB_DB"),
    # ---- real auth (provide via setx) ----
    "GOOGLE_OAUTH_CLIENT_ID": _get("GOOGLE_OAUTH_CLIENT_ID"),
    "GOOGLE_OAUTH_CLIENT_SECRET": _get("GOOGLE_OAUTH_CLIENT_SECRET"),
    "RESEND_API_KEY": _get("RESEND_API_KEY"),       # magic-link + account/reset email (resend.com)
    "EMAIL_FROM": _get("EMAIL_FROM"),
    "TURNSTILE_SITE_KEY": _get("TURNSTILE_SITE_KEY"),  # Cloudflare Turnstile CAPTCHA
    "TURNSTILE_SECRET": _get("TURNSTILE_SECRET"),
    "ELEVENLABS_API_KEY": _get("ELEVENLABS_API_KEY"),   # premium voice (optional; free browser TTS otherwise)
    "ELEVENLABS_VOICE_ID": _get("ELEVENLABS_VOICE_ID"),
    "CORS_ORIGINS": "https://recoup-vaibhav4046s-projects.vercel.app,http://localhost:8123,http://127.0.0.1:8123",  # pinned: never "*" (wildcard+credentials reflects any origin)
    "BASE_URL": url,
    "APP_SECRET": _get("APP_SECRET") or _secrets.token_hex(24),  # set APP_SECRET via setx to keep sessions alive across redeploys
}
for k, v in secrets_to_set.items():
    if v:
        api.add_space_secret(repo_id, k, v)
        print(f"secret set: {k}")

print(f"\nDEPLOYED -> {url}")
print("(Space is building the Docker image; first /api/health may take ~2-4 min.)")
