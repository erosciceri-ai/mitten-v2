"""Tests for storage layer: file I/O, atomic promotion, boot recovery."""

import json
import os
import tempfile
import shutil

import pytest

from storage.files import (
    read_json_file,
    write_json_file,
    safe_remove,
    file_exists,
    list_files,
)
from storage.atomic import (
    atomic_write_and_promote,
    promote_profile,
    validate_profile_file,
)
from profile.loader import load_active_profile, validate_profile_structure


class TestStorageFiles:
    """Basic file operations."""

    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.old_cwd = os.getcwd()
        os.chdir(self.tmpdir)

    def teardown_method(self):
        os.chdir(self.old_cwd)
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_read_write_json_file(self):
        data = {"version": 1, "profileId": "p1", "gestureCount": 0, "gestures": []}
        write_json_file("test.json", data)
        result = read_json_file("test.json")
        assert result == data

    def test_read_nonexistent_file_returns_none(self):
        assert read_json_file("nonexistent.json") is None

    def test_safe_remove_existing_file(self):
        write_json_file("test.json", {})
        assert file_exists("test.json")
        safe_remove("test.json")
        assert not file_exists("test.json")

    def test_safe_remove_nonexistent_file_no_error(self):
        safe_remove("nonexistent.json")  # Should not raise

    def test_file_exists(self):
        write_json_file("test.json", {})
        assert file_exists("test.json")
        assert not file_exists("missing.json")

    def test_list_files(self):
        write_json_file("a.json", {})
        write_json_file("b.json", {})
        files = list_files("*.json")
        assert "a.json" in files
        assert "b.json" in files


