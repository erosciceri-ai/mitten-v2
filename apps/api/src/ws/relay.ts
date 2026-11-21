import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config/index.js';
import { findUserById } from '../models/User.js';
import { verifyToken } from '../utils/jwt.js';
import { allowPairingAttempt, consumePairingCode, issueDeviceToken, verifyDeviceToken } from './deviceAuth.js';
import { getClientIp, isSecureUpgrade } from './proxyTrust.js';

type Role = 'web' | 'device';
interface Pair { web?: WebSocket; device?: WebSocket; deviceId?: string }

export interface RelayMetrics {
  activeWeb: number;
  activeDevices: number;
  upgradesRejected: number;
  authFailures: number;
  pairingSuccess: number;
  pairingRejected: number;
  rateLimited: number;
  devicesRevokedOnline: number;
}

export type RelayLogger = (event: string, fields: Record<string, string | number | boolean>) => void;

export interface RelayOptions {
  authTimeoutMs?: number;
  pingMs?: number;
  maxUpgradesPerMinute?: number;
  pairingLimits?: { perIp?: number; global?: number };
  logger?: RelayLogger;
}

const MAX_PAYLOAD = 16 * 1024;
const DEFAULT_MAX_UPGRADES_PER_MINUTE = 60;

interface RelayRegistryEntry {
  pairs: Map<number, Pair>;
  disconnectDevice: (userId: number, deviceId: string) => boolean;
}

const activeRelays = new Set<RelayRegistryEntry>();

const defaultLogger: RelayLogger = (event, fields) => {
  if (config.nodeEnv === 'test' || process.env.VITEST === 'true') return;
  console.info(JSON.stringify({ component: 'relay', event, ...fields }));
};

const control = (ws: WebSocket, event: string, extra: Record<string, unknown> = {}): void => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'relay', event, ...extra }));
};

