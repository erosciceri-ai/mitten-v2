FROM node:24.16.0-bookworm-slim AS build
WORKDIR /app
# sqlite3 can fall back to a native build if a prebuilt binary is unavailable.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY tools/esp32-simulator/package.json tools/esp32-simulator/
RUN npm ci --workspace=@mitten/contracts --workspace=@mitten/api
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src/ apps/api/src/
COPY packages/contracts/tsconfig.json packages/contracts/
COPY packages/contracts/src/ packages/contracts/src/
RUN npm run build --workspace=@mitten/contracts \
    && npm run build --workspace=@mitten/api \
    && npm prune --omit=dev --workspace=@mitten/contracts --workspace=@mitten/api

FROM node:24.16.0-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 python3-venv libgomp1 \
    && python3 -m venv /opt/piper \
    && /opt/piper/bin/pip install --no-cache-dir piper-tts==1.8.0 lameenc==1.8.4 \
    && mkdir -p /opt/voices \
    && voice=es_AR-daniela-high.onnx \
    && source_url=https://huggingface.co/rhasspy/piper-voices/resolve/ae9d8352b73c1b1750748843e753a504b00e05b0/es/es_AR/daniela/high \
    && curl --fail --location --retry 3 "$source_url/$voice?download=true" --output "/opt/voices/$voice" \
    && curl --fail --location --retry 3 "$source_url/$voice.json?download=true" --output "/opt/voices/$voice.json" \
    && /opt/piper/bin/python -c 'import lameenc, piper' \
    && apt-get purge -y curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
COPY apps/api/tools/piper_synthesize.py apps/api/tools/
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 \
    TTS_PROVIDER=piper TTS_CONCURRENCY=1 PIPER_EXECUTABLE=/opt/piper/bin/python \
    PIPER_MODEL=/opt/voices/es_AR-daniela-high.onnx
USER node
EXPOSE 10000
CMD ["node", "apps/api/dist/index.js"]
