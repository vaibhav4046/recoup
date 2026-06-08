"""Copy the working Gemini config from the cortex .env into recoup/backend/.env
for local live testing. Does not print secret values. .env stays gitignored."""
from pathlib import Path

src = Path(r"C:\Users\lalwa\OneDrive\Desktop\claude max work\cortex\backend\.env")
dst = Path(__file__).resolve().parent.parent / ".env"

vals = {}
for line in src.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    v = v.split(" #")[0].strip()  # drop inline comments
    vals[k.strip()] = v

out = [
    "GOOGLE_API_KEY=" + vals.get("GOOGLE_API_KEY", ""),
    "USE_VERTEX=" + (vals.get("USE_VERTEX", "false") or "false"),
    "GEMINI_MODEL=" + (vals.get("GEMINI_MODEL") or "gemini-2.5-flash"),
    "GOOGLE_CLOUD_PROJECT=" + vals.get("GOOGLE_CLOUD_PROJECT", ""),
    "MONGODB_URI=",
    "MONGODB_DB=recoup",
    "CORS_ORIGINS=*",
]
dst.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"wrote {dst.name}; GOOGLE_API_KEY present={bool(vals.get('GOOGLE_API_KEY'))} "
      f"(len {len(vals.get('GOOGLE_API_KEY',''))}); model={vals.get('GEMINI_MODEL')}")