class TestValidateProfileFile:
    """Profile file validation per synchronization.md section 7."""

    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.old_cwd = os.getcwd()
        os.chdir(self.tmpdir)

    def teardown_method(self):
        os.chdir(self.old_cwd)
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_valid_profile_passes(self):
        profile = {
            "version": 1,
            "profileId": "profile-42",
            "profileRevision": "rev-7",
            "gestureCount": 1,
            "gestures": [{
                "id": 17,
                "name": "hola",
                "audioTrack": 1,
                "data": self._valid_gesture_data()
            }]
        }
        write_json_file("gestures.json", profile)
        assert validate_profile_file("gestures.json") is True

    def test_invalid_json_returns_false(self):
        with open("gestures.json", "w") as f:
            f.write("not json")
        assert validate_profile_file("gestures.json") is False

    def test_missing_version_fails(self):
        profile = {
            "profileId": "p1",
            "profileRevision": "r1",
            "gestureCount": 0,
            "gestures": []
        }
        write_json_file("gestures.json", profile)
        assert validate_profile_file("gestures.json") is False

    def test_wrong_version_fails(self):
        profile = {
            "version": 2,
            "profileId": "p1",
            "profileRevision": "r1",
            "gestureCount": 0,
            "gestures": []
        }
        write_json_file("gestures.json", profile)
        assert validate_profile_file("gestures.json") is False

    def test_missing_profileId_fails(self):
        profile = {
            "version": 1,
            "profileRevision": "r1",
            "gestureCount": 0,
            "gestures": []
        }
        write_json_file("gestures.json", profile)
        assert validate_profile_file("gestures.json") is False

    def test_missing_profileRevision_fails(self):
        profile = {
            "version": 1,
            "profileId": "p1",
            "gestureCount": 0,
            "gestures": []
        }
        write_json_file("gestures.json", profile)
        assert validate_profile_file("gestures.json") is False

    def test_gestureCount_mismatch_fails(self):
        profile = {
            "version": 1,
            "profileId": "p1",
            "profileRevision": "r1",
            "gestureCount": 2,
            "gestures": [{"id": 1, "name": "a", "audioTrack": 1, "data": self._valid_gesture_data()}]
        }
        write_json_file("gestures.json", profile)
        assert validate_profile_file("gestures.json") is False

    def test_duplicate_gesture_id_fails(self):
        profile = {
            "version": 1,
            "profileId": "p1",
            "profileRevision": "r1",
            "gestureCount": 2,
            "gestures": [
                {"id": 17, "name": "a", "audioTrack": 1, "data": self._valid_gesture_data()},
                {"id": 17, "name": "b", "audioTrack": 2, "data": self._valid_gesture_data()}
            ]
        }
        write_json_file("gestures.json", profile)
        assert validate_profile_file("gestures.json") is False

    def test_duplicate_audioTrack_fails(self):
        profile = {
            "version": 1,
            "profileId": "p1",
            "profileRevision": "r1",
            "gestureCount": 2,
            "gestures": [
                {"id": 17, "name": "a", "audioTrack": 1, "data": self._valid_gesture_data()},
                {"id": 18, "name": "b", "audioTrack": 1, "data": self._valid_gesture_data()}
            ]
        }
        write_json_file("gestures.json", profile)
        assert validate_profile_file("gestures.json") is False

    def test_audioTrack_out_of_range_fails(self):
        profile = {
            "version": 1,
            "profileId": "p1",
            "profileRevision": "r1",
            "gestureCount": 1,
            "gestures": [{"id": 17, "name": "a", "audioTrack": 51, "data": self._valid_gesture_data()}]
        }
        write_json_file("gestures.json", profile)
        assert validate_profile_file("gestures.json") is False

    def test_invalid_gesture_data_fails(self):
        profile = {
            "version": 1,
            "profileId": "p1",
            "profileRevision": "r1",
            "gestureCount": 1,
            "gestures": [{"id": 17, "name": "a", "audioTrack": 1, "data": {"version": 1}}]
        }
        write_json_file("gestures.json", profile)
        assert validate_profile_file("gestures.json") is False

    def test_empty_profile_valid(self):
        profile = {
            "version": 1,
            "profileId": "p1",
            "profileRevision": "r1",
            "gestureCount": 0,
            "gestures": []
        }
        write_json_file("gestures.json", profile)
        assert validate_profile_file("gestures.json") is True

    def _valid_gesture_data(self):
        return {
            "version": 1,
            "dimensions": 7,
            "dimensionOrder": ["flex1","flex2","flex3","flex4","flex5","mpuX","mpuY"],
            "units": {"flex": "adc12", "mpu": "degrees"},
            "samples": [[3000.0, 3000.0, 3000.0, 3000.0, 3000.0, 0.0, 0.0]],
            "summary": {
                "min": [3000.0, 3000.0, 3000.0, 3000.0, 3000.0, 0.0, 0.0],
                "max": [3000.0, 3000.0, 3000.0, 3000.0, 3000.0, 0.0, 0.0],
                "mean": [3000.0, 3000.0, 3000.0, 3000.0, 3000.0, 0.0, 0.0]
            },
            "sampleCount": 1,
            "captureDurationMs": 100,
            "samplingPeriodMs": 100
        }


