#!/usr/bin/env bash
set -euo pipefail

docker build --file apps/api/Dockerfile --tag mitten-api:phase5a .
container=$(docker run --detach --cpus=0.1 --memory=512m --memory-swap=512m \
  --publish 127.0.0.1::10000 \
  --env NODE_ENV=development --env DB_PROVIDER=sqlite --env AUDIO_STORAGE_PROVIDER=local \
  --env DB_PATH=/tmp/mitten-bench.db --env AUDIO_DIR=/tmp/mitten-bench-audio \
  --env JWT_SECRET=disposable-local-benchmark-key-never-use-in-deployments \
  --env TTS_CONCURRENCY=1 mitten-api:phase5a)
trap 'docker logs "$container"; docker inspect --format "OOMKilled={{.State.OOMKilled}}" "$container"; docker rm -f "$container" >/dev/null' EXIT

port=$(docker port "$container" 10000/tcp | cut -d: -f2)
status=0
node tools/bench-render-free.mjs "$port" || status=$?
docker exec "$container" sh -c '
  for metric in cpu.max cpu.stat memory.max memory.peak memory.events; do
    printf "\n%s\n" "$metric"
    cat "/sys/fs/cgroup/$metric" || exit 1
  done'
exit "$status"
