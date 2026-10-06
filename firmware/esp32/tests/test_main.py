import asyncio
import importlib
import json
import sys

from main import main_loop


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
    assert [item["data"]["state"] for item in messages if item.get("event") == "device.state"] == [
        "INITIALIZING", "CALIBRATING", "IDLE"
    ]


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
