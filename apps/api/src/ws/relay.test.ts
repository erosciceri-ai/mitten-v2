import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import app from '../index.js';
import { config } from '../config/index.js';
import { getDatabase } from '../db/index.js';
import { createUser } from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { resetPairingRateLimits } from './deviceAuth.js';
import { attachRelay } from './relay.js';

const server = app.listen(0, '127.0.0.1');
const logs: Array<{ event: string; fields: Record<string, string | number | boolean> }> = [];
const relay = attachRelay(server, {
  authTimeoutMs: 300,
  logger: (event, fields) => logs.push({ event, fields }),
});
let port = 0;
beforeAll(async () => {
  if (!server.listening) await once(server, 'listening');
  port = (server.address() as AddressInfo).port;
});
beforeEach(() => {
  resetPairingRateLimits();
  logs.length = 0;
});
afterAll(() => new Promise<void>((resolve, reject) => {
  relay.close();
  server.close(error => error ? reject(error) : resolve());
}));

interface Client { ws: WebSocket; next: () => Promise<string>; closed: Promise<number> }
function connectTo(targetPort: number, path: string, headers: Record<string, string> = {}): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${targetPort}${path}`, { headers });
    const queue: string[] = [];
    const waiters: Array<(m: string) => void> = [];
    ws.on('message', data => { const text = data.toString(); const w = waiters.shift(); w ? w(text) : queue.push(text); });
    const closed = new Promise<number>(res => ws.on('close', code => res(code)));
    ws.on('error', reject);
    ws.on('open', () => resolve({
      ws, closed,
      next: () => new Promise((res, rej) => {
        if (queue.length) return res(queue.shift()!);
        waiters.push(res);
        setTimeout(() => rej(new Error('timeout esperando mensaje')), 2000);
      }),
    }));
  });
}
const connect = (path: string, origin?: string) => connectTo(port, path, origin ? { Origin: origin } : {});
const webClient = () => connect('/ws/web', config.corsOrigin);
const deviceClient = () => connect('/ws/device');

let counter = 0;
async function account() {
  const user = await createUser({ email: `relay${++counter}@example.com`, password: 'password123' });
  const token = generateToken({ userId: user.id, email: user.email });
  const pairing = await fetch(`http://127.0.0.1:${port}/api/device/pairing`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  expect(pairing.status).toBe(201);
  const { code } = await pairing.json() as { code: string };
  return { token, code };
}
async function pairDevice(code: string) {
  const device = await deviceClient();
  device.ws.send(JSON.stringify({ type: 'pair', code }));
  const paired = JSON.parse(await device.next());
  expect(paired).toMatchObject({ type: 'relay', event: 'paired' });
  expect(JSON.parse(await device.next())).toMatchObject({ event: 'ready' });
  return { device, deviceToken: paired.deviceToken as string };
}

it('vincula el guante con un código y reenvía NDJSON en ambos sentidos', async () => {
  const { token, code } = await account();
  const { device } = await pairDevice(code);
  const web = await webClient();
  web.ws.send(JSON.stringify({ type: 'auth', token }));
  expect(JSON.parse(await web.next())).toEqual({ type: 'relay', event: 'ready', device: true });
  const request = '{"v":1,"type":"request","id":"r1","command":"device.handshake","payload":{}}';
  web.ws.send(request);
  expect(await device.next()).toBe(request);
  const response = '{"v":1,"type":"response","id":"r1","ok":true,"payload":{}}';
  device.ws.send(response);
  expect(await web.next()).toBe(response);
  web.ws.close(); device.ws.close();
});

it('avisa a la web cuando el guante se conecta o se desconecta', async () => {
  const { token, code } = await account();
  const web = await webClient();
  web.ws.send(JSON.stringify({ type: 'auth', token }));
  expect(JSON.parse(await web.next())).toEqual({ type: 'relay', event: 'ready', device: false });
  web.ws.send('{"v":1}');
  expect(JSON.parse(await web.next())).toMatchObject({ event: 'device_offline' });
  const { device } = await pairDevice(code);
  expect(JSON.parse(await web.next())).toMatchObject({ event: 'device_online' });
  device.ws.close();
  expect(JSON.parse(await web.next())).toMatchObject({ event: 'device_offline' });
  web.ws.close();
});

