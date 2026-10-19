"""Bare-board USB diagnostics must never initialize hardware or storage."""
import asyncio

from protocol.commands import FirmwareDispatcher
from tests.test_main import MockStreamTransport, frame, decode_writes


def request(command, identifier='request'):
    payload = {'client':'MITTEN_WEB', 'supportedProtocolVersions':[2]} if command == 'device.handshake' else {}
    return {'v':2, 'type':'request', 'id':identifier, 'command':command, 'payload':payload}


def test_diagnostic_handshake_status_and_rejections_preserve_all_files(tmp_path, monkeypatch):
    original = {name: b'leave this file untouched' for name in
                ('gestos.json', 'gestures.json', 'gestures.staging', 'gestures.tmp')}
    for name, data in original.items():
        (tmp_path / name).write_bytes(data)

    def forbidden(*args, **kwargs):
        raise AssertionError('Diagnostic mode must not initialize runtime services')
    for name in ('SyncTransactionManager', 'CaptureManager', 'GestureRecognizer'):
        monkeypatch.setattr('protocol.commands.' + name, forbidden)
    dispatcher = FirmwareDispatcher(diagnostic_only=True)
    assert dispatcher.startup() is False
    assert dispatcher.state.current == 'ERROR'
    commands = ('device.status', 'capture.start', 'sync.begin', 'sync.gesture',
                'sync.commit', 'sync.abort', 'unknown')
    for command in commands:
        assert dispatcher.handle_request(request(command))['error']['code'] == 'HANDSHAKE_REQUIRED'
    handshake = dispatcher.handle_request(request('device.handshake', 'hs'))
    assert handshake['ok'] and handshake['result']['device'] == 'MITTEN'
    assert handshake['result']['state'] == 'ERROR'
    status = dispatcher.handle_request(request('device.status'))['result']
    assert status == {'state':'ERROR', 'activeProfile':None, 'activeSync':None,
                      'error':{'code':'SENSOR_ERROR', 'message':'USB-only diagnostic: sensors intentionally disabled'}}
    for command in commands[1:-1]:
        assert dispatcher.handle_request(request(command))['error']['code'] == 'INVALID_STATE'
    assert dispatcher.handle_request(request('unknown'))['error']['code'] == 'UNKNOWN_COMMAND'
    dispatcher.update(100)
    assert dispatcher.active_request_count == 0
    assert {p.name:p.read_bytes() for p in tmp_path.iterdir()} == original


def test_diagnostic_main_loop_uses_real_protocol_without_hardware(tmp_path):
    from main import main_loop
    transport = MockStreamTransport([frame(request('device.handshake', 'hs')),
                                     frame(request('device.status', 'status')),
                                     frame(request('capture.start', 'capture'))])
    asyncio.run(main_loop(transport, max_iterations=3, sleep_ms=0, diagnostic_only=True))
    messages = decode_writes(transport)
    responses = {m['id']:m for m in messages if m['type']=='response'}
    assert responses['hs']['result']['state'] == 'ERROR'
    assert responses['status']['result']['error']['code'] == 'SENSOR_ERROR'
    assert responses['capture']['error']['code'] == 'INVALID_STATE'
    assert not any(m.get('event') in ('capture.completed', 'recognition.detected') for m in messages)
    assert list(tmp_path.iterdir()) == []


def test_diagnostic_entry_does_not_load_board_configuration(monkeypatch):
    import diagnostic
    calls = []
    transport = object()
    monkeypatch.setattr(diagnostic, 'StdioStreamTransport', lambda: transport)
    async def loop(value, **kwargs):
        assert value is transport
        calls.append(kwargs)
    monkeypatch.setattr(diagnostic, 'main_loop', loop)
    diagnostic.main()
    assert calls == [{'diagnostic_only':True}]


def test_temporary_launcher_selects_the_dedicated_directory(monkeypatch):
    import runpy
    import sys
    from pathlib import Path
    import diagnostic
    calls = []
    monkeypatch.setattr(sys, 'path', list(sys.path))
    monkeypatch.setattr(diagnostic, 'main', lambda: calls.append('started'))
    runpy.run_path(str(Path(__file__).parents[1] / 'diagnostic_launcher.py'), run_name='__main__')
    assert calls == ['started']
    assert sys.path[0] == '/mitten_diag'
