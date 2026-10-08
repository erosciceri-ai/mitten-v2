import { afterAll, beforeAll, expect, it } from 'vitest';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import app, { isEntrypoint } from '../index.js';
import { config, validateConfig } from '../config/index.js';

const server = app.listen(0, '127.0.0.1');
let base: string;
beforeAll(async () => {
  if (!server.listening) await once(server, 'listening');
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

it('registers, logs in, restores /me and catches asynchronous failures', async () => {
  const credentials = { email: 'http@example.com', password: 'password123' };
  const post = (path: string, body: object) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