class TestBootRecovery:
    """Boot recovery scenarios per synchronization.md section 7."""

    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.old_cwd = os.getcwd()
        os.chdir(self.tmpdir)

    def teardown_method(self):
        os.chdir(self.old_cwd)
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_valid_gestures_json_loads_and_removes_staging(self):
        """gestures.json valid + gestures.staging exists -> load json, remove staging"""
        profile = {
            "version": 1,
            "profileId": "p1",
            "profileRevision": "r1",
            "gestureCount": 1,
            "gestures": [{"id": 1, "name": "a", "audioTrack": 1, "data": self._valid_gesture_data()}]
        }
        write_json_file("gestures.json", profile)
        write_json_file("gestures.staging", {"junk": "data"})  # orphaned staging

        result = load_active_profile()
        assert result is not None
        assert result["profileId"] == "p1"
        assert not file_exists("gestures.staging")

    def test_valid_gestures_json_and_valid_tmp_keeps_json(self):
        """gestures.json valid + gestures.json.tmp valid -> json has priority, tmp removed"""
        profile = {
            "version": 1,
            "profileId": "p1",
            "profileRevision": "r1",
            "gestureCount": 1,
            "gestures": [{"id": 1, "name": "a", "audioTrack": 1, "data": self._valid_gesture_data()}]
        }
        write_json_file("gestures.json", profile)

        tmp_profile = {
            "version": 1,
            "profileId": "p2",
            "profileRevision": "r2",
            "gestureCount": 0,
            "gestures": []
        }
        write_json_file("gestures.json.tmp", tmp_profile)

        result = load_active_profile()
        assert result["profileId"] == "p1"  # main has priority
        assert not file_exists("gestures.json.tmp")

    def test_corrupt_json_valid_tmp_recovers_tmp(self):
        """gestures.json corrupt + gestures.json.tmp valid -> rename tmp to json, load it"""
        # Write invalid JSON directly
        with open("gestures.json", "w") as f:
            f.write("{ invalid json")
        # The file is corrupt, read_json_file will return None

        tmp_profile = {
            "version": 1,
            "profileId": "p-recovered",
            "profileRevision": "r-recovered",
            "gestureCount": 1,
            "gestures": [{"id": 1, "name": "a", "audioTrack": 1, "data": self._valid_gesture_data()}]
        }
        write_json_file("gestures.json.tmp", tmp_profile)

        result = load_active_profile()
        assert result is not None
        assert result["profileId"] == "p-recovered"
        assert file_exists("gestures.json")  # promoted

    def test_corrupt_json_invalid_tmp_no_profile(self):
        """gestures.json corrupt + gestures.json.tmp invalid -> no profile"""
        # Write invalid JSON directly
        with open("gestures.json", "w") as f:
            f.write("{ invalid json")
        with open("gestures.json.tmp", "w") as f:
            f.write("{ also invalid")

        result = load_active_profile()
        assert result is None
        assert not file_exists("gestures.json.tmp")  # cleaned up

    def test_no_files_returns_none(self):
        """No gestures.json and no .tmp -> None"""
        result = load_active_profile()
        assert result is None

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


class TestAtomicPromotion:
    """Atomic commit promotion per synchronization.md section 5."""

    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.old_cwd = os.getcwd()
        os.chdir(self.tmpdir)

    def teardown_method(self):
        os.chdir(self.old_cwd)
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_atomic_write_and_promote_creates_valid_profile(self):
        """atomic_write_and_promote writes .tmp, validates, promotes to target"""
        profile = {
            "version": 1,
            "profileId": "p1",
            "profileRevision": "r1",
            "gestureCount": 1,
            "gestures": [{"id": 1, "name": "a", "audioTrack": 1, "data": self._valid_gesture_data()}]
        }

        success = atomic_write_and_promote("gestures.json", profile)
        assert success is True
        assert file_exists("gestures.json")
        assert not file_exists("gestures.json.tmp")

        loaded = read_json_file("gestures.json")
        assert loaded["profileId"] == "p1"

    def test_atomic_promote_fails_on_invalid_data(self):
        """Invalid profile data -> promotion fails, target unchanged"""
        # Create valid initial profile
        initial = {
            "version": 1,
            "profileId": "initial",
            "profileRevision": "r0",
            "gestureCount": 0,
            "gestures": []
        }
        write_json_file("gestures.json", initial)

        # Try to promote invalid profile (missing version)
        invalid = {"profileId": "p1", "profileRevision": "r1", "gestureCount": 0, "gestures": []}

        success = atomic_write_and_promote("gestures.json", invalid)
        assert success is False

        # Original profile should remain intact
        loaded = read_json_file("gestures.json")
        assert loaded["profileId"] == "initial"
        assert not file_exists("gestures.json.tmp")

    def test_promote_profile_renames_tmp_to_target(self):
        """promote_profile renames .tmp to target atomically"""
        tmp_data = {"version": 1, "profileId": "p1", "profileRevision": "r1", "gestureCount": 0, "gestures": []}
        write_json_file("gestures.json.tmp", tmp_data)

        promote_profile("gestures.json.tmp", "gestures.json")

        assert file_exists("gestures.json")
        assert not file_exists("gestures.json.tmp")
        loaded = read_json_file("gestures.json")
        assert loaded["profileId"] == "p1"

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