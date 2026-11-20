import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { TLSSocket } from 'node:tls';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config/index.js';
import { findUserById } from '../models/User.js';
import { verifyToken } from '../utils/jwt.js';
import { allowPairingAttempt, consumePairingCode, issueDeviceToken, verifyDeviceToken } from './deviceAuth.js';

type Role = 'web' | 'device';
interface Pair { web?: WebSocket; device?: WebSocket }
export interface RelayOptions { authTimeoutMs?: number; pingMs?: number }

const MAX_PAYLOAD = 16 * 1024;
const pairs = new Map<number, Pair>();

const control = (ws: WebSocket, event: string, extra: Record<string, unknown> = {}): void => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'relay', event, ...extra }));
};

function isSecure(req: IncomingMessage): boolean {
  if (config.nodeEnv !== 'production') return true;
  if ((req.socket as TLSSocket).encrypted) return true;
  const trusted = config.trustedProxy === 1 || config.trustedProxy.length > 0;
  const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',').pop()?.trim();
  return trusted && forwarded === 'https';
}

function reject(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/**
 * Relay web <-> guante por WebSocket. El ESP32 abre una conexión saliente a /ws/device
 * y el navegador a /ws/web; ambos se emparejan por cuenta. Cada mensaje de texto es una
 * línea NDJSON del protocolo V2, que se reenvía sin tocarla. Los avisos propios del relay
 * llevan type "relay" y nunca se reenvían al otro extremo.
 */
export function attachRelay(server: Server, options: RelayOptions = {}): { close: () => void } {
  const authTimeoutMs = options.authTimeoutMs ?? 5000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    const role: Role | null = path === '/ws/web' ? 'web' : path === '/ws/device' ? 'device' : null;
    if (!role) return reject(socket, 404, 'Not Found');
    if (!isSecure(req)) return reject(socket, 403, 'Forbidden');
    if (role === 'web' && req.headers.origin !== config.corsOrigin) return reject(socket, 403, 'Forbidden');
    wss.handleUpgrade(req, socket, head, ws => onConnection(ws, role));
  });

  function onConnection(ws: WebSocket, role: Role): void {
    let userId: number | null = null;
    let alive = true;
    const timer = setTimeout(() => { if (userId === null) ws.close(4001, 'auth timeout'); }, authTimeoutMs);
    ws.on('pong', () => { alive = true; });
    (ws as WebSocket & { checkAlive?: () => boolean }).checkAlive = () => {
      if (!alive) return false;
      alive = false;
      ws.ping();
      return true;
    };

    // Un solo manejador en serie: el orden de los mensajes se conserva aunque la auth sea asíncrona.
    let chain: Promise<void> = Promise.resolve();
    ws.on('message', (data, isBinary) => {
      chain = chain.then(() => handle(data as Buffer, isBinary)).catch(() => ws.close(1011, 'internal error'));
    });
    ws.on('close', () => {
      clearTimeout(timer);
      if (userId === null) return;
      const pair = pairs.get(userId);
      if (!pair || pair[role] !== ws) return;
      delete pair[role];
      if (role === 'device' && pair.web) control(pair.web, 'device_offline');
      if (!pair.web && !pair.device) pairs.delete(userId);
    });

    async function authenticate(message: Record<string, unknown>): Promise<void> {
      let id: number | null = null;
      let paired: string | undefined;
      if (role === 'web' && message.type === 'auth' && typeof message.token === 'string') {
        id = verifyToken(message.token)?.userId ?? null;
      } else if (role === 'device' && message.type === 'auth' && typeof message.deviceToken === 'string') {
        id = verifyDeviceToken(message.deviceToken);
      } else if (role === 'device' && message.type === 'pair' && typeof message.code === 'string') {
        if (!allowPairingAttempt()) return void ws.close(4029, 'too many attempts');
        id = consumePairingCode(message.code);
        if (id !== null) paired = issueDeviceToken(id);
      }
      if (id !== null && !(await findUserById(id))) id = null;
      if (id === null) {
        control(ws, 'error', { code: 'UNAUTHORIZED' });
        return void ws.close(4003, 'unauthorized');
      }
      clearTimeout(timer);
      userId = id;
      const pair = pairs.get(id) ?? {};
      pairs.set(id, pair);
      pair[role]?.close(4000, 'replaced');
      pair[role] = ws;
      if (paired) control(ws, 'paired', { deviceToken: paired });
      control(ws, 'ready', role === 'web' ? { device: pair.device?.readyState === WebSocket.OPEN } : {});
      if (role === 'device' && pair.web) control(pair.web, 'device_online');
    }

    async function handle(data: Buffer, isBinary: boolean): Promise<void> {
      if (isBinary) return void ws.close(1003, 'text only');
      const text = data.toString('utf8');
      if (userId === null) {
        let message: unknown;
        try { message = JSON.parse(text); } catch { return void ws.close(4003, 'unauthorized'); }
        if (typeof message !== 'object' || message === null) return void ws.close(4003, 'unauthorized');
        return authenticate(message as Record<string, unknown>);
      }
      const other = pairs.get(userId)?.[role === 'web' ? 'device' : 'web'];
      if (other && other.readyState === WebSocket.OPEN) other.send(text);
      else if (role === 'web') control(ws, 'device_offline');
    }
  }

  const ping = setInterval(() => {
    for (const ws of wss.clients) {
      if (!(ws as WebSocket & { checkAlive?: () => boolean }).checkAlive?.()) ws.terminate();
    }
  }, options.pingMs ?? 25_000);
  ping.unref();

  return {
    close: () => {
      clearInterval(ping);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      pairs.clear();
    },
  };
}
