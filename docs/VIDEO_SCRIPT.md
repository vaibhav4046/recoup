# Recoup - 3-minute demo video script

Setup before recording (do these IN ORDER — they make every claim in the script true on camera):
- Redeploy Cloud Run with the pinned deps + `--min-instances 1` (see docs/SUBMISSION.md), then **verify the MCP toolset is actually live**: `curl -X POST $URL/api/agent/recover -d '{"charge":{"merchant":"FitLife Gym","kind":"dead_subscription","amount":480}}'` must return `"mcp":{"live":true,...}`. Do NOT narrate the MCP line below until this returns true.
- **Pre-warm Gemini** right before recording: `curl -X POST $URL/api/agent/plan -d '{"charge":{"merchant":"FitLife Gym","kind":"dead_subscription","amount":480}}'` once, so the first on-camera reasoning call is fast and `live:true` (not a cold-start 429 fallback).
- Open `/api/health` once so it is warm; confirm `gemini:live`, `mongodb:live`, `audit.intact:true`.
- Open the Cloud Run URL; it serves both the frontend and API.
- Have one real subscription or refund example ready if you can show a real confirmation.

## 0:00-0:18 - Cold open

"I just found money I was quietly losing, and Recoup shows exactly how to get it back without ever moving money for me."

Show one real cancellation/refund confirmation if available. If not, show the demo claim clearly labelled as demo.

## 0:18-0:35 - The problem

"People leave money everywhere: forgotten subscriptions, silent price hikes, duplicate charges, flight-delay compensation, unclaimed property. The hard part is not knowing where to look, what rule applies, and what to send."

## 0:35-1:05 - The scan

Open "Find my money", paste a sample statement, and run the private scan.

"The paste scan runs in the browser. Amounts are deterministic. The model never invents a dollar amount."

## 1:05-1:45 - Hackathon technical core

Show the Agent Run Timeline.

"This is not a chatbot. The agent plans, calls tools, retrieves memory, drafts, and stops at approval. Gemini and Google ADK run the planner. The official MongoDB MCP server is registered as the tool bridge. Atlas Vector Search is the memory: it retrieves the most relevant recovery playbook with a similarity score."

Point to the matched playbook and score.

## 1:45-2:20 - Trust and approval

Open "Show work" on a claim, then approve it.

"Every claim shows the rule, source evidence, verifier checks, caveats, and the official next step. Nothing sends until I approve it. Even after approval, Recoup only readies the claim; I still submit on the official vendor or government site."

## 2:20-2:45 - Proof

Show `/api/health` from Cloud Run.

"The live backend is on Google Cloud Run. `/api/health` shows Gemini, MongoDB, Vector Search playbooks, and the SHA-256 audit chain."

## 2:45-3:00 - Close

"Recoup is the AI agent that gets your money back, with you in control of every dollar."
