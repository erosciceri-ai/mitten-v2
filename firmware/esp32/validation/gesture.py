"""Gesture validation for MITTEN V2 firmware.

MicroPython-native implementation equivalent to packages/contracts/src/gesture.ts
Per gesture-format.md section 3.
"""

# Validation constants matching gesture-format.md and contracts
GESTURE_CONSTRAINTS = {
    "NAME_MIN_LENGTH": 1,
    "NAME_MAX_LENGTH": 60,  # Unicode code points
    "SAMPLE_COUNT_MIN": 1,
    "CAPTURE_DURATION_MIN_MS": 1,
    "CAPTURE_DURATION_MAX_MS": 10000,
    "SAMPLING_PERIOD_MIN_MS": 1,
    "SAMPLING_PERIOD_MAX_MS": 1000,
    "GESTURE_ID_MIN": 1,
    "GESTURE_ID_MAX": 2147483647,
    "AUDIO_TRACK_MIN": 1,
    "AUDIO_TRACK_MAX": 50,
    "FLEX_VALUE_MIN": 0,
    "FLEX_VALUE_MAX": 4095,
    "MPU_VALUE_MIN": -180,
    "MPU_VALUE_MAX": 180,
    "MIN_SAMPLES_FOR_VALID_CAPTURE": 3,
}

GESTURE_DATA_VERSION = 1
GESTURE_DIMENSIONS = 7
GESTURE_DIMENSION_ORDER = ["flex1", "flex2", "flex3", "flex4", "flex5", "mpuX", "mpuY"]
GESTURE_UNITS = {"flex": "adc12", "mpu": "degrees"}

# Fields that must NOT be present in GestureData (V1 incompatible fields)
INCOMPATIBLE_GESTURE_DATA_FIELDS = [
    "id", "name", "audioTrack",
    "nombre", "tipo", "min", "max", "prom", "muestras"
]


def is_value_in_dimension_range(value, dimension_index):
    """Check if a value is within the valid range for a dimension."""
    if dimension_index < 5:  # flex1-flex5
        return GESTURE_CONSTRAINTS["FLEX_VALUE_MIN"] <= value <= GESTURE_CONSTRAINTS["FLEX_VALUE_MAX"]
    else:  # mpuX, mpuY
        return GESTURE_CONSTRAINTS["MPU_VALUE_MIN"] <= value <= GESTURE_CONSTRAINTS["MPU_VALUE_MAX"]


def validate_gesture_metadata(metadata):
    """Validate gesture metadata (id, name, audioTrack)."""
    errors = []

    if not isinstance(metadata, dict):
        return False, ["Gesture metadata must be an object"]

    # id
    gid = metadata.get("id")
    if type(gid) is not int:
        errors.append("id must be an integer")
    elif gid < GESTURE_CONSTRAINTS["GESTURE_ID_MIN"] or gid > GESTURE_CONSTRAINTS["GESTURE_ID_MAX"]:
        errors.append(f"id must be between {GESTURE_CONSTRAINTS['GESTURE_ID_MIN']} and {GESTURE_CONSTRAINTS['GESTURE_ID_MAX']}")

    # name
    name = metadata.get("name")
    if not isinstance(name, str):
        errors.append("name must be a string")
    else:
        # Count Unicode code points
        code_point_length = len(name)
        if code_point_length < GESTURE_CONSTRAINTS["NAME_MIN_LENGTH"]:
            errors.append(f"name must be at least {GESTURE_CONSTRAINTS['NAME_MIN_LENGTH']} character")
        if code_point_length > GESTURE_CONSTRAINTS["NAME_MAX_LENGTH"]:
            errors.append(f"name must be at most {GESTURE_CONSTRAINTS['NAME_MAX_LENGTH']} Unicode code points")
        # Check for control characters
        if any(ord(c) < 32 or ord(c) == 127 for c in name):
            errors.append("name must not contain control characters")

    # audioTrack
    track = metadata.get("audioTrack")
    if type(track) is not int:
        errors.append("audioTrack must be an integer")
    elif track < GESTURE_CONSTRAINTS["AUDIO_TRACK_MIN"] or track > GESTURE_CONSTRAINTS["AUDIO_TRACK_MAX"]:
        errors.append(f"audioTrack must be between {GESTURE_CONSTRAINTS['AUDIO_TRACK_MIN']} and {GESTURE_CONSTRAINTS['AUDIO_TRACK_MAX']}")

    return len(errors) == 0, errors


def _validate_samples(samples):
    """Validate samples array."""
    errors = []

    if not isinstance(samples, list) or len(samples) == 0:
        return ["samples must be a non-empty array"]

    for idx, sample in enumerate(samples):
        if not isinstance(sample, list) or len(sample) != 7:
            errors.append(f"samples[{idx}] must be an array of 7 numbers")
            continue
        for dim_idx, val in enumerate(sample):
            if (isinstance(val, bool) or not isinstance(val, (int, float))):
                errors.append(f"samples[{idx}][{dim_idx}] must be a number")
            elif not is_value_in_dimension_range(val, dim_idx):
                dim_name = GESTURE_DIMENSION_ORDER[dim_idx]
                if dim_idx < 5:
                    errors.append(f"samples[{idx}][{dim_idx}] ({dim_name}) = {val} out of range [0, 4095]")
                else:
                    errors.append(f"samples[{idx}][{dim_idx}] ({dim_name}) = {val} out of range [-180, 180]")

    return errors


