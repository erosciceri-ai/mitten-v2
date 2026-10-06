import pytest

from config import (
    STATE_CALIBRATING,
    STATE_CAPTURING,
    STATE_ERROR,
    STATE_IDLE,
    STATE_INITIALIZING,
    STATE_SYNCING,
)
from statemachine.machine import FirmwareStateMachine, InvalidTransitionError


def test_startup_emits_initial_state_and_each_transition():
    events = []
    machine = FirmwareStateMachine(events.append)

    machine.startup()

    assert events == [STATE_INITIALIZING, STATE_CALIBRATING, STATE_IDLE]
    assert machine.current == STATE_IDLE


def test_capture_transitions_require_protocol_causes():
    events = []
    machine = FirmwareStateMachine(events.append)
    machine.startup()
    events.clear()

    machine.transition(STATE_CAPTURING, "capture.start")
    machine.transition(STATE_IDLE, "capture.completed")

    assert events == [STATE_CAPTURING, STATE_IDLE]


@pytest.mark.parametrize("finish_cause", ["capture.completed", "capture.failed"])
def test_capture_can_finish_or_fail(finish_cause):
    machine = FirmwareStateMachine()
    machine.startup()
    machine.transition(STATE_CAPTURING, "capture.start")

    assert machine.transition(STATE_IDLE, finish_cause) is True


@pytest.mark.parametrize("finish_cause", ["sync.commit", "sync.abort", "sync.failed"])
def test_sync_can_commit_abort_or_fail(finish_cause):
    machine = FirmwareStateMachine()
    machine.startup()
    machine.transition(STATE_SYNCING, "sync.begin")

    assert machine.transition(STATE_IDLE, finish_cause) is True


def test_invalid_transition_does_not_mutate_or_emit():
    events = []
    machine = FirmwareStateMachine(events.append)
    machine.startup()
    events.clear()

    with pytest.raises(InvalidTransitionError):
        machine.transition(STATE_SYNCING, "capture.start")

    assert machine.current == STATE_IDLE
    assert events == []


@pytest.mark.parametrize(
    "state, setup",
    [
        (STATE_INITIALIZING, []),
        (STATE_CALIBRATING, [(STATE_CALIBRATING, "startup.calibrating")]),
        (STATE_IDLE, [
            (STATE_CALIBRATING, "startup.calibrating"),
            (STATE_IDLE, "startup.ready"),
        ]),
        (STATE_CAPTURING, [
            (STATE_CALIBRATING, "startup.calibrating"),
            (STATE_IDLE, "startup.ready"),
            (STATE_CAPTURING, "capture.start"),
        ]),
        (STATE_SYNCING, [
            (STATE_CALIBRATING, "startup.calibrating"),
            (STATE_IDLE, "startup.ready"),
            (STATE_SYNCING, "sync.begin"),
        ]),
    ],
)
def test_any_non_error_state_can_enter_error(state, setup):
    machine = FirmwareStateMachine()
    for target, cause in setup:
        machine.transition(target, cause)
    assert machine.current == state

    assert machine.transition(STATE_ERROR, "fatal.error") is True
    assert machine.current == STATE_ERROR


def test_error_is_terminal_until_reboot():
    machine = FirmwareStateMachine()
    machine.transition(STATE_ERROR, "fatal.error")

    with pytest.raises(InvalidTransitionError):
        machine.transition(STATE_IDLE, "startup.ready")


def test_repeating_same_state_is_not_a_transition():
    events = []
    machine = FirmwareStateMachine(events.append)

    assert machine.transition(STATE_INITIALIZING, "startup") is False
    assert events == []


def test_convenience_methods_follow_the_same_transition_table():
    machine = FirmwareStateMachine()
    machine.startup()

    assert machine.start_capture() is True
    assert machine.finish_capture(failed=True) is True
    assert machine.start_sync() is True
    assert machine.finish_sync("sync.abort") is True
    assert machine.to_error() is True
    assert machine.current == STATE_ERROR
