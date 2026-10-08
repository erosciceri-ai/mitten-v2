import json
import subprocess
from pathlib import Path
import pytest
from protocol.commands import FirmwareDispatcher
from protocol.envelopes import build_event, serialize_envelope
from capture import CaptureManager, CaptureConfig
from recognition import GestureRecognizer, RecognitionResult

ROOT = Path(__file__).resolve().parents[3]

def request(command, payload=None):
    return {"v": 2, "type": "request", "id": "r1", "command": command, "payload": payload or {}}

def connected():
    d = FirmwareDispatcher()
    d.startup()
    d.handle_request(request("device.handshake", {"client": "MITTEN_WEB", "supportedProtocolVersions": [2]}))
    return d

def test_wire_outputs_validate_with_shared_typescript_contracts(monkeypatch):
    d = connected()
    response = d.handle_request(request("capture.start"))
    clock = [100]
    monkeypatch.setattr('capture.time_ms', lambda: clock[0])
    c = CaptureManager()
    c.start(CaptureConfig(sample_count=3))
    c.samples = [[100]*5 + [0, 0] for _ in range(3)]
    clock[0] += 100
    c._finalize()
    frames = [response, build_event('capture.completed', {'requestId': 'r1', 'data': c.get_result()['data']}),
              GestureRecognizer().to_event(RecognitionResult(1, 1, 1, True))]
    script = "const c=require('./packages/contracts/dist'); const fs=require('fs'); for(const f of JSON.parse(fs.readFileSync(0,'utf8'))) { const v=f.type==='response'?c.validateCaptureStartResult(f.result):c.validateProtocolV2Message(f); if(!v.valid) throw Error(v.errors.join(';')); }"
    result = subprocess.run(['node', '-e', script], cwd=str(ROOT), input=json.dumps(frames), text=True, capture_output=True)
    assert result.returncode == 0, result.stderr

@pytest.mark.parametrize('command', ['capture.cancel', 'calibrate.flex', 'calibrate.mpu', 'calibrate.complete', 'calibrate.abort', 'playback.play', 'playback.stop', 'playback.volume'])
def test_private_commands_are_unknown_after_handshake(command):
    assert connected().handle_request(request(command))['error']['code'] == 'UNKNOWN_COMMAND'

def test_sync_timeout_is_correlated_and_preserves_profile():
    events = []
    d = connected()
    d.sync_manager._emit_callback = events.append
    d.handle_request(request('sync.begin', {'syncId':'s1', 'profileId':'p1', 'profileRevision':'r1', 'gestureCount':0}))
    d.sync_manager.handle_timeout()
    event = next(e for e in events if e.get('event') == 'sync.failed')
    assert event['data'] == {'syncId':'s1', 'error': {'code':'SYNC_TIMEOUT','message':'Synchronization timed out'}}
    assert d.sync_manager.get_status()['activeSync'] is None

def test_error_state_rejects_sync_operations():
    d = connected()
    d.enter_error('SENSOR_ERROR', 'sensor unavailable')
    for command in ['sync.begin','sync.gesture','sync.commit','sync.abort','capture.start']:
        assert d.handle_request(request(command))['error']['code'] == 'INVALID_STATE'

def test_serialization_rejects_oversized_output():
    with pytest.raises(ValueError, match='MESSAGE_TOO_LARGE'):
        serialize_envelope(build_event('diagnostic.log', {'text':'é'*8192}))