it('el código es de un solo uso y el token de dispositivo permite reconectar', async () => {
  const { code } = await account();
  const { device, deviceToken } = await pairDevice(code);
  device.ws.close();
  const reuse = await deviceClient();
  reuse.ws.send(JSON.stringify({ type: 'pair', code }));
  expect(JSON.parse(await reuse.next())).toMatchObject({ event: 'error', code: 'UNAUTHORIZED' });
  expect(await reuse.closed).toBe(4003);
  const again = await deviceClient();
  again.ws.send(JSON.stringify({ type: 'auth', deviceToken }));
  expect(JSON.parse(await again.next())).toMatchObject({ event: 'ready' });
  again.ws.close();
});

it('rechaza credenciales cruzadas, origen ajeno, binarios y falta de autenticación', async () => {
  const { token, code } = await account();
  const { deviceToken } = await pairDevice(code);
  const web = await webClient();
  web.ws.send(JSON.stringify({ type: 'auth', token: deviceToken }));      // token de dispositivo como usuario
  expect(await web.closed).toBe(4003);
  const device = await deviceClient();
  device.ws.send(JSON.stringify({ type: 'auth', deviceToken: token }));   // token de usuario como dispositivo
  expect(await device.closed).toBe(4003);
  await expect(connect('/ws/web', 'https://otro.example')).rejects.toThrow(/403/);
  await expect(connect('/ws/otro')).rejects.toThrow(/404/);
  const silent = await deviceClient();
  expect(await silent.closed).toBe(4001);
  const bin = await webClient();
  bin.ws.send(Buffer.from([1, 2, 3]));
  expect(await bin.closed).toBe(1003);
});

it('no mezcla mensajes entre cuentas', async () => {
  const a = await account();
  const b = await account();
  const deviceA = (await pairDevice(a.code)).device;
  const deviceB = (await pairDevice(b.code)).device;
  const webA = await webClient();
  webA.ws.send(JSON.stringify({ type: 'auth', token: a.token }));
  await webA.next();
  webA.ws.send('solo-para-A');
  expect(await deviceA.next()).toBe('solo-para-A');
  await expect(deviceB.next()).rejects.toThrow(/timeout/);
  webA.ws.close(); deviceA.ws.close(); deviceB.ws.close();
});

it('una segunda sesión web reemplaza a la anterior', async () => {
  const { token } = await account();
  const first = await webClient();
  first.ws.send(JSON.stringify({ type: 'auth', token }));
  await first.next();
  const second = await webClient();
  second.ws.send(JSON.stringify({ type: 'auth', token }));
  await second.next();
  expect(await first.closed).toBe(4000);
  second.ws.close();
});

