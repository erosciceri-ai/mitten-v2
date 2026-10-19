"""Tests for sync command handlers integrated with FirmwareDispatcher."""

import pytest

from config import (
    STATE_IDLE,
    STATE_SYNCING,
    ERR_PROFILE_TOO_LARGE,
    ERR_SYNC_NOT_ACTIVE,
    ERR_SYNC_ID_MISMATCH,
    ERR_SYNC_SEQUENCE_INVALID,
    ERR_SYNC_INCOMPLETE,
    ERR_GESTURE_INVALID,
    ERR_DUPLICATE_GESTURE_ID,
    ERR_INVALID_STATE,
    ERR_DEVICE_BUSY,
    MAX_GESTURES,
    SYNC_IDLE_TIMEOUT_MS,
)
from protocol.commands import FirmwareDispatcher


def connect(dispatcher):
    """Perform handshake after explicit device startup."""
    dispatcher.startup()
    return dispatcher.handle_request({
        "v": 2, "type": "request", "id": "hs",
        "command": "device.handshake",
        "payload": {"client": "MITTEN_WEB", "supportedProtocolVersions": [2]}
    })


def sync_begin_request(request_id, sync_id, profile_id, profile_revision, gesture_count):
    return {
        "v": 2, "type": "request", "id": request_id,
        "command": "sync.begin",
        "payload": {
            "syncId": sync_id,
            "profileId": profile_id,
            "profileRevision": profile_revision,
            "gestureCount": gesture_count
        }
    }


def sync_gesture_request(request_id, sync_id, index, gesture):
    return {
        "v": 2, "type": "request", "id": request_id,
        "command": "sync.gesture",
        "payload": {
            "syncId": sync_id,
            "index": index,
            "gesture": gesture
        }
    }


def sync_commit_request(request_id, sync_id):
    return {
        "v": 2, "type": "request", "id": request_id,
        "command": "sync.commit",
        "payload": {"syncId": sync_id}
    }


def sync_abort_request(request_id, sync_id):
    return {
        "v": 2, "type": "request", "id": request_id,
        "command": "sync.abort",
        "payload": {"syncId": sync_id}
    }


def valid_gesture(gesture_id, name, audio_track):
    return {
        "id": gesture_id,
        "name": name,
        "audioTrack": audio_track,
        "data": {
            "version": 1,
            "dimensions": 7,
            "dimensionOrder": ["flex1","flex2","flex3","flex4","flex5","mpuX","mpuY"],
            "units": {"flex": "adc12", "mpu": "degrees"},
            "samples": [[3000.0, 3000.0, 3000.0, 3000.0, 3000.0, 0.0, 0.0]],
            "summary": {
                "min": [3000.0, 3000.0, 3000.0, 3000.0, 3000.0, -10.0, -10.0],
                "max": [3000.0, 3000.0, 3000.0, 3000.0, 3000.0, 10.0, 10.0],
                "mean": [3000.0, 3000.0, 3000.0, 3000.0, 3000.0, 0.0, 0.0]
            },
            "sampleCount": 1,
            "captureDurationMs": 100,
            "samplingPeriodMs": 100
        }
    }


