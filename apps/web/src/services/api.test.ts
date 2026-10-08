import { afterEach, expect, it, vi } from 'vitest';
import { getGestureAudioBlob } from './api';

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
