# Recoup — Development Handoff Prompt

> Paste everything below into the new agent. It is self-contained.

---

You are taking over development of **Recoup — "the AI that gets your money back."** It is a solo entry in the **Google Cloud Rapid Agent Hackathon** (deadline ~Wed 11 June 2026). The owner is **Vaibhav Lalwani**, a final-year Computer Science student at the University of Liverpool. The goal is unambiguous: **win 1st place.** The owner's current top priority is **world-class, Apple/Linear/Stripe-tier visual design** plus a flawless, bug-free, brutally-QA'd product. Be brutally honest, never inflate scores, and fix the actual product (test the LIVE site, not a description).

## What Recoup does
An AI agent that finds money the user is **owed** (refunds, EU261/UK261 flight-delay compensation, class-action settlements, unclaimed property, warranties, deposits) and **losing** (dead subscriptions, silent price creep, duplicate/billing errors). It drafts each claim, the human approves every one (nothing auto-sends), deep-links to the real gov/airline/vendor form, tracks the lifecycle (drafted → approved → sent → recovered), and writes a tamper-evident SHA-256 hash-chained audit log. Two data inputs: (1) **paste a statement** — 100% in-browser, no sign-in; (2) **Connect Gmail** — read-only OAuth, subscription/receipt emails only.

## Live links
- **Frontend (Vercel):** https://recoup-vaibhav4046s-projects.vercel.app
- **Backend (Hugging Face Space):** https://vaibhav3313-recoup.hf.space — API under `/api/*` (e.g. `/api/health`, `/api/state`, `/api/agent/run`)
- **Repo (GitHub):** https://github.com/vaibhav4046/recoup — ⚠️ currently **PRIVATE**; owner must make it **public before submission** (private = DQ; also the in-app "See the code" link 404s until public).

## Code location & file map (Windows)
Root: `C:\Users\lalwa\OneDrive\Desktop\claude max work\recoup\`
- **Frontend (zero-build static, vanilla JS):** `index.html`, `app.js` (~570 lines, all UI logic), `styles.css`, `recover.js` (client-side scan engine), `data.js` (offline fallback findings), `login.html`, `privacy.html`
- **Backend (FastAPI):** `backend/app/main.py` (routes), `snapshot.py` (deterministic rule engine + the money surface), `agent.py` (Gemini via REST), `state.py` (orchestration + approval gate), `gmail.py` (read-only Gmail intake), `auth.py` (sessions/OAuth/magic-link), `config.py` (pydantic settings). Deploy: `backend/scripts/deploy_hf.py`.
- **Docs:** `docs/SUBMISSION.md` (Devpost copy), `docs/VIDEO_SCRIPT.md` (3-min demo script), `docs/QA_STATUS.md` (defect status — 30/40 fixed, 10 listed remaining).

## Dev environment (Windows)
- Python venv: `C:\Users\lalwa\.virtualenvs\recallops\Scripts\python.exe`
- **Local static server runs on `http://localhost:8123`** (serves the frontend for testing). `index.html` points `RO_CONFIG.apiBase` at the live HF backend, so the local frontend uses live data.
- Playwright for screenshots/testing is installed at `/c/tmp/pw` (use `NODE_PATH=/c/tmp/pw/node_modules`).
- Deploy frontend: `cd <root> && vercel --prod --yes`. Deploy backend: `HF_TOKEN=<token> python backend/scripts/deploy_hf.py` (rebuilds the Docker Space, ~2-4 min).

## Architecture / stack
- **Frontend:** vanilla JS, zero build, instant load. Boot fetches `/api/state` (5s cold-start timeout → falls back to `data.js`). **Lifecycle is now per-visitor/client-side** (approve/sent/paid do NOT POST to the shared backend — important, see fix below). SHA-256 audit computed in-browser via `crypto.subtle`.
- **Backend:** FastAPI on a free HF Docker Space. **Gemini 2.5-flash via direct REST httpx** (NOT the google-genai SDK — the SDK had a client-lifecycle RuntimeError on the Spaces container; REST is robust). MongoDB adapter. Google OAuth. The deterministic rule engine owns every dollar amount; Gemini only narrates the reasoning (never invents amounts).
- **Free/no-card stack throughout** (hard constraint — zero paid services).

