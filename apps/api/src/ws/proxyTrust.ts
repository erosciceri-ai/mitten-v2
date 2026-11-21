import type { IncomingMessage } from 'node:http';
import { BlockList, isIP } from 'node:net';
import type { TLSSocket } from 'node:tls';

export type TrustedProxySetting = 1 | string[];

/** Normalizes brackets, IPv6 zone scopes and IPv4-mapped IPv6 addresses into canonical IP form. */
export function normalizeIp(raw: string | undefined): string {
  if (!raw) return '';
  let value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    value = value.slice(1, -1);
  }
  const zoneIndex = value.indexOf('%');
  if (zoneIndex !== -1) {
    value = value.slice(0, zoneIndex);
  }
  if (value.toLowerCase().startsWith('::ffff:')) {
    const candidate = value.slice(7);
    if (isIP(candidate) === 4) return candidate;
  }
  return value;
}

function buildBlockList(entries: string[]): BlockList {
  const list = new BlockList();
  for (const entry of entries) {
    const [rawAddress, rawPrefix] = entry.split('/');
    const trimmedAddress = (rawAddress ?? '').trim();
    const rawFamily = isIP(trimmedAddress);
    if (rawPrefix !== undefined && rawFamily === 6 && Number(rawPrefix) > 32) {
      list.addSubnet(trimmedAddress, Number(rawPrefix), 'ipv6');
      continue;
    }
    const addr = normalizeIp(trimmedAddress);
    const family = isIP(addr);
    if (family === 4) {
      if (rawPrefix !== undefined) list.addSubnet(addr, Number(rawPrefix), 'ipv4');
      else list.addAddress(addr, 'ipv4');
    } else if (family === 6) {
      if (rawPrefix !== undefined) list.addSubnet(addr, Number(rawPrefix), 'ipv6');
      else list.addAddress(addr, 'ipv6');
    }
  }
  return list;
}

/** Verifies whether the immediate TCP peer belongs to the configured TRUSTED_PROXY set. */
export function isTrustedProxyPeer(remoteAddress: string | undefined, trustedProxy: TrustedProxySetting): boolean {
  if (trustedProxy === 1) return true;
  if (trustedProxy.length === 0) return false;
  const ip = normalizeIp(remoteAddress);
  const family = isIP(ip);
  if (family === 0) return false;
  const list = buildBlockList(trustedProxy);
  return list.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/** Enforces TLS (directly or through a verified trusted proxy with x-forwarded-proto=https) in production. */
export function isSecureUpgrade(
  req: IncomingMessage,
  env: { nodeEnv: string; trustedProxy: TrustedProxySetting },
): boolean {
  if (env.nodeEnv !== 'production') return true;
  if ((req.socket as TLSSocket).encrypted) return true;
  if (!isTrustedProxyPeer(req.socket.remoteAddress, env.trustedProxy)) return false;
  const forwarded = String(req.headers['x-forwarded-proto'] ?? '')
    .split(',')
    .pop()
    ?.trim()
    .toLowerCase();
  return forwarded === 'https';
}

/** Extracts the client IP without trusting x-forwarded-for from untrusted direct peers. */
export function getClientIp(req: IncomingMessage, trustedProxy: TrustedProxySetting): string {
  const peer = normalizeIp(req.socket.remoteAddress) || 'unknown';
  if (!isTrustedProxyPeer(peer, trustedProxy)) return peer;

  const rawXff = req.headers['x-forwarded-for'];
  const headerValue = Array.isArray(rawXff) ? rawXff.join(',') : (rawXff ?? '');
  const forwarded = headerValue
    .split(',')
    .map(part => normalizeIp(part))
    .filter(part => isIP(part) !== 0);

  if (forwarded.length === 0) return peer;
  if (trustedProxy === 1) return forwarded[forwarded.length - 1];

  for (let i = forwarded.length - 1; i >= 0; i--) {
    if (!isTrustedProxyPeer(forwarded[i], trustedProxy)) {
      return forwarded[i];
    }
  }
  return forwarded[0];
}
