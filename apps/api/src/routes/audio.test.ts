import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import app from '../index.js';
import { createUser } from '../models/User.js';
import { createGesture, generateGestureAudio, updateGesture, deleteGesture, getGestureAudioInfo, findAllGestures } from '../models/Gesture.js';
import { generateToken } from '../utils/jwt.js';
import { gestureData } from '../test/gesture.js';
import { generateTTS, getAudioFilePath } from '../services/tts.js';
import JSZip from 'jszip';

vi.mock('../services/tts.js', async importOriginal => ({
  ...await importOriginal<typeof import('../services/tts.js')>(), generateTTS: vi.fn(),
}));
const provider = vi.mocked(generateTTS);
const server = app.listen(0, '127.0.0.1');
let base: string;
beforeAll(async () => {
  if (!server.listening) await once(server, 'listening');
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
beforeEach(() => { provider.mockReset(); });
let counter = 0;
async function owner() {
  const user = await createUser({ email: `audio${counter++}@example.com`, password: 'password123' });
  return { user, headers: { Authorization: `Bearer ${generateToken({userId:user.id,email:user.email})}` } };
}

it('isolates identical track numbers, requires ownership and supports regeneration', async () => {
  const a = await owner(), b = await owner();
  const ga = await createGesture({userId:a.user.id,name:'Uno',data:gestureData});
  const gb = await createGesture({userId:b.user.id,name:'Dos',data:gestureData});
  // Transport/storage bytes are deliberately synthetic; this is not an MP3 decoder test.
  provider.mockImplementation(async ({text}) => ({audio:Buffer.from(text),provider:'test'}));
  await Promise.all([generateGestureAudio(a.user.id,ga.id),generateGestureAudio(b.user.id,gb.id)]);
  expect([ga.audioTrack,gb.audioTrack]).toEqual([1,1]);
  const path = `/gestures/${ga.id}/audio/file`;
  expect((await fetch(base+path)).status).toBe(401);
  expect((await fetch(base+path,{headers:b.headers})).status).toBe(404);
  expect(await (await fetch(base+path,{headers:a.headers})).text()).toBe('Uno');
  expect(await readFile(getAudioFilePath(b.user.id,1),'utf8')).toBe('Dos');
  expect((await fetch(base+'/audio/0001.mp3')).status).toBe(404);
  await updateGesture(a.user.id,ga.id,{name:'Nuevo'});
  expect((await fetch(base+path,{headers:a.headers})).status).toBe(404);
  await generateGestureAudio(a.user.id,ga.id);
  expect(await (await fetch(base+path,{headers:a.headers})).text()).toBe('Nuevo');
  await deleteGesture(a.user.id,ga.id);
  const replacement=await createGesture({userId:a.user.id,name:'Replacement',data:gestureData});
  expect(replacement.audioTrack).toBe(1);
  expect((await getGestureAudioInfo(a.user.id,replacement.id))?.filePath).toBeNull();
});

it('does not publish stale generation after deletion and track reuse', async () => {
  const {user}=await owner();
  const gesture=await createGesture({userId:user.id,name:'Original',data:gestureData});
  let finish!: (value: Awaited<ReturnType<typeof generateTTS>>) => void;
  let started!: () => void;
  const entered=new Promise<void>(resolve => { started=resolve; });
  provider.mockImplementation(() => { started(); return new Promise(resolve => {finish=resolve;}); });
  const pending=generateGestureAudio(user.id,gesture.id);
  const assertion=expect(pending).rejects.toMatchObject({status:409});
  await entered;
  await deleteGesture(user.id,gesture.id);
  const replacement=await createGesture({userId:user.id,name:'New',data:gestureData});
  finish({audio:Buffer.from('stale'),provider:'test'});
  await assertion;
  expect((await getGestureAudioInfo(user.id,replacement.id))?.filePath).toBeNull();
});

it('blocks incomplete microSD packages and returns only the authenticated user tracks', async () => {
  const a = await owner(), b = await owner();
  const first = await createGesture({ userId: a.user.id, name: 'Necesito agua', data: gestureData });
  await createGesture({ userId: a.user.id, name: 'Gracias', data: gestureData });
  const foreign = await createGesture({ userId: b.user.id, name: 'Privado', data: gestureData });
  provider.mockResolvedValue({ audio: Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200)]), provider: 'test' });
  await generateGestureAudio(a.user.id, first.id);
  await generateGestureAudio(b.user.id, foreign.id);
  const incomplete = await fetch(`${base}/audio/package`, { headers: a.headers });
  expect(incomplete.status).toBe(409);
  expect(await incomplete.json()).toMatchObject({ missingTracks: [{ name: 'Gracias', audioTrack: 2, file: 'mp3/0002.mp3' }] });

  const second = (await findAllGestures(a.user.id))[1];
  await generateGestureAudio(a.user.id, second.id);
  const response = await fetch(`${base}/audio/package`, { headers: a.headers });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-disposition')).toContain('mitten-microsd.zip');
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  expect(Object.keys(zip.files).sort()).toEqual(['COPIAR_A_MICROSD.txt', 'manifest.json', 'mp3/', 'mp3/0001.mp3', 'mp3/0002.mp3']);
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
  expect(manifest.tracks.map((track: { name: string }) => track.name)).toEqual(['Necesito agua', 'Gracias']);
  expect(JSON.stringify(manifest)).not.toContain('Privado');
});

