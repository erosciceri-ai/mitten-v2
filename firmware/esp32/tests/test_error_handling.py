from config import STATE_CAPTURING
from error.handler import ErrorHandler, ProtocolException
from protocol.commands import FirmwareDispatcher


def request(request_id, command, payload=None, version=2):
    return {
        "v": version,
        "type": "request",
        "id": request_id,
        "command": command,
        "payload": {} if payload is None else payload,
    }


def connect(dispatcher):
    return dispatcher.handle_request(request(
        "hs",
        "device.handshake",
        {"client": "MITTEN_WEB", "supportedProtocolVersions": [2]},
    ))


def test_parse_error_mapping_for_invalid_json_and_oversize():
    invalid = ErrorHandler.from_parse_error({
        "type": "INVALID_JSON", "message": "Unable to parse JSON frame"
    })
    oversized = ErrorHandler.from_parse_error({
        "type": "MESSAGE_TOO_LARGE", "message": "Frame too large"
    })

    assert invalid["data"]["error"]["code"] == "INVALID_JSON"
    assert oversized["data"]["error"]["code"] == "MESSAGE_TOO_LARGE"


def test_invalid_utf8_maps_to_invalid_message():
    event = ErrorHandler.from_parse_error({
        "type": "INVALID_UTF8", "message": "Invalid UTF-8"
    })
    assert event["data"]["error"]["code"] == "INVALID_MESSAGE"


def test_protocol_exception_maps_to_correlated_response():
    response = ErrorHandler.from_exception(
        ProtocolException("INVALID_PAYLOAD", "Bad payload", {"field": "client"}),
        "req-1",
    )

    assert response["id"] == "req-1"
    assert response["error"] == {
        "code": "INVALID_PAYLOAD",
        "message": "Bad payload",
        "details": {"field": "client"},
    }


def test_unexpected_exception_maps_to_internal_error_without_trace():
    response = ErrorHandler.from_exception(RuntimeError("secret internal"), "req-2")

    assert response["error"]["code"] == "INTERNAL_ERROR"
    assert "secret internal" not in response["error"]["message"]


def test_required_dispatch_error_codes_and_priorities():
    dispatcher = FirmwareDispatcher()

    handshake_required = dispatcher.handle_request(request("r1", "device.status"))
    invalid_payload = dispatcher.handle_request(request(
        "r2", "device.handshake",
        {"client": "WRONG", "supportedProtocolVersions": [2]},
    ))
    connect(dispatcher)
    incompatible = dispatcher.handle_request(request("r3", "device.status", version=3))
    unknown = dispatcher.handle_request(request("r4", "device.fly"))

    assert handshake_required["error"]["code"] == "HANDSHAKE_REQUIRED"
    assert invalid_payload["error"]["code"] == "INVALID_PAYLOAD"
    assert incompatible["error"]["code"] == "PROTOCOL_INCOMPATIBLE"
    assert unknown["error"]["code"] == "UNKNOWN_COMMAND"


def test_device_busy_and_invalid_state_for_functional_commands():
    initial = FirmwareDispatcher()
    connect(initial)
    invalid_state = initial.handle_request(request("capture-initial", "capture.start"))
    assert invalid_state["error"]["code"] == "INVALID_STATE"

    busy = FirmwareDispatcher()
    busy.startup()
    connect(busy)
    busy.state.transition(STATE_CAPTURING, "capture.start")
    response = busy.handle_request(request("sync-busy", "sync.begin"))
    assert response["error"]["code"] == "DEVICE_BUSY"
