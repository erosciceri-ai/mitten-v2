"""Gesture capture state machine (PREPARING → RECORDING → PROCESSING)."""

import time
from utils.time import time_ms, ticks_diff


class CaptureState:
    """Capture phase states per protocol."""
    IDLE = "IDLE"
    PREPARING = "PREPARING"
    RECORDING = "RECORDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class CaptureConfig:
    """Capture configuration parameters."""

    __slots__ = ('sample_count', 'sampling_period_ms', 'preparing_duration_ms', 'max_capture_duration_ms')

    def __init__(self, sample_count=50, sampling_period_ms=20, preparing_duration_ms=1000, max_capture_duration_ms=15000):
        self.sample_count = sample_count
        self.sampling_period_ms = sampling_period_ms
        self.preparing_duration_ms = preparing_duration_ms
        self.max_capture_duration_ms = max_capture_duration_ms


class CaptureManager:
    """Capture state machine with phase transitions."""

    __slots__ = ('state', 'is_active', 'config', 'samples', 'start_time', 'phase_start_time', 
                 'sensor_manager', 'error', '_completed_data', '_recording_started', '_recording_finished')

    def __init__(self, sensor_manager=None):
        self.state = CaptureState.IDLE
        self.is_active = False
        self.config = None
        self.samples = []
        self._recording_started = 0
        self._recording_finished = 0
        self.start_time = 0
        self.phase_start_time = 0
        self.sensor_manager = sensor_manager
        self.error = None
        self._completed_data = None

    def start(self, config):
        """Start capture from IDLE state."""
        if self.state != CaptureState.IDLE:
            return {"accepted": False, "error": "DEVICE_BUSY"}
        
        self.config = config
        self.samples = []
        self.start_time = time_ms()
        self.phase_start_time = self.start_time
        self.state = CaptureState.PREPARING
        self.is_active = True
        self.error = None
        self._completed_data = None
        
        return {"accepted": True}

    def abort(self):
        """Abort capture and return to IDLE."""
        self.state = CaptureState.IDLE
        self.is_active = False
        self.config = None
        self.samples = []
        self.error = None

    def update(self):
        """Update state machine (call periodically)."""
        if not self.is_active:
            return
        
        now = time_ms()
        elapsed = ticks_diff(now, self.start_time)
        
        # Check overall timeout
        if elapsed > self.config.max_capture_duration_ms:
            self._fail("CAPTURE_TIMEOUT")
            return
        
        if self.state == CaptureState.PREPARING:
            if ticks_diff(now, self.phase_start_time) >= self.config.preparing_duration_ms:
                self._enter_recording(now)
        
        elif self.state == CaptureState.RECORDING:
            # Sampling is handled externally via process_sample()
            # Transition to PROCESSING happens in process_sample()
            pass
        
        elif self.state == CaptureState.PROCESSING:
            self._finalize()

    def process_sample(self, sample):
        """Process incoming sample during RECORDING phase."""
        if self.state != CaptureState.RECORDING:
            return False
        
        self._recording_finished = time_ms()
        self.samples.append(sample[:])  # Copy
        
        if len(self.samples) >= self.config.sample_count:
            self.state = CaptureState.PROCESSING
            self.phase_start_time = time_ms()
        
        return True

    def _enter_recording(self, now):
        self._recording_started = now
        self.state = CaptureState.RECORDING
        self.phase_start_time = now

    def _enter_processing(self, now):
        self.state = CaptureState.PROCESSING
        self.phase_start_time = now
        self._finalize()

    def _finalize(self):
        """Compute summary statistics and create gesture data."""
        if not self.samples:
            self._fail("NO_SAMPLES")
            return
        
        sample_count = len(self.samples)
        dims = 7
        
        # Compute min, max, mean per dimension
        min_vals = [float('inf')] * dims
        max_vals = [float('-inf')] * dims
        sum_vals = [0.0] * dims
        
        for sample in self.samples:
            for i in range(dims):
                val = sample[i]
                if val < min_vals[i]:
                    min_vals[i] = val
                if val > max_vals[i]:
                    max_vals[i] = val
                sum_vals[i] += val
        
        mean_vals = [s / sample_count for s in sum_vals]
        
        capture_duration = max(1, ticks_diff(self._recording_finished, self._recording_started))
        
        self._completed_data = {
            "version": 1,
            "dimensions": 7,
            "dimensionOrder": ["flex1", "flex2", "flex3", "flex4", "flex5", "mpuX", "mpuY"],
            "samples": self.samples,
            "summary": {
                "min": min_vals,
                "max": max_vals,
                "mean": mean_vals
            },
            "sampleCount": sample_count,
            "captureDurationMs": capture_duration,
            "samplingPeriodMs": self.config.sampling_period_ms,
            "units": {
                "flex": "adc12",
                "mpu": "degrees"
            }
        }
        
        self.state = CaptureState.COMPLETED
        self.is_active = False
        return self._completed_data

    def _fail(self, error):
        self.state = CaptureState.FAILED
        self.is_active = False
        self.error = error
        self._completed_data = None

    def get_result(self):
        """Get completed gesture data."""
        if self.state == CaptureState.COMPLETED:
            return {"data": self._completed_data}
        elif self.state == CaptureState.FAILED:
            return {"error": self.error}
        return None

    def get_progress(self):
        """Get current capture progress."""
        return {
            "phase": self.state,
            "samples_collected": len(self.samples),
            "total_samples": self.config.sample_count if self.config else 0
        }

    # Test helpers
    def _advance_phase(self):
        """Test helper to manually advance phase."""
        if self.state == CaptureState.PREPARING:
            self._enter_recording(time_ms())
        elif self.state == CaptureState.RECORDING:
            self._enter_processing(time_ms())

    def _simulate_timeout(self):
        """Test helper to simulate timeout."""
        self._fail("CAPTURE_TIMEOUT")