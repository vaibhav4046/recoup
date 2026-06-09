# Recoup — Agent Spine HANDOFF (Google Cloud Rapid Agent Hackathon · MongoDB track)

Qualifying agent spine retrofitted **additively** — existing product behavior unchanged.
Architecture: **Frontend → Cloud Run [Gemini + Google ADK] → MongoDB MCP → Atlas Vector Search**.

## Done (committed)
| Phase | What | State |
|---|---|---|
| 1 | **ADK Gemini agent** `backend/app/adk_agent.py` (`LlmAgent`) + `POST /api/agent/plan` | ✅ verified local (charge→plan, `pending_approval`, deterministic $) |
| 2 | **Official MongoDB MCP** as ADK `MCPToolset` (`mongodb_toolset()` → `npx mongodb-mcp-server`) | ✅ code; server pre-warmed v1.12.0; live tool call needs `MONGODB_URI` |
| 3 | **Atlas Vector Search playbooks** (6 docs: gym/streaming cancel, EU261, duplicate-charge, free-trial refund, overpaid utility) + `POST /api/agent/recover` | ✅ code; live run needs `MONGODB_URI` |
| 4 | **Agent Run Timeline UI** (Plan→MCP→Vector[playbook+score]→Draft→Awaiting approval→Action link) + summary card, black+gold, seeded | ✅ rendered + verified (screens/timeline.png); deploys on Vercel reset |
| 5 | **Cloud Run** image — root `Dockerfile` (Python + Node) + `.gcloudignore` | ✅ code; deploy = your gcloud |
| 6 | **LICENSE** (MIT) + README architecture + this HANDOFF | ✅ |

Runtime AI is **Google-only** (ElevenLabs stripped; voice = browser Web Speech). Money math deterministic; human gate intact; secrets from env.

## Left (your manual steps, in order)
1. **Prove MCP + Vector live (1 min):** in your terminal `setx MONGODB_URI "mongodb+srv://…"`, then I run `backend/scripts/adk_mcp_smoke.py` + `/api/agent/recover` (or you run them).
2. **Deploy to Cloud Run** (needs `gcloud`, your GCP project — command below).
3. **Frontend redeploy** (Agent Timeline): Vercel daily-deploy limit is hit; redeploy from the Vercel dashboard or wait for reset (backend already serves the run data).
4. **Make GitHub repo public**, record the 3-min video (script in `docs/SUBMISSION.md`), submit Devpost.

## Env vars (all from env, never hardcoded)
`GOOGLE_API_KEY` · `MONGODB_URI` · `MONGODB_DB=recoup` · `GEMINI_MODEL=gemini-2.5-flash` · `GOOGLE_GENAI_USE_VERTEXAI=FALSE` · `CORS_ORIGINS`

## Commands
```bash
# local smoke
python backend/scripts/adk_smoke.py          # ADK Gemini agent (no DB needed)
python backend/scripts/adk_mcp_smoke.py      # official MongoDB MCP tool call (needs MONGODB_URI)

# deploy to Cloud Run (root Dockerfile installs Node for the MCP server)
gcloud run deploy recoup-agent --source . --region us-central1 --allow-unauthenticated --memory 1Gi \
  --set-env-vars "GOOGLE_API_KEY=$GOOGLE_API_KEY,MONGODB_URI=$MONGODB_URI,MONGODB_DB=recoup,GEMINI_MODEL=gemini-2.5-flash,GOOGLE_GENAI_USE_VERTEXAI=FALSE,CORS_ORIGINS=*"

# verify the live URL gcloud prints
curl "$URL/api/health"                        # vector.precedents + vector.playbooks populated
curl -X POST "$URL/api/agent/recover" -H 'content-type: application/json' \
     -d '{"charge":{"merchant":"FitLife Gym","kind":"dead_subscription","amount":480}}'
```

## Endpoints (agent spine)
`POST /api/agent/plan` · `POST /api/agent/recover` · `POST /api/vector/seed` · `GET /api/health` (carries `vector` status).
