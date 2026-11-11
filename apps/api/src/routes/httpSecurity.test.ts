import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { config, jwtLifetimeSeconds, validateConfig } from '../config/index.js';
import { generateToken, verifyToken } from '../utils/jwt.js';
import { createUser } from '../models/User.js';

const server = app.listen(0, '127.0.0.1');
let base: string;
beforeAll(async () => {
  if (!server.listening) await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to TCP');
  base = `http://127.0.0.1:${address.port}/api`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

const json = { 'Content-Type': 'application/json' };
const post = (path: string, body: unknown, headers: Record<string, string> = json) =>
  fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });

it('keeps legacy HS256 tokens and requires a signed, unexpired session with valid claims', () => {
  const claims = { userId: 1, email: 'legacy@example.com' };
  expect(verifyToken(jwt.sign(claims, config.jwtSecret, { expiresIn: '7d' }))).toMatchObject(claims);
  expect(verifyToken(jwt.sign(claims, config.jwtSecret))).toBeNull();
  expect(verifyToken(jwt.sign(claims, config.jwtSecret, { algorithm: 'HS384', expiresIn: '7d' }))).toBeNull();
  expect(verifyToken(jwt.sign(claims, config.jwtSecret, { expiresIn: -1 }))).toBeNull();
  expect(verifyToken(jwt.sign({ ...claims, userId: '1' }, config.jwtSecret, { expiresIn: '7d' }))).toBeNull();
  expect(jwtLifetimeSeconds('3600')).toBe(3600);
  expect(jwtLifetimeSeconds('7d')).toBe(604800);
  expect(() => jwtLifetimeSeconds('900ms')).toThrow('JWT_EXPIRES_IN');
  expect(() => jwtLifetimeSeconds('31d')).toThrow('JWT_EXPIRES_IN');
});

it('enforces production HTTPS and only trusts forwarding information from configured peers', async () => {
  const original = { nodeEnv: config.nodeEnv, corsOrigin: config.corsOrigin, trustedProxy: config.trustedProxy };
  const trust = app.get('trust proxy');
  try {
    config.nodeEnv = 'production';
    config.corsOrigin = 'http://localhost:5173';
    expect(() => validateConfig()).toThrow('FRONTEND_URL');
    config.corsOrigin = 'https://mitten.example';
    config.trustedProxy = ['0.0.0.0/0'];
    expect(() => validateConfig()).toThrow('TRUSTED_PROXY');
    config.trustedProxy = ['127.0.0.1'];
    expect(() => validateConfig()).not.toThrow();
    expect(await (await fetch(base + '/health')).json()).toEqual({ status: 'ok' });
    const ready = await fetch(base + '/ready');
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ status: 'degraded' });

    const headers = {
      Origin: config.corsOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Authorization, Content-Type',
      'X-Forwarded-Proto': 'https',
    };
    const options = { method: 'OPTIONS', headers };
    expect((await fetch(base + '/auth/login', options)).status).toBe(403);
    app.set('trust proxy', config.trustedProxy);
    const preflight = await fetch(base + '/auth/login', options);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(config.corsOrigin);
    expect(preflight.headers.get('access-control-allow-methods')?.split(',')).toEqual(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
    expect(preflight.headers.get('access-control-allow-headers')).toBe('Authorization,Content-Type,Range');
    expect(preflight.headers.has('access-control-allow-credentials')).toBe(false);
    expect(preflight.headers.get('vary')).toContain('Origin');

    const rejected = await fetch(base + '/auth/login', { ...options, headers: { ...headers, Origin: 'https://otro.example' } });
    expect(rejected.status).toBe(403);
    expect(rejected.headers.has('access-control-allow-origin')).toBe(false);
    expect((await post('/auth/login', {}, { ...json, Origin: 'null', 'X-Forwarded-Proto': 'https' })).status).toBe(403);
    const noOrigin = await fetch(base + '/auth/me', { headers: { 'X-Forwarded-Proto': 'https' } });
    expect(noOrigin.status).toBe(401);
    expect(noOrigin.headers.has('x-powered-by')).toBe(false);
    expect(noOrigin.headers.get('x-content-type-options')).toBe('nosniff');
    expect(noOrigin.headers.get('cache-control')).toBe('no-store');
    expect(noOrigin.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  } finally {
    Object.assign(config, original);
    app.set('trust proxy', trust);
  }
});

it('rejects oversized, malformed and unsupported request bodies with sanitized HTTP errors', async () => {
  const user = await createUser({ email: 'payload@example.com', password: 'password123' });
  const headers = { ...json, Authorization: `Bearer ${generateToken({ userId: user.id, email: user.email })}` };
  expect((await post('/auth/register', { password: 'x'.repeat(5000) })).status).toBe(413);
  expect((await post('/auth/login', {}, { 'Content-Type': 'text/plain' })).status).toBe(415);
  expect((await post('/auth/login', {}, { ...json, 'Content-Encoding': 'gzip' })).status).toBe(415);
  expect((await post('/gestures', { name: 'x'.repeat(40_000) }, headers)).status).toBe(413);
  expect((await post('/gestures/1/audio', { text: 'x'.repeat(2000) }, headers)).status).toBe(413);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const marker = 'synthetic-redaction-marker';
    const malformed = await fetch(base + '/auth/login', { method: 'POST', headers: json, body: '{' + marker });
    expect(malformed.status).toBe(400);
    expect(await malformed.text()).not.toContain(marker);
    expect(log).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

it('limits repeated login attempts and ignores client-provided forwarding when directly connected', async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await post('/auth/login', {
      email: attempt % 2 === 0 ? 'limited@example.com' : 'LIMITED@example.com',
      password: 'wrong',
    });
    expect(response.status).toBe(401);
  }
  const response = await post('/auth/login', { email: 'limited@example.com', password: 'wrong' });
  expect(response.status).toBe(429);
  expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
  expect(response.headers.get('ratelimit')).toBeTruthy();
  for (let attempt = 0; attempt < 61; attempt++) {
    const result = await post('/auth/login', {}, { ...json, 'X-Forwarded-For': `192.0.2.${attempt + 1}` });
    if (result.status === 429) return;
    expect(result.status).toBe(400);
  }
  throw new Error('Expected the login IP quota to reject a request');
});

it('limits registration attempts including invalid bodies', async () => {
  let response = await post('/auth/register', {});
  for (let attempt = 0; attempt < 12 && response.status !== 429; attempt++) {
    expect(response.status).toBe(400);
    response = await post('/auth/register', {});
  }
  expect(response.status).toBe(429);
  expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
});

it('limits ZIP exports per authenticated account', async () => {
  const user = await createUser({ email: 'zip@example.com', password: 'password123' });
  const headers = { Authorization: `Bearer ${generateToken({ userId: user.id, email: user.email })}` };
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(base + '/audio/package', { headers });
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  }
  expect((await fetch(base + '/audio/package', { headers })).status).toBe(429);
});

it('limits TTS attempts independently of the general gesture quota', async () => {
  const user = await createUser({ email: 'tts@example.com', password: 'password123' });
  const headers = { Authorization: `Bearer ${generateToken({ userId: user.id, email: user.email })}` };
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await fetch(base + '/gestures/999999/audio', { headers, method: 'POST' });
    expect(response.status).toBe(404);
  }
  const response = await fetch(base + '/gestures/999999/audio', { headers, method: 'POST' });
  expect(response.status).toBe(429);
  expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
});
