import { afterAll, beforeAll, expect, it } from 'vitest';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import app from '../index.js';
import { config } from '../config/index.js';
import { createUser } from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { attachRelay } from './relay.js';

const server = app.listen(0, '127.0.0.1');
const relay = attachRelay(server, { authTimeoutMs: 300 });
let port = 0;
beforeAll(async () => {
  if (!server.listening) await once(server, 'listening');
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve, reject) => {
  relay.close();
  server.close(error => error ? reject(error) : resolve());
}));

interface Client { ws: WebSocket; next: () => Promise<string>; closed: Promise<number> }
function connect(path: string, origin?: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers: origin ? { Origin: origin } : {} });
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
