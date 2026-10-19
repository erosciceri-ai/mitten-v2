import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import { AppError } from '../middleware/errorHandler.js';

export interface TTSOptions { text: string; }
export interface TTSResult { audio: Buffer; provider: string; }
export interface TTSReadiness { provider: string; available: boolean; message?: string; }
export interface TTSProvider {
  readonly name: string;
  synthesize(options: TTSOptions): Promise<TTSResult>;
  readiness(): Promise<TTSReadiness>;
}
export type ProcessExecutor = (command: string, args: string[], options: { stdin: string; timeoutMs: number }) => Promise<void>;

const helperPath = resolve(fileURLToPath(new URL('../../tools/piper_synthesize.py', import.meta.url)));

export function getAudioFilePath(userId: number, trackNumber: number): string {
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isInteger(trackNumber) || trackNumber < 1 || trackNumber > 50) throw new Error('Invalid audio owner or track');
  return join(config.audioDir, String(userId), 'mp3', `${String(trackNumber).padStart(4, '0')}.mp3`);
}

export function validateMp3(audio: Buffer): void {
  const hasHeader = audio.subarray(0, 3).toString() === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
  if (audio.length < 128 || !hasHeader) throw new AppError('TTS provider returned invalid MP3 audio', 502);
}

export const executeProcess: ProcessExecutor = (command, args, { stdin, timeoutMs }) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  let settled = false;
  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    error ? reject(error) : resolvePromise();
  };
  const timer = setTimeout(() => { child.kill(); finish(new AppError(`Piper exceeded its ${timeoutMs}ms timeout`, 504)); }, timeoutMs);
  child.stderr.on('data', chunk => { if (stderr.length < 4000) stderr += String(chunk); });
  child.once('error', error => finish(new AppError(`Could not start Piper: ${error.message}`, 503)));
  child.once('exit', code => code === 0 ? finish() : finish(new AppError(`Piper failed${stderr.trim() ? `: ${stderr.trim()}` : ` with exit code ${code}`}`, 502)));
  child.stdin.end(stdin, 'utf8');
});

class MockTTSProvider implements TTSProvider {
  readonly name = 'mock';
  async synthesize(): Promise<TTSResult> { throw new AppError('El proveedor mock no genera voz. Ejecuta npm run tts:setup y configura Piper.', 503); }
  async readiness(): Promise<TTSReadiness> { return { provider: this.name, available: false, message: 'Proveedor de prueba; no genera audio.' }; }
}

class FixtureTTSProvider implements TTSProvider {
  readonly name = 'fixture';
  async synthesize(): Promise<TTSResult> {
    if (config.nodeEnv !== 'test') throw new AppError('Fixture TTS is test-only', 503);
    return { provider: this.name, audio: Buffer.concat([Buffer.from('ID3'), Buffer.alloc(512)]) };
  }
  async readiness(): Promise<TTSReadiness> { return { provider: this.name, available: config.nodeEnv === 'test' }; }
}

class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = 'elevenlabs';
  async synthesize({ text }: TTSOptions): Promise<TTSResult> {
    if (!config.elevenLabsApiKey || !config.elevenLabsVoiceId) throw new AppError('TTS credentials and voice are not configured', 503);
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.elevenLabsVoiceId)}?output_format=mp3_44100_128`, {
      method: 'POST', signal: AbortSignal.timeout(30000), headers: { Accept: 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': config.elevenLabsApiKey },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
    });
    if (!response.ok) throw new AppError(`TTS provider returned HTTP ${response.status}`, 502);
    if (!response.headers.get('content-type')?.includes('audio/mpeg')) throw new AppError('TTS provider did not return MP3 audio', 502);
    const audio = Buffer.from(await response.arrayBuffer());
    validateMp3(audio);
    return { audio, provider: this.name };
  }
  async readiness(): Promise<TTSReadiness> {
    const available = Boolean(config.elevenLabsApiKey && config.elevenLabsVoiceId);
    return { provider: this.name, available, message: available ? undefined : 'Faltan credenciales.' };
  }
}

export class PiperTTSProvider implements TTSProvider {
  readonly name = 'piper';
  constructor(private readonly executable = config.piperExecutable, private readonly model = config.piperModel,
    private readonly timeoutMs = config.piperTimeoutMs, private readonly runProcess: ProcessExecutor = executeProcess,
    private readonly lengthScale = config.piperLengthScale) {}

  async readiness(): Promise<TTSReadiness> {
    try { await this.validatePaths(); return { provider: this.name, available: true }; }
    catch (error) { return { provider: this.name, available: false, message: error instanceof Error ? error.message : 'Piper no disponible.' }; }
  }

  async synthesize({ text }: TTSOptions): Promise<TTSResult> {
    await this.validatePaths();
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'mitten-piper-'));
    const output = join(temporaryDirectory, 'speech.mp3');
    try {
      await this.runProcess(this.executable, [helperPath, '--model', this.model, '--output', output, '--length-scale', String(this.lengthScale)], { stdin: text, timeoutMs: this.timeoutMs });
      const outputStat = await stat(output).catch(() => null);
      if (!outputStat?.isFile()) throw new AppError('Piper did not create an MP3 file', 502);
      const audio = await readFile(output);
      validateMp3(audio);
      return { audio, provider: this.name };
    } finally { await rm(temporaryDirectory, { recursive: true, force: true }); }
  }

  private async validatePaths(): Promise<void> {
    if (!this.executable || !this.model) throw new AppError('Piper is not configured. Set PIPER_EXECUTABLE and PIPER_MODEL.', 503);
    for (const [label, path] of [['PIPER_EXECUTABLE', this.executable], ['PIPER_MODEL', this.model], ['Piper helper', helperPath]] as const) {
      await access(path).catch(() => { throw new AppError(`${label} is not available`, 503); });
      if (!(await stat(path)).isFile()) throw new AppError(`${label} must point to a file`, 503);
    }
    await access(`${this.model}.json`).catch(() => { throw new AppError('PIPER_MODEL metadata file is not available', 503); });
  }
}

export function createTTSProvider(provider = config.ttsProvider): TTSProvider {
  if (provider === 'mock') return new MockTTSProvider();
  if (provider === 'fixture') return new FixtureTTSProvider();
  if (provider === 'elevenlabs') return new ElevenLabsTTSProvider();
  if (provider === 'piper') return new PiperTTSProvider();
  throw new AppError('Unsupported TTS provider', 503);
}
export async function getTTSReadiness(): Promise<TTSReadiness> {
  try { return await createTTSProvider().readiness(); }
  catch (error) { return { provider: config.ttsProvider, available: false, message: error instanceof Error ? error.message : 'Proveedor TTS no disponible.' }; }
}
export async function generateTTS(options: TTSOptions): Promise<TTSResult> { return createTTSProvider().synthesize(options); }
