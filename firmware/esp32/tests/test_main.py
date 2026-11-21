import asyncio
import importlib
import json
import os
import sys
import types

import main as firmware_main
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


def test_main_detaches_repl_after_hardware_init_before_starting_protocol(monkeypatch):
    calls = []

    class Player:
        def deinitialize(self):
            calls.append("deinitialize")

    monkeypatch.setattr(firmware_main, "TRANSPORT_MODE", "serial")
    monkeypatch.setitem(sys.modules, "hardware_config", types.SimpleNamespace(BOARD={}))
    monkeypatch.setitem(
        sys.modules,
        "hardware",
        types.SimpleNamespace(create_hardware=lambda board: (calls.append("hardware") or (None, None, Player()))),
    )
    monkeypatch.setattr(os, "dupterm", lambda stream: calls.append(("dupterm", stream)), raising=False)

    def run(coroutine):
        calls.append("run")
        coroutine.close()

    monkeypatch.setattr(firmware_main.asyncio, "run", run)

    firmware_main.main()

    assert calls == ["hardware", ("dupterm", None), "run", "deinitialize"]


def test_run_wires_custom_ap_password_and_relay_url_with_safe_defaults(monkeypatch):
    seen = []

    class FakeWifiManager:
        def __init__(self, ap_password=None, on_form=None):
            seen.append(("wifi", ap_password, on_form))
            self.state = "CONNECTED"

        async def run(self):
            return None

    class FakeRelayTransport:
        def __init__(self, is_online, url=None):
            self.is_online = is_online
            seen.append(("relay", url))

        def handle_form(self, form):
            return form

        async def run(self):
            return None

    async def fake_main_loop(transport, sensor_manager=None, audio_player=None):
        online_now = transport.is_online() if hasattr(transport, "is_online") else None
        seen.append(("loop", transport, online_now))

    monkeypatch.setitem(
        sys.modules,
        "wifi_manager",
        types.SimpleNamespace(
            WifiManager=FakeWifiManager,
            CONNECTED="CONNECTED",
            resolve_ap_password=lambda board=None: (board or {}).get("ap_password") or "mitten1234",
        ),
    )
    monkeypatch.setitem(
        sys.modules,
        "relay_transport",
        types.SimpleNamespace(RelayTransport=FakeRelayTransport, RELAY_URL="wss://default.example/ws/device"),
    )
    monkeypatch.setattr(firmware_main, "main_loop", fake_main_loop)
    old_mode = firmware_main.TRANSPORT_MODE
    try:
        # 1. Relay mode with custom board config
        firmware_main.TRANSPORT_MODE = "relay"
        asyncio.run(firmware_main._run(
            "serial-t", None, None,
            board={"ap_password": "custom-ap-password", "relay_url": "wss://custom.example/ws/device"},
        ))
        assert seen[0] == ("relay", "wss://custom.example/ws/device")
        assert seen[1][0] == "wifi"
        assert seen[1][1] == "custom-ap-password"
        assert callable(seen[1][2])
        assert seen[2][0] == "loop"
        assert isinstance(seen[2][1], FakeRelayTransport)
        assert seen[2][2] is True

        # 2. Relay mode with empty board dict falls back to defaults
        seen.clear()
        asyncio.run(firmware_main._run("serial-t", None, None, board={}))
        assert seen[0] == ("relay", "wss://default.example/ws/device")
        assert seen[1][1] == "mitten1234"

        # 3. Serial mode with legacy 3-argument call (board omitted)
        seen.clear()
        firmware_main.TRANSPORT_MODE = "serial"
        asyncio.run(firmware_main._run("serial-t", None, None))
        assert seen[0] == ("wifi", "mitten1234", None)
        assert seen[1] == ("loop", "serial-t", None)
    finally:
        firmware_main.TRANSPORT_MODE = old_mode
