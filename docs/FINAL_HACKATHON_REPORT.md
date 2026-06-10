# Recoup — Final Hackathon Readiness Report

_Google Cloud Rapid Agent Hackathon · MongoDB track · prepared 2026-06-10_

## 1. What Recoup is
A money-recovery **agent** (not a chatbot): it scans a financial footprint (private in-browser
paste scan, or read-only Gmail receipts), finds money you're losing and owed, grounds every
finding in **MongoDB Atlas Vector Search** precedent/playbook memory, has **Gemini 3** (via the
Google **ADK / Agent Builder** family) draft each claim, and stops at a **human approval gate**.
Every step folds into a **SHA-256 audit chain**. Money math is deterministic — the model writes
words, the rules compute the amounts.

## 2. Rules compliance (verified at rapid-agent.devpost.com/rules)
| Requirement | Status |
|---|---|
| Powered by **Gemini 3** | ✅ `gemini-3-flash-preview` (live `/api/health` reports it) |
| **Google Cloud Agent Builder** | ✅ Google **ADK** `LlmAgent` (ADK is Agent Builder's agent framework) — lineage now stated explicitly in the Devpost copy |
| **Partner MCP server** | ✅ official `mongodb-mcp-server@1.12.0` as an ADK `MCPToolset` (MongoDB track) |
| Public repo + visible OSI license | ✅ MIT, `LICENSE` at repo root |
| Hosted URL | ✅ Google **Cloud Run** (serves frontend + API same-origin) |
| ~3-min demo video | ⏳ user records (script in `docs/VIDEO_SCRIPT.md`) |
| **No competing services** (Hugging Face etc.) | ✅ purged — Google-only stack |

## 3. What was hardened (3 review passes, committed + pushed)
- **Partner-MCP toolset was dead in production** — unpinned `google-adk` resolved to 2.x where
  `mcp` is an optional extra → silent `ModuleNotFoundError` → `mcp.live:false`. Fixed by pinning
  `google-adk[mcp]>=1.34,<2` + `mcp>=1.24,<2` (verified resolves, pulls `mcp 1.27.2`).
- **Event-loop freezes** — `run_in_threadpool` on `/api/health`, approve/reject/sent/paid, Gmail
  callback; one shared pooled `MongoClient` with 3s fast-fail timeouts.
- **Integrity** — idempotent `mark_sent`/`mark_paid`, reject can't demote a paid claim,
  regenerated `data.js` so its embedded SHA-256 chain verifies; per-currency one-time totals
  (EUR never summed into the $ headline).
- **Honesty** — removed the retired voice-agent claim everywhere; live agent timeline with a
  live/simulated badge; `gemini-2.5→3` in every deploy path.
- **Security** — `config.js` validates `?api=` against a fixed allowlist (closed a Gmail
  handoff-token exfil path); `.dockerignore` so no build context bakes `backend/.env`.
- **Clean Google sign-in** — `/api/auth/google/start` requests only `openid/email/profile`
  (non-sensitive → no "unverified app" screen). Gmail is a separate opt-in.
- **Premium UI** — Sora hero font, black-and-gold with one gold word, brand mark in the phone frame.
- **Deeper MongoDB corpus** — 41 grounded docs: 30 precedents (14 tagged + 16 untagged semantic variants) + 11 playbooks across US/UK/EU (was 9 + 6). Embedding-free keyword/kind fallback keeps the legal basis alive through a total Gemini outage.

## 4. Tests (reproducible, zero deps — 19 checks, all green)
- `node tests/recover.test.mjs` — parser: gateway split (`PAYPAL *NYTIMES` ≠ `PAYPAL *SPOTIFY`),
  recurring annualized, scatter rejected, duplicate = one-time, empty input safe (8).
- `python ../tests/backend_test.py` (from `backend/`) — deterministic money + currency split,
  approval writes an audit block, **tamper breaks `verify()`**, idempotent recovery, MCP ASCII (11).

## 5. Remaining deploy — ONE free step (the only account-gated action left)
The Cloud Run frontend is baked into the Docker image, so **everything above goes live only on a
Cloud Run rebuild.** No $300 credit needed — Cloud Run's free tier covers it, and **Google Cloud
Shell** has `gcloud` preinstalled (nothing to install locally).

1. Get a fresh Gemini key (resets the daily quota): https://aistudio.google.com/apikey → **Create API key** → copy.
2. Open Cloud Shell with the repo pre-cloned:
   `https://shell.cloud.google.com/cloudshell/editor?cloneRepo=https://github.com/vaibhav4046/recoup`
3. In the Cloud Shell terminal run **one command** — it prompts for the key + your Mongo URI, rebuilds, and verifies:
   ```bash
   cd recoup && bash deploy.sh
   ```
`deploy.sh` sets every env var (with a `^##^` delimiter so the comma-separated `CORS_ORIGINS`
isn't mis-parsed), generates an `APP_SECRET`, deploys with `--min-instances 1`, and curls
`/api/health` + `/api/agent/recover` so you can confirm `"mcp":{"live":true}` and Gemini live
before submitting.

## 6. Demo
- **Submit the Cloud Run URL** (`/api/health` for the live proof). Use the in-browser paste scan
  (no account, full product) + the Agent Run Timeline for the technical core.
- Pre-warm Gemini before recording so the first on-camera call is `live`, not a cold 429.

## 7. Known limitations (honest)
- Gmail connect still shows Google's "unverified app" screen (restricted scope; needs Google's
  multi-day OAuth verification — out of scope for the deadline). Plain sign-in is clean.
- The agent's routing/verification are deterministic by design (the model narrates, never invents
  amounts) — stated plainly, because for a money product *checkable* beats *clever*.
- Expanded precedents/playbooks are a real knowledge base; the seeded demo statement exercises a
  subset, and the corpus is queryable via `/api/agent/recover` and the MCP tools.
