"""Tests for staging manager: transactional NDJSON staging."""

import json
import os
import tempfile
import shutil

import pytest

from staging.manager import StagingManager
from staging.validator import validate_gesture_for_staging
from config import (
    ERR_GESTURE_INVALID,
    ERR_DUPLICATE_GESTURE_ID,
    ERR_SYNC_SEQUENCE_INVALID,
    ERR_SYNC_ID_MISMATCH,
    ERR_SYNC_NOT_ACTIVE,
    MAX_GESTURES,
)


class TestStagingManager:
    """Staging manager tests per synchronization.md section 4."""

    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.old_cwd = os.getcwd()
        os.chdir(self.tmpdir)
        self.manager = StagingManager(staging_path="gestures.staging")

    def teardown_method(self):
        os.chdir(self.old_cwd)
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_begin_creates_staging_file_with_header(self):
        """sync.begin creates staging file with header line"""
        result = self.manager.begin(
            sync_id="sync-a1",
            profile_id="profile-42",
            profile_revision="rev-7",
            expected_count=2
        )
        assert result is True
        assert os.path.exists("gestures.staging")

        with open("gestures.staging", "r") as f:
            lines = f.readlines()

        assert len(lines) == 1
        header = json.loads(lines[0])
        assert header["version"] == 1
        assert header["profileId"] == "profile-42"
        assert header["profileRevision"] == "rev-7"
        assert header["expectedGestureCount"] == 2

    def test_begin_initializes_ram_state(self):
        """sync.begin initializes RAM state correctly"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)

        state = self.manager.get_state()
        assert state["sync_id"] == "sync-a1"
        assert state["profile_id"] == "profile-42"
        assert state["profile_revision"] == "rev-7"
        assert state["expected_count"] == 2
        assert state["received_count"] == 0
        assert state["received_ids"] == set()
        assert state["received_tracks"] == set()

    def test_begin_fails_if_staging_exists(self):
        """sync.begin fails if staging file already exists (cleanup first)"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)
        result = self.manager.begin("sync-a2", "profile-43", "rev-8", 1)
        assert result is False  # Should fail because staging exists

    def test_add_gesture_valid_appends_to_staging(self):
        """Valid gesture appended to staging, counters updated"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)

        gesture = self._valid_gesture(17, "hola", 1)
        result = self.manager.add_gesture("sync-a1", 0, gesture)

        assert result["ok"] is True
        assert result["receivedCount"] == 1
        assert result["nextIndex"] == 1

        with open("gestures.staging", "r") as f:
            lines = f.readlines()
        assert len(lines) == 2  # header + 1 gesture
        stored_gesture = json.loads(lines[1])
        assert stored_gesture["id"] == 17

    def test_add_gesture_increments_received_count(self):
        """received_count increments with each valid gesture"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 3)

        for i in range(3):
            gesture = self._valid_gesture(10 + i, f"gesture{i}", i + 1)
            result = self.manager.add_gesture("sync-a1", i, gesture)
            assert result["receivedCount"] == i + 1
            assert result["nextIndex"] == i + 1

    def test_add_gesture_wrong_sync_id_returns_mismatch(self):
        """Wrong syncId -> SYNC_ID_MISMATCH, staging unchanged"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)

        gesture = self._valid_gesture(17, "hola", 1)
        result = self.manager.add_gesture("sync-wrong", 0, gesture)

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_SYNC_ID_MISMATCH

        # Staging should still have only header
        with open("gestures.staging", "r") as f:
            lines = f.readlines()
        assert len(lines) == 1

    def test_add_gesture_wrong_index_returns_sequence_invalid(self):
        """Index != nextIndex -> SYNC_SEQUENCE_INVALID, staging discarded"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)

        gesture = self._valid_gesture(17, "hola", 1)
        result = self.manager.add_gesture("sync-a1", 5, gesture)  # wrong index

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_SYNC_SEQUENCE_INVALID
        # Staging should be discarded
        assert not os.path.exists("gestures.staging")

    def test_add_gesture_exceeds_expected_count_fails(self):
        """More gestures than expected -> error, staging discarded"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 1)

        gesture = self._valid_gesture(17, "hola", 1)
        result = self.manager.add_gesture("sync-a1", 0, gesture)
        assert result["ok"] is True

        # Try to add another
        gesture2 = self._valid_gesture(18, "adios", 2)
        result = self.manager.add_gesture("sync-a1", 1, gesture2)
        assert result["ok"] is False
        assert result["error"]["code"] == ERR_SYNC_SEQUENCE_INVALID  # or appropriate error

    def test_add_gesture_duplicate_id_fails_and_discards_staging(self):
        """Duplicate gesture.id -> DUPLICATE_GESTURE_ID, staging discarded"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)

        gesture1 = self._valid_gesture(17, "hola", 1)
        self.manager.add_gesture("sync-a1", 0, gesture1)

        gesture2 = self._valid_gesture(17, "adios", 2)  # same ID
        result = self.manager.add_gesture("sync-a1", 1, gesture2)

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_DUPLICATE_GESTURE_ID
        assert not os.path.exists("gestures.staging")

    def test_add_gesture_duplicate_audio_track_fails(self):
        """Duplicate audioTrack -> error, staging discarded"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)

        gesture1 = self._valid_gesture(17, "hola", 1)
        self.manager.add_gesture("sync-a1", 0, gesture1)

        gesture2 = self._valid_gesture(18, "adios", 1)  # same audioTrack
        result = self.manager.add_gesture("sync-a1", 1, gesture2)

        assert result["ok"] is False
        assert not os.path.exists("gestures.staging")

    def test_add_gesture_invalid_gesture_fails_and_discards(self):
        """Invalid gesture data -> GESTURE_INVALID, staging discarded"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)

        invalid_gesture = {"id": 17, "name": "hola", "audioTrack": 1, "data": {"version": 1}}
        result = self.manager.add_gesture("sync-a1", 0, invalid_gesture)

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_GESTURE_INVALID
        assert not os.path.exists("gestures.staging")

    def test_abort_removes_staging_and_resets_state(self):
        """sync.abort removes staging file and resets RAM state"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)
        self.manager.add_gesture("sync-a1", 0, self._valid_gesture(17, "hola", 1))

        result = self.manager.abort("sync-a1")

        assert result["ok"] is True
        assert result["aborted"] is True
        assert not os.path.exists("gestures.staging")
        assert self.manager.get_state()["sync_id"] is None

    def test_abort_wrong_sync_id_returns_mismatch(self):
        """sync.abort with wrong syncId -> SYNC_ID_MISMATCH, staging preserved"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)
        self.manager.add_gesture("sync-a1", 0, self._valid_gesture(17, "hola", 1))

        result = self.manager.abort("sync-wrong")

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_SYNC_ID_MISMATCH
        assert os.path.exists("gestures.staging")

    def test_abort_no_active_sync_returns_not_active(self):
        """sync.abort with no active sync -> SYNC_NOT_ACTIVE"""
        result = self.manager.abort("sync-a1")

        assert result["ok"] is False
        assert result["error"]["code"] == ERR_SYNC_NOT_ACTIVE

    def test_commit_validates_all_gestures_received(self):
        """sync.commit verifies received_count == expected_count"""
        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)
        # Only add 1 of 2 expected
        self.manager.add_gesture("sync-a1", 0, self._valid_gesture(17, "hola", 1))

        result = self.manager.commit("sync-a1")

        assert result["ok"] is False
        assert result["error"]["code"] == "SYNC_INCOMPLETE"

    def test_is_active_returns_correct_state(self):
        """is_active returns True only during active transaction"""
        assert self.manager.is_active() is False

        self.manager.begin("sync-a1", "profile-42", "rev-7", 2)
        assert self.manager.is_active() is True

        self.manager.abort("sync-a1")
        assert self.manager.is_active() is False

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


