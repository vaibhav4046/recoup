# Devpost form — paste-ready answers (Google Cloud Rapid Agent Hackathon)

> Fill the form at rapid-agent.devpost.com → Submit a project. Deadline **Jun 11, 2:00pm PDT**.

## Project name
Recoup — the AI agent that gets your money back

## Tagline (short)
A Gemini 3 + ADK agent that finds money you're owed, grounds every claim in MongoDB Atlas Vector Search memory, and never acts without your approval.

## Track
**MongoDB**

## Hosted project URL
https://recoup-agent-681822930558.us-central1.run.app

## Repository URL
https://github.com/vaibhav4046/recoup  *(must be PUBLIC before submitting)*

## Demo video URL
*(record the 3-min video from the script in docs/SUBMISSION.md, upload YouTube unlisted, paste the link)*

## Built with (tags)
gemini, google-adk, google-cloud-run, mongodb-atlas, vector-search, mcp, fastapi, python, javascript

---

## About the project (long description — paste as-is)

### Inspiration
Every year people leave billions on the table — expiring refunds, class-action funds, unclaimed property, plus the quiet bleed of forgotten subscriptions, silent price hikes and duplicate charges. The #1 reason people don't let AI near their money is trust. So we built an agent that does the tedious finding-and-drafting work but **never acts on its own** — the human approves every dollar.

### What it does
Recoup turns a messy financial footprint into recovered money through one audited loop:
1. **Scan** — paste a statement (100% in-browser, nothing uploaded) or connect read-only Gmail. A deterministic rule engine finds money you're losing (dead subscriptions, price creep, duplicate charges) and money you're owed (refunds, EU261 flight compensation, settlements, unclaimed property).
2. **Reason — grounded in MongoDB Atlas Vector Search.** For every charge the agent embeds the case (gemini-embedding-001, 768-d) and runs an Atlas `$vectorSearch` over a recovery-playbook + consumer-protection-precedent corpus, retrieving the exact legal basis with similarity scores. The reasoning cites FTC Click-to-Cancel, EU261, the Fair Credit Billing Act — not the model's imagination.
3. **Act under oversight** — Gemini 3 via Google ADK drafts the recovery plan and claim; everything stops at `pending_approval`. Nothing is ever sent without a human tap.
4. **Audit** — every step writes a tamper-evident SHA-256 hash chain, verifiable live at `/api/health`.

### How we built it
- **Google:** Gemini 3 (gemini-3-flash-preview) as the reasoner inside an **`LlmAgent` built on the Google Agent Development Kit (ADK) — the open-source agent framework of Google Cloud's Agent Builder**; the whole app (static frontend + FastAPI) is served by **one Cloud Run service**. (ADK is how you build agents in the Agent Builder family — same orchestration, plan→tool→act loop, and `MCPToolset` tool bridge.)
- **MongoDB (partner MCP):** the agent queries Atlas through the **official `mongodb-mcp-server`** registered as an ADK `MCPToolset` — and uses **Atlas Vector Search as its memory** (41 grounded documents: 30 consumer-protection precedents — 16 untagged so retrieval is genuinely semantic, not a dict lookup — + 11 recovery playbooks across US/UK/EU, embedded with gemini-embedding-001; degrades to keyword/kind match so the legal basis never vanishes under a quota outage).
- **Trust engineering:** money math is deterministic in code (the model never invents an amount); one-time payouts are never annualized; a human-approval gate enforced in the API (state.py) and mirrored in the demo UI; a SHA-256 audit chain with a public integrity check at `/api/health`.
- **Recoup is also an MCP server itself:** a JSON-RPC surface at `/mcp` exposes **5 tools** — including `recoup_plan_recovery`, which lets any agent host hand Recoup a charge and get back a playbook-grounded recovery plan stopped at `pending_approval` (approval is deliberately NOT exposed over MCP: the human gate is part of the protocol, not just the UI) — Google-only runtime AI throughout.
- **One-tap onboarding:** a single Google consent both signs you in and runs a same-pass read-only Gmail scan, so you land in the command center with your real subscriptions already loaded. A plain-English GDPR/Limited-Use privacy page backs it, with a 5-minute retention window enforced in code.

### Challenges we ran into
Trust is the whole game: our adversarial QA personas kept failing us on things that merely *read* as untrustworthy — a blended $/yr figure, a self-certifying audit chain, fabricated-looking testimonials. Every one became a fix: per-currency totals, a race-safe audit chain verified under concurrent approvals, and a QA section that only shows reproducible claims. Free-tier reliability mattered too: every agent endpoint degrades to a deterministic playbook-based fallback so the demo never breaks under rate limits.

### Accomplishments we're proud of
A real, deployed, end-to-end agent — not a mockup: live `$vectorSearch` retrieval with similarity scores in the UI, the official MongoDB MCP toolset wired through ADK, sign-in, a per-visitor demo, and an honesty-first design (the agent shows its work, its caveats, and what it can't confirm).

### What we learned
For an AI-near-money product, *checkable* beats *clever*. Showing the rule, the source row, the verifier's checks and the "you might not qualify if…" did more for user trust than any polish.

### Why this doesn't already exist
Rocket Money links your bank and takes a cut; DoNotPay was FTC-sanctioned (2024) for unverifiable claims; property-finder firms charge 10–30% of recoveries. Recoup is the anti-DoNotPay: in-browser data, every claim cites its statute, a human approves everything, and money only moves on official portals — checkable beats clever.

### Business model (sustainable, trust-consistent)
The private scan stays free forever. The path is an *optional* success fee (5–10%) only on confirmation-backed recoveries — never data sales, never a bank login, never a cut of money you recovered yourself.

### What's next
Google OAuth verification for the Gmail connector; one-click pre-filled claim forms; open-banking (read-only) as the scale data source; a cross-session recovered-to-date ledger; multi-currency rule packs (UK/EU/India).

---

## Submission checklist (do in this order)
1. GitHub repo → **Public** (Settings → Danger Zone → Change visibility).
2. Console → OAuth client → add the 2 Cloud Run redirect URIs (sign-in on the submission URL).
3. Record the ~3-min video against the **Cloud Run URL** (script: docs/SUBMISSION.md) → YouTube unlisted.
4. Devpost form: paste everything above, select the **MongoDB** track, attach the video link, submit.
