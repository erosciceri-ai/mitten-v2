import pytest

from config import STATE_IDLE
from protocol.commands import FirmwareDispatcher


def handshake_request(request_id="hs-1", versions=None, client="MITTEN_WEB"):
    return {
        "v": 2,
        "type": "request",
        "id": request_id,
        "command": "device.handshake",
        "payload": {
            "client": client,
            "supportedProtocolVersions": [2] if versions is None else versions,
        },
    }


def test_valid_handshake_matches_contract_and_marks_session_compatible():
    dispatcher = FirmwareDispatcher()
    dispatcher.startup()

    response = dispatcher.handle_request(handshake_request())

    assert response["ok"] is True
    assert response["id"] == "hs-1"
    assert response["result"]["device"] == "MITTEN"
    assert response["result"]["protocolVersion"] == 2
    assert response["result"]["state"] == STATE_IDLE
    assert response["result"]["capabilities"] == {
        "maxGestures": 50,
        "maxMessageBytes": 8192,
    }
    assert dispatcher.handshake_compatible is True


@pytest.mark.parametrize(
    "client, versions",
    [
        ("WRONG", [2]),
        ("MITTEN_WEB", []),
        ("MITTEN_WEB", [2, 2]),
        ("MITTEN_WEB", [True]),
        ("MITTEN_WEB", ["2"]),
    ],
)
def test_invalid_handshake_payload_returns_invalid_payload(client, versions):
    dispatcher = FirmwareDispatcher()

    response = dispatcher.handle_request(
        handshake_request(client=client, versions=versions)
    )

    assert response["ok"] is False
    assert response["error"]["code"] == "INVALID_PAYLOAD"
    assert dispatcher.handshake_compatible is False


def test_incompatible_handshake_still_returns_bootstrap_but_not_compatible():
    dispatcher = FirmwareDispatcher()

    response = dispatcher.handle_request(handshake_request(versions=[3]))

    assert response["ok"] is True
    assert response["result"]["protocolVersion"] == 2
    assert dispatcher.handshake_compatible is False


def test_only_active_duplicate_request_id_is_rejected_and_memory_is_released():
    dispatcher = FirmwareDispatcher()
    dispatcher._active_request_ids.add("hs-active")

    duplicate = dispatcher.handle_request(handshake_request("hs-active"))
    assert duplicate["error"]["code"] == "DUPLICATE_REQUEST_ID"

    dispatcher._active_request_ids.remove("hs-active")
    first = dispatcher.handle_request(handshake_request("hs-active"))
    second = dispatcher.handle_request(handshake_request("hs-active"))
    assert first["ok"] is True
    assert second["ok"] is True
    assert dispatcher.active_request_count == 0


def test_handshake_is_allowed_while_device_is_error():
    dispatcher = FirmwareDispatcher()
    dispatcher.enter_error("INTERNAL_ERROR", "Fatal state failure")

    response = dispatcher.handle_request(handshake_request())

    assert response["ok"] is True
    assert response["result"]["state"] == "ERROR"


def test_invalid_handshake_does_not_revoke_existing_compatible_session():
    dispatcher = FirmwareDispatcher()
    assert dispatcher.handle_request(handshake_request())["ok"] is True

    invalid = dispatcher.handle_request(handshake_request("hs-bad", client="WRONG"))

    assert invalid["error"]["code"] == "INVALID_PAYLOAD"
    assert dispatcher.handshake_compatible is True
