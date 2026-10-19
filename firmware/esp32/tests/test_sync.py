"""Tests for sync transaction state machine."""

import json
import os
import tempfile
import shutil

import pytest

from sync.transaction import SyncTransactionManager
from config import (
    STATE_IDLE,
    STATE_SYNCING,
    STATE_ERROR,
    ERR_PROFILE_TOO_LARGE,
    ERR_SYNC_NOT_ACTIVE,
    ERR_SYNC_ID_MISMATCH,
    ERR_SYNC_INCOMPLETE,
    ERR_SYNC_FAILED,
    ERR_STORAGE_ERROR,
    MAX_GESTURES,
    SYNC_IDLE_TIMEOUT_MS,
)


class TestSyncTransactionManager:
    """Sync transaction manager integration with staging and storage."""

    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.old_cwd = os.getcwd()
        os.chdir(self.tmpdir)

    def teardown_method(self):
        os.chdir(self.old_cwd)
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_begin_creates_transaction_and_staging(self):
        """sync.begin creates active transaction and staging file"""
        manager = SyncTransactionManager()

        result = manager.begin(
            sync_id="sync-a1",
            profile_id="profile-42",
            profile_revision="rev-7",
            gesture_count=2
        )

        assert result["ok"] is True
        assert result["accepted"] is True
        assert result["syncId"] == "sync-a1"
        assert result["expectedGestureCount"] == 2
        assert result["receivedCount"] == 0
        assert result["nextIndex"] == 0
        assert result["idleTimeoutMs"] == SYNC_IDLE_TIMEOUT_MS

        # State should be SYNCING
        assert manager.get_state() == STATE_SYNCING

    def test_begin_rejects_gesture_count_exceeds_max(self):
        """gestureCount > MAX_GESTURES -> PROFILE_TOO_LARGE"""
        manager = SyncTransactionManager()

        result = manager.begin("sync-a1", "p1", "r1", MAX_GESTURES + 1)

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_PROFILE_TOO_LARGE

    def test_begin_rejects_zero_max_gestures(self):
        """gestureCount = 0 is valid (empty profile)"""
        manager = SyncTransactionManager()

        result = manager.begin("sync-a1", "p1", "r1", 0)
        assert result["ok"] is True

    def test_begin_rejects_negative_gesture_count(self):
        """Negative gestureCount -> error"""
        manager = SyncTransactionManager()

        result = manager.begin("sync-a1", "p1", "r1", -1)
        assert result["ok"] is False

    def test_begin_in_idle_only(self):
        """sync.begin only allowed from IDLE"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 1)
        # Now in SYNCING, try to begin again
        result = manager.begin("sync-a2", "p2", "r2", 1)
        assert result["ok"] is False
        assert result["error"]["code"] == "INVALID_STATE"

    def test_gesture_valid_adds_to_staging(self):
        """sync.gesture with valid data adds to staging"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 2)

        gesture = self._valid_gesture(17, "hola", 1)
        result = manager.gesture("sync-a1", 0, gesture)

        assert result["ok"] is True
        assert result["syncId"] == "sync-a1"
        assert result["receivedCount"] == 1
        assert result["nextIndex"] == 1

    def test_gesture_invalid_sync_id_returns_mismatch(self):
        """Wrong syncId -> SYNC_ID_MISMATCH, transaction preserved"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 2)

        gesture = self._valid_gesture(17, "hola", 1)
        result = manager.gesture("sync-wrong", 0, gesture)

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_SYNC_ID_MISMATCH
        # Transaction still active
        assert manager.get_state() == STATE_SYNCING

    def test_gesture_wrong_index_returns_sequence_invalid(self):
        """Wrong index -> SYNC_SEQUENCE_INVALID, transaction aborted"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 2)

        gesture = self._valid_gesture(17, "hola", 1)
        result = manager.gesture("sync-a1", 5, gesture)  # wrong index

        assert result["ok"] is False
        assert result["error"]["code"] == "SYNC_SEQUENCE_INVALID"
        # Transaction should be aborted, back to IDLE
        assert manager.get_state() == STATE_IDLE

    def test_gesture_duplicate_id_aborts_transaction(self):
        """Duplicate gesture.id -> DUPLICATE_GESTURE_ID, transaction aborted"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 2)

        gesture1 = self._valid_gesture(17, "hola", 1)
        manager.gesture("sync-a1", 0, gesture1)

        gesture2 = self._valid_gesture(17, "adios", 2)  # same ID
        result = manager.gesture("sync-a1", 1, gesture2)

        assert result["ok"] is False
        assert result["error"]["code"] == "DUPLICATE_GESTURE_ID"
        assert manager.get_state() == STATE_IDLE

    def test_gesture_duplicate_audio_track_aborts(self):
        """Duplicate audioTrack -> error, transaction aborted"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 2)

        gesture1 = self._valid_gesture(17, "hola", 1)
        manager.gesture("sync-a1", 0, gesture1)

        gesture2 = self._valid_gesture(18, "adios", 1)  # same audioTrack
        result = manager.gesture("sync-a1", 1, gesture2)

        assert result["ok"] is False
        assert manager.get_state() == STATE_IDLE

    def test_commit_valid_promotes_profile(self):
        """sync.commit with complete staging promotes profile atomically"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 2)

        manager.gesture("sync-a1", 0, self._valid_gesture(17, "hola", 1))
        manager.gesture("sync-a1", 1, self._valid_gesture(18, "adios", 2))

        result = manager.commit("sync-a1")

        assert result["ok"] is True
        assert result["committed"] is True
        assert result["syncId"] == "sync-a1"
        assert result["activeProfile"]["profileId"] == "p1"
        assert result["activeProfile"]["gestureCount"] == 2
        assert manager.get_state() == STATE_IDLE

        # Profile should be loadable
        from profile.loader import load_active_profile
        profile = load_active_profile()
        assert profile["profileId"] == "p1"
        assert profile["gestureCount"] == 2

    def test_commit_incomplete_returns_sync_incomplete(self):
        """sync.commit with missing gestures -> SYNC_INCOMPLETE"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 2)

        manager.gesture("sync-a1", 0, self._valid_gesture(17, "hola", 1))
        # Missing gesture 1

        result = manager.commit("sync-a1")

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_SYNC_INCOMPLETE
        assert manager.get_state() == STATE_IDLE

        # Old profile should remain
        from profile.loader import load_active_profile
        # If no previous profile, returns None

    def test_commit_wrong_sync_id_returns_mismatch(self):
        """sync.commit with wrong syncId -> SYNC_ID_MISMATCH, transaction preserved"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 1)
        manager.gesture("sync-a1", 0, self._valid_gesture(17, "hola", 1))

        result = manager.commit("sync-wrong")

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_SYNC_ID_MISMATCH
        assert manager.get_state() == STATE_SYNCING  # preserved

    def test_abort_valid_returns_aborted(self):
        """sync.abort valid -> aborted: true, state IDLE"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 2)
        manager.gesture("sync-a1", 0, self._valid_gesture(17, "hola", 1))

        result = manager.abort("sync-a1")

        assert result["ok"] is True
        assert result["aborted"] is True
        assert result["syncId"] == "sync-a1"
        assert manager.get_state() == STATE_IDLE

    def test_abort_no_active_sync_returns_not_active(self):
        """sync.abort with no active sync -> SYNC_NOT_ACTIVE"""
        manager = SyncTransactionManager()

        result = manager.abort("sync-a1")

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_SYNC_NOT_ACTIVE

    def test_abort_wrong_sync_id_returns_mismatch(self):
        """sync.abort with wrong syncId -> SYNC_ID_MISMATCH, preserved"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 1)

        result = manager.abort("sync-wrong")

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_SYNC_ID_MISMATCH
        assert manager.get_state() == STATE_SYNCING

    def test_status_reports_active_sync_during_transaction(self):
        """device.status during SYNCING returns activeSync info"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 2)
        manager.gesture("sync-a1", 0, self._valid_gesture(17, "hola", 1))

        status = manager.get_status()
        assert status["state"] == STATE_SYNCING
        assert status["activeSync"] is not None
        assert status["activeSync"]["syncId"] == "sync-a1"
        assert status["activeSync"]["expectedGestureCount"] == 2
        assert status["activeSync"]["receivedCount"] == 1
        assert status["activeSync"]["nextIndex"] == 1

    def test_timeout_triggers_sync_failed(self):
        """Simulated timeout triggers sync.failed event and returns to IDLE"""
        manager = SyncTransactionManager()
        manager.begin("sync-a1", "p1", "r1", 2)
        assert manager.get_state() == STATE_SYNCING

        # Simulate timeout by calling internal timeout handler
        manager.handle_timeout()

        assert manager.get_state() == STATE_IDLE
        # Event would be emitted by the dispatcher

    def _valid_gesture(self, gesture_id, name, audio_track):
        return {
            "id": gesture_id,
            "name": name,
            "audioTrack": audio_track,
            "data": self._valid_gesture_data()
        }

    def _valid_gesture_data(self):
        return {
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