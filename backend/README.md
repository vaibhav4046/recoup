# Recoup API

FastAPI backend for **Recoup**, the AI agent that gets your money back. It scans a
financial footprint, uses **Gemini** and Google **ADK** to plan recovery, retrieves
memory from **MongoDB Atlas Vector Search**, registers the official
`mongodb-mcp-server` as an ADK toolset, and gates every real-world action behind
human approval. Every lifecycle event writes a tamper-evident SHA-256 audit chain.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | service + integration status |
| POST | `/api/scan` | scan the money surface |
| POST | `/api/agent/run` | Gemini drafts the plan + reasoning trace |
| POST | `/api/agent/plan` | ADK/Gemini recovery plan for one detected charge |
| POST | `/api/agent/recover` | MCP probe + Atlas Vector Search playbook + recovery plan |
| POST | `/api/actions/{id}/approve` | human approval gate; readies a claim, no money movement |
| POST | `/api/actions/{id}/sent` | mark an approved claim as sent |
| POST | `/api/actions/{id}/paid` | mark money as actually recovered |
| POST | `/api/actions/{id}/reject` | skip an action |
| GET | `/api/audit` | hash-chained audit log + integrity |
| POST | `/api/report` | full recovery report |
| GET | `/api/state` | hydration snapshot for the frontend |
| GET | `/mcp`, `/api/mcp` | MCP tool discovery metadata |
| POST | `/mcp`, `/api/mcp` | MCP-compatible JSON-RPC tool calls |

## Run Locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8099
python scripts/mcp_smoke.py
python scripts/adk_smoke.py
```

Set `GOOGLE_API_KEY` and `MONGODB_URI` in `backend/.env` or your environment for
live Gemini, official MongoDB MCP, and Atlas Vector Search. Without those, the
service returns clearly labelled deterministic fallbacks.

## Deploy To Google Cloud Run

Run from the repo root so the root `Dockerfile` installs Python plus Node for the
official `mongodb-mcp-server` subprocess:

```bash
gcloud run deploy recoup-agent \
  --source . --region us-central1 --allow-unauthenticated --memory 1Gi \
  --set-env-vars "GOOGLE_API_KEY=$GOOGLE_API_KEY,MONGODB_URI=$MONGODB_URI,MONGODB_DB=recoup,GEMINI_MODEL=gemini-2.5-flash,GOOGLE_GENAI_USE_VERTEXAI=FALSE"

gcloud run services update recoup-agent --region us-central1 \
  --set-env-vars "BASE_URL=$URL,FRONTEND_URL=$URL"
```

After deploy, open:

```bash
curl "$URL/api/health"
curl -X POST "$URL/api/agent/recover" -H "content-type: application/json" \
  -d '{"charge":{"merchant":"FitLife Gym","kind":"dead_subscription","amount":480,"amount_label":"$480/yr"}}'
```
