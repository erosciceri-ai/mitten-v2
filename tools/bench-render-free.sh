#!/usr/bin/env bash
set -euo pipefail

docker build --file apps/api/Dockerfile --tag mitten-api:phase5a .
container=$(docker run --detach --cpus=0.1 --memory=512m --memory-swap=512m \
  --publish 127.0.0.1::10000 \
  --env NODE_ENV=development --env DB_PROVIDER=sqlite --env AUDIO_STORAGE_PROVIDER=local \
  --env DB_PATH=/tmp/mitten-bench.db --env AUDIO_DIR=/tmp/mitten-bench-audio \
  --env JWT_SECRET=disposable-local-benchmark-key-never-use-in-deployments \
  --env TTS_CONCURRENCY=1 mitten-api:phase5a)
cleanup() {
  docker logs "$container" || true
  docker inspect --format 'Status={{.State.Status}} ExitCode={{.State.ExitCode}} OOMKilled={{.State.OOMKilled}}' "$container" || true
  docker rm -f "$container" >/dev/null || true
}
trap cleanup EXIT

status=0
if port=$(docker port "$container" 10000/tcp | cut -d: -f2) && [[ $port =~ ^[0-9]+$ ]]; then
  node tools/bench-render-free.mjs "$port" "$container" || status=$?
else
  echo 'Cannot resolve the published port before /api/health; see the container state and logs below.' >&2
  status=1
fi
if [[ $(docker inspect --format '{{.State.Running}}' "$container") == true ]]; then
  if ! docker exec "$container" sh -c '
    status=0
    for metric in cpu.max cpu.stat memory.max memory.peak memory.events; do
      printf "\n%s\n" "$metric"
      cat "/sys/fs/cgroup/$metric" || status=1
    done
    exit "$status"'; then
    echo 'Some cgroup metrics could not be collected.' >&2
    if (( status == 0 )); then status=1; fi
  fi
else
  echo 'Container is no longer running; live cgroup metrics are unavailable.' >&2
  if (( status == 0 )); then status=1; fi
fi
exit "$status"