it('persiste códigos de vinculación hasheados y lista o revoca guantes por cuenta', async () => {
  const owner = await account();
  const outsider = await account();
  const db = await getDatabase();

  const pendingRows = await db.all<Array<{ code_hash: string }>>('SELECT code_hash FROM device_pairing_codes');
  expect(pendingRows.length).toBeGreaterThanOrEqual(2);
  expect(pendingRows.every(row => /^[0-9a-f]{64}$/.test(row.code_hash))).toBe(true);
  expect(pendingRows.some(row => row.code_hash.includes(owner.code))).toBe(false);

  const { device, deviceToken } = await pairDevice(owner.code);
  const web = await webClient();
  web.ws.send(JSON.stringify({ type: 'auth', token: owner.token }));
  expect(JSON.parse(await web.next())).toEqual({ type: 'relay', event: 'ready', device: true });

  const listOnline = await fetch(`http://127.0.0.1:${port}/api/device`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  expect(listOnline.status).toBe(200);
  const bodyOnline = await listOnline.json() as {
    devices: Array<{ id: string; name: string; online: boolean; revokedAt: string | null; tokenHash?: string }>;
  };
  expect(bodyOnline.devices).toHaveLength(1);
  expect(bodyOnline.devices[0]).toMatchObject({ name: 'Guante MITTEN', online: true, revokedAt: null });
  expect(bodyOnline.devices[0].tokenHash).toBeUndefined();
  const deviceId = bodyOnline.devices[0].id;

  const outsiderList = await fetch(`http://127.0.0.1:${port}/api/device`, {
    headers: { Authorization: `Bearer ${outsider.token}` },
  });
  expect(await outsiderList.json()).toEqual({ devices: [] });

  const outsiderDelete = await fetch(`http://127.0.0.1:${port}/api/device/${deviceId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${outsider.token}` },
  });
  expect(outsiderDelete.status).toBe(404);

  const invalidDelete = await fetch(`http://127.0.0.1:${port}/api/device/not-a-uuid`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  expect(invalidDelete.status).toBe(404);

  const revoked = await fetch(`http://127.0.0.1:${port}/api/device/${deviceId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  expect(revoked.status).toBe(204);
  expect(await device.closed).toBe(4003);
  expect(JSON.parse(await web.next())).toMatchObject({ event: 'device_offline' });

  const reconnect = await deviceClient();
  reconnect.ws.send(JSON.stringify({ type: 'auth', deviceToken }));
  expect(JSON.parse(await reconnect.next())).toMatchObject({ event: 'error', code: 'UNAUTHORIZED' });
  expect(await reconnect.closed).toBe(4003);

  const listAfter = await fetch(`http://127.0.0.1:${port}/api/device`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  const bodyAfter = await listAfter.json() as { devices: Array<{ online: boolean; revokedAt: string | null }> };
  expect(bodyAfter.devices[0].online).toBe(false);
  expect(bodyAfter.devices[0].revokedAt).not.toBeNull();

  const serializedLogs = JSON.stringify(logs);
  expect(serializedLogs).not.toContain(owner.code);
  expect(serializedLogs).not.toContain(deviceToken);
  expect(serializedLogs).not.toContain(owner.token);

  web.ws.close();
});

it('aisla límites de pairing por IP y limita upgrades repetidos con métricas', async () => {
  const isolatedServer = createServer();
  isolatedServer.listen(0, '127.0.0.1');
  await once(isolatedServer, 'listening');
  const isolatedPort = (isolatedServer.address() as AddressInfo).port;
  const previousTrustedProxy = config.trustedProxy;
  config.trustedProxy = 1;
  const isolatedLogs: Array<{ event: string; fields: Record<string, string | number | boolean> }> = [];
  const isolatedRelay = attachRelay(isolatedServer, {
    authTimeoutMs: 300,
    maxUpgradesPerMinute: 3,
    pairingLimits: { perIp: 2, global: 10 },
    logger: (event, fields) => isolatedLogs.push({ event, fields }),
  });

  try {
    const accountA = await account();
    const accountB = await account();

    for (let i = 0; i < 2; i++) {
      const bad = await connectTo(isolatedPort, '/ws/device', { 'X-Forwarded-For': '198.51.100.10' });
      bad.ws.send(JSON.stringify({ type: 'pair', code: '000000' }));
      expect(await bad.closed).toBe(4003);
    }

    const throttled = await connectTo(isolatedPort, '/ws/device', { 'X-Forwarded-For': '198.51.100.10' });
    throttled.ws.send(JSON.stringify({ type: 'pair', code: accountA.code }));
    expect(await throttled.closed).toBe(4029);

    const otherIp = await connectTo(isolatedPort, '/ws/device', { 'X-Forwarded-For': '198.51.100.20' });
    otherIp.ws.send(JSON.stringify({ type: 'pair', code: accountB.code }));
    expect(JSON.parse(await otherIp.next())).toMatchObject({ type: 'relay', event: 'paired' });
    expect(JSON.parse(await otherIp.next())).toMatchObject({ event: 'ready' });
    otherIp.ws.close();

    // El cuarto upgrade desde 198.51.100.10 supera maxUpgradesPerMinute=3 y recibe HTTP 429.
    await expect(connectTo(isolatedPort, '/ws/device', { 'X-Forwarded-For': '198.51.100.10' })).rejects.toThrow(/429/);

    const metrics = isolatedRelay.getMetrics();
    expect(metrics.pairingSuccess).toBe(1);
    expect(metrics.pairingRejected).toBe(3);
    expect(metrics.rateLimited).toBeGreaterThanOrEqual(2);
    expect(metrics.upgradesRejected).toBeGreaterThanOrEqual(1);
    expect(isolatedLogs.some(entry => entry.event === 'ws.upgrade.rate_limited')).toBe(true);
    expect(JSON.stringify(isolatedLogs)).not.toContain(accountB.code);
  } finally {
    config.trustedProxy = previousTrustedProxy;
    isolatedRelay.close();
    await new Promise<void>((resolve, reject) => isolatedServer.close(err => err ? reject(err) : resolve()));
  }
});
