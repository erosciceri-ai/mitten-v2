import { expect, it } from 'vitest';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { validateGestureData, validateProtocolV2Message, type Gesture } from '@mitten/contracts';
import app from '../index.js';

it('registers → captures → persists → syncs → restarts firmware → recognizes → writes DFPlayer track', async () => {
  const workspace=await mkdtemp(join(tmpdir(),'mitten-device-e2e-'));
  const fixture=resolve('../../firmware/esp32/tests/software_device.py');
  const device=(action:string,input?:unknown) => {
    const result=spawnSync(process.env.MITTEN_TEST_PYTHON || 'python', ['-B',fixture,action], {
      cwd:workspace,input:input ? JSON.stringify(input) : undefined,encoding:'utf8',
      windowsHide:true,timeout:10000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},
    });
    if(result.error) throw result.error;
    expect(result.status,result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  };
  const server=app.listen(0,'127.0.0.1');
  try {
    if (!server.listening) await once(server,'listening');
    const address=server.address();
    const base=`http://127.0.0.1:${typeof address==='object' && address ? address.port : 0}/api`;
    const registration=await fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:'software-e2e@example.com',password:'password123'})});
    expect(registration.status).toBe(201);
    const {token}=await registration.json() as {token:string};
    const completed=device('capture');
    expect(validateProtocolV2Message(completed).valid).toBe(true);
    expect(validateGestureData(completed.data.data).valid).toBe(true);
    const saved=await fetch(base+'/gestures',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({name:'Hola',data:completed.data.data})});
    expect(saved.status).toBe(201);
    const gesture=await saved.json() as Gesture;
    const committed=device('sync',{id:gesture.id,name:gesture.name,audioTrack:gesture.audioTrack,data:gesture.data});
    expect(validateProtocolV2Message(committed).valid).toBe(true);
    const reboot=device('reboot');
    expect(reboot.profile).toBe('rev1');
    expect(validateProtocolV2Message(reboot.event).valid).toBe(true);
    expect(reboot.event.data).toEqual({gestureId:gesture.id,audioTrack:gesture.audioTrack});
    expect(reboot.uart[3]).toBe(0x12);
    expect(reboot.uart[5]*256+reboot.uart[6]).toBe(gesture.audioTrack);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(e=>e ? reject(e) : resolve()));
    await rm(workspace,{recursive:true,force:true});
  }
},20000);
