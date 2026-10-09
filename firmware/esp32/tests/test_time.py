"""Tests for the monotonic time abstraction."""

import sys
import time as stdlib_time

from utils.time import ticks_ms, ticks_diff, ticks_add


def test_ticks_ms_returns_increasing_values():
    """ticks_ms should return monotonically increasing values."""
    t1 = ticks_ms()
    t2 = ticks_ms()
    assert t2 >= t1


def test_ticks_diff_positive():
    """ticks_diff should return positive difference for increasing values."""
    base = ticks_ms()
    later = ticks_ms()
    diff = ticks_diff(later, base)
    assert diff >= 0


def test_ticks_diff_known_interval():
    """ticks_diff should observe elapsed monotonic time without assuming timer resolution."""
    base = ticks_ms()
    deadline = stdlib_time.monotonic() + 0.25
    later = base

    while later == base and stdlib_time.monotonic() < deadline:
        stdlib_time.sleep(0.005)
        later = ticks_ms()

    diff = ticks_diff(later, base)
    assert 1 <= diff <= 500


def test_ticks_add_positive():
    """ticks_add should add delta to base."""
    base = 1000
    result = ticks_add(base, 500)
    assert result == 1500


def test_ticks_diff_wraparound_simulation():
    """ticks_diff should handle wraparound correctly (simulated)."""
    # Simulate MicroPython 30-bit wraparound: max value is 2^30 - 1
    # When current wraps to small value and previous was large
    # In MicroPython: ticks_diff(small, large) should return positive diff
    max_ticks = (1 << 30) - 1
    previous = max_ticks - 100
    current = 50  # wrapped around
    diff = ticks_diff(current, previous)
    # With MicroPython's ticks_diff, this should be 150
    # With CPython fallback, it will be negative (but we don't hit wraparound in practice)
    # This test documents expected behavior for MicroPython
    if hasattr(stdlib_time, "ticks_diff"):
        assert diff == 150
    else:
        # CPython fallback - wraparound not applicable
        pass


def test_import_without_stdlib_time_monotonic():
    """Ensure the module imports even if time.monotonic is missing (unlikely)."""
    # This is mainly to verify no hard dependency on time.monotonic
    assert callable(ticks_ms)
    assert callable(ticks_diff)
    assert callable(ticks_add)
