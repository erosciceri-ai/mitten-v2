"""Tests for gesture capture state machine (PREPARING → RECORDING → PROCESSING)."""

import pytest
from capture import CaptureManager, CaptureState, CaptureConfig


class TestCaptureConfig:
    """Capture configuration."""

    def test_default_config(self):
        """Default capture config matches protocol."""
        config = CaptureConfig()
        assert config.sample_count == 50
        assert config.sampling_period_ms == 20
        assert config.preparing_duration_ms == 1000
        assert config.max_capture_duration_ms == 15000

    def test_custom_config(self):
        """Custom config values are accepted."""
        config = CaptureConfig(sample_count=100, sampling_period_ms=10)
        assert config.sample_count == 100
        assert config.sampling_period_ms == 10


class TestCaptureState:
    """Capture state constants."""

    def test_state_values(self):
        """Capture states match protocol phases."""
        assert CaptureState.PREPARING == "PREPARING"
        assert CaptureState.RECORDING == "RECORDING"
        assert CaptureState.PROCESSING == "PROCESSING"
        assert CaptureState.COMPLETED == "COMPLETED"
        assert CaptureState.FAILED == "FAILED"
        assert CaptureState.IDLE == "IDLE"


class TestCaptureManager:
    """Capture manager state machine."""

    def setup_method(self):
        self.manager = CaptureManager()
        self.config = CaptureConfig(sample_count=10, sampling_period_ms=5)

    def test_initial_state(self):
        """Initial state is IDLE."""
        assert self.manager.state == CaptureState.IDLE
        assert self.manager.is_active is False

    def test_start_transitions_to_preparing(self):
        """start() transitions IDLE → PREPARING."""
        result = self.manager.start(self.config)
        assert result["accepted"] is True
        assert self.manager.state == CaptureState.PREPARING
        assert self.manager.is_active is True

    def test_start_from_non_idle_returns_error(self):
        """start() from non-IDLE returns error."""
        self.manager.start(self.config)
        result = self.manager.start(self.config)
        assert result["accepted"] is False
        assert result["error"] == "DEVICE_BUSY"

    def test_preparing_completes_after_timeout(self):
        """PREPARING completes after preparing_duration_ms."""
        self.manager.start(self.config)
        # Simulate time passing
        import time
        time.sleep(0.01)  # Small delay for test
        # In real implementation, this would be time-based
        # For test, we'll manually advance
        self.manager._advance_phase()
        assert self.manager.state == CaptureState.RECORDING

    def test_recording_collects_samples(self):
        """RECORDING phase collects configured number of samples."""
        self.manager.start(self.config)
        self.manager._advance_phase()  # PREPARING → RECORDING
        
        # Simulate sampling
        for _ in range(self.config.sample_count):
            self.manager.process_sample([0]*7)
        
        assert self.manager.state == CaptureState.PROCESSING
        assert len(self.manager.samples) == self.config.sample_count

    def test_processing_computes_summary(self):
        """PROCESSING computes summary statistics."""
        self.manager.start(self.config)
        self.manager._advance_phase()  # → RECORDING
        for _ in range(self.config.sample_count):
            self.manager.process_sample([100, 200, 300, 400, 500, 10.0, -5.0])
        self.manager._advance_phase()  # → PROCESSING
        
        result = self.manager._finalize()
        
        assert self.manager.state == CaptureState.COMPLETED
        assert "version" in result
        assert result["version"] == 1
        assert result["sampleCount"] == self.config.sample_count
        assert "summary" in result
        assert "min" in result["summary"]
        assert "max" in result["summary"]
        assert "mean" in result["summary"]
        assert len(result["summary"]["min"]) == 7

    def test_abort_returns_to_idle(self):
        """abort() returns to IDLE from any active state."""
        self.manager.start(self.config)
        self.manager.abort()
        assert self.manager.state == CaptureState.IDLE
        assert self.manager.is_active is False

    def test_timeout_during_recording(self):
        """Capture fails if max duration exceeded."""
        config = CaptureConfig(max_capture_duration_ms=1)
        self.manager = CaptureManager()
        self.manager.start(config)
        # Would need time simulation - simplified for test
        self.manager._simulate_timeout()
        assert self.manager.state == CaptureState.FAILED
        assert self.manager.error == "CAPTURE_TIMEOUT"

    def test_get_progress(self):
        """get_progress returns current phase and sample count."""
        self.manager.start(self.config)
        progress = self.manager.get_progress()
        assert "phase" in progress
        assert "samples_collected" in progress
        assert "total_samples" in progress
        assert progress["phase"] == CaptureState.PREPARING
        assert progress["samples_collected"] == 0
        assert progress["total_samples"] == self.config.sample_count

def test_capture_duration_excludes_preparation_and_processing(monkeypatch):
    clock=[100]
    monkeypatch.setattr('capture.time_ms', lambda: clock[0])
    manager=CaptureManager(); manager.start(CaptureConfig(sample_count=3))
    clock[0]=1100; manager.update()
    for t in (1100,1120,1140):
        clock[0]=t; manager.process_sample([1000]*5+[0,0])
    clock[0]=1300; manager.update()
    assert manager.get_result()['data']['captureDurationMs'] == 40