def _validate_summary(summary):
    """Validate summary object."""
    errors = []

    if not isinstance(summary, dict):
        return ["summary must be an object with min, max, mean arrays"]

    for key in ("min", "max", "mean"):
        arr = summary.get(key)
        if not isinstance(arr, list) or len(arr) != 7:
            errors.append(f"summary.{key} must be an array of 7 numbers")
            continue
        for i, val in enumerate(arr):
            if (isinstance(val, bool) or not isinstance(val, (int, float))):
                errors.append(f"summary.{key}[{i}] must be a number")
            elif not is_value_in_dimension_range(val, i):
                errors.append(f"summary.{key}[{i}] out of range")

    # Check min <= mean <= max
    if not errors and all(k in summary for k in ("min", "max", "mean")):
        min_arr = summary["min"]
        max_arr = summary["max"]
        mean_arr = summary["mean"]
        if all(isinstance(arr, list) and len(arr) == 7 for arr in [min_arr, max_arr, mean_arr]):
            for i in range(7):
                if not (min_arr[i] <= mean_arr[i] <= max_arr[i]):
                    errors.append(f"summary: min[{i}] <= mean[{i}] <= max[{i}] violated ({min_arr[i]} <= {mean_arr[i]} <= {max_arr[i]})")

    return errors


def validate_gesture_data(data):
    """Validate gesture data per gesture-format.md section 3."""
    errors = []

    if not isinstance(data, dict):
        return False, ["Gesture data must be an object"]

    # Check for incompatible V1 fields
    for field in INCOMPATIBLE_GESTURE_DATA_FIELDS:
        if field in data:
            errors.append(f"{field} is incompatible with GestureData version 1")

    # version
    if type(data.get("version")) is not int or data.get("version") != GESTURE_DATA_VERSION:
        errors.append(f"version must be {GESTURE_DATA_VERSION}, got {data.get('version')}")

    # dimensions
    if data.get("dimensions") != GESTURE_DIMENSIONS:
        errors.append(f"dimensions must be {GESTURE_DIMENSIONS}, got {data.get('dimensions')}")

    # dimensionOrder
    dim_order = data.get("dimensionOrder")
    if not isinstance(dim_order, list) or len(dim_order) != 7:
        errors.append("dimensionOrder must be an array of 7 strings")
    elif dim_order != GESTURE_DIMENSION_ORDER:
        errors.append('dimensionOrder must match fixed order: flex1,flex2,flex3,flex4,flex5,mpuX,mpuY')

    # units
    units = data.get("units")
    if not isinstance(units, dict) or units.get("flex") != "adc12" or units.get("mpu") != "degrees":
        errors.append('units must be {flex: "adc12", mpu: "degrees"}')

    # samples
    samples = data.get("samples")
    sample_errors = _validate_samples(samples)
    errors.extend(sample_errors)

    # summary
    summary = data.get("summary")
    summary_errors = _validate_summary(summary)
    errors.extend(summary_errors)

    # sampleCount
    sample_count = data.get("sampleCount")
    if type(sample_count) is not int or sample_count < 1:
        errors.append("sampleCount must be an integer >= 1")
    elif isinstance(samples, list) and len(samples) != sample_count:
        errors.append("sampleCount must match samples.length")

    # captureDurationMs
    cap_dur = data.get("captureDurationMs")
    if type(cap_dur) is not int or cap_dur <= 0 or cap_dur > GESTURE_CONSTRAINTS["CAPTURE_DURATION_MAX_MS"]:
        errors.append(f"captureDurationMs must be an integer between 1 and {GESTURE_CONSTRAINTS['CAPTURE_DURATION_MAX_MS']}")

    # samplingPeriodMs
    samp_per = data.get("samplingPeriodMs")
    if type(samp_per) is not int or samp_per <= 0 or samp_per > GESTURE_CONSTRAINTS["SAMPLING_PERIOD_MAX_MS"]:
        errors.append(f"samplingPeriodMs must be an integer between 1 and {GESTURE_CONSTRAINTS['SAMPLING_PERIOD_MAX_MS']}")

    return len(errors) == 0, errors


def validate_gesture(gesture):
    """Validate complete gesture (metadata + data)."""
    errors = []

    if not isinstance(gesture, dict):
        return False, ["Gesture must be an object"]

    # Validate metadata
    meta_valid, meta_errors = validate_gesture_metadata({
        "id": gesture.get("id"),
        "name": gesture.get("name"),
        "audioTrack": gesture.get("audioTrack")
    })
    errors.extend(meta_errors)

    # Validate data
    gesture_data = gesture.get("data")
    if not gesture_data:
        errors.append("Gesture must have a data property")
    else:
        data_valid, data_errors = validate_gesture_data(gesture_data)
        errors.extend(data_errors)

    return len(errors) == 0, errors


# Export constraints for tests
__all__ = [
    "GESTURE_CONSTRAINTS",
    "GESTURE_DATA_VERSION",
    "GESTURE_DIMENSIONS",
    "GESTURE_DIMENSION_ORDER",
    "GESTURE_UNITS",
    "INCOMPATIBLE_GESTURE_DATA_FIELDS",
    "is_value_in_dimension_range",
    "validate_gesture_metadata",
    "validate_gesture_data",
    "validate_gesture",
]