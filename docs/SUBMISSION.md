# Recoup — Devpost submission

**Tagline:** The AI agent that gets your money back — finds what you're owed and losing, drafts every claim, and *you* approve each one.

- 🔗 **Live demo:** https://recoup-vaibhav4046s-projects.vercel.app
- 💻 **Code:** https://github.com/vaibhav4046/recoup
- 🤖 **Live API (Hugging Face Space):** https://vaibhav3313-recoup.hf.space/api/health
- **Built with:** Google **Gemini 2.5-flash** · FastAPI · MongoDB · MCP-compatible JSON-RPC tools *(committed backend; mounts on redeploy)* · Hugging Face Spaces · Vercel

---

## Inspiration

Every year people leave **billions** on the table — $1B+ in expiring tax refunds, a $1.5B Amazon/FTC consumer fund, mountains of unclaimed property, plus the quiet bleed of forgotten subscriptions, silent price hikes, and duplicate charges. And the #1 reason people *don't* let AI touch their money is **trust** (it's the highest-want, highest-distrust category in consumer AI surveys). We wanted an agent that does the tedious finding-and-drafting work but never acts on its own — the human stays in control of every dollar.

## What it does

Recoup turns a messy financial footprint into recovered money through one audited loop:

1. **Scan** — point it at your data (paste a statement, or connect Gmail read-only). A deterministic rule engine finds money you're **losing** (dead subscriptions, price creep, billing errors) and money you're **owed** (refunds, EU261 flight-delay compensation, class-action settlements, unclaimed property, warranties, deposits).
2. **Reason** — a **4-agent swarm** (Subscription Hunter, Billing Auditor, Refund Claimant, Entitlement Finder) is dispatched by a Coordinator; an independent **Verifier** auto-confirms the mechanical leaks and explicitly flags entitlements as "needs your eligibility sign-off." **Gemini** narrates the reasoning — but never invents an amount.
3. **Show the work** — every claim has a confidence score, the consumer-protection rule it cites, the exact source evidence, the Verifier's boolean checks, an honest "you might NOT qualify if…" caveat, and a deep-link to the *real* claim form (MissingMoney/NAUPA, the CAA for EU261, the FTC for settlements).
4. **Approve → Send → Recover** — approval is the only path that readies a claim; each advances Drafted → Sent → Recovered. "Recovered" only counts money you mark as actually received (self-reported, labelled as such).
5. **Audit** — every step folds into a **SHA-256 hash chain** with a `verify()` re-walk that detects tampering.

**Privacy first:** the "Scan your statement" path runs the entire rule engine **100% in your browser** — nothing is uploaded, no account needed.

## How we built it

- **Frontend:** a zero-build static app (instant load) — vanilla JS + a premium product-led UI, light/dark mode, responsive mobile layout, full accessibility (ARIA roles, focus-visible, reduced-motion), deployed on **Vercel**.
- **Backend:** **FastAPI** on a free **Hugging Face Docker Space**. A deterministic rule engine owns every dollar amount; **Gemini 2.5-flash** (called via the REST API for runtime robustness) writes the human-readable reasoning trace. Server-enforced human-approval gate. A `hashlib` **SHA-256 audit chain**. A **MongoDB** adapter persists approved cases. The committed backend also includes an MCP-compatible JSON-RPC endpoint for `recoup_scan_demo`, `recoup_get_state`, Gmail subscription detection, and Gmail connection status tools.
- **The swarm:** a Coordinator → specialist agents → an independent Verifier → a Drafter, each finding carrying its agent attribution + verdict.
- **Quality:** we ran **three rounds of brutal multi-agent QA** (14 personas + hackathon-judge lenses each round), then fixed what they found — the honesty calibration (no annualized one-time payouts, eligibility caveats, "self-reported" recovered, a Verifier that says *no*) came directly out of that.

## Partner & free-tier stack

| Layer | Tech | Cost |
|---|---|---|
| Reasoning | **Google Gemini 2.5-flash** | free tier |
| Store | **MongoDB** Atlas M0 | free |
| Agent tools | MCP-compatible JSON-RPC over HTTP | free |
| Backend host | **Hugging Face** Docker Spaces | free |
| Frontend host | **Vercel** | free |

## Challenges we ran into

- **Trust is the whole game.** Our QA panel kept scoring us down for things that *read* as untrustworthy even when correct — a blended "/yr" number, a self-certifying audit chain, a verifier that passed 100% of its sibling's output. Every one became a fix.
- **Gemini on the Spaces container** threw a client-lifecycle `RuntimeError`; we switched to calling the Gemini REST API directly via httpx, which is robust across runtimes (and degrades gracefully to the deterministic trace on a transient 503).
- **Free-tier rate limits** (5 calls/min) — handled with retry + a clearly-labelled deterministic fallback, so the demo never breaks.

## Accomplishments we're proud of

- A **real, deployed, end-to-end** product (not a mockup) on an entirely free, no-card stack.
- **Real data, totally private** — the in-browser scan finds your actual recurring charges without anything leaving your device.
- An agent that is **honest by construction**: amounts from rules not the model, one-time money never annualized, eligibility caveats up front, a verifier that flags what it can't confirm.
- A judge-friendly technical story: deterministic money rules, Gemini reasoning, human approval, SHA-256 audit, MongoDB persistence, and an MCP-compatible tool surface for agent access *(in the committed backend; live on the Space at the next redeploy)*.

## What we learned

For an AI-near-money product, *checkable* beats *clever*. Showing the work — the rule, the source row, the boolean checks, the "why you might not qualify" — did more for trust than any amount of polish.

## What's next

- Google OAuth verification for the read-only Gmail connector, so judges no longer see Google's unverified-app warning.
- Closing more categories end-to-end (pre-filled claim forms, one-click cancels).
- A "recovered to date" ledger across sessions.

---

## 3-minute demo video script

**[0:00–0:20] Hook.** "Americans leave billions unclaimed every year — forgotten subscriptions, refunds they never filed, money they're legally owed. Meet Recoup: the AI agent that gets it back, with you in control of every dollar." *(show the live command center)*

**[0:20–0:50] The scan.** "Recoup scans your financial footprint — here, 100% in the browser, nothing uploaded." *(open "Scan your statement" → Try a sample → Scan → cards populate)* "It found recurring leaks and money you're owed — and notice the amounts come from rules, not the model."

**[0:50–1:30] The swarm + show-your-work.** "A coordinator dispatched four specialist agents; an independent verifier auto-confirmed the mechanical leaks but flagged the entitlements for your eligibility sign-off — it doesn't mark its own homework." *(click "Show work")* "Every claim shows the rule, the source evidence, the verifier's checks, an honest 'you might not qualify if', and a deep-link to the real claim form."

**[1:30–2:10] Approve → recover.** "Nothing sends without me." *(Approve → Copy / Open claim form → Mark sent → Mark recovered)* "Each step writes a tamper-evident SHA-256 audit chain — and 'recovered' only counts what I confirm I actually got back."

**[2:10–2:40] Real + trustworthy + free.** "It's live: a FastAPI backend on Hugging Face, Gemini doing the reasoning, a private in-browser engine, all on a free no-card stack." *(show the "Backend · live / Gemini · live" chips, toggle light/dark)*

**[2:40–3:00] Close.** "Recoup — money you're owed, recovered, on your terms. Thanks for watching." *(live link on screen)*
