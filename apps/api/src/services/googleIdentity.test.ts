import { expect, it } from 'vitest';
import { config } from '../config/index.js';
import { verifyGoogleCredential } from './googleIdentity.js';

it('fails closed when Google authentication is not configured', async () => {
  const previous = config.googleClientId;
  try {
    config.googleClientId = '';
    await expect(verifyGoogleCredential('untrusted-token')).rejects.toMatchObject({
      status: 503,
      message: 'Google sign-in is not configured',
    });
  } finally {
    config.googleClientId = previous;
  }
});
