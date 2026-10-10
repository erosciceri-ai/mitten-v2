import { afterAll, beforeAll, expect, it } from 'vitest';
import { once } from 'node:events';
import app from '../index.js';

const server = app.listen(0, '127.0.0.1');
let base = '';
beforeAll(async () => {
  if (!server.listening) await once(server, 'listening');
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

it('reports API, SQLite and TTS readiness without exposing local paths or credentials', async () => {
  const response = await fetch(`${base}/ready`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ status: 'degraded', services: { api: 'ok', sqlite: 'ok', tts: { provider: 'mock', available: false } } });
  expect(JSON.stringify(body)).not.toMatch(/PIPER_|ELEVENLABS_|mitten-test-audio/i);
});
