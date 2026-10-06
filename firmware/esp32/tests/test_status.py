import pytest

from config import (
    STATE_CALIBRATING,
    STATE_CAPTURING,
    STATE_ERROR,
    STATE_IDLE,
    STATE_INITIALIZING,
    STATE_SYNCING,
)
from protocol.commands import FirmwareDispatcher


def request(request_id, command="device.status", version=2, payload=None):
    return {
        "v": version,
        "type": "request",
        "id": request_id,
        "command": command,
        "payload": {} if payload is None else payload,
    }


def connect(dispatcher):
    response = dispatcher.handle_request(request(
        "hs-1",
        "device.handshake",
        payload={"client": "MITTEN_WEB", "supportedProtocolVersions": [2]},
    ))
    assert response["ok"] is True


def test_status_before_handshake_is_rejected():
    dispatcher = FirmwareDispatcher()

    response = dispatcher.handle_request(request("status-1"))

    assert response["error"]["code"] == "HANDSHAKE_REQUIRED"


def test_status_returns_profile_and_sync_metadata():
    dispatcher = FirmwareDispatcher()
    connect(dispatcher)
    dispatcher.active_profile = {
        "profileId": "profile-42",
        "profileRevision": "rev-7",
        "gestureCount": 2,
    }
    dispatcher.active_sync = {
        "syncId": "sync-a1",
        "profileId": "profile-42",
        "profileRevision": "rev-8",
        "expectedGestureCount": 3,
        "receivedCount": 1,
        "nextIndex": 1,
    }

    response = dispatcher.handle_request(request("status-1"))

    assert response["result"]["activeProfile"]["gestureCount"] == 2
    assert response["result"]["activeSync"]["nextIndex"] == 1


@pytest.mark.parametrize(
    "target, cause",
    [
        (STATE_INITIALIZING, None),
        (STATE_CALIBRATING, "startup.calibrating"),
        (STATE_IDLE, "startup.ready"),
        (STATE_CAPTURING, "capture.start"),
        (STATE_SYNCING, "sync.begin"),
        (STATE_ERROR, "fatal.error"),
    ],
)
def test_status_reports_each_official_state(target, cause):
    dispatcher = FirmwareDispatcher()
    connect(dispatcher)
    if cause is not None:
        if target in (STATE_IDLE, STATE_CAPTURING, STATE_SYNCING):
            dispatcher.state.transition(STATE_CALIBRATING, "startup.calibrating")
            dispatcher.state.transition(STATE_IDLE, "startup.ready")
        if target == STATE_CAPTURING:
            dispatcher.state.transition(STATE_CAPTURING, cause)
        elif target == STATE_SYNCING:
            dispatcher.active_sync = {
                "syncId": "sync-1", "profileId": "p", "profileRevision": "r",
                "expectedGestureCount": 0, "receivedCount": 0, "nextIndex": 0,
            }
            dispatcher.state.transition(STATE_SYNCING, cause)
        elif target == STATE_ERROR:
            dispatcher.enter_error("INTERNAL_ERROR", "fatal")
        elif target == STATE_CALIBRATING:
            dispatcher.state.transition(target, cause)

    response = dispatcher.handle_request(request("status-%s" % target.lower()))

    assert response["result"]["state"] == target
    if target == STATE_ERROR:
        assert response["result"]["error"]["code"] == "INTERNAL_ERROR"


def test_incompatible_protocol_after_handshake_is_correlated():
    dispatcher = FirmwareDispatcher()
    connect(dispatcher)

    response = dispatcher.handle_request(request("status-v3", version=3))

    assert response["id"] == "status-v3"
    assert response["error"]["code"] == "PROTOCOL_INCOMPATIBLE"


def test_unknown_command_priority_changes_after_handshake():
    dispatcher = FirmwareDispatcher()
    before = dispatcher.handle_request(request("unknown-before", "device.fly"))
    assert before["error"]["code"] == "HANDSHAKE_REQUIRED"

    connect(dispatcher)
    after = dispatcher.handle_request(request("unknown-after", "device.fly"))
    assert after["error"]["code"] == "UNKNOWN_COMMAND"


def test_status_ignores_additional_unknown_payload_fields():
    dispatcher = FirmwareDispatcher()
    connect(dispatcher)

    response = dispatcher.handle_request(request(
        "status-extra", "device.status", payload={"futureField": True}
    ))

    assert response["ok"] is True
    assert response["result"]["state"] == "INITIALIZING"
