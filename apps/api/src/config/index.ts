import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(apiRoot, '.env') });
const isTest = process.env.NODE_ENV === 'test';

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  jwtSecret: isTest ? randomBytes(32).toString('hex') : process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Tests must never open development data, even when DB_PATH is inherited.
  dbPath: isTest ? ':memory:' : resolve(apiRoot, process.env.DB_PATH || 'data/mitten.db'),
  audioDir: isTest ? mkdtempSync(resolve(tmpdir(), 'mitten-test-audio-')) : resolve(apiRoot, process.env.AUDIO_DIR || 'data/audio'),
  ttsProvider: isTest ? 'mock' : process.env.TTS_PROVIDER || 'mock',
  elevenLabsApiKey: isTest ? '' : process.env.ELEVENLABS_API_KEY || '',
  elevenLabsVoiceId: isTest ? '' : process.env.ELEVENLABS_VOICE_ID || '',
  corsOrigin: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
};

export function validateConfig(): void {
  if (!['mock', 'elevenlabs'].includes(config.ttsProvider)) throw new Error('Unsupported TTS_PROVIDER; use mock or elevenlabs');
  if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters long');
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('Invalid PORT');
  if (config.corsOrigin === '*') throw new Error('An explicit frontend origin is required');
}
