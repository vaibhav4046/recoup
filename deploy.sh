#!/usr/bin/env bash
# Recoup — one-command Google Cloud Run deploy. Run it in Google Cloud Shell (free; gcloud is
# preinstalled; no $300 credit needed — Cloud Run's free tier covers this). It prompts for the two
# secrets (never committed), rebuilds the image (ships the current frontend + the MCP/Gemini-3
# backend), and verifies the live result.
#
#   ONE STEP:  bash deploy.sh
#
set -euo pipefail
REGION="us-central1"
SERVICE="recoup-agent"
URL="https://recoup-agent-681822930558.us-central1.run.app"
VERCEL="https://recoup-vaibhav4046s-projects.vercel.app"

: "${GOOGLE_API_KEY:=}"; : "${MONGODB_URI:=}"
if [ -z "$GOOGLE_API_KEY" ]; then
  echo "Get a fresh key at https://aistudio.google.com/apikey (Create API key) — resets the daily quota."
  read -rp "Paste GOOGLE_API_KEY: " GOOGLE_API_KEY
fi
if [ -z "$MONGODB_URI" ]; then
  read -rp "Paste MONGODB_URI (your Atlas connection string): " MONGODB_URI
fi

# ^##^ = custom delimiter so commas inside CORS_ORIGINS (and any Mongo replica-set URI) are NOT
# mis-parsed by gcloud as separate env vars.
gcloud run deploy "$SERVICE" --source . --region "$REGION" \
  --allow-unauthenticated --memory 1Gi --min-instances 1 --max-instances 1 \
  --set-env-vars "^##^GOOGLE_API_KEY=${GOOGLE_API_KEY}##MONGODB_URI=${MONGODB_URI}##MONGODB_DB=recoup##GEMINI_MODEL=gemini-3-flash-preview##GOOGLE_GENAI_USE_VERTEXAI=FALSE##APP_SECRET=$(openssl rand -hex 16)##BASE_URL=${URL}##FRONTEND_URL=${URL}##CORS_ORIGINS=${URL},${VERCEL}"

echo; echo "== verifying the live deployment =="
sleep 6
echo "-- /api/health --";        curl -s "$URL/api/health" | head -c 500; echo
echo "-- /api/agent/recover --"; curl -s -X POST "$URL/api/agent/recover" -H 'content-type: application/json' \
     -d '{"charge":{"merchant":"FitLife Gym","kind":"dead_subscription","amount":480}}' | head -c 500; echo
echo
echo "DONE. Submit this URL on Devpost:  $URL"
echo 'Look above for  "mcp":{"live":true  and  gemini live.  If mcp.live is false or the plan is'
echo 'a deterministic fallback, the Gemini key is quota-limited — paste a fresh key and re-run.'
