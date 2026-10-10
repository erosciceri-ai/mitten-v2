import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const runtime = join(root, '.runtime', 'tts');
const venv = join(runtime, '.venv');
const voices = join(runtime, 'voices');
const isWindows = process.platform === 'win32';
const python = isWindows ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python');
const model = join(voices, 'es_AR-daniela-high.onnx');
const metadata = `${model}.json`;
const voiceBase = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high';

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${command} terminó con código ${code}`)));
  });
}

async function findBootstrapPython() {
  const candidates = process.env.PYTHON
    ? [[process.env.PYTHON, []]]
    : isWindows ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]];
  for (const [command, prefix] of candidates) {
    try { await run(command, [...prefix, '--version']); return [command, prefix]; } catch { /* probar siguiente */ }
  }
  throw new Error('No se encontró Python 3.9 o superior. Define PYTHON con la ruta al ejecutable.');
}

async function download(url, destination) {
  try { await access(destination); return; } catch { /* descargar */ }
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`No se pudo descargar ${url}: HTTP ${response.status}`);
  const temporary = `${destination}.download`;
  await rm(temporary, { force: true });
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(temporary, bytes, { flag: 'wx' });
  await rename(temporary, destination);
}

async function updateEnv() {
  const envPath = join(root, 'apps', 'api', '.env');
  let contents = await readFile(envPath, 'utf8').catch(() => '');
  const values = {
    TTS_PROVIDER: 'piper', PIPER_EXECUTABLE: python, PIPER_MODEL: model, PIPER_TIMEOUT_MS: '60000',
  };
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    contents = pattern.test(contents) ? contents.replace(pattern, line) : `${contents.trimEnd()}\n${line}\n`;
  }
  await writeFile(envPath, contents, 'utf8');
}

await mkdir(voices, { recursive: true });
try {
  await access(python);
} catch {
  const [bootstrap, prefix] = await findBootstrapPython();
  await run(bootstrap, [...prefix, '-m', 'venv', venv]);
}
await run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', 'piper-tts==1.8.0', 'lameenc==1.8.4']);
await download(`${voiceBase}/es_AR-daniela-high.onnx?download=true`, model);
await download(`${voiceBase}/es_AR-daniela-high.onnx.json?download=true`, metadata);
await updateEnv();
process.stdout.write(`Piper listo. Modelo: ${model}\nLa configuración local se guardó en apps/api/.env (ignorado por Git).\n`);
