"""Subprocess fixture for API/firmware E2E; caller owns a temporary cwd."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import capture
import dfplayer
from protocol.commands import FirmwareDispatcher
from tests.sensor_fakes import UART

class Sensors:
    def capture_sample(self):
        return [1000, 1200, 1400, 1600, 1800, 10, -5]

events = []
clock = [0]
capture.time_ms = lambda: clock[0]
dfplayer.sleep_ms = lambda ms: None
uart = UART()
player = dfplayer.DFPlayer()
player.begin(uart)
device = FirmwareDispatcher(emit=events.append, sensor_manager=Sensors(), dfplayer=player)
device.startup()
counter = [0]

def request(command, payload):
    counter[0] += 1
    result = device.handle_request({'v':2,'type':'request','id':str(counter[0]),
                                    'command':command,'payload':payload})
    assert result['ok'], result
    device.flush_events()
    return result

request('device.handshake', {'client':'MITTEN_WEB','supportedProtocolVersions':[2]})
action = sys.argv[1]
if action == 'capture':
    request('capture.start', {})
    for t in range(0, 2500, 20):
        clock[0] = t
        device.update(t)
    completed = [e for e in events if e.get('event') == 'capture.completed']
    assert len(completed) == 1, events
    print(json.dumps(completed[0]))
elif action == 'sync':
    gesture = json.load(sys.stdin)
    request('sync.begin', {'syncId':'e2e','profileId':'e2e','profileRevision':'rev1','gestureCount':1})
    request('sync.gesture', {'syncId':'e2e','index':0,'gesture':gesture})
    print(json.dumps(request('sync.commit', {'syncId':'e2e'})))
elif action == 'reboot':
    device.update(100)
    detected = [e for e in events if e.get('event') == 'recognition.detected']
    print(json.dumps({'event':detected[0], 'uart':list(uart.writes[-1]),
                     'profile':device.sync_manager.profile_manager.profile_revision}))
else:
    raise ValueError('Unknown fixture action')
