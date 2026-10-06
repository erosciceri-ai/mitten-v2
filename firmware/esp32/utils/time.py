"""Monotonic time abstraction for MITTEN V2 firmware.

Provides MicroPython-compatible ticks_ms/ticks_diff with CPython fallback.
"""

try:
    import utime as time
except ImportError:
    import time


def ticks_ms():
    """Return current monotonic time in milliseconds.

    MicroPython: uses time.ticks_ms() (handles wraparound)
    CPython: uses time.monotonic() * 1000
    """
    if hasattr(time, "ticks_ms"):
        return time.ticks_ms()
    return int(time.monotonic() * 1000)


def ticks_diff(current, previous):
    """Return difference between two ticks_ms values, handling wraparound.

    MicroPython: uses time.ticks_diff()
    CPython: simple subtraction (monotonic doesn't wrap in practice)
    """
    if hasattr(time, "ticks_diff"):
        return time.ticks_diff(current, previous)
    return current - previous


def ticks_add(base, delta):
    """Add delta to base ticks, handling wraparound.

    MicroPython: uses time.ticks_add()
    CPython: simple addition
    """
    if hasattr(time, "ticks_add"):
        return time.ticks_add(base, delta)
    return base + delta