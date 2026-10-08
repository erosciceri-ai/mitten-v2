"""Gesture data validation module - alias for validation.gesture for clarity."""

from validation.gesture import (
    validate_gesture_data,
    is_value_in_dimension_range,
    GESTURE_CONSTRAINTS,
    GESTURE_DATA_VERSION,
    GESTURE_DIMENSIONS,
    GESTURE_DIMENSION_ORDER,
    GESTURE_UNITS,
)

__all__ = [
    "validate_gesture_data",
    "is_value_in_dimension_range",
    "GESTURE_CONSTRAINTS",
    "GESTURE_DATA_VERSION",
    "GESTURE_DIMENSIONS",
    "GESTURE_DIMENSION_ORDER",
    "GESTURE_UNITS",
]