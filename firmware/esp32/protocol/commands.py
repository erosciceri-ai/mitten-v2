"""Protocol V2 request dispatcher for the hardware-independent firmware core."""

from config import (
    BOOTSTRAP_MAX_MESSAGE_BYTES,
    ERR_DEVICE_BUSY,
    ERR_DUPLICATE_REQUEST_ID,
    ERR_HANDSHAKE_REQUIRED,
    ERR_INVALID_MESSAGE,
    ERR_INVALID_PAYLOAD,
    ERR_INVALID_STATE,
    ERR_PROTOCOL_INCOMPATIBLE,
    ERR_UNKNOWN_COMMAND,
    EXPECTED_CLIENT,
    MAX_GESTURES,
    PROTOCOL_VERSION,
    STATE_CALIBRATING,
    STATE_CAPTURING,
    STATE_ERROR,
    STATE_INITIALIZING,
    STATE_SYNCING,
)
from protocol.envelopes import (
    build_error_response,
    build_handshake_response,
    build_protocol_error_event,
    build_state_event,
    build_status_response,
    is_valid_request_id,
    validate_request_envelope,
)
from statemachine.machine import FirmwareStateMachine


_FUNCTIONAL_COMMANDS = (
    "capture.start",
    "sync.begin",
    "sync.gesture",
    "sync.commit",
    "sync.abort",
)


class FirmwareDispatcher:
    """Owns protocol session state and dispatches one request at a time."""

    def __init__(self, emit=None):
        self._emit_callback = emit
        self.state = FirmwareStateMachine(self._on_state_change)
        self.handshake_compatible = False
        self.active_profile = None
        self.active_sync = None
        self.current_error = None
        # IDs exist only while a request/async operation is active.
        self._active_request_ids = set()

    @property
    def active_request_count(self):
        return len(self._active_request_ids)

    def startup(self):
        return self.state.startup()

    def enter_error(self, code, message, details=None):
        error = {"code": code, "message": message}
        if details is not None:
            error["details"] = details
        self.current_error = error
        self.state.transition(STATE_ERROR, "fatal.error")

    def handle_request(self, request):
        valid, validation_message = validate_request_envelope(request)
        if not valid:
            request_id = request.get("id") if isinstance(request, dict) else None
            if is_valid_request_id(request_id):
                return build_error_response(
                    request_id, ERR_INVALID_MESSAGE, validation_message
                )
            return build_protocol_error_event(
                ERR_INVALID_MESSAGE, validation_message
            )

        request_id = request["id"]
        if request_id in self._active_request_ids:
            return build_error_response(
                request_id,
                ERR_DUPLICATE_REQUEST_ID,
                "The request id is already active",
            )

        self._active_request_ids.add(request_id)
        try:
            return self._dispatch_valid_request(request)
        finally:
            # Synchronous commands are complete when their response is built.
            self._active_request_ids.discard(request_id)

    def handle_handshake(self, request_id, payload):
        return self._handle_handshake(request_id, payload)

    def handle_status(self, request_id):
        if not self.handshake_compatible:
            return build_error_response(
                request_id,
                ERR_HANDSHAKE_REQUIRED,
                "A compatible device.handshake is required before this command",
            )
        return self._handle_status(request_id)

    def _dispatch_valid_request(self, request):
        request_id = request["id"]
        command = request["command"]

        if command == "device.handshake":
            return self._handle_handshake(request_id, request["payload"])

        if not self.handshake_compatible:
            return build_error_response(
                request_id,
                ERR_HANDSHAKE_REQUIRED,
                "A compatible device.handshake is required before this command",
            )

        if request["v"] != PROTOCOL_VERSION:
            return build_error_response(
                request_id,
                ERR_PROTOCOL_INCOMPATIBLE,
                "Protocol version %s is not supported" % request["v"],
            )

        if command == "device.status":
            return self._handle_status(request_id)

        if command in _FUNCTIONAL_COMMANDS:
            return self._functional_command_error(request_id, command)

        return build_error_response(
            request_id,
            ERR_UNKNOWN_COMMAND,
            "Unknown command",
            {"command": command},
        )

    def _handle_handshake(self, request_id, payload):
        errors = self._validate_handshake_payload(payload)
        if errors:
            return build_error_response(
                request_id,
                ERR_INVALID_PAYLOAD,
                "Invalid device.handshake payload",
                {"errors": errors},
            )

        supported = payload["supportedProtocolVersions"]
        self.handshake_compatible = PROTOCOL_VERSION in supported
        return build_handshake_response(
            request_id,
            {
                "maxGestures": MAX_GESTURES,
                "maxMessageBytes": BOOTSTRAP_MAX_MESSAGE_BYTES,
            },
            state=self.state.current,
        )

    def _handle_status(self, request_id):
        return build_status_response(
            request_id,
            self.state.current,
            active_profile=self.active_profile,
            active_sync=self.active_sync,
            error=self.current_error,
        )

    @staticmethod
    def _validate_handshake_payload(payload):
        errors = []
        if not isinstance(payload, dict):
            return ["Handshake payload must be an object"]
        if payload.get("client") != EXPECTED_CLIENT:
            errors.append('client must be "MITTEN_WEB"')
        versions = payload.get("supportedProtocolVersions")
        if not isinstance(versions, list) or not versions:
            errors.append("supportedProtocolVersions must be a non-empty array")
        else:
            seen = set()
            for version in versions:
                if isinstance(version, bool) or not isinstance(version, int) or version < 1:
                    errors.append(
                        "supportedProtocolVersions must contain positive integers"
                    )
                    break
                if version in seen:
                    errors.append(
                        "supportedProtocolVersions must not contain duplicates"
                    )
                    break
                seen.add(version)
        return errors

    def _functional_command_error(self, request_id, command):
        current = self.state.current
        if current in (STATE_CAPTURING, STATE_SYNCING):
            return build_error_response(
                request_id,
                ERR_DEVICE_BUSY,
                "Another exclusive operation is in progress",
            )
        if current in (STATE_INITIALIZING, STATE_CALIBRATING, STATE_ERROR):
            return build_error_response(
                request_id,
                ERR_INVALID_STATE,
                "%s is not allowed in state %s" % (command, current),
            )
        return build_error_response(
            request_id,
            ERR_UNKNOWN_COMMAND,
            "Command is defined but not implemented by this firmware stage",
            {"command": command},
        )

    def _on_state_change(self, state):
        if self._emit_callback is not None:
            self._emit_callback(build_state_event(state))
