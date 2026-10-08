"""Sensor drivers for flex ADC and MPU6050 IMU."""

import time
from utils.time import time_ms, sleep_ms


class CalibrationData:
    """Calibration offsets for sensor normalization."""

    __slots__ = ('flex_min', 'flex_max', 'mpu_x_offset', 'mpu_y_offset', 'mpu_z_offset', 'is_valid')

    def __init__(self):
        self.flex_min = [4095, 4095, 4095, 4095, 4095]
        self.flex_max = [0, 0, 0, 0, 0]
        self.mpu_x_offset = 0.0
        self.mpu_y_offset = 0.0
        self.mpu_z_offset = 0.0
        self.is_valid = False

    def apply(self, raw_values):
        """Apply calibration to raw 7D sensor vector."""
        if len(raw_values) != 7:
            raise ValueError("Expected 7 values (5 flex + 2 MPU)")
        
        # GestureFormat V1 requires ADC raw values, never min/max rescaling.
        result = list(raw_values)
        result[5] = (raw_values[5] - self.mpu_x_offset + 180) % 360 - 180
        result[6] = (raw_values[6] - self.mpu_y_offset + 180) % 360 - 180

        return result

    def to_dict(self):
        """Serialize to dictionary."""
        return {
            'flex_min': self.flex_min[:],
            'flex_max': self.flex_max[:],
            'mpu_x_offset': self.mpu_x_offset,
            'mpu_y_offset': self.mpu_y_offset,
            'mpu_z_offset': self.mpu_z_offset,
            'is_valid': self.is_valid
        }

    @classmethod
    def from_dict(cls, data):
        """Deserialize from dictionary."""
        cal = cls()
        cal.flex_min = data.get('flex_min', [0]*5)
        cal.flex_max = data.get('flex_max', [4095]*5)
        cal.mpu_x_offset = data.get('mpu_x_offset', 0.0)
        cal.mpu_y_offset = data.get('mpu_y_offset', 0.0)
        cal.mpu_z_offset = data.get('mpu_z_offset', 0.0)
        cal.is_valid = data.get('is_valid', False)
        return cal


class FlexSensorArray:
    """Five injected machine.ADC-compatible channels; no assumed GPIO."""
    def __init__(self, adcs):
        if len(adcs) != 5:
            raise ValueError("Five ADC channels required in flex1..flex5 order")
        self.channel_count = 5
        self.channels = list(range(5))
        self._adcs = adcs

    def read_channel(self, channel):
        if not 0 <= channel < 5:
            raise ValueError("Channel must be 0-4")
        # machine.ADC.read_u16 has a portable full-scale range of 0..65535.
        value = self._adcs[channel].read_u16()
        if not 0 <= value <= 65535:
            raise OSError("ADC value outside range")
        return (value * 4095 + 32767) // 65535

    def read_all(self):
        return [self.read_channel(ch) for ch in self.channels]


class MPU6050:
    """MPU6050 register driver, accelerometer angles in degrees.

    Register map: https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Register-Map1.pdf
    """
    def __init__(self, address=0x68):
        self.address = address
        self.is_initialized = False
        self._i2c = None
        self._x_offset = self._y_offset = self._z_offset = 0.0

    def initialize(self, i2c):
        self._i2c = i2c
        identity = i2c.readfrom_mem(self.address, 0x75, 1)
        if identity != b'\x68':
            raise OSError("MPU6050 identity mismatch")
        i2c.writeto_mem(self.address, 0x6B, b'\x00')
        i2c.writeto_mem(self.address, 0x1B, b'\x00')  # +/-250 deg/s
        i2c.writeto_mem(self.address, 0x1C, b'\x00')  # +/-2g
        self.is_initialized = True
        return True

    def set_offsets(self, x_offset=0.0, y_offset=0.0, z_offset=0.0):
        self._x_offset, self._y_offset, self._z_offset = x_offset, y_offset, z_offset

    def _read_words(self, register, count):
        if not self.is_initialized:
            raise RuntimeError("MPU6050 not initialized")
        data = self._i2c.readfrom_mem(self.address, register, count * 2)
        if len(data) != count * 2:
            raise OSError("Incomplete MPU6050 reading")
        values = [(data[i] << 8) | data[i+1] for i in range(0, len(data), 2)]
        return [v - 65536 if v >= 32768 else v for v in values]

    def read_acceleration(self):
        import math
        x, y, z = self._read_words(0x3B, 3)
        if x == y == z == 0:
            raise OSError("Invalid zero gravity vector")
        return (math.atan2(y, z) * 180 / math.pi - self._x_offset,
                math.atan2(x, z) * 180 / math.pi - self._y_offset, -self._z_offset)

    def read_gyro(self):
        return tuple(v / 131.0 for v in self._read_words(0x43, 3))

    def read_temperature(self):
        return self._read_words(0x41, 1)[0] / 340.0 + 36.53


class SensorManager:
    """Combined sensor manager for gesture capture."""

    __slots__ = ('flex', 'mpu', 'calibration', '_sample_period_ms')

    def __init__(self, flex, mpu, calibration=None):
        self.flex = flex
        self.mpu = mpu
        self.calibration = calibration or CalibrationData()
        self._sample_period_ms = 20

    def calibrate(self):
        # Board configuration supplies measured mounting offsets; no assumed pose.
        if not self.calibration.is_valid:
            raise ValueError("Measured MPU calibration offsets are required")
        self.capture_sample()  # Verify hardware during CALIBRATING before IDLE.

    def capture_sample(self):
        """Capture single 7D sample (5 flex + 2 MPU angles)."""
        flex_values = self.flex.read_all()
        mpu_x, mpu_y, _ = self.mpu.read_acceleration()
        
        raw = flex_values + [mpu_x, mpu_y]
        
        if self.calibration.is_valid:
            return self.calibration.apply(raw)
        return raw

    def capture_multiple(self, count, period_ms=None):
        """Capture multiple samples with timing."""
        if period_ms is not None:
            self._sample_period_ms = period_ms
        
        samples = []
        for _ in range(count):
            samples.append(self.capture_sample())
            if self._sample_period_ms > 0:
                sleep_ms(self._sample_period_ms)
        
        return samples

    def set_calibration(self, calibration):
        """Set calibration data."""
        self.calibration = calibration