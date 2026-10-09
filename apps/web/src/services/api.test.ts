import { afterEach, expect, it, vi } from 'vitest';
import { exportAccountData, getGestureAudioBlob, linkGoogleAccount, loginWithGoogle } from './api';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('downloads the gesture audio with bearer authentication through the central API',async () => {
  localStorage.setItem('auth_token','test-token');
  const blob=new Blob(['test transport bytes'],{type:'audio/mpeg'});
  const fetcher=vi.fn().mockResolvedValue({ok:true,blob:async()=>blob});
  vi.stubGlobal('fetch',fetcher);
  expect(await getGestureAudioBlob(42)).toBe(blob);
  expect(fetcher).toHaveBeenCalledWith('/api/gestures/42/audio/file',expect.objectContaining({
    headers:expect.objectContaining({Authorization:'Bearer test-token'}),
  }));
});
it('does not turn an audio authorization failure into a playable blob',async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>({message:'Unauthorized'})}));
  await expect(getGestureAudioBlob(42)).rejects.toMatchObject({status:401,message:'Unauthorized'});
});

it('sends Google credentials only to the central authentication endpoints', async () => {
  localStorage.setItem('auth_token', 'session-token');
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { id: 1, email: 'g@example.com', googleLinked: true }, token: 'token' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { id: 1, email: 'g@example.com', googleLinked: true } }) });
  vi.stubGlobal('fetch', fetcher);

  await loginWithGoogle('google-id-credential');
  await linkGoogleAccount('google-link-credential');

  expect(fetcher.mock.calls[0][0]).toBe('/api/auth/google');
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ credential: 'google-id-credential' }) });
  expect(fetcher.mock.calls[1][0]).toBe('/api/auth/google/link');
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ credential: 'google-link-credential' }) });
});

it('requests the authenticated account export through the central API', async () => {
  localStorage.setItem('auth_token', 'export-session');
  const payload = { format: 'mitten-account-export', version: 1, exportedAt: '2026-10-07T00:00:00.000Z', account: {}, gestures: [] };
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
  vi.stubGlobal('fetch', fetcher);

  await expect(exportAccountData()).resolves.toEqual(payload);
  expect(fetcher).toHaveBeenCalledWith('/api/auth/export', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer export-session' }),
  }));
});
