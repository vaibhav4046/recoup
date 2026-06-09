# Recoup — Devpost submission

**Tagline:** The AI agent that gets your money back — finds what you're owed and losing, drafts every claim, and *you* approve each one.

- 🔗 **Live demo:** https://recoup-vaibhav4046s-projects.vercel.app
- 💻 **Code:** https://github.com/vaibhav4046/recoup
- 🤖 **Live API (Hugging Face Space):** https://vaibhav3313-recoup.hf.space/api/health
- **Built with:** **MongoDB Atlas Vector Search** (the agent's retrieval brain) · Google **Gemini 2.5-flash** + **gemini-embedding-001** · Google **ADK** · the official **MongoDB MCP server** · FastAPI · a zero-cost in-browser **voice agent** · Hugging Face Spaces today, Cloud Run-ready image in repo · Vercel

---

## Inspiration

Every year people leave **billions** on the table — $1B+ in expiring tax refunds, a $1.5B Amazon/FTC consumer fund, mountains of unclaimed property, plus the quiet bleed of forgotten subscriptions, silent price hikes, and duplicate charges. And the #1 reason people *don't* let AI touch their money is **trust** (it's the highest-want, highest-distrust category in consumer AI surveys). We wanted an agent that does the tedious finding-and-drafting work but never acts on its own — the human stays in control of every dollar.

## What it does

Recoup turns a messy financial footprint into recovered money through one audited loop:

1. **Scan** — point it at your data (paste a statement, or connect Gmail read-only). A deterministic rule engine finds money you're **losing** (dead subscriptions, price creep, billing errors) and money you're **owed** (refunds, EU261 flight-delay compensation, class-action settlements, unclaimed property, warranties, deposits).
2. **Reason — grounded in real precedent via MongoDB Atlas Vector Search.** This is the agent's brain: for every finding it embeds the case (`gemini-embedding-001`, 768-dim) and runs an Atlas **`$vectorSearch`** over a consumer-protection precedent corpus to retrieve the exact legal basis *with similarity scores* — so the reasoning is grounded in actual law (FTC Click-to-Cancel, EU261, the Fair Credit Billing Act…), not the model's imagination. The agent then runs a genuine **plan → tool → act** loop: a Coordinator dispatches a **4-agent swarm** (Subscription Hunter, Billing Auditor, Refund Claimant, Entitlement Finder); an independent **Verifier** auto-confirms mechanical leaks and flags entitlements for your eligibility sign-off. **Gemini** narrates — but never invents an amount.
3. **Show the work** — every claim has a confidence score, the consumer-protection rule it cites, the exact source evidence, the Verifier's boolean checks, an honest "you might NOT qualify if…" caveat, and a deep-link to the *real* claim form (MissingMoney/NAUPA, the CAA for EU261, the FTC for settlements).
4. **Approve → Send → Recover** — approval is the only path that readies a claim; each advances Drafted → Sent → Recovered. "Recovered" only counts money you mark as actually received (self-reported, labelled as such).
5. **Audit** — every step folds into a **SHA-256 hash chain** with a `verify()` re-walk that detects tampering.

**Privacy first:** the "Scan your statement" path runs the entire rule engine **100% in your browser** — nothing is uploaded, no account needed.

## How we built it

- **Frontend:** a zero-build static app (instant load) — vanilla JS + a premium product-led UI, light/dark mode, responsive mobile layout, full accessibility (ARIA roles, focus-visible, reduced-motion), deployed on **Vercel**.
- **Backend:** **FastAPI** currently deployed on a free **Hugging Face Docker Space**, with a Cloud Run image and exact deploy command committed for the Google Cloud submission path. A deterministic rule engine owns every dollar amount; **Gemini 2.5-flash** writes the human-readable plan/reasoning and degrades to deterministic fallback under free-tier rate limits. Server-enforced human-approval gate. A `hashlib` **SHA-256 audit chain**. The agent spine registers the official **MongoDB MCP server** as an ADK toolset, while Atlas **Vector Search** stores/retrieves recovery playbook memory.
- **The swarm:** a Coordinator → specialist agents → an independent Verifier → a Drafter, each finding carrying its agent attribution + verdict.
- **Quality:** we ran **three rounds of brutal multi-agent QA** (14 personas + hackathon-judge lenses each round), then fixed what they found — the honesty calibration (no annualized one-time payouts, eligibility caveats, "self-reported" recovered, a Verifier that says *no*) came directly out of that.

## Partner & free-tier stack

| Layer | Tech | Cost |
|---|---|---|
| **Vector Search** | **MongoDB Atlas Vector Search** + `gemini-embedding-001` (768d) | free (M0) |
| Reasoning | **Google Gemini 2.5-flash** | free tier |
| Store | **MongoDB** Atlas M0 | free |
| Voice agent | Browser Web Speech (STT + TTS) only | free |
| Agent tools | Google ADK + official MongoDB MCP server | free |
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
- A judge-friendly technical story: deterministic money rules, Gemini/ADK planning, human approval, SHA-256 audit, MongoDB Atlas Vector Search memory, and the official MongoDB MCP server registered as an agent toolset.

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

**[0:50–1:30] Atlas Vector Search + the swarm.** "Here's the technical heart: for every finding, the agent embeds the case and runs a **MongoDB Atlas Vector Search** over a consumer-protection precedent corpus — you can see it retrieve the exact legal basis with a similarity score." *(point at the 'Tool · Atlas Vector Search → FTC Click-to-Cancel (sim 0.84)' reasoning line)* "That's a real plan→tool→act loop, not a chatbot. A coordinator dispatched four specialist agents; an independent verifier auto-confirmed the mechanical leaks but flagged the entitlements for your sign-off — it doesn't mark its own homework." *(click "Show work")* "Every claim shows the rule, the source evidence, the verifier's checks, an honest 'you might not qualify if', and a deep-link to the real claim form. You can even drive it by **voice** — tap the mic and say 'find my money.'"

**[1:30–2:10] Approve → recover.** "Nothing sends without me." *(Approve → Copy / Open claim form → Mark sent → Mark recovered)* "Each step writes a tamper-evident SHA-256 audit chain — and 'recovered' only counts what I confirm I actually got back."

**[2:10–2:40] Real + trustworthy + free.** "It's live: a FastAPI backend on Hugging Face, Gemini doing the reasoning, a private in-browser engine, all on a free no-card stack." *(show the "Backend · live / Gemini · live" chips, toggle light/dark)*

**[2:40–3:00] Close.** "Recoup — money you're owed, recovered, on your terms. Thanks for watching." *(live link on screen)*
