import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isIP } from 'node:net';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(apiRoot, '.env') });
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  trustedProxy: (process.env.TRUSTED_PROXY || '').split(',').map(value => value.trim()).filter(Boolean),
  jwtSecret: isTest ? randomBytes(32).toString('hex') : process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbProvider: isTest ? 'sqlite' : process.env.DB_PROVIDER ?? 'sqlite',
  databaseUrl: isTest ? '' : process.env.DATABASE_URL ?? '',
  dbTls: isTest ? 'verify-full' : process.env.DB_TLS ?? 'verify-full',
  dbPoolMax: isTest ? 5 : Number(process.env.DB_POOL_MAX ?? 5),
  // Tests must never open development data, even when DB_PATH is inherited.
  dbPath: isTest ? ':memory:' : resolve(apiRoot, process.env.DB_PATH || 'data/mitten.db'),
  audioDir: isTest ? mkdtempSync(resolve(tmpdir(), 'mitten-test-audio-')) : resolve(apiRoot, process.env.AUDIO_DIR || 'data/audio'),
  audioStorageProvider: isTest ? 'local' : process.env.AUDIO_STORAGE_PROVIDER ?? 'local',
  audioS3Endpoint: isTest ? '' : process.env.AUDIO_S3_ENDPOINT ?? '',
  audioS3Region: isTest ? '' : process.env.AUDIO_S3_REGION ?? '',
  audioS3Bucket: isTest ? '' : process.env.AUDIO_S3_BUCKET ?? '',
  audioS3AccessKeyId: isTest ? '' : process.env.AUDIO_S3_ACCESS_KEY_ID ?? '',
  audioS3SecretAccessKey: isTest ? '' : process.env.AUDIO_S3_SECRET_ACCESS_KEY ?? '',
  ttsProvider: isTest ? process.env.TTS_PROVIDER || 'mock' : process.env.TTS_PROVIDER || 'mock',
  piperExecutable: isTest ? '' : process.env.PIPER_EXECUTABLE || '',
  piperModel: isTest ? '' : process.env.PIPER_MODEL || '',
  piperTimeoutMs: Number(process.env.PIPER_TIMEOUT_MS || 60000),
  elevenLabsApiKey: isTest ? '' : process.env.ELEVENLABS_API_KEY || '',
  elevenLabsVoiceId: isTest ? '' : process.env.ELEVENLABS_VOICE_ID || '',
  corsOrigin: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
};

export function validateConfig(): void {
  const providers = isTest ? ['mock', 'fixture', 'elevenlabs', 'piper'] : ['mock', 'elevenlabs', 'piper'];
  if (!providers.includes(config.ttsProvider)) throw new Error('Unsupported TTS_PROVIDER; use mock, elevenlabs or piper');
  if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters long');
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('Invalid PORT');
  validateHttpConfig();
  jwtLifetimeSeconds(config.jwtExpiresIn);
  if (!Number.isSafeInteger(config.piperTimeoutMs) || config.piperTimeoutMs < 1000 || config.piperTimeoutMs > 300000) throw new Error('PIPER_TIMEOUT_MS must be between 1000 and 300000');
}

export function jwtLifetimeSeconds(value: string): number {
  const match = /^([1-9][0-9]*)([smhdw]?)$/.exec(value);
  const multipliers: Record<string, number> = { '': 1, s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  const seconds = match ? Number(match[1]) * multipliers[match[2]] : NaN;
  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 30 * 86400) {
    throw new Error('JWT_EXPIRES_IN must be between 60 seconds and 30 days');
  }
  return seconds;
}

function validateHttpConfig(): void {
  const origin = parseOrigin(config.corsOrigin);
  const production = config.nodeEnv === 'production';
  if (!origin || origin.origin !== config.corsOrigin ||
      !(origin.protocol === 'https:' || (!production && origin.protocol === 'http:'))) {
    throw new Error('FRONTEND_URL must be an explicit origin and use HTTPS in production');
  }
  for (const entry of config.trustedProxy) {
    const [address, prefix, extra] = entry.split('/');
    const version = isIP(address);
    const maxBits = version === 4 ? 32 : 128;
    const bits = prefix === undefined ? maxBits : Number(prefix);
    if (!version || extra !== undefined || (prefix !== undefined && !/^\d+$/.test(prefix)) ||
        !Number.isInteger(bits) || bits < 1 || bits > maxBits) {
      throw new Error('TRUSTED_PROXY must contain explicit proxy IP addresses or CIDRs');
    }
  }
}

function parseOrigin(value: string): URL | undefined {
  try { return new URL(value); } catch { return undefined; }
}