class TestSyncBeginCommand:
    """sync.begin command handler tests."""

    def test_sync_begin_valid_in_idle(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)

        response = dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))

        assert response["ok"] is True
        assert response["result"]["accepted"] is True
        assert response["result"]["syncId"] == "sync-a1"
        assert response["result"]["expectedGestureCount"] == 2
        assert response["result"]["receivedCount"] == 0
        assert response["result"]["nextIndex"] == 0
        assert response["result"]["idleTimeoutMs"] == SYNC_IDLE_TIMEOUT_MS

    def test_sync_begin_emits_state_event(self):
        dispatcher = FirmwareDispatcher()
        events = []
        dispatcher._emit_callback = events.append
        connect(dispatcher)
        dispatcher.flush_events()
        events.clear()

        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))

        dispatcher.flush_events()
        state_events = [e for e in events if e.get("event") == "device.state"]
        assert len(state_events) == 1
        assert state_events[0]["data"]["state"] == STATE_SYNCING

    def test_sync_begin_gesture_count_exceeds_max(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)

        response = dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", MAX_GESTURES + 1))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_PROFILE_TOO_LARGE

    def test_sync_begin_gesture_count_zero_valid(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)

        response = dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 0))

        assert response["ok"] is True
        assert response["result"]["expectedGestureCount"] == 0

    def test_sync_begin_not_in_idle_rejected(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 1))

        # Now in SYNCING, try another begin
        response = dispatcher.handle_request(sync_begin_request("sb-2", "sync-a2", "p2", "r2", 1))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_DEVICE_BUSY

    def test_sync_begin_before_handshake_rejected(self):
        dispatcher = FirmwareDispatcher()

        response = dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 1))

        assert response["error"]["code"] == "HANDSHAKE_REQUIRED"

    def test_sync_begin_invalid_protocol_version_rejected(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)

        response = dispatcher.handle_request({
            "v": 3, "type": "request", "id": "sb-1",
            "command": "sync.begin",
            "payload": {"syncId": "sync-a1", "profileId": "p1", "profileRevision": "r1", "gestureCount": 1}
        })

        assert response["error"]["code"] == "PROTOCOL_INCOMPATIBLE"


class TestSyncGestureCommand:
    """sync.gesture command handler tests."""

    def test_sync_gesture_valid_sequence(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))

        response = dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 0, valid_gesture(17, "hola", 1)))

        assert response["ok"] is True
        assert response["result"]["syncId"] == "sync-a1"
        assert response["result"]["receivedCount"] == 1
        assert response["result"]["nextIndex"] == 1

    def test_sync_gesture_wrong_sync_id(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))

        response = dispatcher.handle_request(sync_gesture_request("sg-1", "sync-wrong", 0, valid_gesture(17, "hola", 1)))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_SYNC_ID_MISMATCH

    def test_sync_gesture_wrong_index(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))

        response = dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 5, valid_gesture(17, "hola", 1)))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_SYNC_SEQUENCE_INVALID

    def test_sync_gesture_duplicate_id(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))
        dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 0, valid_gesture(17, "hola", 1)))

        response = dispatcher.handle_request(sync_gesture_request("sg-2", "sync-a1", 1, valid_gesture(17, "adios", 2)))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_DUPLICATE_GESTURE_ID

    def test_sync_gesture_duplicate_audio_track(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))
        dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 0, valid_gesture(17, "hola", 1)))

        response = dispatcher.handle_request(sync_gesture_request("sg-2", "sync-a1", 1, valid_gesture(18, "adios", 1)))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_GESTURE_INVALID

    def test_sync_gesture_invalid_gesture_data(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))

        invalid_gesture = {"id": 17, "name": "hola", "audioTrack": 1, "data": {"version": 1}}
        response = dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 0, invalid_gesture))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_GESTURE_INVALID

    def test_sync_gesture_exceeds_expected_count(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 1))
        dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 0, valid_gesture(17, "hola", 1)))

        response = dispatcher.handle_request(sync_gesture_request("sg-2", "sync-a1", 1, valid_gesture(18, "adios", 2)))

        assert response["ok"] is False
        assert response["error"]["code"] in (ERR_SYNC_SEQUENCE_INVALID, "SYNC_SEQUENCE_INVALID")


