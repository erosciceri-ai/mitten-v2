import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { selectAvailablePort } from './dev-ports.mjs';

const root = resolve(import.meta.dirname, '..');
const preferredApiPort = Number(process.env.PORT || 3000);
const preferredWebPort = Number(process.env.WEB_PORT || 5173);
const apiPortWasRequested = process.env.PORT !== undefined && process.env.PORT !== '';
const webPortWasRequested = process.env.WEB_PORT !== undefined && process.env.WEB_PORT !== '';
const children = new Set();
let shuttingDown = false;

function prefix(stream, label, writer) {
  createInterface({ input: stream }).on('line', line => writer(`[${label}] ${line}\n`));
}

function start(label, args, env = {}) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true });
  children.add(child);
  prefix(child.stdout, label, chunk => process.stdout.write(chunk));
  prefix(child.stderr, label, chunk => process.stderr.write(chunk));
  child.once('exit', code => {
    children.delete(child);
    if (!shuttingDown) {
      process.stderr.write(`[dev] ${label} se detuvo (${code ?? 'sin código'}). Cerrando la demo.\n`);
      void shutdown(code ?? 1);
    }
  });
  return child;
}

async function waitUntilReady(child, apiPort) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('La API terminó antes de estar lista.');
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/ready`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return await response.json();
    } catch { /* La API todavía está iniciando. */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  throw new Error('La API no respondió /api/ready dentro de 30 segundos.');
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  await Promise.all([...children].map(child => new Promise(resolvePromise => {
    if (child.exitCode !== null) return resolvePromise();
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolvePromise(); }, 3000);
    child.once('exit', () => { clearTimeout(timer); resolvePromise(); });
  })));
  process.exitCode = code;
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void shutdown(0); });

try {
  const apiPort = await selectAvailablePort({
    preferred: preferredApiPort,
    explicitlyRequested: apiPortWasRequested,
    label: 'API',
  });
  const webPort = await selectAvailablePort({
    preferred: preferredWebPort,
    explicitlyRequested: webPortWasRequested,
    label: 'web',
    excluded: new Set([apiPort]),
  });
  if (apiPort !== preferredApiPort) {
    process.stdout.write(`[dev] Puerto API ${preferredApiPort} ocupado; usando ${apiPort}.\n`);
  }
  if (webPort !== preferredWebPort) {
    process.stdout.write(`[dev] Puerto web ${preferredWebPort} ocupado; usando ${webPort}.\n`);
  }
  process.stdout.write(`[dev] Iniciando API en http://127.0.0.1:${apiPort}\n`);
  const api = start('api', ['--import', 'tsx', 'apps/api/src/index.ts'], { PORT: String(apiPort), FRONTEND_URL: `http://127.0.0.1:${webPort}` });
  const readiness = await waitUntilReady(api, apiPort);
  process.stdout.write(`[dev] API lista · TTS ${readiness.services.tts.provider}: ${readiness.services.tts.available ? 'disponible' : 'no disponible'}\n`);
  start('web', ['node_modules/vite/bin/vite.js', 'apps/web', '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` });
  process.stdout.write(`[dev] MITTEN disponible en http://127.0.0.1:${webPort}\n`);
} catch (error) {
  process.stderr.write(`[dev] ${error instanceof Error ? error.message : String(error)}\n`);
  await shutdown(1);
}
