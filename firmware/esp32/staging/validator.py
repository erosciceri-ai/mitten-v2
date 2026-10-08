"""Gesture validator for staging.

Validates gesture metadata and data per gesture-format.md.
"""

try:
    import ujson as json
except ImportError:
    import json

from validation.gesture import validate_gesture


def validate_gesture_for_staging(gesture):
    """Validate a complete gesture for staging.

    Returns (True, None) on success, (False, error_message) on failure.
    """
    valid, errors = validate_gesture(gesture)
    if valid:
        return True, None
    return False, "; ".join(errors)