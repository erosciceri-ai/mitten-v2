import asyncio
import importlib
import json
import sys
import types

from main import main, main_loop


class MockStreamTransport:
    def __init__(self, chunks):
        self.chunks = list(chunks)
        self.writes = []

    def read(self):
        if self.chunks:
            return self.chunks.pop(0)
        return None

    def write(self, data):
        self.writes.append(data)


def frame(value):
    return (json.dumps(value, separators=(",", ":")) + "\n").encode("utf-8")


def decode_writes(transport):
    return [json.loads(item.decode("utf-8")) for item in transport.writes]


def test_main_loop_uses_stream_transport_for_handshake_and_status():
    transport = MockStreamTransport([
        frame({
            "v": 2, "type": "request", "id": "hs", "command": "device.handshake",
            "payload": {"client": "MITTEN_WEB", "supportedProtocolVersions": [2]},
        }),
        frame({
            "v": 2, "type": "request", "id": "status", "command": "device.status",
            "payload": {},
        }),
    ])

    asyncio.run(main_loop(transport, max_iterations=2, sleep_ms=0))

    messages = decode_writes(transport)
    responses = {item["id"]: item for item in messages if item["type"] == "response"}
    assert responses["hs"]["result"]["device"] == "MITTEN"
    assert responses["status"]["result"]["state"] == "IDLE"
    assert not [item for item in messages if item.get("event") == "device.state"]


def test_audio_storage_warning_keeps_firmware_operational():
    transport = MockStreamTransport([
        frame({
            "v": 2, "type": "request", "id": "hs", "command": "device.handshake",
            "payload": {"client": "MITTEN_WEB", "supportedProtocolVersions": [2]},
        }),
        frame({"v": 2, "type": "request", "id": "status", "command": "device.status", "payload": {}}),
    ])

    asyncio.run(main_loop(transport, max_iterations=2, sleep_ms=0,
                          storage_warning="Audio storage unavailable"))

    messages = decode_writes(transport)
    status = next(item for item in messages if item.get("id") == "status")
    diagnostic = next(item for item in messages if item.get("event") == "diagnostic.log")
    assert status["result"]["state"] == "IDLE"
    assert diagnostic["data"] == {"level": "INFO", "message": "Audio storage unavailable"}


def test_deferred_audio_initializes_after_handshake_response():
    transport = MockStreamTransport([
        frame({
            "v": 2, "type": "request", "id": "hs", "command": "device.handshake",
            "payload": {"client": "MITTEN_WEB", "supportedProtocolVersions": [2]},
        }),
        frame({"v": 2, "type": "request", "id": "status", "command": "device.status", "payload": {}}),
    ])

    class AudioPlayer:
        mounted = False

        def __init__(self):
            self.initializations = 0

        def initialize(self, safe_sd_pin=None):
            self.initializations += 1
            assert any(message.get("id") == "hs" for message in decode_writes(transport))
            return False

        def update(self, now=None):
            pass

    player = AudioPlayer()
    asyncio.run(main_loop(transport, max_iterations=2, sleep_ms=0, audio_player=player,
                          initialize_audio_on_handshake=True))

    messages = decode_writes(transport)
    assert player.initializations == 1
    assert messages[0]["id"] == "hs"
    assert messages[0]["ok"] is True
    assert any(item.get("event") == "diagnostic.log" for item in messages)
    status = next(item for item in messages if item.get("id") == "status")
    assert status["result"]["state"] == "IDLE"


def test_startup_sensor_failure_is_available_through_handshake_and_status():
    transport = MockStreamTransport([
        frame({
            "v": 2, "type": "request", "id": "hs", "command": "device.handshake",
            "payload": {"client": "MITTEN_WEB", "supportedProtocolVersions": [2]},
        }),
        frame({"v": 2, "type": "request", "id": "status", "command": "device.status", "payload": {}}),
    ])

    asyncio.run(main_loop(transport, max_iterations=2, sleep_ms=0,
                          startup_error=("SENSOR_ERROR", "MPU6050 unavailable")))

    messages = decode_writes(transport)
    responses = {item.get("id"): item for item in messages if item.get("type") == "response"}
    assert responses["hs"]["result"]["state"] == "ERROR"
    assert responses["status"]["result"]["state"] == "ERROR"
    assert responses["status"]["result"]["error"]["code"] == "SENSOR_ERROR"


