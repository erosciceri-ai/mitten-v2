"""Tests for gesture data and metadata validation (MicroPython-native equivalent to contracts)."""

import pytest

from validation.gesture import (
    validate_gesture_metadata,
    validate_gesture_data,
    validate_gesture,
    GESTURE_CONSTRAINTS,
)
from validation.data import (
    validate_gesture_data as validate_data,
    is_value_in_dimension_range,
)


class TestGestureMetadataValidation:
    """Gesture metadata validation per gesture-format.md section 2.1."""

    def _valid_metadata(self):
        return {"id": 17, "name": "hola", "audioTrack": 1}

    def test_valid_metadata_passes(self):
        valid, errors = validate_gesture_metadata(self._valid_metadata())
        assert valid is True
        assert errors == []

    def test_missing_id_fails(self):
        meta = {"name": "hola", "audioTrack": 1}
        valid, errors = validate_gesture_metadata(meta)
        assert valid is False
        assert any("id" in e.lower() for e in errors)

    def test_id_below_min_fails(self):
        meta = {"id": 0, "name": "hola", "audioTrack": 1}
        valid, errors = validate_gesture_metadata(meta)
        assert valid is False

    def test_id_above_max_fails(self):
        meta = {"id": 2147483648, "name": "hola", "audioTrack": 1}
        valid, errors = validate_gesture_metadata(meta)
        assert valid is False

    def test_non_integer_id_fails(self):
        meta = {"id": 17.5, "name": "hola", "audioTrack": 1}
        valid, errors = validate_gesture_metadata(meta)
        assert valid is False

    def test_missing_name_fails(self):
        meta = {"id": 17, "audioTrack": 1}
        valid, errors = validate_gesture_metadata(meta)
        assert valid is False

    def test_name_empty_fails(self):
        meta = {"id": 17, "name": "", "audioTrack": 1}
        valid, errors = validate_gesture_metadata(meta)
        assert valid is False

    def test_name_too_long_fails(self):
        meta = {"id": 17, "name": "x" * 61, "audioTrack": 1}
        valid, errors = validate_gesture_metadata(meta)
        assert valid is False

    def test_name_with_control_chars_fails(self):
        for ctrl in ["\x00", "\x1f", "\x7f"]:
            meta = {"id": 17, "name": f"hola{ctrl}", "audioTrack": 1}
            valid, errors = validate_gesture_metadata(meta)
            assert valid is False

    def test_missing_audio_track_fails(self):
        meta = {"id": 17, "name": "hola"}
        valid, errors = validate_gesture_metadata(meta)
        assert valid is False

    def test_audio_track_below_min_fails(self):
        meta = {"id": 17, "name": "hola", "audioTrack": 0}
        valid, errors = validate_gesture_metadata(meta)
        assert valid is False

    def test_audio_track_above_max_fails(self):
        meta = {"id": 17, "name": "hola", "audioTrack": 51}
        valid, errors = validate_gesture_metadata(meta)
        assert valid is False

    def test_non_integer_audio_track_fails(self):
        meta = {"id": 17, "name": "hola", "audioTrack": 1.5}
        valid, errors = validate_gesture_metadata(meta)
        assert valid is False


class TestGestureDataValidation:
    """Gesture data validation per gesture-format.md section 3."""

    def _valid_data(self):
        return {
            "version": 1,
            "dimensions": 7,
            "dimensionOrder": ["flex1","flex2","flex3","flex4","flex5","mpuX","mpuY"],
            "units": {"flex": "adc12", "mpu": "degrees"},
            "samples": [[3000.0, 3000.0, 3000.0, 3000.0, 3000.0, 0.0, 0.0]],
            "summary": {
                "min": [3000.0]*5 + [0.0, 0.0],
                "max": [3000.0]*5 + [0.0, 0.0],
                "mean": [3000.0]*5 + [0.0, 0.0]
            },
            "sampleCount": 1,
            "captureDurationMs": 100,
            "samplingPeriodMs": 100
        }

    def test_valid_data_passes(self):
        valid, errors = validate_gesture_data(self._valid_data())
        assert valid is True
        assert errors == []

    def test_missing_version_fails(self):
        data = self._valid_data()
        del data["version"]
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_wrong_version_fails(self):
        data = self._valid_data()
        data["version"] = 2
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_wrong_dimensions_fails(self):
        data = self._valid_data()
        data["dimensions"] = 8
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_wrong_dimension_order_fails(self):
        data = self._valid_data()
        data["dimensionOrder"] = ["a","b","c","d","e","f","g"]
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_wrong_units_fails(self):
        data = self._valid_data()
        data["units"] = {"flex": "volts", "mpu": "rad"}
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_samples_wrong_length_fails(self):
        data = self._valid_data()
        data["samples"] = [[3000.0]*8]
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_samples_count_mismatch_fails(self):
        data = self._valid_data()
        data["sampleCount"] = 5
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_summary_min_max_mean_wrong_length_fails(self):
        data = self._valid_data()
        data["summary"]["min"] = [3000.0]*6
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_min_greater_than_mean_fails(self):
        data = self._valid_data()
        data["summary"]["mean"][0] = 2000.0  # mean < min
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_mean_greater_than_max_fails(self):
        data = self._valid_data()
        data["summary"]["mean"][0] = 4000.0  # mean > max
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_flex_value_out_of_range_fails(self):
        data = self._valid_data()
        data["samples"][0][0] = 5000  # > 4095
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_mpu_value_out_of_range_fails(self):
        data = self._valid_data()
        data["samples"][0][5] = 200  # > 180
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_capture_duration_zero_fails(self):
        data = self._valid_data()
        data["captureDurationMs"] = 0
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_capture_duration_too_large_fails(self):
        data = self._valid_data()
        data["captureDurationMs"] = 10001
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_sampling_period_zero_fails(self):
        data = self._valid_data()
        data["samplingPeriodMs"] = 0
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_sampling_period_too_large_fails(self):
        data = self._valid_data()
        data["samplingPeriodMs"] = 1001
        valid, errors = validate_gesture_data(data)
        assert valid is False

    def test_incompatible_v1_fields_rejected(self):
        data = self._valid_data()
        data["min"] = [1,2,3,4,5,6,7]  # V1 field
        valid, errors = validate_gesture_data(data)
        assert valid is False


class TestFullGestureValidation:
    """Complete gesture (metadata + data) validation."""

    def _valid_gesture(self):
        return {
            "id": 17,
            "name": "hola",
            "audioTrack": 1,
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

    def test_valid_gesture_passes(self):
        valid, errors = validate_gesture(self._valid_gesture())
        assert valid is True
        assert errors == []

    def test_invalid_metadata_fails(self):
        gesture = self._valid_gesture()
        gesture["name"] = ""
        valid, errors = validate_gesture(gesture)
        assert valid is False

    def test_invalid_data_fails(self):
        gesture = self._valid_gesture()
        gesture["data"]["version"] = 2
        valid, errors = validate_gesture(gesture)
        assert valid is False


class TestDimensionRangeHelper:
    """Helper function for value range checking."""

    def test_flex_dimensions_0_4_range(self):
        assert is_value_in_dimension_range(0, 0) is True
        assert is_value_in_dimension_range(4095, 4) is True
        assert is_value_in_dimension_range(-1, 0) is False
        assert is_value_in_dimension_range(4096, 4) is False

    def test_mpu_dimensions_5_6_range(self):
        assert is_value_in_dimension_range(-180, 5) is True
        assert is_value_in_dimension_range(180, 6) is True
        assert is_value_in_dimension_range(-181, 5) is False
        assert is_value_in_dimension_range(181, 6) is False