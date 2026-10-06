"""MITTEN Protocol V2 envelope builders and structural validators."""

try:
    import ujson as json
except ImportError:
    import json

from config import (
    DEVICE_NAME,
    FIRMWARE_VERSION,
    PROTOCOL_ERROR_CODES,
    PROTOCOL_VERSION,
    is_valid_firmware_state,
)


_REQUEST_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-"


def is_valid_request_id(request_id):
    """Return True when request_id matches ^[A-Za-z0-9._:-]{1,64}$."""
    if not isinstance(request_id, str):
        return False
    if len(request_id) < 1 or len(request_id) > 64:
        return False
    for char in request_id:
        if char not in _REQUEST_ID_CHARS:
            return False
    return True


def _require_request_id(request_id):
    if not is_valid_request_id(request_id):
        raise ValueError("Invalid request id")


def _require_state(state):
    if not is_valid_firmware_state(state):
        raise ValueError("Invalid firmware state")


def _error_object(code, message, details=None):
    if code not in PROTOCOL_ERROR_CODES:
        raise ValueError("Invalid protocol error code")
    if not isinstance(message, str) or not message:
        raise ValueError("Error message must be a non-empty string")
    error = {"code": code, "message": message}
    if details is not None:
        if not isinstance(details, dict):
            raise ValueError("Error details must be an object")
        error["details"] = details
    return error


def build_handshake_response(request_id, capabilities, state="IDLE",
                             firmware_version=FIRMWARE_VERSION):
    _require_request_id(request_id)
    _require_state(state)
    if not isinstance(capabilities, dict):
        raise ValueError("Capabilities must be an object")
    return {
        "v": PROTOCOL_VERSION,
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "device": DEVICE_NAME,
            "firmwareVersion": firmware_version,
            "protocolVersion": PROTOCOL_VERSION,
            "state": state,
            "capabilities": capabilities,
        },
    }


def build_status_response(request_id, state, active_profile=None,
                          active_sync=None, error=None):
    _require_request_id(request_id)
    _require_state(state)
    return {
        "v": PROTOCOL_VERSION,
        "type": "response",
        "id": request_id,
        "ok": True,
        "result": {
            "state": state,
            "activeProfile": active_profile,
            "activeSync": active_sync,
            "error": error,
        },
    }


def build_error_response(request_id, code, message, details=None):
    _require_request_id(request_id)
    return {
        "v": PROTOCOL_VERSION,
        "type": "response",
        "id": request_id,
        "ok": False,
        "error": _error_object(code, message, details),
    }


def build_state_event(state):
    _require_state(state)
    return {
        "v": PROTOCOL_VERSION,
        "type": "event",
        "event": "device.state",
        "data": {"state": state},
    }


def build_protocol_error_event(code, message, details=None):
    return {
        "v": PROTOCOL_VERSION,
        "type": "event",
        "event": "protocol.error",
        "data": {"error": _error_object(code, message, details)},
    }


def validate_request_envelope(value):
    """Validate the structural request envelope without rejecting commands."""
    if not isinstance(value, dict):
        return False, "Envelope must be an object"
    version = value.get("v")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        return False, "Envelope v must be a positive integer"
    if value.get("type") != "request":
        return False, 'Envelope type must be "request"'
    if not is_valid_request_id(value.get("id")):
        return False, "Request id must match ^[A-Za-z0-9._:-]{1,64}$"
    command = value.get("command")
    if not isinstance(command, str) or not command:
        return False, "Request command must be a non-empty string"
    if not isinstance(value.get("payload"), dict):
        return False, "Request payload must be an object"
    return True, None


def serialize_envelope(envelope):
    """Serialize one envelope to compact UTF-8 NDJSON bytes."""
    try:
        text = json.dumps(envelope, separators=(",", ":"), ensure_ascii=False)
    except TypeError:
        # MicroPython ujson emits compact JSON and may not accept kwargs.
        text = json.dumps(envelope)
    return text.encode("utf-8") + b"\n"
