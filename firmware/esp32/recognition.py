"""Local gesture recognition (baseline V1 algorithm)."""

import math


class RecognitionResult:
    """Recognition result."""

    __slots__ = ('gesture_id', 'confidence', 'audio_track', 'matched')

    def __init__(self, gesture_id=None, confidence=0.0, audio_track=None, matched=None):
        self.gesture_id = gesture_id
        self.confidence = confidence
        self.audio_track = audio_track
        # Auto-set matched based on gesture_id presence if not explicitly provided
        if matched is None:
            self.matched = gesture_id is not None
        else:
            self.matched = matched

    @classmethod
    def no_match(cls):
        return cls(matched=False)

    def __repr__(self):
        return f"RecognitionResult(id={self.gesture_id}, conf={self.confidence:.3f}, track={self.audio_track}, matched={self.matched})"


class GestureRecognizer:
    """V1 baseline: range-centre weighted L1 score, accept score <= 2.

    Port of mittenv1/scripts/firmware_esp32.py::detectar_gesto.
    Flex denominator floor is 400 ADC counts; MPU floor is 20 degrees.
    Ties retain profile order. Confidence is diagnostic only, never a threshold.
    """

    def __init__(self):
        self.gestures = []

    def load_profile(self, gestures):
        self.gestures = gestures

    def recognize(self, sample):
        if len(sample) != 7 or any(not math.isfinite(v) for v in sample):
            return RecognitionResult.no_match()
        best = None
        best_score = float('inf')
        for gesture in self.gestures:
            summary = gesture["data"]["summary"]
            low, high = summary["min"], summary["max"]
            score = sum(abs(sample[i] - (low[i] + high[i]) / 2.0) /
                        max(high[i] - low[i], 400.0 if i < 5 else 20.0)
                        for i in range(7))
            if score < best_score:
                best, best_score = gesture, score
        if best is None or best_score > 2.0:
            return RecognitionResult.no_match()
        return RecognitionResult(best["id"], max(0.0, 1.0 - best_score / 2.0),
                                 best["audioTrack"])

    def to_event(self, result):
        """Convert result to protocol event format."""
        if result.matched:
            from protocol.envelopes import build_event
            return build_event("recognition.detected", {
                "gestureId": result.gesture_id,
                "audioTrack": result.audio_track
            })
        return None