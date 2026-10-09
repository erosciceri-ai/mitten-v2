import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import app, { isEntrypoint } from '../index.js';
import { config, validateConfig } from '../config/index.js';

const verifyGoogleCredential = vi.hoisted(() => vi.fn());
vi.mock('../services/googleIdentity.js', () => ({ verifyGoogleCredential }));

const server = app.listen(0, '127.0.0.1');
let base: string;
beforeAll(async () => {
  if (!server.listening) await once(server, 'listening');
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

const post = (path: string, body: object, token?: string) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

it('registers, logs in, restores /me and catches asynchronous failures', async () => {
  const credentials = { email: 'http@example.com', password: 'password123' };
  const registration = await post('/auth/register', credentials);
  expect(registration.status).toBe(201);
  const registered = await registration.json() as { user: { id: number; email: string } };
  const login = await post('/auth/login', credentials);
  expect(login.status).toBe(200);
  const { token } = await login.json() as { token: string };
  const me = await fetch(base + '/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  expect(await me.json()).toEqual(registered.user);
  const invalidGesture = await fetch(base + '/gestures', { method: 'POST', headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
  }, body: JSON.stringify({ name: 'Invalid', data: { version: 1 } }) });
  expect(invalidGesture.status).toBe(400);
  expect((await fetch(base + '/auth/me')).status).toBe(401);
  expect((await post('/auth/login', { ...credentials, password: 'wrong' })).status).toBe(401);
  expect((await post('/auth/register', credentials)).status).toBe(409);
});

it('exports only the authenticated account in a versioned format', async () => {
  const registration = await post('/auth/register', { email: 'route-export@example.com', password: 'password123' });
  const { token } = await registration.json() as { token: string };

  const response = await fetch(base + '/auth/export', { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json() as Record<string, unknown>;

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(body).toMatchObject({
    format: 'mitten-account-export',
    version: 1,
    account: { email: 'route-export@example.com', googleLinked: false },
    gestures: [],
  });
  expect(JSON.stringify(body)).not.toContain('password_hash');
  expect((await fetch(base + '/auth/export')).status).toBe(401);
});

it('creates a Google user, reuses its subject and protects password-account linking', async () => {
  verifyGoogleCredential.mockResolvedValue({ subject: 'google-new-sub', email: 'google-new@example.com' });
  const first = await post('/auth/google', { credential: 'valid-google-credential-0001' });
  expect(first.status).toBe(200);
  const firstBody = await first.json() as { user: { id:number; googleLinked:boolean }; token:string };
  expect(firstBody.user.googleLinked).toBe(true);

  const again = await post('/auth/google', { credential: 'valid-google-credential-0001' });
  expect((await again.json() as { user:{ id:number } }).user.id).toBe(firstBody.user.id);

  await post('/auth/register', { email: 'needs-link@example.com', password: 'password123' });
  verifyGoogleCredential.mockResolvedValue({ subject: 'google-link-sub', email: 'needs-link@example.com' });
  const conflict = await post('/auth/google', { credential: 'valid-google-credential-0002' });
  expect(conflict.status).toBe(409);
});

it('links Google only from an authenticated account with the same email', async () => {
  const credentials = { email: 'link-route@example.com', password: 'password123' };
  const registration = await post('/auth/register', credentials);
  const registered = await registration.json() as { user:{ id:number }; token:string };

  verifyGoogleCredential.mockResolvedValue({ subject: 'linked-route-sub', email: credentials.email });
  const linked = await post('/auth/google/link', { credential: 'valid-google-credential-0003' }, registered.token);
  expect(linked.status).toBe(200);
  expect((await linked.json() as { user:{ googleLinked:boolean } }).user.googleLinked).toBe(true);

  const googleLogin = await post('/auth/google', { credential: 'valid-google-credential-0003' });
  expect((await googleLogin.json() as { user:{ id:number } }).user.id).toBe(registered.user.id);

  verifyGoogleCredential.mockResolvedValue({ subject: 'wrong-email-sub', email: 'other@example.com' });
  expect((await post('/auth/google/link', { credential: 'valid-google-credential-0004' }, registered.token)).status).toBe(409);
});

it('compares entrypoint URLs with encoded spaces correctly', () => {
  const file = resolve('folder with spaces/index.ts');
  expect(isEntrypoint(pathToFileURL(file).href, file)).toBe(true);
  expect(isEntrypoint(pathToFileURL(file).href, resolve('other.ts'))).toBe(false);
});

it('rejects a missing signing secret', () => {
  const secret = config.jwtSecret;
  try { config.jwtSecret = ''; expect(validateConfig).toThrow('JWT_SECRET'); }
  finally { config.jwtSecret = secret; }
});

it('starts the actual entrypoint and serves HTTP', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'test' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const port = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('API did not listen')), 10000);
      child.on('error', reject);
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`API exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        const match = String(chunk).match(/listening on (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    expect((await fetch(`http://127.0.0.1:${port}/api/health`)).status).toBe(200);
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
  }
}, 15000);
