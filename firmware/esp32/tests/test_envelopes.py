import json

import pytest

from config import (
    ERR_HANDSHAKE_REQUIRED,
    STATE_CAPTURING,
    STATE_IDLE,
)
from protocol.envelopes import (
    build_error_response,
    build_handshake_response,
    build_protocol_error_event,
    build_state_event,
    build_status_response,
    is_valid_request_id,
    serialize_envelope,
    validate_request_envelope,
)


def test_build_handshake_response_matches_contract_fixture():
    response = build_handshake_response(
        "req-1",
        {"maxGestures": 50, "maxMessageBytes": 8192},
        state=STATE_IDLE,
    )

    assert response == {
        "v": 2,
        "type": "response",
        "id": "req-1",
        "ok": True,
        "result": {
            "device": "MITTEN",
            "firmwareVersion": "2.0.0",
            "protocolVersion": 2,
            "state": "IDLE",
            "capabilities": {"maxGestures": 50, "maxMessageBytes": 8192},
        },
    }


def test_build_status_response_includes_nullable_contract_fields():
    response = build_status_response("req-2", STATE_IDLE)

    assert response["result"] == {
        "state": "IDLE",
        "activeProfile": None,
        "activeSync": None,
        "error": None,
    }


def test_build_error_response_preserves_correlation_and_details():
    response = build_error_response(
        "req-3",
        ERR_HANDSHAKE_REQUIRED,
        "Handshake required",
        {"command": "device.status"},
    )

    assert response == {
        "v": 2,
        "type": "response",
        "id": "req-3",
        "ok": False,
        "error": {
            "code": "HANDSHAKE_REQUIRED",
            "message": "Handshake required",
            "details": {"command": "device.status"},
        },
    }


def test_build_state_and_protocol_error_events():
    assert build_state_event(STATE_CAPTURING) == {
        "v": 2,
        "type": "event",
        "event": "device.state",
        "data": {"state": "CAPTURING"},
    }
    assert build_protocol_error_event("INVALID_JSON", "Bad JSON") == {
        "v": 2,
        "type": "event",
        "event": "protocol.error",
        "data": {"error": {"code": "INVALID_JSON", "message": "Bad JSON"}},
    }


@pytest.mark.parametrize(
    "request_id",
    ["a", "req-1", "A_z.9:part", "x" * 64],
)
def test_valid_request_ids(request_id):
    assert is_valid_request_id(request_id)


@pytest.mark.parametrize(
    "request_id",
    [None, "", "bad@id", "space id", "ñ", "x" * 65],
)
def test_invalid_request_ids(request_id):
    assert not is_valid_request_id(request_id)


def test_builders_reject_invalid_ids_and_states():
    with pytest.raises(ValueError):
        build_status_response("bad@id", STATE_IDLE)
    with pytest.raises(ValueError):
        build_state_event("DISCONNECTED")


def test_validate_request_envelope_allows_unknown_command_but_checks_shape():
    valid, message = validate_request_envelope({
        "v": 2,
        "type": "request",
        "id": "req-1",
        "command": "device.fly",
        "payload": {},
    })
    assert valid is True
    assert message is None

    valid, message = validate_request_envelope({
        "v": 2,
        "type": "event",
        "id": "req-1",
        "command": "device.status",
        "payload": {},
    })
    assert valid is False
    assert "request" in message


def test_serialize_envelope_is_compact_utf8_ndjson():
    envelope = build_state_event(STATE_IDLE)
    encoded = serialize_envelope(envelope)

    assert encoded.endswith(b"\n")
    assert b" " not in encoded
    assert json.loads(encoded.decode("utf-8")) == envelope
