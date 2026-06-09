# Recoup — Comprehensive Development Handoff Prompt

> Paste everything below the line into the new agent. It is fully self-contained.

---

You are the new lead engineer + designer for **Recoup — "the AI that gets your money back."** Your job: make it a **literal 10/10, hackathon-winning product** — flawless UI/UX, zero bugs, all configuration/OAuth/integration issues fixed, brutally tested, and deployed. You have full authority to write code, run multi-agent QA, push to git, and deploy the Vercel + Hugging Face links. Be brutally honest, never inflate, and always test the **LIVE deployed site** (not a description). Fix EVERYTHING.

## THE HACKATHON (optimize for the actual judging criteria)
- **Event:** Google Cloud Rapid Agent Hackathon — **https://rapid-agent.devpost.com/**
- **Dates:** May 1 – **June 11, 2026** (deadline). **Prize pool $50,000.** Global, online.
- **Best-fit track:** **Financial Services** (Recoup = consumer money recovery — perfect fit).
- **Tech the hackathon expects:** Gemini (reasoning), Google Cloud Agent Builder (orchestration), **MCP (Model Context Protocol)** to connect agents to external tools/data. Recoup already uses Gemini 2.5-flash + a MongoDB integration; **strongly consider deepening the Google-Cloud/MCP story** (e.g., wire a real MCP server, or upgrade to the latest Gemini) to score the "technological implementation" criterion harder.
- **JUDGING CRITERIA (build to THESE):**
  1. **Technological implementation** — quality software dev + real interaction with Google Cloud + partner services.
  2. **Design** — user experience and project design. ← The owner's #1 priority; this is where Recoup must jump to world-class.
  3. **Potential impact** — significance for the target community.
- **Owner:** Vaibhav Lalwani, final-year CS student, University of Liverpool. Solo entry. Goal: **WIN 1st.**

## WHAT RECOUP DOES
An AI agent that finds money the user is **OWED** (refunds, EU/UK261 flight-delay comp, class-action settlements, unclaimed property, warranties, deposits) and **LOSING** (dead subscriptions, silent price creep, billing/duplicate errors). It drafts each claim; the human approves every one (nothing auto-sends); deep-links to the real gov/airline/vendor form; tracks drafted→approved→sent→recovered; writes a SHA-256 hash-chained, tamper-evident audit log. A 4-agent swarm (Subscription Hunter, Billing Auditor, Refund Claimant, Entitlement Finder) + an independent Verifier + a Drafter. Two inputs: (1) **paste a statement** — 100% in-browser, no sign-in; (2) **Connect Gmail** — read-only OAuth, subscription/receipt emails only. Honesty by construction: amounts come from deterministic rules (never the model), one-time payouts never annualized, "recovered" is user-confirmed.

## LIVE LINKS
- **Frontend (Vercel):** https://recoup-vaibhav4046s-projects.vercel.app
- **Backend (Hugging Face Space):** https://vaibhav3313-recoup.hf.space  (API under `/api/*`: `/api/health`, `/api/state`, `/api/agent/run`, `/api/scan`, `/api/actions/{id}/approve|sent|paid|reject`, `/api/gmail/start|callback|findings`, `/api/auth/*`)
- **Repo (GitHub):** https://github.com/vaibhav4046/recoup  — ⚠️ currently **PRIVATE**; the owner must make it **public before submission** (private = DQ; the in-app "See the code" link 404s until public).

## CODE LOCATION & FILE MAP (Windows)
Root: `C:\Users\lalwa\OneDrive\Desktop\claude max work\recoup\`
- **Frontend (zero-build vanilla JS, instant load):** `index.html`, `app.js` (~580 lines — all UI logic, lifecycle, audit, scan handoff), `styles.css`, `recover.js` (client-side scan engine), `data.js` (offline fallback findings), `login.html`, `privacy.html`
- **Backend (FastAPI):** `backend/app/main.py` (routes), `snapshot.py` (deterministic rule engine + money surface + KIND_META), `agent.py` (Gemini via REST), `state.py` (orchestration + approval gate), `swarm.py` (multi-agent orchestration), `gmail.py` (read-only intake), `auth.py` (sessions/OAuth/magic-link), `config.py` (pydantic settings). Deploy: `backend/scripts/deploy_hf.py`.
- **Docs:** `docs/SUBMISSION.md` (Devpost copy), `docs/VIDEO_SCRIPT.md` (3-min demo script), `docs/QA_STATUS.md` (defect status: 30/40 fixed, 10 listed with fixes), `docs/HANDOFF.md` (this file). **READ QA_STATUS.md + this file first.**

## DEV ENVIRONMENT (Windows)
- Python venv: `C:\Users\lalwa\.virtualenvs\recallops\Scripts\python.exe`
- **Local static server on `http://localhost:8123`** serves the frontend for testing. `index.html`'s `RO_CONFIG.apiBase` points at the live HF backend, so local FE uses live data.
- Playwright for screenshots/automated testing at `/c/tmp/pw` (`NODE_PATH=/c/tmp/pw/node_modules`). Use it to drive flows + screenshot at **1440px desktop AND 375px mobile**.
- **Deploy frontend:** `cd "<root>" && vercel --prod --yes`
- **Deploy backend:** `HF_TOKEN=<token> python backend/scripts/deploy_hf.py` (rebuilds the Docker Space, ~2-4 min; the script also pushes the HF secrets from `.env`).
- **Push code:** standard git to `origin main` (end commits with the required Co-Authored-By trailer; branch off main if needed).

