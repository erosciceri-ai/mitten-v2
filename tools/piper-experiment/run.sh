#!/usr/bin/env bash
set -euo pipefail

mode=${1:?Use tts or transport}
voice=${2:-es_AR-daniela-high}
threads=${3:-default}
timeout=${4:-60000}
output=${5:?Supply an output directory}
[[ "$timeout" =~ ^(60000|90000|120000|180000)$ ]]
[[ "$threads" == default || "$threads" == one ]]
revision=ae9d8352b73c1b1750748843e753a504b00e05b0
case "$voice" in
  es_AR-daniela-high) voice_dir=es_AR/daniela/high ;;
  es_MX-ald-medium) voice_dir=es_MX/ald/medium ;;
  es_MX-ald-x_low) voice_dir=es_MX/ald/x_low ;;
  *) echo "Unsupported experiment voice: $voice" >&2; exit 2 ;;
esac

mkdir -p "$output"
output=$(cd "$output" && pwd)
scratch=$(mktemp -d)
container=
cleanup() {
  if [[ -n "$container" ]]; then
    docker logs "$container" >"$output/express.log" 2>&1 || true
    docker inspect --format '{{json .State}}' "$container" >"$output/container-state.json" || true
    docker rm -f "$container" >/dev/null || true
  fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

# Build the unchanged production image. Only the benchmark container gets mounts and overrides.
docker build --file apps/api/Dockerfile --tag mitten-piper-experiment .
root=$(pwd)
base=(
  --cpus=0.1 --memory=512m --memory-swap=512m
  --mount "type=bind,src=$root/tools/piper-experiment,dst=/experiment,readonly"
  --mount "type=bind,src=$root/apps/api/tools/piper_synthesize.py,dst=/original-piper.py,readonly"
)
voice_env=()
case "$mode" in
  tts)
    mkdir "$scratch/voices"
    url="https://huggingface.co/rhasspy/piper-voices/resolve/$revision/es/$voice_dir"
    for file in "$voice.onnx" "$voice.onnx.json" MODEL_CARD; do
      curl --fail --silent --show-error --location --retry 3 "$url/$file?download=true" -o "$scratch/voices/$file"
    done
    printf 'revision=%s voice=%s threads=%s timeout_ms=%s\n' "$revision" "$voice" "$threads" "$timeout" | tee "$output/config.log"
    (cd "$scratch/voices" && sha256sum "$voice.onnx" "$voice.onnx.json" MODEL_CARD) | tee "$output/model-checksums.log"
    cp "$scratch/voices/MODEL_CARD" "$output/MODEL_CARD"
    chmod a+rx "$scratch" "$scratch/voices"
    chmod a+r "$scratch/voices/"*
    base+=(--mount "type=bind,src=$scratch/voices,dst=/voices,readonly")
    voice_env+=(--env "PIPER_MODEL=/voices/$voice.onnx")
    ;;
  transport)
    ffmpeg -nostdin -v error -f lavfi -i 'sine=frequency=440:duration=1' -ac 1 -ar 22050 -codec:a libmp3lame -b:a 128k "$scratch/fixture.mp3"
    chmod a+rx "$scratch"
    chmod a+r "$scratch/fixture.mp3"
    base+=(--mount "type=bind,src=$scratch/fixture.mp3,dst=/fixture.mp3,readonly")
    voice_env+=(--env PIPER_BENCH_FIXTURE=/fixture.mp3)
    ;;
  *) echo "Unsupported experiment mode: $mode" >&2; exit 2 ;;
esac

container=$(docker run --detach "${base[@]}" "${voice_env[@]}" \
  --mount "type=bind,src=$root/tools/piper-experiment/probe.py,dst=/app/apps/api/tools/piper_synthesize.py,readonly" \
  --publish 127.0.0.1::10000 --env NODE_ENV=development --env DB_PROVIDER=sqlite \
  --env AUDIO_STORAGE_PROVIDER=local --env DB_PATH=/tmp/experiment.db --env AUDIO_DIR=/tmp/audio \
  --env JWT_SECRET=disposable-local-benchmark-key-never-use-in-deployments \
  --env TTS_CONCURRENCY=1 --env "PIPER_TIMEOUT_MS=$timeout" \
  --env "PIPER_BENCH_THREADS=$threads" --env PIPER_BENCH_TIMINGS=/tmp/piper-timings.jsonl \
  mitten-piper-experiment)
port=$(docker port "$container" 10000/tcp | cut -d: -f2)
status=0
node tools/bench-render-free.mjs "$port" "$container" "$mode" "$scratch" | tee "$output/http.log" || status=$?
docker exec "$container" sh -c 'for f in cpu.max cpu.stat memory.max memory.swap.max memory.peak memory.events; do
  printf "\n%s\n" "$f"; cat "/sys/fs/cgroup/$f" || exit 1
done' | tee "$output/cgroup.log" || status=1

if [[ "$mode" == tts ]]; then
  docker exec "$container" cat /tmp/piper-timings.jsonl | tee "$output/process.jsonl" || status=1
  for sample in "$scratch"/phrase-*.mp3; do
    [[ -f "$sample" ]] || continue
    if ffmpeg -nostdin -v error -xerror -i "$sample" -f null -; then
      printf 'Decoded %s\n' "$(basename "$sample")" | tee -a "$output/mp3-integrity.log"
    else
      echo "Decode failed: $(basename "$sample")" | tee -a "$output/mp3-integrity.log"
      status=1
    fi
  done

  # Measure reuse in a separate container and cgroup, with the identical Python adapter.
  mkdir "$scratch/warm"
  chmod a+rwx "$scratch/warm"
  docker run --rm "${base[@]}" --env "PIPER_BENCH_THREADS=$threads" \
    --mount "type=bind,src=$scratch/warm,dst=/warm" --entrypoint /bin/sh mitten-piper-experiment \
    -c 'timeout 900 /opt/piper/bin/python /experiment/probe.py --model "$1" --warm /warm
      result=$?
      for f in cpu.max cpu.stat memory.max memory.swap.max memory.peak memory.events; do
        printf "\n%s\n" "$f"; cat "/sys/fs/cgroup/$f" || result=1
      done
      exit "$result"' sh "/voices/$voice.onnx" | tee "$output/warm.log" || status=1
  for sample in "$scratch"/warm/*.mp3; do
    [[ -f "$sample" ]] || continue
    ffmpeg -nostdin -v error -xerror -i "$sample" -f null - || status=1
  done
else
  python3 - "$scratch" <<'PY' | tee "$output/zip-integrity.log" || status=1
import json
from pathlib import Path
import sys
from zipfile import ZipFile

root = Path(sys.argv[1])
with ZipFile(root / "transport.zip") as archive:
    assert archive.testzip() is None
    tracks = json.loads(archive.read("manifest.json"))["tracks"]
    assert [track["file"] for track in tracks] == ["mp3/0001.mp3", "mp3/0002.mp3"]
    for track in tracks:
        assert archive.read(track["file"]) == (root / "fixture.mp3").read_bytes()
    print("ZIP CRC, manifest, paths and MP3 byte integrity verified.")
PY
fi
exit "$status"