class TestStagingValidator:
    """Gesture validation for staging per synchronization.md section 4."""

    def test_valid_gesture_passes(self):
        gesture = {
            "id": 17,
            "name": "hola",
            "audioTrack": 1,
            "data": self._valid_gesture_data()
        }
        valid, error = validate_gesture_for_staging(gesture)
        assert valid is True
        assert error is None

    def test_missing_id_fails(self):
        gesture = {"name": "hola", "audioTrack": 1, "data": self._valid_gesture_data()}
        valid, error = validate_gesture_for_staging(gesture)
        assert valid is False
        assert "id" in error.lower()

    def test_invalid_id_range_fails(self):
        for bad_id in [0, -1, 2147483648]:
            gesture = {"id": bad_id, "name": "hola", "audioTrack": 1, "data": self._valid_gesture_data()}
            valid, error = validate_gesture_for_staging(gesture)
            assert valid is False

    def test_missing_name_fails(self):
        gesture = {"id": 17, "audioTrack": 1, "data": self._valid_gesture_data()}
        valid, error = validate_gesture_for_staging(gesture)
        assert valid is False

    def test_name_too_long_fails(self):
        gesture = {"id": 17, "name": "x" * 61, "audioTrack": 1, "data": self._valid_gesture_data()}
        valid, error = validate_gesture_for_staging(gesture)
        assert valid is False

    def test_name_with_control_chars_fails(self):
        gesture = {"id": 17, "name": "hola\x00", "audioTrack": 1, "data": self._valid_gesture_data()}
        valid, error = validate_gesture_for_staging(gesture)
        assert valid is False

    def test_invalid_audio_track_range_fails(self):
        for bad_track in [0, -1, 51]:
            gesture = {"id": 17, "name": "hola", "audioTrack": bad_track, "data": self._valid_gesture_data()}
            valid, error = validate_gesture_for_staging(gesture)
            assert valid is False

    def test_missing_data_fails(self):
        gesture = {"id": 17, "name": "hola", "audioTrack": 1}
        valid, error = validate_gesture_for_staging(gesture)
        assert valid is False

    def test_invalid_gesture_data_fails(self):
        gesture = {"id": 17, "name": "hola", "audioTrack": 1, "data": {"version": 1}}
        valid, error = validate_gesture_for_staging(gesture)
        assert valid is False

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