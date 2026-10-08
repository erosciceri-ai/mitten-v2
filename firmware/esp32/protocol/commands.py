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
    STATE_IDLE,
    STATE_INITIALIZING,
    STATE_SYNCING,
)
from protocol.envelopes import (
    build_error_response,
    build_handshake_response,
    build_protocol_error_event,
    build_state_event,
    build_status_response,
    build_success_response,
    build_event,
    serialize_envelope,
    is_valid_request_id,
    validate_request_envelope,
)
from statemachine.machine import FirmwareStateMachine
from sync.transaction import SyncTransactionManager
from capture import CaptureManager, CaptureConfig
from recognition import GestureRecognizer
from utils.time import ticks_ms, ticks_diff
from validation.gesture import validate_gesture_data


_FUNCTIONAL_COMMANDS = ("capture.start", "sync.begin", "sync.gesture", "sync.commit", "sync.abort")


class FirmwareDispatcher:
    """Owns protocol session state and dispatches one request at a time."""

    def __init__(self, emit=None, sensor_manager=None, dfplayer=None):
        self._emit_callback = emit
        self._handling_request = False
        self._events = []
        self.capture_request_id = None
        self.sensor_manager = sensor_manager
        self._capture_phase = None
        self._last_sample = None
        self._last_recognition = None
        self._last_recognized_id = None
        self.state = FirmwareStateMachine(self._on_state_change)
        self.handshake_compatible = False
        self.active_profile = None
        self.active_sync = None
        self.current_error = None
        # IDs exist only while a request/async operation is active.
        self._active_request_ids = set()

        # Sync transaction manager
        self.sync_manager = SyncTransactionManager(
            state_machine=self.state,
            emit_callback=self._emit
        )

        # Shared runtime services
        self.capture_manager = CaptureManager(sensor_manager)
        self.recognizer = GestureRecognizer()
        self.dfplayer = dfplayer

        # Load active profile on startup
        self._load_recognition_profile()
        if self.sync_manager.profile_manager.current:
            self.active_profile = {
                "profileId": self.sync_manager.profile_manager.profile_id,
                "profileRevision": self.sync_manager.profile_manager.profile_revision,
                "gestureCount": self.sync_manager.profile_manager.gesture_count
            }

    @property
    def active_request_count(self):
        return len(self._active_request_ids)

    def startup(self):
        try:
            return self.state.startup(self._prepare_sensors)
        except Exception as error:
            self.enter_error("SENSOR_ERROR", str(error))
            return False

    def _prepare_sensors(self):
        if self.sensor_manager is not None and hasattr(self.sensor_manager, "calibrate"):
            self.sensor_manager.calibrate()

    def _load_recognition_profile(self):
        profile = self.sync_manager.profile_manager.current
        self.recognizer.load_profile(profile["gestures"] if profile else [])
        self._last_recognized_id = None

    def _emit(self, event):
        if self._handling_request:
            self._events.append(event)
        elif self._emit_callback:
            self._emit_callback(event)

    def flush_events(self):
        events, self._events = self._events, []
        for event in events:
            self._emit(event)

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
        self._handling_request = True
        try:
            return self._dispatch_valid_request(request)
        finally:
            # Synchronous commands are complete when their response is built.
            self._handling_request = False
            if request_id != self.capture_request_id:
                self._active_request_ids.discard(request_id)

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

        if command in _FUNCTIONAL_COMMANDS and self.state.current == STATE_ERROR:
            return build_error_response(request_id, ERR_INVALID_STATE, "Device requires restart")

        # Sync commands - check if we're in a state that allows them
        if command in ("sync.begin", "sync.gesture", "sync.commit", "sync.abort"):
            # These commands are only valid in certain states
            if command == "sync.begin":
                # sync.begin only allowed in IDLE
                if self.state.current != STATE_IDLE:
                    return self._functional_command_error(request_id, command)
            else:
                # sync.gesture, sync.commit, sync.abort only allowed in SYNCING
                if self.state.current != STATE_SYNCING:
                    # Return the specific sync error from the sync manager
                    if command == "sync.gesture":
                        return self._handle_sync_gesture(request_id, request["payload"])
                    elif command == "sync.commit":
                        return self._handle_sync_commit(request_id, request["payload"])
                    elif command == "sync.abort":
                        return self._handle_sync_abort(request_id, request["payload"])

            if command == "sync.begin":
                return self._handle_sync_begin(request_id, request["payload"])
            if command == "sync.gesture":
                return self._handle_sync_gesture(request_id, request["payload"])
            if command == "sync.commit":
                return self._handle_sync_commit(request_id, request["payload"])
            if command == "sync.abort":
                return self._handle_sync_abort(request_id, request["payload"])

        # Capture commands
        if command == "capture.start":
            return self._handle_capture_start(request_id, request["payload"])
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
        # Update active_profile and active_sync from sync manager
        if self.sync_manager.profile_manager.current:
            self.active_profile = {
                "profileId": self.sync_manager.profile_manager.profile_id,
                "profileRevision": self.sync_manager.profile_manager.profile_revision,
                "gestureCount": self.sync_manager.profile_manager.gesture_count
            }
        else:
            self.active_profile = None

        if self.state.current == STATE_SYNCING:
            self.active_sync = self.sync_manager.get_status().get("activeSync")
        else:
            self.active_sync = None

        return build_status_response(
            request_id,
            self.state.current,
            active_profile=self.active_profile,
            active_sync=self.active_sync,
            error=self.current_error,
        )

    def _handle_sync_begin(self, request_id, payload):
        result = self.sync_manager.begin(
            sync_id=payload.get("syncId"),
            profile_id=payload.get("profileId"),
            profile_revision=payload.get("profileRevision"),
            gesture_count=payload.get("gestureCount")
        )

        if not result.get("ok"):
            return build_error_response(
                request_id,
                result["error"]["code"],
                result["error"]["message"]
            )

        return build_success_response(request_id, result)

    def _handle_sync_gesture(self, request_id, payload):
        result = self.sync_manager.gesture(
            sync_id=payload.get("syncId"),
            index=payload.get("index"),
            gesture=payload.get("gesture")
        )

        if not result.get("ok"):
            return build_error_response(
                request_id,
                result["error"]["code"],
                result["error"]["message"]
            )

        return build_success_response(request_id, result)

    def _handle_sync_commit(self, request_id, payload):
        result = self.sync_manager.commit(sync_id=payload.get("syncId"))

        if not result.get("ok"):
            return build_error_response(
                request_id,
                result["error"]["code"],
                result["error"]["message"]
            )

        # Update active_profile
        self.active_profile = result.get("activeProfile")
        self._load_recognition_profile()

        return build_success_response(request_id, result)

    def _handle_sync_abort(self, request_id, payload):
        result = self.sync_manager.abort(sync_id=payload.get("syncId"))

        if not result.get("ok"):
            return build_error_response(
                request_id,
                result["error"]["code"],
                result["error"]["message"]
            )

        return build_success_response(request_id, result)

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
        self._emit(build_state_event(state))

    # Capture handlers
    def _handle_capture_start(self, request_id, payload):
        if self.state.current != STATE_IDLE:
            return self._functional_command_error(request_id, "capture.start")

        # V2 capture parameters are device configuration, not private wire commands.
        config = CaptureConfig()
        result = self.capture_manager.start(config)
        if not result.get("accepted"):
            return build_error_response(request_id, ERR_DEVICE_BUSY, "Capture already in progress")

        self._capture_phase = None
        self._last_sample = None
        self.state.transition(STATE_CAPTURING, "capture.start")

        self.capture_request_id = request_id
        from config import CAPTURE_OPERATION_TIMEOUT_MS
        return build_success_response(request_id, {
            "accepted": True, "operationTimeoutMs": CAPTURE_OPERATION_TIMEOUT_MS
        })

    def update(self, now=None):
        now = ticks_ms() if now is None else now
        if self.state.current == STATE_SYNCING:
            self.sync_manager.check_timeout(now)
        if self.state.current == STATE_CAPTURING and self.capture_request_id:
            self._update_capture(now)
        elif self.state.current == STATE_IDLE and self.sensor_manager is not None:
            if self._last_recognition is None or ticks_diff(now, self._last_recognition) >= 100:
                self._last_recognition = now
                try:
                    result = self.recognizer.recognize(self.sensor_manager.capture_sample())
                    if result.matched and result.gesture_id != self._last_recognized_id:
                        if self.dfplayer is not None:
                            self.dfplayer.play_track(result.audio_track)
                        if self.handshake_compatible:
                            self._emit(self.recognizer.to_event(result))
                    self._last_recognized_id = result.gesture_id if result.matched else None
                except Exception as error:
                    self.enter_error("SENSOR_ERROR", str(error))

    def _capture_progress(self):
        phase = self.capture_manager.state
        if phase in ("PREPARING", "RECORDING", "PROCESSING") and phase != self._capture_phase:
            self._capture_phase = phase
            self._emit(build_event("capture.progress", {"requestId": self.capture_request_id, "phase": phase, "progress": 0}))

    def _update_capture(self, now):
        capture = self.capture_manager
        request_id = self.capture_request_id
        self._capture_progress()
        try:
            capture.update()
            self._capture_progress()
            if capture.state == "RECORDING" and (self._last_sample is None or ticks_diff(now, self._last_sample) >= capture.config.sampling_period_ms):
                if self.sensor_manager is None:
                    raise OSError("Sensors are not configured")
                capture.process_sample(self.sensor_manager.capture_sample())
                self._last_sample = now
                self._capture_progress()
            result = capture.get_result()
            if result is None:
                return
            if "data" in result:
                valid, errors = validate_gesture_data(result["data"])
                if not valid:
                    raise ValueError("; ".join(errors))
                event = build_event("capture.completed", {"requestId": request_id, "data": result["data"]})
                # Enforce both the capture event and worst-case future sync frame size.
                serialize_envelope(event)
                serialize_envelope({"v": 2, "type": "request", "id": "r" * 64, "command": "sync.gesture", "payload": {
                    "syncId": "s" * 64, "index": 49, "gesture": {"id": 2147483647, "name": "x" * 240, "audioTrack": 50, "data": result["data"]}}})
            else:
                event = build_event("capture.failed", {"requestId": request_id, "error": {"code": "CAPTURE_FAILED", "message": str(result["error"])}})
        except Exception as error:
            code = "MESSAGE_TOO_LARGE" if str(error) == "MESSAGE_TOO_LARGE" else "SENSOR_ERROR" if isinstance(error, OSError) else "CAPTURE_FAILED"
            event = build_event("capture.failed", {"requestId": request_id, "error": {"code": code, "message": str(error)}})
        self._emit(event)
        self._active_request_ids.discard(request_id)
        self.capture_request_id = None
        capture.abort()
        self.state.finish_capture(failed=event["event"] == "capture.failed")
