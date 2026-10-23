# Deployment sketch for docker-compose.yml. Not built in this prototype's CI; see docs/features/platform.md.

# Build the web UI
FROM node:22-bookworm-slim AS ui
WORKDIR /src/frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# API, workers and the built UI in one image
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PRAMANA_DATA_DIR=/data
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/ ./
# Editable install keeps rulesets/ and trust/ next to the package, where the settings expect them
RUN pip install --no-cache-dir -e ".[postgres]"
COPY --from=ui /src/frontend/dist /app/frontend/dist
RUN useradd --system --uid 10001 pramana && mkdir -p /data && chown pramana /data
USER pramana
EXPOSE 8000
# One server process: background runs and the parser pool live inside it (see docs/features/platform.md)
CMD ["uvicorn", "pramana.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
