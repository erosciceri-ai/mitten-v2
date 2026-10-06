"""
MITTEN V2 Firmware Configuration

Protocol Version: 2
All constants are plain Python types for MicroPython compatibility.
"""

# ============================================================================
# Protocol Version
# ============================================================================

PROTOCOL_VERSION = 2

# ============================================================================
# Device Information
# ============================================================================

FIRMWARE_VERSION = "2.0.0"
DEVICE_NAME = "MITTEN"

# ============================================================================
# Message Limits
# ============================================================================

BOOTSTRAP_MAX_MESSAGE_BYTES = 8192
MAX_GESTURES = 50

# ============================================================================
# Timeouts (ms)
# ============================================================================

HANDSHAKE_TIMEOUT_MS = 5000
RESPONSE_TIMEOUT_MS = 5000
FRAME_INCOMPLETE_TIMEOUT_MS = 5000
CAPTURE_OPERATION_TIMEOUT_MS = 15000
SYNC_IDLE_TIMEOUT_MS = 10000

# ============================================================================
# Framing
# ============================================================================

FRAME_DELIMITER = b"\n"
CR_BYTE = 0x0d

# ============================================================================
# Request ID Validation
# ============================================================================

REQUEST_ID_PATTERN = r"^[A-Za-z0-9._:-]{1,64}$"

# ============================================================================
# SyncId / Profile Validation
# ============================================================================

SYNC_ID_PATTERN = r"^[A-Za-z0-9._:-]{1,64}$"
PROFILE_ID_PATTERN = r"^[A-Za-z0-9._:-]{1,64}$"
PROFILE_REVISION_MAX_LENGTH = 128

# ============================================================================
# Firmware States (string constants — not enum.Enum for MicroPython compat)
# ============================================================================

STATE_INITIALIZING = "INITIALIZING"
STATE_CALIBRATING = "CALIBRATING"
STATE_IDLE = "IDLE"
STATE_CAPTURING = "CAPTURING"
STATE_SYNCING = "SYNCING"
STATE_ERROR = "ERROR"

FIRMWARE_STATES = [
    STATE_INITIALIZING,
    STATE_CALIBRATING,
    STATE_IDLE,
    STATE_CAPTURING,
    STATE_SYNCING,
    STATE_ERROR,
]


def is_valid_firmware_state(state):
    """Check if a string is a valid firmware state."""
    return state in FIRMWARE_STATES


# ============================================================================
# Protocol Error Codes (string constants — not enum.Enum for MicroPython compat)
# ============================================================================

# Framing/parsing errors
ERR_INVALID_JSON = "INVALID_JSON"
ERR_INVALID_MESSAGE = "INVALID_MESSAGE"
ERR_MESSAGE_TOO_LARGE = "MESSAGE_TOO_LARGE"
ERR_INCOMPLETE_MESSAGE = "INCOMPLETE_MESSAGE"

# Protocol errors
ERR_UNKNOWN_COMMAND = "UNKNOWN_COMMAND"
ERR_DUPLICATE_REQUEST_ID = "DUPLICATE_REQUEST_ID"
ERR_HANDSHAKE_REQUIRED = "HANDSHAKE_REQUIRED"
ERR_PROTOCOL_INCOMPATIBLE = "PROTOCOL_INCOMPATIBLE"
ERR_INVALID_PAYLOAD = "INVALID_PAYLOAD"
ERR_INVALID_STATE = "INVALID_STATE"
ERR_DEVICE_BUSY = "DEVICE_BUSY"

# Sync errors
ERR_PROFILE_TOO_LARGE = "PROFILE_TOO_LARGE"
ERR_GESTURE_INVALID = "GESTURE_INVALID"
ERR_DUPLICATE_GESTURE_ID = "DUPLICATE_GESTURE_ID"
ERR_SYNC_NOT_ACTIVE = "SYNC_NOT_ACTIVE"
ERR_SYNC_ID_MISMATCH = "SYNC_ID_MISMATCH"
ERR_SYNC_SEQUENCE_INVALID = "SYNC_SEQUENCE_INVALID"
ERR_SYNC_INCOMPLETE = "SYNC_INCOMPLETE"
ERR_SYNC_TIMEOUT = "SYNC_TIMEOUT"
ERR_SYNC_FAILED = "SYNC_FAILED"

# Capture errors
ERR_CAPTURE_FAILED = "CAPTURE_FAILED"

# Hardware errors
ERR_SENSOR_ERROR = "SENSOR_ERROR"
ERR_STORAGE_ERROR = "STORAGE_ERROR"

# Internal errors
ERR_INTERNAL_ERROR = "INTERNAL_ERROR"

PROTOCOL_ERROR_CODES = [
    ERR_INVALID_JSON,
    ERR_INVALID_MESSAGE,
    ERR_MESSAGE_TOO_LARGE,
    ERR_INCOMPLETE_MESSAGE,
    ERR_UNKNOWN_COMMAND,
    ERR_DUPLICATE_REQUEST_ID,
    ERR_HANDSHAKE_REQUIRED,
    ERR_PROTOCOL_INCOMPATIBLE,
    ERR_INVALID_PAYLOAD,
    ERR_INVALID_STATE,
    ERR_DEVICE_BUSY,
    ERR_PROFILE_TOO_LARGE,
    ERR_GESTURE_INVALID,
    ERR_DUPLICATE_GESTURE_ID,
    ERR_SYNC_NOT_ACTIVE,
    ERR_SYNC_ID_MISMATCH,
    ERR_SYNC_SEQUENCE_INVALID,
    ERR_SYNC_INCOMPLETE,
    ERR_SYNC_TIMEOUT,
    ERR_SYNC_FAILED,
    ERR_CAPTURE_FAILED,
    ERR_SENSOR_ERROR,
    ERR_STORAGE_ERROR,
    ERR_INTERNAL_ERROR,
]


def is_protocol_error_code(code):
    """Check if a string is a valid protocol error code."""
    return code in PROTOCOL_ERROR_CODES


# ============================================================================
# Client Identifier
# ============================================================================

EXPECTED_CLIENT = "MITTEN_WEB"
