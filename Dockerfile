# Recoup — Google Cloud Run image.
# FastAPI + Google ADK (Gemini reasoner) + Node so the agent can spawn the OFFICIAL
# MongoDB MCP server (npx mongodb-mcp-server) as an ADK MCP toolset.
FROM python:3.12-slim

# Node 20 for the MongoDB MCP server
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
# pre-fetch the MongoDB MCP server so the first tool call is fast
RUN npx -y mongodb-mcp-server --version || true

COPY backend/app ./app
RUN mkdir -p ./static
COPY index.html login.html privacy.html config.js data.js recover.js app.js reel.js voice.js agent-timeline.js login.js styles.css favicon.png mark.png logo.png ./static/
COPY screens/ ./static/screens/
ENV PORT=8080 GOOGLE_GENAI_USE_VERTEXAI=FALSE
# Cloud Run injects $PORT; bind to it
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
