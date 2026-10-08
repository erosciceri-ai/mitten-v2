"""Sync transaction manager - integrates staging, storage, and state machine."""

from utils.time import ticks_ms, ticks_diff

from config import (
    STATE_IDLE,
    STATE_SYNCING,
    STATE_ERROR,
    MAX_GESTURES,
    SYNC_IDLE_TIMEOUT_MS,
    ERR_PROFILE_TOO_LARGE,
    ERR_SYNC_NOT_ACTIVE,
    ERR_SYNC_ID_MISMATCH,
    ERR_SYNC_INCOMPLETE,
    ERR_SYNC_FAILED,
    ERR_STORAGE_ERROR,
    ERR_INVALID_PAYLOAD,
)
from statemachine.machine import FirmwareStateMachine
from staging.manager import StagingManager
from storage.atomic import atomic_write_and_promote
from profile.loader import ProfileManager


class SyncTransactionManager:
    """Manages the complete sync transaction lifecycle."""

    def __init__(self, state_machine=None, emit_callback=None):
        self._state_machine = state_machine or FirmwareStateMachine(self._on_state_change)
        self._emit_callback = emit_callback
        self._staging = StagingManager()
        self._profile_manager = ProfileManager()
        self._profile_manager.load()
        # Initialize state machine to IDLE
        if state_machine is None:
            self._state_machine.startup()
        self._sync_timeout_ms = SYNC_IDLE_TIMEOUT_MS
        self._last_activity = None

    def _on_state_change(self, state):
        """Called when firmware state changes."""
        if self._emit_callback:
            from protocol.envelopes import build_state_event
            self._emit_callback(build_state_event(state))

    def _emit(self, envelope):
        """Emit an envelope via callback."""
        if self._emit_callback:
            self._emit_callback(envelope)

    def get_state(self):
        """Get current firmware state."""
        return self._state_machine.current

    def begin(self, sync_id, profile_id, profile_revision, gesture_count):
        """Handle sync.begin request."""
        from protocol.envelopes import is_valid_request_id
        revision_valid = isinstance(profile_revision, str) and 1 <= len(profile_revision) <= 128 and all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-" for c in profile_revision)
        if not is_valid_request_id(sync_id) or not is_valid_request_id(profile_id) or not revision_valid or isinstance(gesture_count, bool) or not isinstance(gesture_count, int):
            return {"ok": False, "error": {"code": ERR_INVALID_PAYLOAD, "message": "Invalid sync.begin payload"}}
        # Validate gesture count
        if gesture_count > MAX_GESTURES:
            return {
                "ok": False,
                "error": {"code": ERR_PROFILE_TOO_LARGE, "message": f"gestureCount {gesture_count} exceeds max {MAX_GESTURES}"}
            }

        if gesture_count < 0:
            return {
                "ok": False,
                "error": {"code": "INVALID_PAYLOAD", "message": "gestureCount must be non-negative"}
            }

        # Must be in IDLE state
        if self._state_machine.current != STATE_IDLE:
            return {
                "ok": False,
                "error": {"code": "INVALID_STATE", "message": f"sync.begin not allowed in state {self._state_machine.current}"}
            }

        # Start staging transaction
        if not self._staging.begin(sync_id, profile_id, profile_revision, gesture_count):
            return {
                "ok": False,
                "error": {"code": ERR_SYNC_FAILED, "message": "Failed to start staging transaction"}
            }

        self._last_activity = ticks_ms()
        # Transition to SYNCING
        self._state_machine.transition(STATE_SYNCING, "sync.begin")

        return {
            "ok": True,
            "accepted": True,
            "syncId": sync_id,
            "expectedGestureCount": gesture_count,
            "receivedCount": 0,
            "nextIndex": 0,
            "idleTimeoutMs": self._sync_timeout_ms
        }

    def gesture(self, sync_id, index, gesture):
        """Handle sync.gesture request."""
        # Add to staging
        result = self._staging.add_gesture(sync_id, index, gesture)

        if not result.get("ok"):
            # Only transition to IDLE for errors that discard staging
            error_code = result.get("error", {}).get("code")
            discard_errors = {"SYNC_SEQUENCE_INVALID", "GESTURE_INVALID", "DUPLICATE_GESTURE_ID", "STORAGE_ERROR"}
            if error_code in discard_errors and self._state_machine.current == STATE_SYNCING:
                self._state_machine.transition(STATE_IDLE, "sync.failed")
            return result

        self._last_activity = ticks_ms()
        return result

    def commit(self, sync_id):
        """Handle sync.commit request."""
        # Validate and build profile
        ok, result = self._staging.commit_validate(sync_id)

        if not ok:
            error_code = result if isinstance(result, str) else ERR_SYNC_FAILED
            # Only transition to IDLE for errors that discard staging
            discard_errors = {"SYNC_INCOMPLETE", "STORAGE_ERROR"}
            if error_code in discard_errors and self._state_machine.current == STATE_SYNCING:
                self._state_machine.transition(STATE_IDLE, "sync.failed")
            return {
                "ok": False,
                "error": {"code": error_code, "message": f"Commit failed: {error_code}"}
            }

        # Atomically promote profile
        profile = result
        if not atomic_write_and_promote("gestures.json", profile):
            self._staging.cleanup_orphaned()
            if self._state_machine.current == STATE_SYNCING:
                # A failed promotion preserves the previous profile (or initial empty state).
                self._state_machine.transition(STATE_IDLE, "sync.failed")
            return {
                "ok": False,
                "error": {"code": ERR_STORAGE_ERROR, "message": "Failed to promote profile"}
            }

        # Reload profile into manager
        self._profile_manager.set_profile(profile)
        self._staging.cleanup_orphaned()

        # Transition to IDLE
        self._state_machine.transition(STATE_IDLE, "sync.commit")

        return {
            "ok": True,
            "committed": True,
            "syncId": sync_id,
            "activeProfile": {
                "profileId": profile["profileId"],
                "profileRevision": profile["profileRevision"],
                "gestureCount": profile["gestureCount"]
            }
        }

    def abort(self, sync_id):
        """Handle sync.abort request."""
        result = self._staging.abort(sync_id)

        if not result.get("ok"):
            return result

        # Transition to IDLE
        self._state_machine.transition(STATE_IDLE, "sync.abort")

        return result

    def check_timeout(self, now=None):
        now = ticks_ms() if now is None else now
        if self._last_activity is not None and ticks_diff(now, self._last_activity) >= self._sync_timeout_ms:
            self.handle_timeout()

    def handle_timeout(self):
        """Handle sync idle timeout."""
        if self._state_machine.current == STATE_SYNCING:
            # Emit sync.failed event
            from protocol.envelopes import build_event
            sync_id = self._staging.get_state()["sync_id"]
            self._emit(build_event("sync.failed", {"syncId": sync_id, "error": {
                "code": "SYNC_TIMEOUT", "message": "Synchronization timed out"}}))
            # Transition to IDLE
            self._state_machine.transition(STATE_IDLE, "sync.failed")
            # Discard staging
            self._staging.cleanup_orphaned()

    def get_status(self):
        """Get device status including activeSync info."""
        status = {
            "state": self._state_machine.current,
            "activeProfile": None,
            "activeSync": None,
            "error": None
        }

        if self._profile_manager.current:
            status["activeProfile"] = {
                "profileId": self._profile_manager.profile_id,
                "profileRevision": self._profile_manager.profile_revision,
                "gestureCount": self._profile_manager.gesture_count
            }

        if self._state_machine.current == STATE_SYNCING:
            state = self._staging.get_state()
            status["activeSync"] = {
                "syncId": state["sync_id"],
                "profileId": state["profile_id"],
                "profileRevision": state["profile_revision"],
                "expectedGestureCount": state["expected_count"],
                "receivedCount": state["received_count"],
                "nextIndex": state["received_count"]
            }

        return status

    @property
    def profile_manager(self):
        return self._profile_manager