class TestSyncCommitCommand:
    """sync.commit command handler tests."""

    def test_sync_commit_valid(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))
        dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 0, valid_gesture(17, "hola", 1)))
        dispatcher.handle_request(sync_gesture_request("sg-2", "sync-a1", 1, valid_gesture(18, "adios", 2)))

        response = dispatcher.handle_request(sync_commit_request("sc-1", "sync-a1"))

        assert response["ok"] is True
        assert response["result"]["committed"] is True
        assert response["result"]["syncId"] == "sync-a1"
        assert response["result"]["activeProfile"]["profileId"] == "p1"
        assert response["result"]["activeProfile"]["gestureCount"] == 2

    def test_sync_commit_emits_idle_state(self):
        dispatcher = FirmwareDispatcher()
        events = []
        dispatcher._emit_callback = events.append
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 1))
        dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 0, valid_gesture(17, "hola", 1)))
        dispatcher.flush_events()
        events.clear()

        dispatcher.handle_request(sync_commit_request("sc-1", "sync-a1"))

        dispatcher.flush_events()
        state_events = [e for e in events if e.get("event") == "device.state"]
        assert len(state_events) == 1
        assert state_events[0]["data"]["state"] == STATE_IDLE

    def test_sync_commit_incomplete(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))
        dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 0, valid_gesture(17, "hola", 1)))

        response = dispatcher.handle_request(sync_commit_request("sc-1", "sync-a1"))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_SYNC_INCOMPLETE

    def test_sync_commit_wrong_sync_id(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 1))
        dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 0, valid_gesture(17, "hola", 1)))

        response = dispatcher.handle_request(sync_commit_request("sc-1", "sync-wrong"))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_SYNC_ID_MISMATCH

    def test_sync_commit_no_active_sync(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)

        response = dispatcher.handle_request(sync_commit_request("sc-1", "sync-a1"))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_SYNC_NOT_ACTIVE


class TestSyncAbortCommand:
    """sync.abort command handler tests."""

    def test_sync_abort_valid(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))
        dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 0, valid_gesture(17, "hola", 1)))

        response = dispatcher.handle_request(sync_abort_request("sa-1", "sync-a1"))

        assert response["ok"] is True
        assert response["result"]["aborted"] is True
        assert response["result"]["syncId"] == "sync-a1"

    def test_sync_abort_emits_idle_state(self):
        dispatcher = FirmwareDispatcher()
        events = []
        dispatcher._emit_callback = events.append
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 1))
        dispatcher.flush_events()
        events.clear()

        dispatcher.handle_request(sync_abort_request("sa-1", "sync-a1"))

        dispatcher.flush_events()
        state_events = [e for e in events if e.get("event") == "device.state"]
        assert len(state_events) == 1
        assert state_events[0]["data"]["state"] == STATE_IDLE

    def test_sync_abort_no_active_sync(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)

        response = dispatcher.handle_request(sync_abort_request("sa-1", "sync-a1"))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_SYNC_NOT_ACTIVE

    def test_sync_abort_wrong_sync_id(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 1))

        response = dispatcher.handle_request(sync_abort_request("sa-1", "sync-wrong"))

        assert response["ok"] is False
        assert response["error"]["code"] == ERR_SYNC_ID_MISMATCH


class TestStatusDuringSync:
    """device.status during SYNCING state."""

    def test_status_reports_active_sync(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 2))
        dispatcher.handle_request(sync_gesture_request("sg-1", "sync-a1", 0, valid_gesture(17, "hola", 1)))

        response = dispatcher.handle_request({"v": 2, "type": "request", "id": "st-1", "command": "device.status", "payload": {}})

        assert response["ok"] is True
        assert response["result"]["state"] == STATE_SYNCING
        assert response["result"]["activeSync"] is not None
        assert response["result"]["activeSync"]["syncId"] == "sync-a1"
        assert response["result"]["activeSync"]["expectedGestureCount"] == 2
        assert response["result"]["activeSync"]["receivedCount"] == 1
        assert response["result"]["activeSync"]["nextIndex"] == 1


class TestSyncCommandsBusy:
    """Functional commands during sync return DEVICE_BUSY."""

    def test_capture_start_during_sync_returns_busy(self):
        dispatcher = FirmwareDispatcher()
        connect(dispatcher)
        dispatcher.handle_request(sync_begin_request("sb-1", "sync-a1", "p1", "r1", 1))

        response = dispatcher.handle_request({"v": 2, "type": "request", "id": "cap-1", "command": "capture.start", "payload": {}})

        assert response["error"]["code"] == ERR_DEVICE_BUSY
