import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['1', 1],
  ['127.0.0.1/32, ::1', ['127.0.0.1/32', '::1']],
  ['2', null],
  ['1,127.0.0.1', null],
] as const)('validates TRUSTED_PROXY=%s', async (value, expected) => {
  vi.resetModules();
  vi.stubEnv('TRUSTED_PROXY', value);
  const { config, validateConfig } = await import('./index.js');
  if (expected === null) {
    expect(validateConfig).toThrow('TRUSTED_PROXY');
  } else {
    expect(config.trustedProxy).toEqual(expected);
    expect(validateConfig).not.toThrow();
  }
});
