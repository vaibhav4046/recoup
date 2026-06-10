#!/usr/bin/env bash
# ============================================================================
#  Recoup — ONE-STEP Cloud Run deploy.  Run it in Google Cloud Shell (free):
#
#     bash deploy.sh
#
#  It reuses the secrets already on your live service (MONGODB_URI, APP_SECRET),
#  so you paste NOTHING — just press ENTER. It ships the current code (clean
#  Google sign-in, live MongoDB MCP, Gemini 3, premium UI), pins min-instances,
#  fixes CORS, and verifies the result. No $300 credit needed.
# ============================================================================
set -euo pipefail
REGION="us-central1"
SERVICE="recoup-agent"
URL="https://recoup-agent-681822930558.us-central1.run.app"
VERCEL="https://recoup-vaibhav4046s-projects.vercel.app"

echo "================  Recoup one-step deploy  ================"
echo "OPTIONAL: paste a fresh Gemini key to reset the daily quota"
echo "          (https://aistudio.google.com/apikey -> Create API key)."
echo "          Or just press ENTER to keep the key already on the service."
read -rp "GOOGLE_API_KEY (or press ENTER to skip): " NEWKEY || true

# Only update the vars that need changing; MONGODB_URI / APP_SECRET are preserved automatically.
# ^##^ delimiter so the comma in CORS_ORIGINS isn't mis-parsed as two env vars.
PAIRS="GEMINI_MODEL=gemini-3-flash-preview##GOOGLE_GENAI_USE_VERTEXAI=FALSE##BASE_URL=${URL}##FRONTEND_URL=${URL}##CORS_ORIGINS=${URL},${VERCEL}"
if [ -n "${NEWKEY:-}" ]; then PAIRS="GOOGLE_API_KEY=${NEWKEY}##${PAIRS}"; fi

echo; echo "Deploying… (first build takes ~3-5 min)"
gcloud run deploy "$SERVICE" --source . --region "$REGION" \
  --allow-unauthenticated --memory 1Gi --min-instances 1 --max-instances 1 \
  --update-env-vars "^##^${PAIRS}"

echo; echo "================  verifying the live site  ================"; sleep 6
echo "-- /api/health --";        curl -s "$URL/api/health" | head -c 600; echo
echo "-- /api/agent/recover --"; curl -s -X POST "$URL/api/agent/recover" -H 'content-type: application/json' \
     -d '{"charge":{"merchant":"FitLife Gym","kind":"dead_subscription","amount":480}}' | head -c 600; echo
echo
echo "============================================================"
echo "DONE. Submit on Devpost:  $URL"
echo
echo "Look above for  \"mcp\":{\"live\":true   and   \"integrations\":{\"gemini\":\"live\""
echo "If gemini shows fallback, the key is quota-limited: re-run and paste a fresh key."
echo
echo ">>> LAST CLICK to remove the 'Google hasn't verified' screen on sign-in:"
echo "    Cloud Console -> APIs & Services -> OAuth consent screen -> PUBLISH APP."
echo "    (Instant, no review — sign-in only uses name+email, a non-sensitive scope.)"
echo "============================================================"
