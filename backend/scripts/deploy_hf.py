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

secrets_to_set = {
    "GOOGLE_API_KEY": env.get("GOOGLE_API_KEY", ""),
    "USE_VERTEX": env.get("USE_VERTEX", "false"),
    "GEMINI_MODEL": env.get("GEMINI_MODEL", "gemini-2.5-flash"),
    "GOOGLE_CLOUD_PROJECT": env.get("GOOGLE_CLOUD_PROJECT", ""),
    "CORS_ORIGINS": "*",
    "BASE_URL": url,
    "APP_SECRET": _secrets.token_hex(24),
}
for k, v in secrets_to_set.items():
    if v:
        api.add_space_secret(repo_id, k, v)
        print(f"secret set: {k}")

print(f"\nDEPLOYED -> {url}")
print("(Space is building the Docker image; first /api/health may take ~2-4 min.)")