def test_parse_error_is_silent_before_handshake_and_structured_after_handshake():
    transport = MockStreamTransport([
        b"not json\n",
        frame({
            "v": 2, "type": "request", "id": "hs", "command": "device.handshake",
            "payload": {"client": "MITTEN_WEB", "supportedProtocolVersions": [2]},
        }),
        b"still not json\n",
    ])

    asyncio.run(main_loop(transport, max_iterations=3, sleep_ms=0))

    errors = [item for item in decode_writes(transport) if item.get("event") == "protocol.error"]
    assert len(errors) == 1
    assert errors[0]["data"]["error"]["code"] == "INVALID_JSON"


def test_importing_main_without_hardware_module_succeeds():
    previous = sys.modules.pop("machine", None)
    try:
        imported = importlib.reload(sys.modules["main"])
        assert callable(imported.main_loop)
        assert "machine" not in sys.modules
    finally:
        if previous is not None:
            sys.modules["machine"] = previous


def test_uncorrelated_invalid_message_is_silent_during_bootstrap():
    transport = MockStreamTransport([
        frame({"v": 2, "type": "event", "event": "unexpected", "data": {}}),
    ])

    asyncio.run(main_loop(transport, max_iterations=1, sleep_ms=0))

    protocol_errors = [
        item for item in decode_writes(transport)
        if item.get("event") == "protocol.error"
    ]
    assert protocol_errors == []


def test_mixed_chunk_preserves_bootstrap_error_order():
    handshake = frame({
        "v": 2, "type": "request", "id": "hs", "command": "device.handshake",
        "payload": {"client": "MITTEN_WEB", "supportedProtocolVersions": [2]},
    })

    before = MockStreamTransport([b"bad json\n" + handshake])
    asyncio.run(main_loop(before, max_iterations=1, sleep_ms=0))
    assert not [
        item for item in decode_writes(before)
        if item.get("event") == "protocol.error"
    ]

    after = MockStreamTransport([handshake + b"bad json\n"])
    asyncio.run(main_loop(after, max_iterations=1, sleep_ms=0))
    errors = [
        item for item in decode_writes(after)
        if item.get("event") == "protocol.error"
    ]
    assert len(errors) == 1
    assert errors[0]["data"]["error"]["code"] == "INVALID_JSON"


class FakeUart:
    """UART double that replays two requests and then stops the loop."""

    def __init__(self):
        self.writes = []
        self.chunks = [
            frame({
                "v": 2, "type": "request", "id": "hs", "command": "device.handshake",
                "payload": {"client": "MITTEN_WEB", "supportedProtocolVersions": [2]},
            }),
            frame({
                "v": 2, "type": "request", "id": "status", "command": "device.status",
                "payload": {},
            }),
        ]

    def any(self):
        if self.chunks:
            return True
        # The firmware loop reads forever; ending the double here stops it.
        raise RuntimeError("stop the loop")

    def read(self):
        return self.chunks.pop(0)

    def write(self, data):
        self.writes.append(data)
        return len(data)


def test_boot_failure_is_announced_instead_of_being_silent(monkeypatch):
    # A firmware module that cannot be imported is one of the failures that
    # used to leave the board mute: the image has no REPL and no console.
    uart = FakeUart()
    fake_machine = types.ModuleType("machine")
    fake_machine.UART = lambda *args, **kwargs: uart
    monkeypatch.setitem(sys.modules, "machine", fake_machine)

    incomplete_hardware = types.ModuleType("hardware")
    monkeypatch.setitem(sys.modules, "hardware", incomplete_hardware)

    main()

    messages = [json.loads(item.decode("utf-8")) for item in uart.writes]
    responses = {item.get("id"): item for item in messages if item.get("type") == "response"}
    assert responses["hs"]["result"]["state"] == "ERROR"
    assert responses["status"]["result"]["state"] == "ERROR"
    assert responses["status"]["result"]["error"]["code"] == "INTERNAL_ERROR"
    assert "hardware" in responses["status"]["result"]["error"]["message"]