function reject(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function isDeviceOnline(userId: number, deviceId: string): boolean {
  for (const relay of activeRelays) {
    const pair = relay.pairs.get(userId);
    if (pair?.deviceId === deviceId && pair.device?.readyState === WebSocket.OPEN) {
      return true;
    }
  }
  return false;
}

export function disconnectRevokedDevice(userId: number, deviceId: string): boolean {
  let disconnected = false;
  for (const relay of activeRelays) {
    if (relay.disconnectDevice(userId, deviceId)) {
      disconnected = true;
    }
  }
  return disconnected;
}

/**
 * Relay web <-> guante por WebSocket. El ESP32 abre una conexión saliente a /ws/device
 * y el navegador a /ws/web; ambos se emparejan por cuenta. Cada mensaje de texto es una
 * línea NDJSON del protocolo V2, que se reenvía sin tocarla. Los avisos propios del relay
 * llevan type "relay" y nunca se reenvían al otro extremo.
 */
export function attachRelay(
  server: Server,
  options: RelayOptions = {},
): { close: () => void; getMetrics: () => RelayMetrics } {
  const authTimeoutMs = options.authTimeoutMs ?? 5000;
  const maxUpgradesPerMinute = options.maxUpgradesPerMinute ?? DEFAULT_MAX_UPGRADES_PER_MINUTE;
  const log = options.logger ?? defaultLogger;
  const pairs = new Map<number, Pair>();
  const upgradeAttempts = new Map<string, number[]>();
  const counters = {
    upgradesRejected: 0,
    authFailures: 0,
    pairingSuccess: 0,
    pairingRejected: 0,
    rateLimited: 0,
    devicesRevokedOnline: 0,
  };
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

  const registryEntry: RelayRegistryEntry = {
    pairs,
    disconnectDevice: (userId: number, deviceId: string) => {
      const pair = pairs.get(userId);
      if (!pair?.device || pair.deviceId !== deviceId) return false;
      counters.devicesRevokedOnline += 1;
      log('ws.device.revoked_online', { userId, deviceId });
      control(pair.device, 'error', { code: 'REVOKED' });
      pair.device.close(4003, 'revoked');
      return true;
    },
  };
  activeRelays.add(registryEntry);

  function allowUpgrade(clientIp: string, now = Date.now()): boolean {
    if (upgradeAttempts.size > 512) {
      for (const [ip, timestamps] of upgradeAttempts) {
        const fresh = timestamps.filter(at => now - at < 60_000);
        if (fresh.length === 0) upgradeAttempts.delete(ip);
        else upgradeAttempts.set(ip, fresh);
      }
    }
    const existing = (upgradeAttempts.get(clientIp) ?? []).filter(at => now - at < 60_000);
    if (existing.length >= maxUpgradesPerMinute) {
      if (existing.length === 0) upgradeAttempts.delete(clientIp);
      else upgradeAttempts.set(clientIp, existing);
      return false;
    }
    existing.push(now);
    upgradeAttempts.set(clientIp, existing);
    return true;
  }

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? '').split('?')[0];
    const role: Role | null = path === '/ws/web' ? 'web' : path === '/ws/device' ? 'device' : null;
    const clientIp = getClientIp(req, config.trustedProxy);
    if (!role) {
      counters.upgradesRejected += 1;
      log('ws.upgrade.rejected', { reason: 'not_found', path, clientIp });
      return reject(socket, 404, 'Not Found');
    }
    if (!isSecureUpgrade(req, config)) {
      counters.upgradesRejected += 1;
      log('ws.upgrade.rejected', { reason: 'insecure_transport', role, clientIp });
      return reject(socket, 403, 'Forbidden');
    }
    if (role === 'web' && req.headers.origin !== config.corsOrigin) {
      counters.upgradesRejected += 1;
      log('ws.upgrade.rejected', { reason: 'origin_not_allowed', role, clientIp });
      return reject(socket, 403, 'Forbidden');
    }
    if (!allowUpgrade(clientIp)) {
      counters.rateLimited += 1;
      counters.upgradesRejected += 1;
      log('ws.upgrade.rate_limited', { role, clientIp });
      return reject(socket, 429, 'Too Many Requests');
    }
    wss.handleUpgrade(req, socket, head, ws => onConnection(ws, role, clientIp));
  });

  function onConnection(ws: WebSocket, role: Role, clientIp: string): void {
    let userId: number | null = null;
    let alive = true;
    const timer = setTimeout(() => {
      if (userId === null) {
        log('ws.auth.timeout', { role, clientIp });
        ws.close(4001, 'auth timeout');
      }
    }, authTimeoutMs);
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
      if (role === 'device') delete pair.deviceId;
      log('ws.disconnected', { role, userId });
      if (role === 'device' && pair.web) control(pair.web, 'device_offline');
      if (!pair.web && !pair.device) pairs.delete(userId);
    });

    async function authenticate(message: Record<string, unknown>): Promise<void> {
      let id: number | null = null;
      let deviceId: string | undefined;
      let paired: string | undefined;
      if (role === 'web' && message.type === 'auth' && typeof message.token === 'string') {
        id = verifyToken(message.token)?.userId ?? null;
      } else if (role === 'device' && message.type === 'auth' && typeof message.deviceToken === 'string') {
        const verified = await verifyDeviceToken(message.deviceToken);
        if (verified) {
          id = verified.userId;
          deviceId = verified.deviceId;
        }
      } else if (role === 'device' && message.type === 'pair' && typeof message.code === 'string') {
        if (!allowPairingAttempt(clientIp, Date.now(), options.pairingLimits)) {
          counters.rateLimited += 1;
          counters.pairingRejected += 1;
          log('ws.pair.rate_limited', { clientIp });
          control(ws, 'error', { code: 'RATE_LIMITED' });
          return void ws.close(4029, 'too many attempts');
        }
        const pairedUserId = await consumePairingCode(message.code);
        if (pairedUserId !== null && (await findUserById(pairedUserId))) {
          const issued = await issueDeviceToken(pairedUserId);
          id = pairedUserId;
          deviceId = issued.deviceId;
          paired = issued.token;
          counters.pairingSuccess += 1;
          log('ws.pair.succeeded', { userId: id, deviceId });
        } else {
          counters.pairingRejected += 1;
          log('ws.pair.rejected', { clientIp });
        }
      }
      if (id !== null && !(await findUserById(id))) id = null;
      if (id === null) {
        counters.authFailures += 1;
        log('ws.auth.failed', { role, clientIp });
        control(ws, 'error', { code: 'UNAUTHORIZED' });
        return void ws.close(4003, 'unauthorized');
      }
      clearTimeout(timer);
      userId = id;
      const pair = pairs.get(id) ?? {};
      pairs.set(id, pair);
      pair[role]?.close(4000, 'replaced');
      pair[role] = ws;
      if (role === 'device' && deviceId) pair.deviceId = deviceId;
      log('ws.authenticated', role === 'device' && deviceId ? { role, userId: id, deviceId } : { role, userId: id });
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
      activeRelays.delete(registryEntry);
      clearInterval(ping);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      pairs.clear();
      upgradeAttempts.clear();
    },
    getMetrics: () => {
      let activeWeb = 0;
      let activeDevices = 0;
      for (const pair of pairs.values()) {
        if (pair.web?.readyState === WebSocket.OPEN) activeWeb += 1;
        if (pair.device?.readyState === WebSocket.OPEN) activeDevices += 1;
      }
      return {
        activeWeb,
        activeDevices,
        ...counters,
      };
    },
  };
}