## STACK / ARCHITECTURE
- **Frontend:** vanilla JS, zero build. Boot fetches `/api/state` (5s cold-start timeout, content-type-guarded → falls back to `data.js`). **Lifecycle is per-visitor/client-side** — approve/sent/paid do NOT POST to the shared backend (a prior bug leaked one visitor's state to all; do NOT reintroduce server-side shared lifecycle). SHA-256 audit via `crypto.subtle` (with a non-secure-context fallback).
- **Backend:** FastAPI on a free HF Docker Space. **Gemini 2.5-flash via DIRECT REST httpx** — NOT the google-genai SDK (the SDK throws a client-lifecycle RuntimeError on the Spaces container). MongoDB adapter. Google OAuth (gmail.readonly). The deterministic rule engine owns every dollar amount; Gemini only narrates the reasoning.
- **Free / no-card stack only** — HARD CONSTRAINT (zero paid services, zero new accounts).

## CURRENT STATE (verified on the LIVE site)
✅ Gemini renders **live** on the backend. ✅ MongoDB live. ✅ Google OAuth **published to production** (any judge can sign in; they see a click-through "Google hasn't verified this app" warning → Advanced → continue; ~100-user cap until Google verification, which is NOT feasible pre-deadline; the paste path needs no sign-in). ✅ Per-visitor clean state. ✅ Routes 200; in-browser scan works; light+dark; dialog a11y (Esc/focus-trap/live-region/labels); break-tested (rapid actions/garbage input/races → zero JS errors). ✅ Design pass 1 done (recovery-arrow logo, Inter feature-settings, motion, depth).

## FIX EVERYTHING — the mandate (in priority order)
1. **DESIGN → genuinely world-class (owner's #1 + a judging criterion).** Current state is "clean premium SaaS," NOT Apple/Linear/Stripe-tier. Required leaps: a **bolder, cinematic hero** (show the actual product/dashboard in-frame instead of hiding it behind a button), a stronger cohesive visual language (consider a refined custom font, a richer but disciplined color system, real product screenshots/mockups, depth), choreographed scroll/entrance motion, impeccable spacing + type hierarchy, a crafted logo/wordmark. **Ask the owner for a reference site they call 10/10 and match that craft.** Verify every change LIVE at desktop + mobile.
2. **OAuth / config / integrations — fix all:** OAuth CSRF `state` validation (#20), HMAC fallback-secret fail-closed (#21), Gmail token-in-URL → fragment/short-TTL (#36); confirm `BASE_URL`/`FRONTEND_URL`/`CORS_ORIGINS` correct; keep the published-production OAuth working; consider a real **MCP server** + the latest Gemini for the tech-implementation score; verify the Gmail end-to-end flow (start → consent → callback → findings render on the frontend).
3. **The remaining 10 defects** in `docs/QA_STATUS.md` (with exact fixes): decorative-emoji aria-hide on the remaining buttons (#11 tail), currency consistency ($ vs the one €250 EU261 amount) (#5), demo-lifecycle-race guard (#24), dialog `aria-describedby` (#30), the auth items above, the unauth-endpoints comment (#19).
4. **Content/honesty:** keep `privacy.html` + README accurate to the code; keep the "recovered" counter honest (user-confirmed, not faked).

## COMPREHENSIVE TESTING METHODOLOGY — do ALL of it, repeatedly
- **Hands-on live-site user testing:** open the deployed Vercel URL and click EVERY flow as a real user — landing → "See example" → results → each card's "show work" drawer → approve → mark sent → mark recovered → scan modal → paste a real statement → Connect Gmail (click through the warning) → theme toggle → Sign in → Privacy → Delete my data → the recovery-log form → the "See a claim → recovered" demo. Screenshot each at **1440px and 375px**. Reproduce every issue on the real URL before fixing.
- **Route/keyword testing:** hit every route (`/`, `/login.html`, `/privacy.html`, a deliberately-mistyped route for the 404), every `/api/*` endpoint (status, payload shape, error cases), and grep the code for every interactive selector to confirm each is wired and labelled.
- **Multi-agent persona QA ("hundreds of users"):** run swarms of diverse + adversarial personas (impatient mobile user, scam-wary pensioner, fintech power user, investigative journalist, broke student, single parent, privacy/security engineer, blind screen-reader user, small-business owner, the 4 hackathon-judge lenses, senior PM, gig worker, retiree, data-privacy lawyer, Gen-Z, seed VC, immigrant) scoring 8 dimensions (first-impression, design, usability, trust, idea, would-use, technical, polish). Adversarially verify findings before acting. Loop until dry.
- **"Warm usage" / real-load testing:** the free HF Space sleeps after inactivity → first load is a ~30s cold start. Keep it warm before demoing/judging (ping it), and confirm the 5s cold-start fallback renders cleanly (no HTML-as-data). Test repeated/concurrent usage; confirm per-visitor state never leaks.
- **Break-testing:** rapid approve-spam, double-clicks, garbage + empty scan input, demo-vs-manual click races, theme spam, bad form input → ZERO JS errors. Capture all `pageerror`/`console.error`.
- **Cross-device + accessibility:** desktop + mobile + tablet widths; full keyboard nav; real screen-reader pass (NVDA/VoiceOver) — confirm the live-region, focus-trap, focus-return, and non-lossy labels actually announce; WCAG AA contrast in BOTH themes.

## DEPLOY / PUSH WORKFLOW
Edit → test locally on `:8123` with Playwright (zero errors) → `git add/commit/push origin main` → `vercel --prod --yes` (frontend) and/or `HF_TOKEN=… python backend/scripts/deploy_hf.py` (backend) → **re-verify on the LIVE URL** (desktop + mobile screenshots) before claiming done. Never claim a fix without a live verification.

## HONEST CONSTRAINTS — surface these to the owner, never hide
- An adversarial 20-persona QA average **plateaus ~6.5–7.1 over 11 rounds.** It is pinned by ONE dimension — `wouldUse` (~5.8) — gated **entirely** on **proof of a real payout**: the product finds + drafts + deep-links + tracks, but the user files on a third-party gov portal and real money lands **weeks** later, so "recovered" is self-reported. **A literal 10/10 average from a maximally-adversarial panel (scam-wary pensioner, privacy lawyer demanding a DPA, VC scoring the business model) is not a reachable metric — do not promise it; saying so destroys trust.** Win on the axes judges actually score (technological implementation, design, impact) and on the honesty moat (trust scores 9 from judge personas).
- **The single highest-leverage move to break the ceiling is the OWNER's manual action:** cancel one real subscription (or claim real unclaimed money via gretel.co.uk / mylostaccount.org.uk), then log it in the in-app recovery log with its confirmation reference. That one evidenced recovery turns "impressive demo" → "consequential product."

## SECURITY (critical)
- **Two secrets were exposed in chat and MUST be rotated by the owner:** the **HF token** and the **Google OAuth client secret**. They live in **HF Space → Settings → Secrets** and the local `backend/.env`. **NEVER paste secrets into chat.** Set in HF Secrets: `GOOGLE_API_KEY` (Gemini, free AI Studio), `MONGODB_URI`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `APP_SECRET`, `BASE_URL`, `FRONTEND_URL`, `CORS_ORIGINS=*`.
- Do NOT create accounts, generate/handle the owner's secrets, modify their cloud-console auth config, or open access controls on their behalf — guide them and let them click (the owner already published the OAuth app to production and can rotate secrets / add config).

## OWNER MANUAL CHECKLIST (only they can do)
🔓 Make the repo public · 🔑 rotate the 2 exposed secrets · 🎥 record the demo video (`docs/VIDEO_SCRIPT.md`) · 💷 do ONE real recovery and log it in-app · ✅ submit on Devpost: https://rapid-agent.devpost.com/

## YOUR FIRST MOVES
1. Read `docs/QA_STATUS.md`. Open the **live** site; click every flow at desktop + mobile; screenshot; list everything that looks/feels sub-premium.
2. Get the owner's reference site; execute a bold design pass; deploy; verify live.
3. Fix OAuth/config/integration items + the remaining 10 defects in tested batches.
4. Run the full multi-agent + hands-on QA loop; fix until clean. Be honest, test the real deployed product every time, never inflate, and aim every change at the three judging criteria.
