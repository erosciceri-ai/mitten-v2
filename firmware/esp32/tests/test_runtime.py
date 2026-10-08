import asyncio
from main import main_loop
from protocol.commands import FirmwareDispatcher
from tests.test_main import MockStreamTransport, frame, decode_writes
from tests.test_sync_commands import valid_gesture, sync_begin_request, sync_gesture_request, sync_commit_request

HANDSHAKE = {"v":2,"type":"request","id":"hs","command":"device.handshake","payload":{"client":"MITTEN_WEB","supportedProtocolVersions":[2]}}

class Sensors:
    def capture_sample(self): return [3000,3000,3000,3000,3000,0,0]

class Player:
    def __init__(self): self.tracks=[]
    def play_track(self, track): self.tracks.append(track)

def test_main_capture_uses_shared_services_and_emits_one_correlated_terminal(monkeypatch):
    clock=[100]
    monkeypatch.setattr('main.ticks_ms', lambda: clock[0])
    monkeypatch.setattr('capture.time_ms', lambda: clock[0])
    class Stream(MockStreamTransport):
        def read(self):
            clock[0] += 20
            return super().read()
    transport=Stream([frame(HANDSHAKE), frame({'v':2,'type':'request','id':'capture-1','command':'capture.start','payload':{}})])
    sensors=Sensors()
    d=asyncio.run(main_loop(transport,max_iterations=120,sleep_ms=0,sensor_manager=sensors))
    messages=decode_writes(transport)
    terminal=[m for m in messages if m.get('event') in ('capture.completed','capture.failed')]
    assert len(terminal)==1 and terminal[0]['event']=='capture.completed'
    assert terminal[0]['data']['requestId']=='capture-1'
    assert terminal[0]['data']['data']['samples']==[sensors.capture_sample()]*50
    phases=[m['data']['phase'] for m in messages if m.get('event')=='capture.progress']
    assert phases==['PREPARING','RECORDING','PROCESSING']
    response=next(i for i,m in enumerate(messages) if m.get('id')=='capture-1')
    state=next(i for i,m in enumerate(messages) if m.get('event')=='device.state' and m['data']['state']=='CAPTURING')
    assert response < state
    assert d.capture_manager.sensor_manager is sensors
    assert d.state.current=='IDLE' and d.active_request_count==0

def test_synced_profile_reloads_and_recognition_plays_the_associated_track():
    player=Player()
    d=FirmwareDispatcher(sensor_manager=Sensors(),dfplayer=player); d.startup(); d.handle_request(HANDSHAKE)
    assert d.handle_request(sync_begin_request('b','s','p','r',1))['ok']
    assert d.handle_request(sync_gesture_request('g','s',0,valid_gesture(42,'Hola',7)))['ok']
    assert d.handle_request(sync_commit_request('c','s'))['ok']
    d.update(100)
    assert player.tracks==[7]
    reboot_player=Player()
    reboot=FirmwareDispatcher(sensor_manager=Sensors(),dfplayer=reboot_player); reboot.startup()
    reboot.update(200)
    assert reboot_player.tracks==[7]
    assert reboot.sync_manager.profile_manager.profile_revision=='r'

def test_status_polling_does_not_extend_sync_idle_timeout(monkeypatch):
    clock=[100]
    monkeypatch.setattr('sync.transaction.ticks_ms',lambda:clock[0])
    d=FirmwareDispatcher(); d.startup(); d.handle_request(HANDSHAKE)
    d.handle_request(sync_begin_request('b','s','p','r',0))
    for t in (3000,6000,10100):
        clock[0]=t
        d.handle_request({'v':2,'type':'request','id':'status','command':'device.status','payload':{}})
        d.update(t)
    assert d.state.current=='IDLE'
