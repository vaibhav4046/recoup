FROM python:3.12-slim

# Node 20 so the agent can spawn the official MongoDB MCP server (npx mongodb-mcp-server) as an ADK toolset.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# pre-fetch the MongoDB MCP server so the first tool call is fast (pinned == the runtime spawn version)
RUN npx -y mongodb-mcp-server@1.12.0 --version || true

COPY . .

# Cloud Run injects PORT; 8080 is the local container default.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
