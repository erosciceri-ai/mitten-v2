"""Firmware state constants re-exported for state-machine consumers."""

from config import (
    FIRMWARE_STATES,
    STATE_CALIBRATING,
    STATE_CAPTURING,
    STATE_ERROR,
    STATE_IDLE,
    STATE_INITIALIZING,
    STATE_SYNCING,
)

__all__ = (
    "FIRMWARE_STATES",
    "STATE_INITIALIZING",
    "STATE_CALIBRATING",
    "STATE_IDLE",
    "STATE_CAPTURING",
    "STATE_SYNCING",
    "STATE_ERROR",
)