## Current state (what works — verified on the LIVE site)
- ✅ Gemini renders **live** on the deployed backend (`/api/agent/run` → `live:true, gemini-2.5-flash`).
- ✅ MongoDB live, Google OAuth **published to production** (any judge can sign in; they hit a click-through "unverified app" warning → Advanced → continue; ~100-user cap until Google verification, which is not feasible pre-deadline).
- ✅ Per-visitor clean state (a prior bug showed shared "$250 recovered" test residue to every visitor — FIXED: on boot, all actions reset to pending/drafted + audit cleared; lifecycle is client-side only).
- ✅ Routes work (`/login.html`, `/privacy.html` → 200). In-browser paste scan detects real subscriptions. Light + dark mode. Dialog a11y (Esc-close, focus-return, focus-trap, live-region, non-lossy labels). Break-tested (rapid actions / garbage input / races → zero JS errors).
- ✅ Premium design pass 1 done (recovery-arrow logo, Inter feature-settings, motion/gloss, cleaner headline, depth).

## What to fix / push (in priority order)
1. **DESIGN → world-class (owner's #1 ask).** Current state is "clean premium SaaS," NOT yet Apple-tier. The owner rates it harshly. Next leaps: a **bolder hero** (show the actual product/dashboard in-frame instead of hiding behind a button), stronger visual language, more cinematic motion, impeccable spacing/type hierarchy. **Ask the owner for a reference site they consider 10/10** and match its craft. Test every change on the LIVE deployed site at multiple viewports (desktop + 375px mobile).
2. **10 remaining defects** (full list + fixes in `docs/QA_STATUS.md`): backend auth hardening (OAuth CSRF state validation, HMAC fallback-secret fail-closed, Gmail token-in-URL → fragment), minor decorative-emoji aria-hiding on buttons, currency consistency ($ vs the one €250 EU261 amount), demo-lifecycle-race guard, dialog `aria-describedby`.
3. **Brutal QA:** the owner wants multi-agent / hundreds-of-personas testing AND hands-on testing of the LIVE site. Do both. Always reproduce issues on the real deployed URL.

## Honest constraints — do NOT hide these from the owner
- **The 20-adversarial-persona QA average plateaus at ~6.5–7.1 across 11 rounds.** It is pinned by ONE dimension — `wouldUse` (~5.8) — which is gated **entirely** on *proof of a real payout*. The product finds + drafts + deep-links + tracks, but the user files on a third-party gov portal and real money lands **weeks** later, so "recovered" is self-reported. **No code or design can manufacture a literal 10/10 average from an adversarial panel that includes a scam-traumatized pensioner, a privacy lawyer demanding a DPA, and a VC scoring the business model.** Do not promise unanimous 10s — it is not a reachable metric and saying so erodes trust.
- **The single highest-leverage move to break that ceiling is the OWNER's manual action:** cancel one real subscription (or claim real unclaimed money), then log it in the in-app "recovery log" with its confirmation reference. That one real, evidenced recovery converts "impressive demo" → "consequential product."
- Where the product DOES win: design craft, engineering depth, trust/honesty discipline, real live integrations — the axes hackathon judges reward. Push those to the ceiling.

## Credentials & security (CRITICAL)
- **Two secrets were exposed in chat and MUST be rotated** by the owner: the HF token and the Google OAuth client secret. They are configured in **HF Space → Settings → Secrets** and the local `backend/.env`. **Never paste secrets into chat; put them only in HF Secrets / `.env`.**
- Set in HF Secrets: `GOOGLE_API_KEY` (Gemini, free AI Studio), `MONGODB_URI`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `APP_SECRET`, `BASE_URL`, `FRONTEND_URL`, `CORS_ORIGINS=*`.
- Do NOT create accounts, generate/handle the owner's secrets, modify their cloud-console auth config, or open access controls on their behalf — guide them and let them click. (The owner published the OAuth app to production themselves.)

## Owner's manual checklist (only they can do)
🔓 Make the repo public · 🔑 rotate the 2 exposed secrets · 🎥 record the demo video (`docs/VIDEO_SCRIPT.md`) · 💷 do one real recovery and log it in-app.

## Your first moves
1. Open the **live** site, click through every flow (landing → See example → results → a card's "show work" drawer → approve → scan modal → paste) at desktop + mobile widths. Screenshot. List what genuinely looks/feels sub-premium.
2. Ask the owner for a reference site they love, then execute a bold design pass and deploy. Verify live.
3. Work through `docs/QA_STATUS.md`'s remaining 10 in tested batches.
4. Be honest, test the real deployed product every time, and never inflate.
