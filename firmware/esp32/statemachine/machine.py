"""Validated state machine for MITTEN Protocol V2."""

from statemachine.states import (
    STATE_CALIBRATING,
    STATE_CAPTURING,
    STATE_ERROR,
    STATE_IDLE,
    STATE_INITIALIZING,
    STATE_SYNCING,
)


class InvalidTransitionError(Exception):
    pass


_TRANSITIONS = {
    (STATE_INITIALIZING, STATE_CALIBRATING, "startup.calibrating"),
    (STATE_CALIBRATING, STATE_IDLE, "startup.ready"),
    (STATE_IDLE, STATE_CAPTURING, "capture.start"),
    (STATE_CAPTURING, STATE_IDLE, "capture.completed"),
    (STATE_CAPTURING, STATE_IDLE, "capture.failed"),
    (STATE_IDLE, STATE_SYNCING, "sync.begin"),
    (STATE_SYNCING, STATE_IDLE, "sync.commit"),
    (STATE_SYNCING, STATE_IDLE, "sync.abort"),
    (STATE_SYNCING, STATE_IDLE, "sync.failed"),
}


class FirmwareStateMachine:
    """Small state machine with injected state-event callback."""

    def __init__(self, on_state_change=None):
        self._current = STATE_INITIALIZING
        self._on_state_change = on_state_change
        self._started = False

    @property
    def current(self):
        return self._current

    def startup(self):
        if self._started:
            return False
        self._started = True
        self._emit(self._current)
        self.transition(STATE_CALIBRATING, "startup.calibrating")
        self.transition(STATE_IDLE, "startup.ready")
        return True

    def start_capture(self):
        return self.transition(STATE_CAPTURING, "capture.start")

    def finish_capture(self, failed=False):
        cause = "capture.failed" if failed else "capture.completed"
        return self.transition(STATE_IDLE, cause)

    def start_sync(self):
        return self.transition(STATE_SYNCING, "sync.begin")

    def finish_sync(self, cause="sync.commit"):
        return self.transition(STATE_IDLE, cause)

    def to_error(self):
        return self.transition(STATE_ERROR, "fatal.error")

    def transition(self, target, cause):
        if target == self._current:
            return False
        if target == STATE_ERROR and self._current != STATE_ERROR:
            self._set_state(target)
            return True
        if (self._current, target, cause) not in _TRANSITIONS:
            raise InvalidTransitionError(
                "Invalid transition %s -> %s (%s)" % (
                    self._current, target, cause
                )
            )
        self._set_state(target)
        return True

    def _set_state(self, target):
        self._current = target
        self._emit(target)

    def _emit(self, state):
        if self._on_state_change is not None:
            self._on_state_change(state)
