"""Tests for calibration state machine and offset management."""

import pytest
from sensors import CalibrationData


class TestCalibrationData:
    """Calibration data structure."""

    def test_default_values(self):
        """Default calibration has identity values for normalization."""
        cal = CalibrationData()
        # Initial values set for incremental min/max update
        assert cal.flex_min == [4095]*5
        assert cal.flex_max == [0]*5
        assert cal.mpu_x_offset == 0.0
        assert cal.mpu_y_offset == 0.0
        assert cal.mpu_z_offset == 0.0
        assert cal.is_valid is False

    def test_apply_preserves_raw_adc(self):
        cal = CalibrationData()
        cal.flex_min = [100]*5
        cal.flex_max = [3000]*5
        for raw in ([100]*5, [3000]*5, [1550]*5):
            assert cal.apply(raw + [0,0])[:5] == raw

    def test_apply_mpu_offsets(self):
        """apply() subtracts MPU offsets."""
        cal = CalibrationData()
        cal.mpu_x_offset = 2.5
        cal.mpu_y_offset = -1.5
        cal.mpu_z_offset = 0.5
        
        raw = [0]*5 + [10.0, 20.0]  # 5 flex + 2 MPU (x, y)
        result = cal.apply(raw)
        assert len(result) == 7
        assert abs(result[5] - 7.5) < 0.01
        assert abs(result[6] - 21.5) < 0.01

    def test_serialize_deserialize(self):
        """CalibrationData can be serialized and restored."""
        cal = CalibrationData()
        cal.flex_min = [50]*5
        cal.flex_max = [3500]*5
        cal.mpu_x_offset = 1.0
        cal.mpu_y_offset = -2.0
        cal.mpu_z_offset = 0.5
        cal.is_valid = True
        
        data = cal.to_dict()
        restored = CalibrationData.from_dict(data)
        
        assert restored.flex_min == cal.flex_min
        assert restored.flex_max == cal.flex_max
        assert restored.mpu_x_offset == cal.mpu_x_offset
        assert restored.mpu_y_offset == cal.mpu_y_offset
        assert restored.mpu_z_offset == cal.mpu_z_offset
        assert restored.is_valid is True
