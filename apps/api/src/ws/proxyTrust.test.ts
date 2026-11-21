import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { getClientIp, isSecureUpgrade, isTrustedProxyPeer } from './proxyTrust.js';

function fakeReq(options: {
  remoteAddress?: string;
  encrypted?: boolean;
  headers?: Record<string, string | string[]>;
}): IncomingMessage {
  return {
    socket: { remoteAddress: options.remoteAddress, encrypted: options.encrypted ?? false },
    headers: options.headers ?? {},
  } as unknown as IncomingMessage;
}

describe('proxyTrust', () => {
  it('accepts TRUSTED_PROXY=1 with x-forwarded-proto=https and resolves rightmost xff', () => {
    const req = fakeReq({
      remoteAddress: '10.0.0.5',
      headers: {
        'x-forwarded-proto': 'http, https',
        'x-forwarded-for': '198.51.100.1, 203.0.113.9',
      },
    });
    expect(isSecureUpgrade(req, { nodeEnv: 'production', trustedProxy: 1 })).toBe(true);
    expect(getClientIp(req, 1)).toBe('203.0.113.9');
  });

  it('validates immediate peer against CIDR/IP list including IPv4-mapped IPv6 and rejects spoofed headers', () => {
    const trusted = ['10.0.0.0/8', '::1'];
    expect(isTrustedProxyPeer('10.1.2.3', trusted)).toBe(true);
    expect(isTrustedProxyPeer('::ffff:10.1.2.3', trusted)).toBe(true);
    expect(isTrustedProxyPeer('::1', trusted)).toBe(true);
    expect(isTrustedProxyPeer('203.0.113.5', trusted)).toBe(false);

    const trustedReq = fakeReq({
      remoteAddress: '::ffff:10.1.2.3',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '198.51.100.7, 10.2.3.4',
      },
    });
    expect(isSecureUpgrade(trustedReq, { nodeEnv: 'production', trustedProxy: trusted })).toBe(true);
    expect(getClientIp(trustedReq, trusted)).toBe('198.51.100.7');

    const spoofedReq = fakeReq({
      remoteAddress: '203.0.113.5',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '198.51.100.99',
      },
    });
    expect(isSecureUpgrade(spoofedReq, { nodeEnv: 'production', trustedProxy: trusted })).toBe(false);
    expect(getClientIp(spoofedReq, trusted)).toBe('203.0.113.5');
  });

  it('rejects plain upgrades in production when TRUSTED_PROXY is empty and allows encrypted sockets', () => {
    const plainReq = fakeReq({
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(isSecureUpgrade(plainReq, { nodeEnv: 'production', trustedProxy: [] })).toBe(false);
    expect(isSecureUpgrade(plainReq, { nodeEnv: 'development', trustedProxy: [] })).toBe(true);

    const tlsReq = fakeReq({ remoteAddress: '203.0.113.5', encrypted: true });
    expect(isSecureUpgrade(tlsReq, { nodeEnv: 'production', trustedProxy: [] })).toBe(true);
  });
});
