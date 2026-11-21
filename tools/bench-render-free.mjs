import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const port = Number(process.argv[2]);
assert(Number.isInteger(port) && port >= 1 && port <= 65535, 'Supply the mapped loopback port');
const container = process.argv[3];
const mode = process.argv[4] ?? 'full';
const output = process.argv[5];
assert(['full', 'tts', 'transport'].includes(mode));
if (mode !== 'full') assert(output, 'Supply an output directory for the experiment');
const phrases = ['Hola', 'Necesito ayuda para encontrar mi mochila y volver al aula.'];
const api = `http://127.0.0.1:${port}/api`;
const headers = { 'Content-Type': 'application/json' };

async function request(label, path, options) {
  const start = performance.now();
  try {
    const response = await fetch(api + path, { signal: AbortSignal.timeout(mode === 'tts' ? 200_000 : 90_000), ...options });
    const bytes = Buffer.from(await response.arrayBuffer());
    console.log(JSON.stringify({ label, status: response.status, ms: Math.round(performance.now() - start), bytes: bytes.length }));
    return { status: response.status, headers: response.headers, bytes, ms: performance.now() - start };
  } catch (error) {
    console.error(JSON.stringify({ label, ms: Math.round(performance.now() - start), error: error.name }));
    throw error;
  }
}

function post(label, path, body) {
  return request(label, path, { method: 'POST', headers, body: JSON.stringify(body) });
}

const boot = performance.now();
const deadline = boot + 45_000;
while (true) {
  try {
    const response = await fetch(api + '/health', { signal: AbortSignal.timeout(1000) });
    if (response.ok) break;
  } catch {
    // A cold container may not be listening yet.
  }
  if (container) {
    const state = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .State}}', container], { encoding: 'utf8' }));
    if (!state.Running) {
      throw new Error(`Container stopped before /api/health responded (status=${state.Status}, exit=${state.ExitCode}, OOMKilled=${state.OOMKilled})`);
    }
  }
  assert(performance.now() < deadline, 'Container did not become healthy within 45 seconds');
  await sleep(250);
}
console.log(JSON.stringify({ label: 'wait for health', ms: Math.round(performance.now() - boot) }));
assert.equal((await request('ready', '/ready')).status, 200);

const registration = await post('register', '/auth/register', { email: 'phase5a@example.test', password: 'disposable-bench-password' });
assert.equal(registration.status, 201);
headers.Authorization = 'Bearer ' + JSON.parse(registration.bytes).token;

const samples = [[100, 200, 300, 400, 500, 10, -5], [110, 210, 310, 410, 510, 11, -4], [120, 220, 320, 420, 520, 12, -3]];
const data = {
  version: 1, dimensions: 7, dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'],
  units: { flex: 'adc12', mpu: 'degrees' }, samples, sampleCount: 3, captureDurationMs: 200, samplingPeriodMs: 100,
  summary: { min: samples[0], mean: samples[1], max: samples[2] },
};

const audioPaths = [];
for (const name of phrases) {
  const saved = await post('save', '/gestures', { name, data });
  assert.equal(saved.status, 201);
  audioPaths.push('/gestures/' + JSON.parse(saved.bytes).id + '/audio');
}

if (mode === 'transport') {
  for (const path of audioPaths) assert.equal((await post('store fixture', path)).status, 200);
} else {
  const concurrent = await Promise.all(audioPaths.map(path => post('concurrent TTS', path)));
  const statuses = concurrent.map(result => result.status).sort();
  if (mode === 'full') assert.deepEqual(statuses, [200, 429]);
  let eligible = statuses.join(',') === '200,429' && concurrent.find(result => result.status === 200).ms <= 60_000;
  for (let round = 0; round < 3; round++) {
    for (const [index, path] of audioPaths.entries()) {
      const synthesis = post(mode === 'tts' ? `TTS round ${round + 1} phrase ${index + 1}` : 'sequential TTS', path);
      await sleep(250);
      const health = request('health during synthesis', '/health');
      const [generated, live] = await Promise.all([synthesis, health]);
      assert.equal(live.status, 200);
      if (mode === 'full') assert.equal(generated.status, 200);
      else if (generated.status === 200) {
        const mp3 = await request('generated MP3', path + '/file', { headers });
        assert.equal(mp3.status, 200);
        writeFileSync(join(output, `phrase-${index + 1}-round-${round + 1}.mp3`), mp3.bytes);
      }
      eligible &&= generated.status === 200 && generated.ms <= 60_000;
    }
  }
  if (mode === 'tts') {
    console.log(JSON.stringify({ label: 'all samples within current 60-second limit', eligible }));
    process.exitCode = eligible ? 0 : 1;
  }
}

if (mode !== 'tts') {
  const path = audioPaths[0] + '/file';
  const full = await request('full audio', path, { headers });
  assert.equal(full.status, 200);
  const partial = await request('128-byte Range', path, { headers: { ...headers, Range: 'bytes=0-127' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), `bytes 0-127/${full.bytes.length}`);
  assert.deepEqual(partial.bytes, full.bytes.subarray(0, 128));
  const zip = await request('ZIP with two tracks', '/audio/package', { headers });
  assert.equal(zip.status, 200);
  assert.equal(zip.bytes.subarray(0, 4).toString('hex'), '504b0304');
  if (mode === 'transport') writeFileSync(join(output, 'transport.zip'), zip.bytes);
}
