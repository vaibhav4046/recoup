---
title: Recoup API
emoji: 💸
colorFrom: green
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Recoup API

FastAPI backend for **Recoup** — the AI agent that gets your money back. It scans
a financial footprint, has **Gemini** reason over it to find money you're losing
(dead subscriptions, price creep, billing errors) and money you're owed (refunds,
settlements, flight-delay compensation, unclaimed property), drafts each claim,
and gates every action behind **human approval** — writing a tamper-evident
sha256 audit chain. Approved cases persist to **MongoDB** (partner integration).
It also exposes an MCP-compatible JSON-RPC tool surface for agent access to demo
scans, current state, Gmail subscription detection, and Gmail connection status.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health` | service + integration status |
| POST | `/api/scan` | scan the money surface |
| POST | `/api/agent/run` | Gemini drafts the plan + reasoning trace |
| POST | `/api/actions/{id}/approve` | the human approval gate (readies a claim; no money movement) |
| POST | `/api/actions/{id}/sent` | mark an approved claim as sent |
| POST | `/api/actions/{id}/paid` | mark money as actually recovered |
| POST | `/api/agent/plan` | ADK/Gemini recovery plan for one detected charge |
| POST | `/api/agent/recover` | MCP probe + Atlas Vector Search playbook + recovery plan |
| POST | `/api/actions/{id}/reject` | skip an action |
| GET  | `/api/audit` | the hash-chained audit log + integrity |
| POST | `/api/report` | full recovery report |
| GET  | `/api/state` | hydration snapshot for the frontend |
| GET  | `/mcp`, `/api/mcp` | MCP tool discovery metadata |
| POST | `/mcp`, `/api/mcp` | MCP-compatible JSON-RPC tool calls |

## Run locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8099
python scripts/mcp_smoke.py
```

Gemini activates with a free [AI Studio](https://aistudio.google.com/) key in
`.env` (`GOOGLE_API_KEY`); without it the agent runs in clearly-labelled
deterministic fallback so the whole flow stays demoable. No credit card required.
